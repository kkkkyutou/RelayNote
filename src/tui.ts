import readline from "node:readline";
import process from "node:process";
import { listSessionSnapshots, readNote, readResumePacket } from "./storage.js";
import type { HandoverNote, ResumePacket, SessionSnapshot } from "./types.js";

interface TuiState {
  sessions: SessionSnapshot[];
  selectedIndex: number;
  note?: HandoverNote;
  resume?: ResumePacket;
  message?: string;
}

function clampIndex(index: number, length: number): number {
  if (length <= 0) {
    return 0;
  }
  if (index < 0) {
    return 0;
  }
  if (index >= length) {
    return length - 1;
  }
  return index;
}

function header(): string[] {
  return [
    "RelayNote TUI",
    "j/k: move  r: refresh  y: print resume prompt  q: quit",
    "",
  ];
}

function renderList(state: TuiState, width = 46): string[] {
  const lines = ["Sessions", "-".repeat(width)];
  if (state.sessions.length === 0) {
    lines.push("No sessions yet.");
    return lines;
  }
  state.sessions.forEach((session, index) => {
    const marker = index === state.selectedIndex ? ">" : " ";
    const line1 = `${marker} ${session.sessionId}`.slice(0, width);
    const line2 = `  ${session.status} | ${session.runtime}`.slice(0, width);
    const line3 = `  ${session.goal}`.slice(0, width);
    lines.push(line1, line2, line3, "");
  });
  return lines;
}

function listBlockers(note: HandoverNote): string {
  if (note.blockers.length === 0) {
    return "None";
  }
  return note.blockers
    .map((item) => (item.detail ? `${item.label}: ${item.detail}` : item.label))
    .join("; ");
}

function listNextActions(note: HandoverNote): string {
  if (note.nextActions.length === 0) {
    return "None";
  }
  return note.nextActions.join(" | ");
}

function renderDetail(state: TuiState): string[] {
  const lines = ["Details", "-".repeat(72)];
  if (!state.note || !state.resume) {
    lines.push("No session selected.");
    return lines;
  }
  const note = state.note;
  lines.push(`Session: ${note.sessionId}`);
  lines.push(`Status: ${note.status}`);
  lines.push(`Goal: ${note.goal}`);
  lines.push(`Updated: ${note.updatedAt}`);
  lines.push(`Summary: ${note.summary}`);
  lines.push(`Blockers: ${listBlockers(note)}`);
  lines.push(`Next: ${listNextActions(note)}`);
  if (note.diffStat?.summaryLine) {
    lines.push(`Diff: ${note.diffStat.summaryLine}`);
  }
  if (note.checks.length > 0) {
    lines.push(`Checks: ${note.checks.map((check) => `${check.name}:${check.status}`).join(", ")}`);
  }
  lines.push("Resume Prompt:");
  lines.push(...state.resume.resumePrompt.split("\n").map((line) => `  ${line}`));
  return lines;
}

function draw(state: TuiState): void {
  const listLines = renderList(state);
  const detailLines = renderDetail(state);
  const rows = Math.max(listLines.length, detailLines.length);
  const output: string[] = [];
  output.push(...header());
  for (let index = 0; index < rows; index += 1) {
    const left = listLines[index] ?? "";
    const right = detailLines[index] ?? "";
    output.push(`${left.padEnd(48)} ${right}`);
  }
  if (state.message) {
    output.push("", `Message: ${state.message}`);
  }
  process.stdout.write("\x1b[2J\x1b[H");
  process.stdout.write(`${output.join("\n")}\n`);
}

async function refreshState(dataRoot: string, state: TuiState): Promise<void> {
  state.sessions = await listSessionSnapshots(dataRoot);
  state.selectedIndex = clampIndex(state.selectedIndex, state.sessions.length);
  const selected = state.sessions[state.selectedIndex];
  if (!selected) {
    state.note = undefined;
    state.resume = undefined;
    return;
  }
  state.note = await readNote(dataRoot, selected.sessionId);
  state.resume = await readResumePacket(dataRoot, selected.sessionId);
}

export async function startTui(dataRoot: string): Promise<void> {
  const state: TuiState = {
    sessions: [],
    selectedIndex: 0,
  };
  await refreshState(dataRoot, state);
  draw(state);

  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }

  const cleanup = (): void => {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    process.stdin.removeAllListeners("keypress");
    process.stdout.write("\x1b[2J\x1b[H");
  };

  const handleKeypress = async (_: string, key: readline.Key): Promise<void> => {
    if (key.name === "q" || (key.ctrl && key.name === "c")) {
      cleanup();
      process.exit(0);
    }
    if (key.name === "j" || key.name === "down") {
      state.selectedIndex = clampIndex(state.selectedIndex + 1, state.sessions.length);
      await refreshState(dataRoot, state);
      state.message = undefined;
      draw(state);
      return;
    }
    if (key.name === "k" || key.name === "up") {
      state.selectedIndex = clampIndex(state.selectedIndex - 1, state.sessions.length);
      await refreshState(dataRoot, state);
      state.message = undefined;
      draw(state);
      return;
    }
    if (key.name === "r") {
      await refreshState(dataRoot, state);
      state.message = "Refreshed.";
      draw(state);
      return;
    }
    if (key.name === "y") {
      if (state.resume) {
        state.message = state.resume.resumePrompt;
      } else {
        state.message = "No selected session.";
      }
      draw(state);
    }
  };

  process.stdin.on("keypress", (char, key) => {
    void handleKeypress(char, key).catch((error) => {
      state.message = `TUI error: ${(error as Error).message}`;
      draw(state);
    });
  });
}
