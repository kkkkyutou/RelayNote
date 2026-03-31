import type {
  CommandRecord,
  GitDiffSummary,
  HandoverNote,
  NoteAction,
  NoteBlocker,
  NoteCheck,
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
  checks: NoteCheck[];
  diffStat?: GitDiffSummary;
  latestOutput?: string;
  hintedStatus?: SessionStatus;
  latestFailure?: string;
  failureCount: number;
  lastActivityAt: string;
  waitingForApproval: boolean;
  handoffRequested: boolean;
  stopped?: boolean;
}

interface ReduceInputs {
  metadata: SessionMetadata;
  events: RelayEvent[];
  changedFiles: string[];
  diffStat?: GitDiffSummary;
}

function pushAction(state: ReduceState, action: NoteAction): void {
  state.recentActions = [...state.recentActions.slice(-11), action];
}

function pushEvidence(state: ReduceState, evidence: HandoverNote["evidence"][number]): void {
  state.evidence = [...state.evidence.slice(-16), evidence];
}

function pushBlocker(state: ReduceState, blocker: NoteBlocker): void {
  const exists = state.blockers.some((item) => item.label === blocker.label && item.detail === blocker.detail);
  if (!exists) {
    state.blockers = [...state.blockers.slice(-8), blocker];
  }
}

function pushCheck(state: ReduceState, check: NoteCheck): void {
  const withoutPrevious = state.checks.filter((item) => item.name !== check.name);
  state.checks = [...withoutPrevious, check].sort((left, right) => left.ts.localeCompare(right.ts)).slice(-10);
}

function approvalHintFromOutput(text: string): string | undefined {
  const normalized = text.toLowerCase();
  if (
    normalized.includes("waiting for approval")
    || normalized.includes("approval required")
    || normalized.includes("need approval")
    || normalized.includes("confirm to continue")
  ) {
    return truncate(text, 180);
  }
  return undefined;
}

function allChecksPassed(checks: NoteCheck[]): boolean {
  return checks.length > 0 && checks.every((check) => check.status === "passed");
}

function hasFailedCheck(checks: NoteCheck[]): boolean {
  return checks.some((check) => check.status === "failed");
}

function inferStatus(state: ReduceState): SessionStatus {
  if (state.latestFailure || hasFailedCheck(state.checks) || state.failureCount >= 2) {
    return "blocked";
  }
  if (state.waitingForApproval || state.blockers.length > 0) {
    return "waiting_for_human";
  }
  if (state.handoffRequested) {
    return "ready_to_resume";
  }
  if (state.hintedStatus) {
    return state.hintedStatus;
  }
  if (state.stopped) {
    if (state.touchedFiles.length > 0 && allChecksPassed(state.checks)) {
      return "ready_for_review";
    }
    if (state.touchedFiles.length > 0 && state.checks.length === 0) {
      return "ready_to_resume";
    }
    return "completed";
  }
  return "running";
}

function buildStatusReason(status: SessionStatus, state: ReduceState): string {
  if (status === "blocked") {
    return state.latestFailure || "Repeated failures or failed validation checks detected.";
  }
  if (status === "waiting_for_human") {
    return state.blockers.at(-1)?.detail
      || "The session appears to be waiting for explicit human approval.";
  }
  if (status === "ready_for_review") {
    return "Session stopped with code changes and all named checks passing.";
  }
  if (status === "ready_to_resume") {
    return state.handoffRequested
      ? "An explicit handoff was requested."
      : "Session ended with unresolved code changes and no full validation evidence.";
  }
  if (status === "completed") {
    return "Session stopped without unresolved blockers.";
  }
  return "Session is still active.";
}

function buildConfidence(status: SessionStatus, state: ReduceState): HandoverNote["confidence"] {
  if (status === "blocked") {
    return "high";
  }
  if (status === "waiting_for_human") {
    return "high";
  }
  if (status === "ready_for_review") {
    return state.checks.length > 0 ? "high" : "medium";
  }
  if (status === "ready_to_resume") {
    return "medium";
  }
  if (status === "completed") {
    return "medium";
  }
  return "low";
}

