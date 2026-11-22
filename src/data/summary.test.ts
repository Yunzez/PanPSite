import assert from "node:assert/strict";
import { test } from "node:test";
import type { EventRow } from "./db.ts";
import { summarizeActivity } from "./summary.ts";

const event = (tMono: number, type: string, payload: Record<string, unknown> = {}): EventRow => ({
  sessionId: "s1",
  seq: 0,
  t: 1_700_000_000_000 + tMono,
  tMono,
  activity: "rehearse",
  type,
  payload,
  schemaVersion: 1,
  syncedAt: null,
});

test("separates model, waiting and recording time for one line", () => {
  const summary = summarizeActivity([
    event(0, "activity_start"),
    event(0, "model_play_start", { lineId: "L01", reason: "auto" }),
    event(2000, "model_play_end"),
    event(2000, "turn_wait_start"),
    event(3500, "record_start"),
    event(6500, "record_stop"),
    event(6600, "take_saved"),
    event(6600, "round_complete", { round: 1, required: 1 }),
    event(7000, "activity_end"),
  ]);
  assert.equal(summary.modelMs, 2000);
  assert.equal(summary.waitMs, 1500);
  assert.equal(summary.recordMs, 3000);
  assert.equal(summary.durationMs, 7000);
  assert.equal(summary.takes, 1);
  assert.equal(summary.modelPlays, 1);
  assert.equal(summary.modelReplays, 0);
  assert.equal(summary.roundsCompleted, 1);
  assert.equal(summary.roundsRequired, 1);
});

test("does not count paused time as listening", () => {
  const summary = summarizeActivity([
    event(0, "activity_start"),
    event(0, "model_play_start", { reason: "play" }),
    event(3000, "pause"),
    event(8000, "resume"),
    event(12000, "model_play_end", { completed: true }),
    event(12500, "activity_end"),
  ]);
  assert.equal(summary.modelMs, 7000);
  assert.equal(summary.modelPlays, 1);
});

test("counts replays, re-reads and own playback separately from required work", () => {
  const summary = summarizeActivity([
    event(0, "activity_start"),
    event(0, "model_play_start", { reason: "auto" }),
    event(1000, "model_play_end"),
    event(1000, "turn_wait_start"),
    event(1500, "model_play_start", { reason: "listen_again" }),
    event(2500, "model_play_end"),
    event(2500, "turn_wait_start"),
    event(3000, "own_playback_start"),
    event(3800, "own_playback_end"),
    event(3800, "turn_wait_start"),
    event(4000, "read_again"),
    event(4000, "turn_wait_start"),
    event(4200, "record_start"),
    event(5200, "record_stop"),
    event(5300, "take_saved"),
  ]);
  assert.equal(summary.modelPlays, 2);
  assert.equal(summary.modelReplays, 1);
  assert.equal(summary.ownPlaybacks, 1);
  assert.equal(summary.ownPlaybackMs, 800);
  assert.equal(summary.rereads, 1);
  assert.equal(summary.modelMs, 2000);
  assert.equal(summary.waitMs, 500 + 500 + 200 + 200);
  assert.equal(summary.recordMs, 1000);
  // The activity never ended, so it has no duration.
  assert.equal(summary.durationMs, null);
});

test("reports the chosen character per round and the time spent on partner audio", () => {
  const summary = summarizeActivity([
    event(0, "activity_start"),
    event(500, "role_selected", { round: 1, characterId: "pig" }),
    event(500, "turn_wait_start"),
    event(900, "record_start"),
    event(1900, "record_stop"),
    event(2000, "partner_play_start", { lineId: "L02" }),
    event(3500, "partner_play_end"),
    event(3500, "round_complete", { round: 1, required: 2 }),
    event(5000, "role_selected", { round: 2, characterId: "monkey" }),
    event(5000, "partner_play_start", { lineId: "L01" }),
    event(6200, "partner_play_end"),
  ]);
  assert.equal(summary.roles, "r1:pig; r2:monkey");
  assert.equal(summary.partnerMs, 1500 + 1200);
  assert.equal(summary.waitMs, 400);
  assert.equal(summary.recordMs, 1000);
  assert.equal(summary.roundsRequired, 2);
});

test("an activity with no rounds reports none required", () => {
  const summary = summarizeActivity([event(0, "activity_start"), event(100, "activity_end")]);
  assert.equal(summary.roundsRequired, null);
  assert.equal(summary.roundsCompleted, 0);
});

test("adds up time on both sides of a page reload, without the gap", () => {
  const summary = summarizeActivity([
    event(100_000, "activity_start"),
    event(100_000, "model_play_start", { reason: "auto" }),
    event(102_000, "model_play_end"),
    event(102_000, "turn_wait_start"),
    event(103_000, "record_start"),
    // Page closed during this recording; nothing more was logged.
    // After the reload the monotonic clock starts again near zero.
    event(4_000, "session_resumed", { round: 1, stepIndex: 0 }),
    event(4_000, "model_play_start", { reason: "auto" }),
    event(6_000, "model_play_end"),
    event(6_000, "turn_wait_start"),
    event(6_500, "record_start"),
    event(8_500, "record_stop"),
    event(9_000, "activity_end", { completed: true }),
  ]);
  assert.equal(summary.modelMs, 2000 + 2000);
  assert.equal(summary.waitMs, 1000 + 500);
  // The cut-off recording has no known length, so only the finished one counts.
  assert.equal(summary.recordMs, 2000);
  // 3 s before the reload (up to the last event) plus 5 s after it.
  assert.equal(summary.durationMs, 3000 + 5000);
});
