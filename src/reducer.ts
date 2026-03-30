import type {
  CommandRecord,
  HandoverNote,
  NoteAction,
  NoteBlocker,
  RelayEvent,
  ResumePacket,
  SessionMetadata,
  SessionStatus,
} from "./types.js";
import { truncate, uniqueStrings } from "./utils.js";

interface ReduceState {
  commands: CommandRecord[];
  recentActions: NoteAction[];
  blockers: NoteBlocker[];
  evidence: HandoverNote["evidence"];
  touchedFiles: string[];
  latestOutput?: string;
  hintedStatus?: SessionStatus;
  latestFailure?: string;
  stopped?: boolean;
}

function pushAction(state: ReduceState, action: NoteAction): void {
  state.recentActions = [...state.recentActions.slice(-7), action];
}

function pushEvidence(state: ReduceState, evidence: HandoverNote["evidence"][number]): void {
  state.evidence = [...state.evidence.slice(-11), evidence];
}

function pushBlocker(state: ReduceState, blocker: NoteBlocker): void {
  const exists = state.blockers.some((item) => item.label === blocker.label && item.detail === blocker.detail);
  if (!exists) {
    state.blockers = [...state.blockers.slice(-5), blocker];
  }
}

function inferStatus(state: ReduceState): SessionStatus {
  if (state.latestFailure) {
    return "blocked";
  }
  if (state.blockers.length > 0) {
    return "waiting_for_human";
  }
  if (state.hintedStatus) {
    return state.hintedStatus;
  }
  if (state.stopped) {
    if (state.touchedFiles.length > 0) {
      return "ready_for_review";
    }
    return "completed";
  }
  return "running";
}

function buildSummary(metadata: SessionMetadata, state: ReduceState, status: SessionStatus): string {
  const action = state.recentActions.at(-1)?.label ?? "Session started";
  const blocker = state.blockers.at(-1)?.label;
  const fileCount = state.touchedFiles.length;
  const parts = [
    `Goal: ${metadata.goal}.`,
    `Current status: ${status}.`,
    `Latest action: ${action}.`,
  ];
  if (fileCount > 0) {
    parts.push(`Touched files: ${fileCount}.`);
  }
  if (blocker) {
    parts.push(`Top blocker: ${blocker}.`);
  } else if (state.latestFailure) {
    parts.push(`Latest failure: ${state.latestFailure}.`);
  }
  return parts.join(" ");
}

function buildNextActions(status: SessionStatus, state: ReduceState): string[] {
  if (status === "blocked") {
    return [
      state.blockers.at(-1)?.detail || state.latestFailure || "Inspect the failing command and rerun a focused check.",
      "Review the latest output and touched files before resuming.",
    ];
  }
  if (status === "ready_for_review") {
    return [
      "Review the touched files and command evidence.",
      "Run any missing validation before merge or handoff.",
    ];
  }
  if (status === "completed") {
    return ["Archive the session or attach the note to the final task record."];
  }
  if (status === "waiting_for_human") {
    return [
      state.blockers.at(-1)?.detail || "Review the latest blocker and provide guidance.",
      "Add an operator annotation if the intended next step changes.",
    ];
  }
  if (status === "ready_to_resume") {
    return [
      "Start a new session with the resume packet as the working brief.",
      "Review the latest evidence before handing off to another operator or model.",
    ];
  }
  return ["Continue the session or wait for more output."];
}

function buildRisks(status: SessionStatus, state: ReduceState): string[] {
  const risks: string[] = [];
  if (!state.stopped) {
    risks.push("Session is still active; the handover note may change.");
  }
  if (state.latestOutput && state.latestOutput.length > 300) {
    risks.push("Recent output has been truncated in the note view.");
  }
  if (status === "blocked") {
    risks.push("The latest known execution failed and may require manual diagnosis.");
  }
  return risks;
}

function buildResumePrompt(metadata: SessionMetadata, status: SessionStatus, state: ReduceState): string {
  const lines = [
    `Resume session ${metadata.sessionId}.`,
    `Goal: ${metadata.goal}`,
    `Current status: ${status}`,
  ];
  if (state.blockers.at(-1)) {
    lines.push(`Blocker: ${state.blockers.at(-1)?.label}`);
  }
  if (state.touchedFiles.length > 0) {
    lines.push(`Touched files: ${state.touchedFiles.slice(0, 8).join(", ")}`);
  }
  if (state.latestFailure) {
    lines.push(`Latest failure: ${state.latestFailure}`);
  }
  lines.push(`Next action: ${buildNextActions(status, state)[0]}`);
  return lines.join("\n");
}

