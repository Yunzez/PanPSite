import { strToU8, zip, type Zippable } from "fflate";
import { extensionForMimeType } from "@/media/recorder";
import { toCsv, type CsvValue } from "./csv";
import { getDb, type RecordingRow, type ResponseRow, type SessionRow } from "./db";
import { summarizeActivity } from "./summary";

/**
 * Builds the researcher's export: one ZIP with the data as CSV, every
 * recording as an audio file, and a raw JSON copy of each session.
 *
 * Every row and every audio file name carries the student and session ids,
 * so the tables and the recordings can be matched to each other.
 */
export type ExportResult = {
  blob: Blob;
  filename: string;
  sessionIds: string[];
};

const iso = (ms: number | null) => (ms === null ? "" : new Date(ms).toISOString());
const safeName = (value: string) => value.replace(/[^A-Za-z0-9_-]/g, "_");

/** Where a recording sits inside the ZIP. */
export function audioPath(session: SessionRow, recording: RecordingRow): string {
  const name = [
    recording.activity,
    `r${recording.round}`,
    recording.lineId,
    recording.characterId ?? "none",
    `t${recording.take}`,
  ]
    .map(safeName)
    .join("_");
  return `audio/${safeName(session.studentId)}/${session.sessionId}/${name}.${extensionForMimeType(recording.mimeType)}`;
}

const README = `Read and Act export

sessions.csv    One row per session: student, material, mode actually used, times, status, settings,
                how often the researcher marked support, interruptions, and researcher notes.
                Status "incomplete" means the session was ended early or abandoned.
summary.csv     One row per session and activity, derived from events.csv: durations, playback
                counts, takes, re-reads, rounds, and the character chosen in each round (roles).
                Time is split into model audio (modelMs), partner audio (partnerMs), waiting
                before recording (waitMs), recording (recordMs) and hearing own takes
                (ownPlaybackMs).
recordings.csv  One row per audio file, with the path of the file inside this archive.
responses.csv   Comprehension and experience answers: first choice, changes, final choice.
events.csv      The full event log. tMono is a monotonic clock in ms; use it for durations.
audio/          Recordings, as audio/<student>/<session>/<activity>_r<round>_<line>_<character>_t<take>.
                A re-read gets the next take number; earlier takes are never overwritten.
raw/            Everything about a session as one JSON file.

Times are ISO 8601 in UTC unless the column name ends in Ms (milliseconds).
Recording durations include any silence. Stars and durations say nothing about accuracy.
`;

function zipAsync(files: Zippable): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    zip(files, (error, data) => (error ? reject(error) : resolve(data)));
  });
}

