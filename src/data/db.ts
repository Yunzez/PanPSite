import Dexie, { type Table } from "dexie";

/**
 * Local database (IndexedDB). In v1 this is where everything lives until the
 * researcher exports it. The shape is chosen so that a later upload step is
 * additive (see docs/DESIGN.md §7):
 *
 * - every key is a client-generated UUID, so data from several devices merges
 *   without collisions;
 * - events are append-only and recordings are never modified, so uploading is
 *   "insert if missing" and can be retried freely;
 * - every row carries `syncedAt` (always null in v1) and `schemaVersion`;
 * - audio bytes sit in their own table, so they can be dropped after a
 *   confirmed upload while the metadata stays.
 */
export const SCHEMA_VERSION = 1;

type SyncFields = {
  schemaVersion: number;
  /** When the row was uploaded (ms since epoch); null until then. */
  syncedAt: number | null;
};

export type Mode = "A" | "B";

export type SessionRow = SyncFields & {
  sessionId: string;
  studentId: string;
  materialId: string;
  materialVersion: string;
  /** The mode actually used, fixed by the launch link. */
  mode: Mode;
  startedAt: number;
  endedAt: number | null;
  status: "in_progress" | "completed" | "incomplete";
  /** Settings in force for this session, e.g. number of rounds. */
  config: Record<string, unknown>;
  appVersion: string;
  userAgent: string;
  exportedAt: number | null;
  notes: string[];
  /** Where the student was, so an interrupted session can resume. */
  progress: unknown;
};

export type EventRow = SyncFields & {
  sessionId: string;
  /** Position within the session, starting at 0. */
  seq: number;
  /** Wall-clock time (ms since epoch). */
  t: number;
  /** Monotonic time (ms); use this one for durations. */
  tMono: number;
  activity: string;
  type: string;
  payload: Record<string, unknown>;
};

export type RecordingRow = SyncFields & {
  recordingId: string;
  sessionId: string;
  activity: string;
  round: number;
  lineId: string;
  characterId: string | null;
  /** 1 for the first attempt at this line in this round, 2 for a re-read, ... */
  take: number;
  startedAt: number;
  durationMs: number;
  mimeType: string;
  sizeBytes: number;
};

export type RecordingBlobRow = {
  recordingId: string;
  blob: Blob;
};

export type ResponseRow = SyncFields & {
  sessionId: string;
  kind: "quiz" | "feedback" | "finalFeedback";
  questionId: string;
  questionVersion: string;
  firstOptionId: string | null;
  changes: { optionId: string; t: number }[];
  finalOptionId: string | null;
  status: "answered" | "missing";
};

class AppDatabase extends Dexie {
  sessions!: Table<SessionRow, string>;
  events!: Table<EventRow, [string, number]>;
  recordings!: Table<RecordingRow, string>;
  recordingBlobs!: Table<RecordingBlobRow, string>;
  responses!: Table<ResponseRow, [string, string, string]>;

  constructor() {
    super("read-and-act");
    // Only indexed fields are listed; rows store every field of their type.
    this.version(1).stores({
      sessions: "sessionId, studentId, status, startedAt",
      events: "[sessionId+seq], sessionId",
      recordings: "recordingId, sessionId, [sessionId+activity+round+lineId]",
      recordingBlobs: "recordingId",
      responses: "[sessionId+kind+questionId], sessionId",
    });
  }
}

let database: AppDatabase | null = null;

/** Created on first use, so importing this module on the server is harmless. */
export function getDb(): AppDatabase {
  if (!database) database = new AppDatabase();
  return database;
}
