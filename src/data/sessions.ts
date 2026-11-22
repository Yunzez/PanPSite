import { getDb, SCHEMA_VERSION, type Mode, type ResponseRow, type SessionRow } from "./db";

export type NewSession = {
  studentId: string;
  materialId: string;
  materialVersion: string;
  mode: Mode;
  config: Record<string, unknown>;
};

/**
 * Creates the record for a new session.
 *
 * Any session still marked "in progress" was abandoned (for example the page
 * was closed), so it is marked incomplete first. Its recordings and events
 * stay exactly as they are.
 */
export async function createSession(input: NewSession): Promise<SessionRow> {
  const db = getDb();
  const now = Date.now();
  const row: SessionRow = {
    ...input,
    sessionId: crypto.randomUUID(),
    startedAt: now,
    endedAt: null,
    status: "in_progress",
    appVersion: process.env.NEXT_PUBLIC_APP_VERSION ?? "dev",
    userAgent: navigator.userAgent,
    exportedAt: null,
    notes: [],
    progress: null,
    schemaVersion: SCHEMA_VERSION,
    syncedAt: null,
  };
  await db.transaction("rw", db.sessions, async () => {
    await db.sessions.where("status").equals("in_progress").modify({ status: "incomplete" });
    await db.sessions.add(row);
  });
  return row;
}

export async function updateSession(sessionId: string, patch: Partial<SessionRow>): Promise<void> {
  await getDb().sessions.update(sessionId, patch);
}

/** Sessions, newest first. */
export async function listSessions(): Promise<SessionRow[]> {
  return (await getDb().sessions.orderBy("startedAt").toArray()).reverse();
}

/** Stores (or replaces) the answer to one question of a session. */
export async function saveResponse(
  response: Omit<ResponseRow, "schemaVersion" | "syncedAt">,
): Promise<void> {
  await getDb().responses.put({ ...response, schemaVersion: SCHEMA_VERSION, syncedAt: null });
}

/**
 * Checks that everything a session produced is really in the database: each
 * take the log says was saved must have both its metadata and its audio.
 * Returns the ids of takes that are missing (empty when all is well).
 */
export async function findMissingTakes(sessionId: string): Promise<string[]> {
  const db = getDb();
  const saved = await db.events
    .where("sessionId")
    .equals(sessionId)
    .filter((event) => event.type === "take_saved")
    .toArray();
  const expected = saved.map((event) => String(event.payload.recordingId));
  const metadata = await db.recordings.bulkGet(expected);
  const audio = await db.recordingBlobs.bulkGet(expected);
  return expected.filter((_, index) => !metadata[index] || !audio[index] || audio[index].blob.size === 0);
}
