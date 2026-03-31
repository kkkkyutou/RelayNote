export type SessionStatus =
  | "running"
  | "waiting_for_human"
  | "blocked"
  | "ready_for_review"
  | "ready_to_resume"
  | "completed"
  | "abandoned";

export type EventKind =
  | "session_started"
  | "output_chunk"
  | "command_started"
  | "command_finished"
  | "validation_reported"
  | "files_changed"
  | "artifact_added"
  | "status_hint"
  | "annotation_added"
  | "session_idle"
  | "session_stopped";

export interface RelayEvent<T = Record<string, unknown>> {
  sessionId: string;
  ts: string;
  kind: EventKind;
  source: string;
  payload: T;
}

export interface CommandRecord {
  command: string;
  startedAt?: string;
  finishedAt?: string;
  exitCode?: number | null;
}

export interface EvidenceItem {
  type: "command" | "artifact" | "git" | "annotation" | "output" | "validation";
  label: string;
  detail?: string;
  path?: string;
  ts: string;
}

export interface NoteAction {
  ts: string;
  label: string;
  detail?: string;
}

export interface NoteBlocker {
  ts: string;
  label: string;
  detail?: string;
}

export interface NoteCheck {
  name: string;
  status: "passed" | "failed";
  command?: string;
  exitCode?: number | null;
  ts: string;
}

export interface GitDiffSummary {
  changedFiles: number;
  insertions: number;
  deletions: number;
  summaryLine: string;
}

export interface HandoverNote {
  sessionId: string;
  runtime: string;
  source: SessionMetadata["source"];
  sourceRef?: string;
  goal: string;
  status: SessionStatus;
  startedAt: string;
  updatedAt: string;
  lastActivityAt: string;
  workingDirectory: string;
  summary: string;
  recentActions: NoteAction[];
  touchedFiles: string[];
  diffStat?: GitDiffSummary;
  checks: NoteCheck[];
  evidence: EvidenceItem[];
  blockers: NoteBlocker[];
  nextActions: string[];
  risks: string[];
  resumePrompt: string;
}

export interface ResumePacket {
  sessionId: string;
  goal: string;
  status: SessionStatus;
  summary: string;
  blockers: NoteBlocker[];
  nextActions: string[];
  touchedFiles: string[];
  diffStat?: GitDiffSummary;
  checks: NoteCheck[];
  resumePrompt: string;
  updatedAt: string;
}

export interface SessionMetadata {
  sessionId: string;
  runtime: string;
  goal: string;
  workingDirectory: string;
  source: "tmux" | "run";
  sourceRef?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SessionSnapshot {
  sessionId: string;
  goal: string;
  status: SessionStatus;
  runtime: string;
  source: SessionMetadata["source"];
  sourceRef?: string;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
  workingDirectory: string;
  summary: string;
  touchedFilesCount: number;
  blockersCount: number;
  checksCount: number;
}
