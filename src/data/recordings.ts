import { getDb, SCHEMA_VERSION, type RecordingRow } from "./db";

export type NewTake = Pick<
  RecordingRow,
  | "sessionId"
  | "activity"
  | "round"
  | "lineId"
  | "characterId"
  | "startedAt"
  | "durationMs"
  | "mimeType"
>;

/**
 * Stores one take. Each call adds a new row with the next take number for
 * that line; an earlier take is never overwritten.
 *
 * The metadata and the audio are written in one transaction, so a take is
 * either fully saved or not saved at all.
 */
export async function saveTake(input: NewTake, blob: Blob): Promise<RecordingRow> {
  const db = getDb();
  return db.transaction("rw", db.recordings, db.recordingBlobs, async () => {
    const earlierTakes = await db.recordings
      .where("[sessionId+activity+round+lineId]")
      .equals([input.sessionId, input.activity, input.round, input.lineId])
      .count();
    const row: RecordingRow = {
      ...input,
      recordingId: crypto.randomUUID(),
      take: earlierTakes + 1,
      sizeBytes: blob.size,
      schemaVersion: SCHEMA_VERSION,
      syncedAt: null,
    };
    await db.recordings.add(row);
    await db.recordingBlobs.add({ recordingId: row.recordingId, blob });
    return row;
  });
}

/** Takes of a session, oldest first. */
export function listTakes(sessionId: string): Promise<RecordingRow[]> {
  return getDb().recordings.where("sessionId").equals(sessionId).sortBy("startedAt");
}

export async function getTakeBlob(recordingId: string): Promise<Blob | null> {
  const row = await getDb().recordingBlobs.get(recordingId);
  return row?.blob ?? null;
}

/** Removes a session's takes and their audio. Used by developer tools only. */
export async function deleteTakes(sessionId: string): Promise<void> {
  const db = getDb();
  await db.transaction("rw", db.recordings, db.recordingBlobs, async () => {
    const ids = await db.recordings.where("sessionId").equals(sessionId).primaryKeys();
    await db.recordingBlobs.bulkDelete(ids);
    await db.recordings.bulkDelete(ids);
  });
}
