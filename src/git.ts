import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { uniqueStrings } from "./utils.js";

const execFileAsync = promisify(execFile);

export async function gitChangedFiles(cwd: string): Promise<string[]> {
  try {
    const [{ stdout: statusStdout }, { stdout: diffStdout }] = await Promise.all([
      execFileAsync("git", ["status", "--short"], { cwd }),
      execFileAsync("git", ["diff", "--name-only", "HEAD"], { cwd }),
    ]);

    const fromStatus = statusStdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.slice(3).trim())
      .filter(Boolean);

    const fromDiff = diffStdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    return uniqueStrings([...fromStatus, ...fromDiff]).sort();
  } catch {
    return [];
  }
}
