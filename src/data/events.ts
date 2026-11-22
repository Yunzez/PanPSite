import { getDb, SCHEMA_VERSION, type EventRow } from "./db";

/**
 * Append-only log of what happened in a session: every playback, wait,
 * recording, answer and researcher action, each with a timestamp.
 *
 * The export derives its numbers from this log (playback counts, time spent
 * waiting / listening / recording, rounds, re-reads), so a new measure can be
 * added later without changing what is collected.
 *
 * Events are written in the background, in order. `flush()` waits until they
 * are all stored, and is called before a session is marked complete.
 */
class EventLog {
  private nextSeq: number;
  private queue: Promise<void> = Promise.resolve();
  private failed: EventRow[] = [];

  constructor(
    readonly sessionId: string,
    startSeq: number,
  ) {
    this.nextSeq = startSeq;
  }

  log(activity: string, type: string, payload: Record<string, unknown> = {}): void {
    const row: EventRow = {
      sessionId: this.sessionId,
      seq: this.nextSeq++,
      t: Date.now(),
      tMono: Math.round(performance.now()),
      activity,
      type,
      payload,
      schemaVersion: SCHEMA_VERSION,
      syncedAt: null,
    };
    this.queue = this.queue.then(async () => {
      try {
        await getDb().events.add(row);
      } catch {
        // Kept for another attempt in flush(); the session carries on.
        this.failed.push(row);
      }
    });
  }

  /** Resolves once every event is stored; rejects if some still cannot be written. */
  async flush(): Promise<void> {
    await this.queue;
    if (this.failed.length === 0) return;
    const retry = this.failed;
    this.failed = [];
    try {
      await getDb().events.bulkPut(retry);
    } catch (error) {
      this.failed = retry;
      throw error;
    }
  }
}

let current: EventLog | null = null;

/**
 * Starts logging for a session. `startSeq` is 0 for a new session; when an
 * interrupted session resumes it is the number after its last stored event.
 */
export function startEventLog(sessionId: string, startSeq = 0): void {
  current = new EventLog(sessionId, startSeq);
}

export function stopEventLog(): void {
  current = null;
}

/** Records one event for the running session. Does nothing when none is running. */
export function logEvent(activity: string, type: string, payload?: Record<string, unknown>): void {
  current?.log(activity, type, payload);
}

export async function flushEvents(): Promise<void> {
  await current?.flush();
}