function buildSummary(metadata: SessionMetadata, state: ReduceState, status: SessionStatus): string {
  const action = state.recentActions.at(-1)?.label ?? "Session started";
  const parts = [
    `Goal: ${metadata.goal}.`,
    `Current status: ${status}.`,
    `Latest action: ${action}.`,
    buildStatusReason(status, state),
  ];
  if (state.touchedFiles.length > 0) {
    parts.push(`Touched files: ${state.touchedFiles.length}.`);
  }
  if (state.diffStat?.summaryLine) {
    parts.push(`Git diff: ${state.diffStat.summaryLine}.`);
  }
  if (state.checks.length > 0) {
    const checksSummary = state.checks.map((check) => `${check.name}:${check.status}`).join(", ");
    parts.push(`Checks: ${checksSummary}.`);
  }
  return parts.join(" ");
}

function buildCompactSummary(
  metadata: SessionMetadata,
  status: SessionStatus,
  statusReason: string,
  state: ReduceState,
): string {
  const checkSummary = state.checks.length > 0
    ? state.checks.map((check) => `${check.name}:${check.status}`).join(", ")
    : "none";
  return truncate(
    `${status.toUpperCase()} | goal=${metadata.goal} | reason=${statusReason} | files=${state.touchedFiles.length} | checks=${checkSummary}`,
    260,
  );
}

function buildNextActions(status: SessionStatus, state: ReduceState): string[] {
  if (status === "blocked") {
    return [
      state.blockers.at(-1)?.detail || state.latestFailure || "Inspect the failing command and rerun a focused check.",
      "Compare failing checks with recent code changes and rerun only targeted validations.",
    ];
  }
  if (status === "ready_for_review") {
    return [
      "Review touched files, diff summary, and named check evidence.",
      "If output quality is acceptable, prepare handoff or merge review.",
    ];
  }
  if (status === "completed") {
    return ["Archive the session note or attach it to the final task record."];
  }
  if (status === "waiting_for_human") {
    return [
      state.blockers.at(-1)?.detail || "Review the blocker and provide guidance.",
      "Record a follow-up annotation if you change session direction.",
    ];
  }
  if (status === "ready_to_resume") {
    return [
      "Start a new session using the resume prompt as the execution brief.",
      "Run at least one named validation check before declaring review-ready.",
    ];
  }
  return ["Continue the session or wait for additional output."];
}

function buildHandoverChecklist(status: SessionStatus, state: ReduceState): string[] {
  if (status === "blocked") {
    return [
      "Open the failing command/check evidence.",
      "Confirm whether failure is reproducible in current workspace.",
      "Decide fix-vs-handoff path and annotate that decision.",
    ];
  }
  if (status === "ready_for_review") {
    return [
      "Confirm touched files align with original goal.",
      "Confirm named checks are still passing.",
      "Attach note and resume packet to review context.",
    ];
  }
  if (status === "ready_to_resume") {
    return [
      "Start a fresh execution session from resume prompt.",
      "Run at least one named check after new changes.",
      "Update blocker/handoff annotations if scope changes.",
    ];
  }
  if (status === "waiting_for_human") {
    return [
      "Read latest blocker details and evidence.",
      "Provide explicit operator decision via annotation.",
      "Refresh note after operator action.",
    ];
  }
  return [
    "Keep session evidence updated.",
    "Use named checks before review/handoff.",
    "Archive once final state is confirmed.",
  ];
}

