import type { EventRow } from "./db.ts";

/**
 * Turns one activity's events into the counts and durations the researcher
 * analyses. Kept free of browser and database code so it can be unit-tested.
 */
export type ActivitySummary = {
  startedAt: number | null;
  endedAt: number | null;
  durationMs: number | null;
  /** Every time model audio started, automatic or requested. */
  modelPlays: number;
  /** The subset the student asked for: Listen again / Listen carefully. */
  modelReplays: number;
  chunkTaps: number;
  ownPlaybacks: number;
  rereads: number;
  takes: number;
  roundsRequired: number | null;
  roundsCompleted: number;
  /** Character chosen in each round of Read and Act, e.g. "r1:pig; r2:monkey". Empty in Mode A. */
  roles: string;
  supportMarks: number;
  modelMs: number;
  partnerMs: number;
  waitMs: number;
  recordMs: number;
  ownPlaybackMs: number;
};

type State = "model" | "partner" | "wait" | "record" | "own";

// What the student was doing between two events. An event listed here opens
// an interval in that state; the next event from either list closes it.
// Summing the intervals gives the time spent in each state, so waiting,
// listening and recording are measured separately.
const STATE_STARTS: Record<string, State> = {
  model_play_start: "model",
  // Continues a paused playback, so paused time is not counted as listening.
  resume: "model",
  partner_play_start: "partner",
  turn_wait_start: "wait",
  record_start: "record",
  own_playback_start: "own",
};

const STATE_ENDS = new Set([
  "model_play_end",
  "pause",
  "partner_play_end",
  "record_stop",
  "own_playback_end",
  "round_complete",
  "activity_end",
]);

/** `events` must belong to one activity of one session, in `seq` order. */
export function summarizeActivity(events: EventRow[]): ActivitySummary {
  const count = (type: string) => events.filter((event) => event.type === type).length;
  const start = events.find((event) => event.type === "activity_start");
  const end = events.findLast((event) => event.type === "activity_end");

  const time: Record<State, number> = { model: 0, partner: 0, wait: 0, record: 0, own: 0 };
  let open: { state: State; since: number } | null = null;
  for (const event of events) {
    const starts = STATE_STARTS[event.type];
    if (!starts && !STATE_ENDS.has(event.type)) continue;
    if (open) time[open.state] += event.tMono - open.since;
    open = starts ? { state: starts, since: event.tMono } : null;
  }

  const required = events.findLast((event) => event.type === "round_complete")?.payload.required;
  return {
    startedAt: start?.t ?? null,
    endedAt: end?.t ?? null,
    // Monotonic clock: unaffected by the device's clock being adjusted.
    durationMs: start && end ? end.tMono - start.tMono : null,
    modelPlays: count("model_play_start"),
    modelReplays: events.filter(
      (event) =>
        event.type === "model_play_start" &&
        event.payload.reason !== "auto" &&
        event.payload.reason !== "play",
    ).length,
    chunkTaps: count("chunk_tap"),
    ownPlaybacks: count("own_playback_start"),
    rereads: count("read_again"),
    takes: count("take_saved"),
    roundsRequired: typeof required === "number" ? required : null,
    roundsCompleted: count("round_complete"),
    roles: events
      .filter((event) => event.type === "role_selected")
      .map((event) => `r${event.payload.round}:${event.payload.characterId}`)
      .join("; "),
    supportMarks: count("support_marked"),
    modelMs: time.model,
    partnerMs: time.partner,
    waitMs: time.wait,
    recordMs: time.record,
    ownPlaybackMs: time.own,
  };
}
