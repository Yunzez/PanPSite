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

/**
 * The most recent session of this student, material and mode that was started
 * but never finished (for example the page was closed), or null.
 */
export async function findUnfinishedSession(
  studentId: string,
  materialId: string,
  mode: Mode,
): Promise<SessionRow | null> {
  const candidates = await getDb()
    .sessions.where("status")
    .equals("in_progress")
    .filter(
      (session) =>
        session.studentId === studentId && session.materialId === materialId && session.mode === mode,
    )
    .sortBy("startedAt");
  return candidates.at(-1) ?? null;
}

/** What a resumed session needs to carry on from its stored event log. */
export async function readLogState(
  sessionId: string,
): Promise<{ nextSeq: number; stars: number; supportMarks: number }> {
  const events = await getDb().events.where("sessionId").equals(sessionId).toArray();
  const count = (type: string) => events.filter((event) => event.type === type).length;
  return {
    nextSeq: events.reduce((highest, event) => Math.max(highest, event.seq), -1) + 1,
    stars: count("star_awarded"),
    supportMarks: count("support_marked"),
  };
}

/** Ids of the questions of one kind that this session has already answered. */
export async function answeredQuestionIds(sessionId: string, kind: ResponseRow["kind"]): Promise<Set<string>> {
  const rows = await getDb().responses.where("sessionId").equals(sessionId).toArray();
  return new Set(
    rows.filter((row) => row.kind === kind && row.status === "answered").map((row) => row.questionId),
  );
}

/**
 * For a session that ends early: stores every question that was never
 * answered as "missing", so the export shows it was not reached rather than
 * leaving a gap. Existing answers are left untouched.
 */
export async function saveMissingResponses(
  sessionId: string,
  items: { kind: ResponseRow["kind"]; id: string; version: string }[],
): Promise<void> {
  const db = getDb();
  await db.transaction("rw", db.responses, async () => {
    for (const item of items) {
      if (await db.responses.get([sessionId, item.kind, item.id])) continue;
      await db.responses.add({
        sessionId,
        kind: item.kind,
        questionId: item.id,
        questionVersion: item.version,
        firstOptionId: null,
        changes: [],
        finalOptionId: null,
        finalOptionLabel: null,
        correct: null,
        status: "missing",
        schemaVersion: SCHEMA_VERSION,
        syncedAt: null,
      });
    }
  });
}

/** Adds a researcher note to the session record. */
export async function appendNote(sessionId: string, note: string): Promise<void> {
  const db = getDb();
  await db.transaction("rw", db.sessions, async () => {
    const session = await db.sessions.get(sessionId);
    if (session) await db.sessions.update(sessionId, { notes: [...session.notes, note] });
  });
}
