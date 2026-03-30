import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function capturePane(sessionName: string): Promise<string> {
  const { stdout } = await execFileAsync("tmux", ["capture-pane", "-p", "-t", sessionName, "-S", "-"]);
  return stdout;
}

export async function sessionExists(sessionName: string): Promise<boolean> {
  try {
    await execFileAsync("tmux", ["has-session", "-t", sessionName]);
    return true;
  } catch {
    return false;
  }
}

export function diffPaneText(previous: string, current: string): string {
  if (!previous) {
    return current;
  }
  if (current.startsWith(previous)) {
    return current.slice(previous.length);
  }
  const prevLines = previous.split("\n");
  const currentLines = current.split("\n");
  let common = 0;
  while (common < prevLines.length && common < currentLines.length && prevLines[common] === currentLines[common]) {
    common += 1;
  }
  return currentLines.slice(common).join("\n");
}
