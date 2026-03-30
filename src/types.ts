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
  type: "command" | "artifact" | "git" | "annotation" | "output";
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

export interface HandoverNote {
  sessionId: string;
  runtime: string;
  goal: string;
  status: SessionStatus;
  startedAt: string;
  updatedAt: string;
  workingDirectory: string;
  summary: string;
  recentActions: NoteAction[];
  touchedFiles: string[];
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