function buildRisks(status: SessionStatus, state: ReduceState): string[] {
  const risks: string[] = [];
  if (!state.stopped) {
    risks.push("Session is still active; handover data may change.");
  }
  if (state.latestOutput && state.latestOutput.length > 300) {
    risks.push("Recent output snippets are truncated in note view.");
  }
  if (status === "blocked") {
    risks.push("At least one failure signal is unresolved.");
  }
  if (state.checks.some((check) => check.status === "failed")) {
    risks.push("Named validation checks include failures.");
  }
  if (state.touchedFiles.length > 0 && state.checks.length === 0 && state.stopped) {
    risks.push("Code changed without named validation checks.");
  }
  return uniqueStrings(risks);
}

function buildResumePrompt(
  metadata: SessionMetadata,
  status: SessionStatus,
  statusReason: string,
  confidence: HandoverNote["confidence"],
  state: ReduceState,
): string {
  const lines = [
    `Resume session ${metadata.sessionId}.`,
    `Goal: ${metadata.goal}`,
    `Current status: ${status}`,
    `Status reason: ${statusReason}`,
    `Confidence: ${confidence}`,
  ];
  if (state.blockers.at(-1)) {
    lines.push(`Top blocker: ${state.blockers.at(-1)?.label}`);
  }
  if (state.touchedFiles.length > 0) {
    lines.push(`Touched files: ${state.touchedFiles.slice(0, 8).join(", ")}`);
  }
  if (state.diffStat?.summaryLine) {
    lines.push(`Git diff: ${state.diffStat.summaryLine}`);
  }
  if (state.checks.length > 0) {
    lines.push(`Checks: ${state.checks.map((check) => `${check.name}:${check.status}`).join(", ")}`);
  }
  if (state.latestFailure) {
    lines.push(`Latest failure: ${state.latestFailure}`);
  }
  lines.push(`Next action: ${buildNextActions(status, state)[0]}`);
  return lines.join("\n");
}