export function reduceSession(
  metadata: SessionMetadata,
  events: RelayEvent[],
  changedFiles: string[],
): { note: HandoverNote; resumePacket: ResumePacket } {
  const state: ReduceState = {
    commands: [],
    recentActions: [],
    blockers: [],
    evidence: [],
    touchedFiles: changedFiles,
  };

  for (const event of events) {
    switch (event.kind) {
      case "session_started":
        pushAction(state, { ts: event.ts, label: `Started ${metadata.runtime} session` });
        break;
      case "command_started": {
        const command = String((event.payload as { command?: string }).command ?? "");
        state.commands.push({ command, startedAt: event.ts });
        pushAction(state, { ts: event.ts, label: `Ran command`, detail: truncate(command) });
        pushEvidence(state, {
          type: "command",
          label: "Command started",
          detail: truncate(command),
          ts: event.ts,
        });
        break;
      }
      case "command_finished": {
        const payload = event.payload as { command?: string; exitCode?: number | null };
        const command = String(payload.command ?? "");
        const exitCode = payload.exitCode ?? null;
        const existing = [...state.commands].reverse().find((entry) => entry.command === command && !entry.finishedAt);
        if (existing) {
          existing.finishedAt = event.ts;
          existing.exitCode = exitCode;
        }
        const detail = `${truncate(command)} (exit ${exitCode === null ? "unknown" : exitCode})`;
        pushAction(state, { ts: event.ts, label: "Command finished", detail });
        pushEvidence(state, {
          type: "command",
          label: "Command finished",
          detail,
          ts: event.ts,
        });
        if (exitCode && exitCode !== 0) {
          state.latestFailure = detail;
          pushBlocker(state, {
            ts: event.ts,
            label: "Last command failed",
            detail,
          });
        }
        break;
      }
      case "output_chunk": {
        const text = String((event.payload as { text?: string }).text ?? "");
        state.latestOutput = truncate(text, 600);
        if (text.trim()) {
          pushEvidence(state, {
            type: "output",
            label: "Recent output",
            detail: truncate(text, 180),
            ts: event.ts,
          });
        }
        break;
      }
      case "files_changed": {
        const payload = event.payload as { files?: string[] };
        state.touchedFiles = uniqueStrings([...state.touchedFiles, ...(payload.files ?? [])]).sort();
        pushAction(state, {
          ts: event.ts,
          label: "Detected file changes",
          detail: truncate((payload.files ?? []).join(", "), 180),
        });
        pushEvidence(state, {
          type: "git",
          label: "Changed files refreshed",
          detail: truncate((payload.files ?? []).join(", "), 180),
          ts: event.ts,
        });
        break;
      }
      case "artifact_added": {
        const payload = event.payload as { label?: string; path?: string; detail?: string };
        pushEvidence(state, {
          type: "artifact",
          label: payload.label ?? "Artifact added",
          path: payload.path,
          detail: payload.detail,
          ts: event.ts,
        });
        break;
      }
      case "annotation_added": {
        const payload = event.payload as { category?: string; text?: string };
        const detail = truncate(payload.text ?? "");
        pushAction(state, { ts: event.ts, label: `Annotation: ${payload.category ?? "note"}`, detail });
        pushEvidence(state, {
          type: "annotation",
          label: `Annotation: ${payload.category ?? "note"}`,
          detail,
          ts: event.ts,
        });
        if ((payload.category ?? "") === "blocker") {
          pushBlocker(state, {
            ts: event.ts,
            label: "Operator blocker",
            detail,
          });
        }
        break;
      }
      case "session_idle": {
        const payload = event.payload as { seconds?: number };
        pushAction(state, {
          ts: event.ts,
          label: "Session idle",
          detail: `${payload.seconds ?? 0}s without new output`,
        });
        break;
      }
      case "status_hint": {
        const payload = event.payload as { status?: SessionStatus; reason?: string };
        if (payload.status) {
          state.hintedStatus = payload.status;
        }
        if (payload.reason) {
          pushAction(state, {
            ts: event.ts,
            label: `Status hint: ${payload.status ?? "unknown"}`,
            detail: truncate(payload.reason),
          });
        }
        break;
      }
      case "session_stopped":
        state.stopped = true;
        pushAction(state, { ts: event.ts, label: "Session stopped" });
        break;
      default:
        break;
    }
  }

  const status = inferStatus(state);
  const note: HandoverNote = {
    sessionId: metadata.sessionId,
    runtime: metadata.runtime,
    goal: metadata.goal,
    status,
    startedAt: metadata.createdAt,
    updatedAt: metadata.updatedAt,
    workingDirectory: metadata.workingDirectory,
    summary: buildSummary(metadata, state, status),
    recentActions: state.recentActions.slice(-6),
    touchedFiles: state.touchedFiles.slice(0, 50),
    evidence: state.evidence.slice(-8),
    blockers: state.blockers.slice(-4),
    nextActions: buildNextActions(status, state),
    risks: buildRisks(status, state),
    resumePrompt: buildResumePrompt(metadata, status, state),
  };

  const resumePacket: ResumePacket = {
    sessionId: note.sessionId,
    goal: note.goal,
    status: note.status,
    summary: note.summary,
    blockers: note.blockers,
    nextActions: note.nextActions,
    touchedFiles: note.touchedFiles,
    resumePrompt: note.resumePrompt,
    updatedAt: note.updatedAt,
  };

  return { note, resumePacket };
}
