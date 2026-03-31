import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { gitSnapshot } from "../git.js";

const execFileAsync = promisify(execFile);

test("gitSnapshot keeps full file names for single and double status codes", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "relaynote-git-"));

  await execFileAsync("git", ["init"], { cwd: root });
  await execFileAsync("git", ["config", "user.name", "RelayNote Test"], { cwd: root });
  await execFileAsync("git", ["config", "user.email", "relaynote@example.com"], { cwd: root });

  await fs.writeFile(path.join(root, "README.md"), "hello\n", "utf8");
  await execFileAsync("git", ["add", "README.md"], { cwd: root });
  await execFileAsync("git", ["commit", "-m", "init"], { cwd: root });

  await fs.writeFile(path.join(root, "README.md"), "hello\nworld\n", "utf8");
  await fs.writeFile(path.join(root, "src.ts"), "export const ok = true;\n", "utf8");

  const snapshot = await gitSnapshot(root);
  assert.ok(snapshot.changedFiles.includes("README.md"));
  assert.ok(snapshot.changedFiles.includes("src.ts"));
});
