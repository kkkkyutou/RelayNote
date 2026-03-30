#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { readFile } from "node:fs/promises";
import { readNote, readNoteMarkdown, readResumePacket } from "./storage.js";
import { deriveWorkingDirectory, emitEvent } from "./session.js";
import { runCommandWithRelayNote } from "./run.js";
import { watchTmuxSession } from "./watch.js";
import { resolveDataRoot } from "./utils.js";

interface ParsedArgs {
  positionals: string[];
  flags: Map<string, string | boolean>;
  commandAfterDoubleDash: string[];
}

function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags = new Map<string, string | boolean>();
  const commandAfterDoubleDash: string[] = [];
  let afterDashDash = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (afterDashDash) {
      commandAfterDoubleDash.push(arg);
      continue;
    }
    if (arg === "--") {
      afterDashDash = true;
      continue;
    }
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) {
        flags.set(key, true);
      } else {
        flags.set(key, next);
        index += 1;
      }
      continue;
    }
    positionals.push(arg);
  }

  return { positionals, flags, commandAfterDoubleDash };
}

function getRequiredFlag(parsed: ParsedArgs, key: string): string {
  const value = parsed.flags.get(key);
  if (typeof value !== "string" || !value) {
    throw new Error(`missing required flag --${key}`);
  }
  return value;
}

function getOptionalFlag(parsed: ParsedArgs, key: string): string | undefined {
  const value = parsed.flags.get(key);
  return typeof value === "string" ? value : undefined;
}

function printUsage(): void {
  console.log(`relaynote v0.1.0

Usage:
  relaynote watch --tmux <session> --goal <text> [--cwd <dir>] [--data-root <dir>] [--interval-ms <n>]
  relaynote run --goal <text> [--cwd <dir>] [--data-root <dir>] -- <command...>
  relaynote note show <session-id> [--json] [--data-root <dir>]
  relaynote note export <session-id> --format json|md [--output <file>] [--data-root <dir>]
  relaynote resume <session-id> [--data-root <dir>]
  relaynote annotate <session-id> --type blocker|note|handoff --text <text> [--data-root <dir>]
`);
}

async function writeOutput(target: string | undefined, content: string): Promise<void> {
  if (!target) {
    process.stdout.write(content.endsWith("\n") ? content : `${content}\n`);
    return;
  }
  const fs = await import("node:fs/promises");
  await fs.mkdir(path.dirname(path.resolve(target)), { recursive: true });
  await fs.writeFile(path.resolve(target), content, "utf8");
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  const [command, subcommand, maybeSessionId] = parsed.positionals;
  if (!command) {
    printUsage();
    return;
  }

  const cwd = process.cwd();
  const dataRoot = resolveDataRoot(getOptionalFlag(parsed, "data-root"), cwd);

  if (command === "watch") {
    await watchTmuxSession({
      dataRoot,
      tmuxSession: getRequiredFlag(parsed, "tmux"),
      goal: getRequiredFlag(parsed, "goal"),
      workingDirectory: deriveWorkingDirectory(cwd, getOptionalFlag(parsed, "cwd")),
      intervalMs: Number(getOptionalFlag(parsed, "interval-ms") ?? "3000"),
    });
    return;
  }

  if (command === "run") {
    const exitCode = await runCommandWithRelayNote({
      dataRoot,
      goal: getRequiredFlag(parsed, "goal"),
      workingDirectory: deriveWorkingDirectory(cwd, getOptionalFlag(parsed, "cwd")),
      command: parsed.commandAfterDoubleDash,
    });
    process.exit(exitCode);
  }

  if (command === "note" && subcommand === "show" && maybeSessionId) {
    const note = await readNote(dataRoot, maybeSessionId);
    if (parsed.flags.get("json")) {
      console.log(JSON.stringify(note, null, 2));
      return;
    }
    process.stdout.write(await readNoteMarkdown(dataRoot, maybeSessionId));
    return;
  }

  if (command === "note" && subcommand === "export" && maybeSessionId) {
    const format = getRequiredFlag(parsed, "format");
    if (format !== "json" && format !== "md") {
      throw new Error("--format must be json or md");
    }
    const content =
      format === "json"
        ? `${JSON.stringify(await readNote(dataRoot, maybeSessionId), null, 2)}\n`
        : await readNoteMarkdown(dataRoot, maybeSessionId);
    await writeOutput(getOptionalFlag(parsed, "output"), content);
    return;
  }

  if (command === "resume" && subcommand) {
    const packet = await readResumePacket(dataRoot, subcommand);
    console.log(JSON.stringify(packet, null, 2));
    return;
  }

  if (command === "annotate" && subcommand) {
    await emitEvent(dataRoot, subcommand, "annotationCollector", "annotation_added", {
      category: getRequiredFlag(parsed, "type"),
      text: getRequiredFlag(parsed, "text"),
    });
    console.log(`annotation added to ${subcommand}`);
    return;
  }

  if (command === "cat" && subcommand) {
    process.stdout.write(await readFile(subcommand, "utf8"));
    return;
  }

  printUsage();
}

main().catch((error) => {
  console.error(`relaynote error: ${(error as Error).message}`);
  process.exit(1);
});
