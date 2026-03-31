import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { GitDiffSummary } from "./types.js";
import { uniqueStrings } from "./utils.js";

const execFileAsync = promisify(execFile);

export interface GitSnapshot {
  changedFiles: string[];
  diffStat?: GitDiffSummary;
}

function parseShortStat(stdout: string): GitDiffSummary | undefined {
  const summaryLine = stdout.trim();
  if (!summaryLine) {
    return undefined;
  }

  const changedFiles = Number(summaryLine.match(/(\d+)\s+files? changed/)?.[1] ?? "0");
  const insertions = Number(summaryLine.match(/(\d+)\s+insertions?\(\+\)/)?.[1] ?? "0");
  const deletions = Number(summaryLine.match(/(\d+)\s+deletions?\(-\)/)?.[1] ?? "0");

  return {
    changedFiles,
    insertions,
    deletions,
    summaryLine,
  };
}

function parseChangedFileLine(line: string): string | undefined {
  const match = line.match(/^[ MADRCU?!]{1,2}\s+(.*)$/);
  return match?.[1]?.trim() || undefined;
}

export async function gitSnapshot(cwd: string): Promise<GitSnapshot> {
  try {
    const [{ stdout: statusStdout }, { stdout: diffStdout }, { stdout: shortStatStdout }] =
      await Promise.all([
        execFileAsync("git", ["status", "--short"], { cwd }),
        execFileAsync("git", ["diff", "--name-only", "HEAD"], { cwd }),
        execFileAsync("git", ["diff", "--shortstat", "HEAD"], { cwd }),
      ]);

    const fromStatus = statusStdout
      .split("\n")
      .map((line) => line.replace(/\r/g, ""))
      .filter(Boolean)
      .map((line) => parseChangedFileLine(line))
      .filter((line): line is string => Boolean(line));

    const fromDiff = diffStdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    return {
      changedFiles: uniqueStrings([...fromStatus, ...fromDiff]).sort(),
      diffStat: parseShortStat(shortStatStdout),
    };
  } catch {
    return {
      changedFiles: [],
      diffStat: undefined,
    };
  }
}