/** Builds the ZIP for the given sessions, or for every session when none are given. */
export async function buildExport(sessionIds?: string[]): Promise<ExportResult> {
  const db = getDb();
  const allSessions = await db.sessions.orderBy("startedAt").toArray();
  const sessions = sessionIds ? allSessions.filter((session) => sessionIds.includes(session.sessionId)) : allSessions;
  if (sessions.length === 0) throw new Error("There are no sessions to export");
  const ids = sessions.map((session) => session.sessionId);
  const byId = new Map(sessions.map((session) => [session.sessionId, session]));

  const events = (await db.events.where("sessionId").anyOf(ids).toArray()).sort(
    (a, b) => a.sessionId.localeCompare(b.sessionId) || a.seq - b.seq,
  );
  const recordings = await db.recordings.where("sessionId").anyOf(ids).sortBy("startedAt");
  const responses = await db.responses.where("sessionId").anyOf(ids).toArray();
  const student = (sessionId: string) => byId.get(sessionId)?.studentId ?? "";
  const countOf = (sessionId: string, type: string) =>
    events.filter((event) => event.sessionId === sessionId && event.type === type).length;

  const files: Zippable = { "README.txt": strToU8(README) };

  files["sessions.csv"] = strToU8(
    toCsv(
      ["sessionId", "studentId", "mode", "materialId", "materialVersion", "status", "startedAt", "endedAt",
        "durationMs", "performRounds", "finalFeedback", "micPolicy", "supportMarks", "interruptions",
        "appVersion", "notes", "userAgent"],
      sessions.map((session) => [
        session.sessionId, session.studentId, session.mode, session.materialId, session.materialVersion,
        session.status, iso(session.startedAt), iso(session.endedAt),
        session.endedAt === null ? null : session.endedAt - session.startedAt,
        session.config.performRounds as CsvValue, session.config.finalFeedback as CsvValue,
        session.config.micPolicy as CsvValue, countOf(session.sessionId, "support_marked"),
        countOf(session.sessionId, "interruption"), session.appVersion, session.notes.join(" | "),
        session.userAgent,
      ]),
    ),
  );

  files["events.csv"] = strToU8(
    toCsv(
      ["sessionId", "studentId", "seq", "time", "tMono", "activity", "type", "payload"],
      events.map((event) => [
        event.sessionId, student(event.sessionId), event.seq, iso(event.t), event.tMono,
        event.activity, event.type, JSON.stringify(event.payload),
      ]),
    ),
  );

  files["recordings.csv"] = strToU8(
    toCsv(
      ["recordingId", "sessionId", "studentId", "materialId", "mode", "activity", "round", "lineId",
        "characterId", "take", "startedAt", "durationMs", "mimeType", "sizeBytes", "file"],
      recordings.map((recording) => {
        const session = byId.get(recording.sessionId)!;
        return [
          recording.recordingId, recording.sessionId, session.studentId, session.materialId, session.mode,
          recording.activity, recording.round, recording.lineId, recording.characterId, recording.take,
          iso(recording.startedAt), recording.durationMs, recording.mimeType, recording.sizeBytes,
          audioPath(session, recording),
        ];
      }),
    ),
  );

  files["responses.csv"] = strToU8(
    toCsv(
      ["sessionId", "studentId", "kind", "questionId", "questionVersion", "status", "firstOptionId",
        "finalOptionId", "finalOptionLabel", "correct", "changeCount", "changes"],
      responses.map((response: ResponseRow) => [
        response.sessionId, student(response.sessionId), response.kind, response.questionId,
        response.questionVersion, response.status, response.firstOptionId, response.finalOptionId,
        response.finalOptionLabel, response.correct, response.changes.length, JSON.stringify(response.changes),
      ]),
    ),
  );

  const summaryRows: CsvValue[][] = [];
  for (const session of sessions) {
    const sessionEvents = events.filter((event) => event.sessionId === session.sessionId);
    const activities = [...new Set(sessionEvents.map((event) => event.activity))].filter((name) => name !== "session");
    for (const activity of activities) {
      const summary = summarizeActivity(sessionEvents.filter((event) => event.activity === activity));
      summaryRows.push([
        session.sessionId, session.studentId, session.mode, session.materialId, activity,
        iso(summary.startedAt), iso(summary.endedAt), summary.durationMs, summary.modelPlays,
        summary.modelReplays, summary.chunkTaps, summary.ownPlaybacks, summary.takes, summary.rereads,
        summary.roundsRequired, summary.roundsCompleted, summary.roles, summary.supportMarks, summary.modelMs,
        summary.partnerMs, summary.waitMs, summary.recordMs, summary.ownPlaybackMs,
      ]);
    }
  }
  files["summary.csv"] = strToU8(
    toCsv(
      ["sessionId", "studentId", "mode", "materialId", "activity", "startedAt", "endedAt", "durationMs",
        "modelPlays", "modelReplays", "chunkTaps", "ownPlaybacks", "takes", "rereads", "roundsRequired",
        "roundsCompleted", "roles", "supportMarks", "modelMs", "partnerMs", "waitMs", "recordMs", "ownPlaybackMs"],
      summaryRows,
    ),
  );

  for (const recording of recordings) {
    const audio = await db.recordingBlobs.get(recording.recordingId);
    if (!audio) continue;
    // Audio is already compressed; storing it as-is keeps the export fast.
    files[audioPath(byId.get(recording.sessionId)!, recording)] = [
      new Uint8Array(await audio.blob.arrayBuffer()),
      { level: 0 },
    ];
  }

  for (const session of sessions) {
    files[`raw/${session.sessionId}.json`] = strToU8(
      JSON.stringify(
        {
          session,
          events: events.filter((event) => event.sessionId === session.sessionId),
          recordings: recordings.filter((recording) => recording.sessionId === session.sessionId),
          responses: responses.filter((response) => response.sessionId === session.sessionId),
        },
        null,
        2,
      ),
    );
  }

  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, "").replace("T", "-");
  const zipped = await zipAsync(files);
  return {
    blob: new Blob([zipped.slice()], { type: "application/zip" }),
    filename: `read-and-act_export_${stamp}.zip`,
    sessionIds: ids,
  };
}

/** Records that these sessions have been handed to the researcher. */
export async function markExported(sessionIds: string[]): Promise<void> {
  await getDb().sessions.where("sessionId").anyOf(sessionIds).modify({ exportedAt: Date.now() });
}
