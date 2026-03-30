import type { HandoverNote } from "./types.js";

export function renderMarkdown(note: HandoverNote): string {
  const lines: string[] = [
    `# RelayNote Session ${note.sessionId}`,
    "",
    `- Goal: ${note.goal}`,
    `- Status: ${note.status}`,
    `- Runtime: ${note.runtime}`,
    `- Working directory: ${note.workingDirectory}`,
    `- Started: ${note.startedAt}`,
    `- Updated: ${note.updatedAt}`,
    "",
    "## Summary",
    "",
    note.summary,
    "",
    "## Recent Actions",
    "",
  ];

  if (note.recentActions.length === 0) {
    lines.push("- None");
  } else {
    for (const action of note.recentActions) {
      lines.push(`- ${action.ts}: ${action.label}${action.detail ? ` - ${action.detail}` : ""}`);
    }
  }

  lines.push("", "## Touched Files", "");
  if (note.touchedFiles.length === 0) {
    lines.push("- None");
  } else {
    for (const file of note.touchedFiles) {
      lines.push(`- ${file}`);
    }
  }

  lines.push("", "## Blockers", "");
  if (note.blockers.length === 0) {
    lines.push("- None");
  } else {
    for (const blocker of note.blockers) {
      lines.push(`- ${blocker.ts}: ${blocker.label}${blocker.detail ? ` - ${blocker.detail}` : ""}`);
    }
  }

  lines.push("", "## Next Actions", "");
  for (const action of note.nextActions) {
    lines.push(`- ${action}`);
  }

  lines.push("", "## Evidence", "");
  if (note.evidence.length === 0) {
    lines.push("- None");
  } else {
    for (const evidence of note.evidence) {
      const detail = [evidence.detail, evidence.path].filter(Boolean).join(" | ");
      lines.push(`- ${evidence.ts}: ${evidence.label}${detail ? ` - ${detail}` : ""}`);
    }
  }

  lines.push("", "## Risks", "");
  if (note.risks.length === 0) {
    lines.push("- None");
  } else {
    for (const risk of note.risks) {
      lines.push(`- ${risk}`);
    }
  }

  lines.push("", "## Resume Prompt", "", "```text", note.resumePrompt, "```", "");
  return lines.join("\n");
}