export function reduceSession(inputs: ReduceInputs): { note: HandoverNote; resumePacket: ResumePacket } {
  const {
    metadata,
    events,
    changedFiles,
    diffStat,
  } = inputs;

  const lastEventTs = events.at(-1)?.ts ?? metadata.updatedAt;
  const state: ReduceState = {
    commands: [],
    recentActions: [],
    blockers: [],
    evidence: [],
    touchedFiles: changedFiles,
    checks: [],
    diffStat,
    failureCount: 0,
    lastActivityAt: lastEventTs,
    waitingForApproval: false,
    handoffRequested: false,
  };

  for (const event of events) {
    state.lastActivityAt = event.ts;
    switch (event.kind) {
      case "session_started":
        pushAction(state, { ts: event.ts, label: `Started ${metadata.runtime} session` });
        break;
      case "command_started": {
        const command = String((event.payload as { command?: string }).command ?? "");
        state.commands.push({ command, startedAt: event.ts });
        pushAction(state, { ts: event.ts, label: "Ran command", detail: truncate(command) });
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
        const existing = [...state.commands]
          .reverse()
          .find((entry) => entry.command === command && !entry.finishedAt);
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
          state.failureCount += 1;
          pushBlocker(state, {
            ts: event.ts,
            label: "Last command failed",
            detail,
          });
        }
        break;
      }
      case "validation_reported": {
        const payload = event.payload as {
          name?: string;
          command?: string;
          exitCode?: number | null;
          status?: "passed" | "failed";
        };
        const check: NoteCheck = {
          name: payload.name ?? "unnamed",
          command: payload.command,
          exitCode: payload.exitCode,
          status: payload.status ?? "failed",
          ts: event.ts,
        };
        pushCheck(state, check);
        pushAction(state, {
          ts: event.ts,
          label: `Validation ${check.status}`,
          detail: `${check.name}${check.command ? ` - ${truncate(check.command)}` : ""}`,
        });
        pushEvidence(state, {
          type: "validation",
          label: `Validation ${check.status}`,
          detail: `${check.name}${check.command ? ` | ${truncate(check.command)}` : ""}`,
          ts: event.ts,
        });
        if (check.status === "failed") {
          state.latestFailure = `${check.name} failed`;
          state.failureCount += 1;
          pushBlocker(state, {
            ts: event.ts,
            label: "Validation failed",
            detail: `${check.name}${check.command ? ` - ${truncate(check.command)}` : ""}`,
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
        const approvalDetail = approvalHintFromOutput(text);
        if (approvalDetail) {
          state.waitingForApproval = true;
          pushBlocker(state, {
            ts: event.ts,
            label: "Session appears to be waiting for approval",
            detail: approvalDetail,
          });
        }
        break;
      }
      case "files_changed": {
        const payload = event.payload as { files?: string[]; diffStat?: GitDiffSummary };
        state.touchedFiles = uniqueStrings([...state.touchedFiles, ...(payload.files ?? [])]).sort();
        if (payload.diffStat) {
          state.diffStat = payload.diffStat;
        }
        pushAction(state, {
          ts: event.ts,
          label: "Detected file changes",
          detail: truncate((payload.files ?? []).join(", "), 180),
        });
        pushEvidence(state, {
          type: "git",
          label: "Changed files refreshed",
          detail: truncate(
            [payload.diffStat?.summaryLine, (payload.files ?? []).join(", ")].filter(Boolean).join(" | "),
            180,
          ),
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
        const category = payload.category ?? "note";
        pushAction(state, { ts: event.ts, label: `Annotation: ${category}`, detail });
        pushEvidence(state, {
          type: "annotation",
          label: `Annotation: ${category}`,
          detail,
          ts: event.ts,
        });
        if (category === "blocker") {
          pushBlocker(state, {
            ts: event.ts,
            label: "Operator blocker",
            detail,
          });
        }
        if (category === "handoff") {
          state.handoffRequested = true;
        }
        if (category === "approval") {
          state.waitingForApproval = true;
          pushBlocker(state, {
            ts: event.ts,
            label: "Operator marked approval required",
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
        if (state.latestFailure) {
          state.failureCount += 1;
          pushBlocker(state, {
            ts: event.ts,
            label: "Session remained idle after a failure",
            detail: `${payload.seconds ?? 0}s without new output after the latest failure`,
          });
        }
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
  const statusReason = buildStatusReason(status, state);
  const confidence = buildConfidence(status, state);
  const compactSummary = buildCompactSummary(metadata, status, statusReason, state);

  const note: HandoverNote = {
    sessionId: metadata.sessionId,
    runtime: metadata.runtime,
    source: metadata.source,
    sourceRef: metadata.sourceRef,
    goal: metadata.goal,
    status,
    statusReason,
    confidence,
    startedAt: metadata.createdAt,
    updatedAt: metadata.updatedAt,
    lastActivityAt: state.lastActivityAt,
    workingDirectory: metadata.workingDirectory,
    summary: buildSummary(metadata, state, status),
    compactSummary,
    recentActions: state.recentActions.slice(-8),
    touchedFiles: state.touchedFiles.slice(0, 50),
    diffStat: state.diffStat,
    checks: state.checks.slice(-6),
    evidence: state.evidence.slice(-12),
    blockers: state.blockers.slice(-5),
    nextActions: buildNextActions(status, state),
    handoverChecklist: buildHandoverChecklist(status, state),
    risks: buildRisks(status, state),
    resumePrompt: buildResumePrompt(metadata, status, statusReason, confidence, state),
  };

  const resumePacket: ResumePacket = {
    sessionId: note.sessionId,
    goal: note.goal,
    status: note.status,
    statusReason: note.statusReason,
    confidence: note.confidence,
    summary: note.summary,
    compactSummary: note.compactSummary,
    blockers: note.blockers,
    nextActions: note.nextActions,
    handoverChecklist: note.handoverChecklist,
    touchedFiles: note.touchedFiles,
    diffStat: note.diffStat,
    checks: note.checks,
    resumePrompt: note.resumePrompt,
    updatedAt: note.updatedAt,
  };

  return { note, resumePacket };
}
