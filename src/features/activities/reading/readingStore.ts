import { create } from "zustand";
import type { Line } from "@/content/schema";
import type { Mode } from "@/data/db";
import { getTakeBlob, saveTake } from "@/data/recordings";
import type { ActivityContext, ActivityController } from "@/features/session/activity";
import { audio, getRecorder } from "@/features/session/engines";
import type { Take } from "@/media/recorder";

/**
 * The read-aloud loop shared by two activities:
 *
 * - `rehearse` (Listen and Read, requirements §5): for every line, the model
 *   plays, stops, and the student records it.
 * - `perform` (Read Again / Read and Act, §6): the student reads their lines
 *   without the model, for a configurable number of rounds. In Mode B the app
 *   will read the other characters' lines ("partner" steps).
 *
 * One line, for the student:
 *
 *   [modelPlaying →] ready → arming → recording → saving → next step
 *
 * Each action checks the phase it is allowed in. Record always silences the
 * audio engine first, so no model or partner audio can overlap a recording.
 * A take is written before the script moves on; if writing fails the take is
 * kept in memory and the script stays where it is.
 */
export type ReadingActivity = "rehearse" | "perform";

export type ReadingPhase =
  | "idle"
  | "modelPlaying"
  | "partnerPlaying"
  | "ready"
  | "arming"
  | "recording"
  | "saving"
  | "saveFailed"
  | "ownPlayback"
  | "roundDone"
  | "finished";

/** One entry of the script plan: who reads which line. */
export type ReadingStep = { lineIndex: number; kind: "student" | "partner" };

type ReadingState = {
  activity: ReadingActivity;
  mode: Mode;
  lines: Line[];
  steps: ReadingStep[];
  /** Whether the model plays automatically before each student line. */
  modelFirst: boolean;
  rounds: number;
  /** 1-based. */
  round: number;
  stepIndex: number;
  phase: ReadingPhase;
  /** Most recent take of this activity, for "Hear my reading". */
  lastTakeId: string | null;
  error: string | null;

  record: () => Promise<void>;
  done: () => Promise<void>;
  retrySave: () => Promise<void>;
  listen: () => void;
  hearMine: () => Promise<void>;
  readAgain: () => void;
  nextRound: () => void;
  finish: () => void;
};

let context: ActivityContext | null = null;
/** A finished take not yet written to the database. */
let pendingTake: Take | null = null;
/**
 * Set while re-reading the last line after a round has ended: the phase to
 * return to once that take is saved, instead of ending the round twice.
 */
let returnPhase: "roundDone" | "finished" | null = null;

const describeError = (error: unknown) => (error instanceof Error ? error.message : String(error));

export const useReadingStore = create<ReadingState>((set, get) => ({
  activity: "rehearse",
  mode: "A",
  lines: [],
  steps: [],
  modelFirst: true,
  rounds: 1,
  round: 1,
  stepIndex: 0,
  phase: "idle",
  lastTakeId: null,
  error: null,

  record: async () => {
    const activity = context;
    if (get().phase !== "ready" || !activity) return;
    audio.stop();
    // "arming" covers the moment before the recorder is really running, so a
    // quick second tap cannot reach Done too early.
    set({ phase: "arming", error: null });
    try {
      await getRecorder().start();
    } catch (error) {
      if (context === activity) set({ phase: "ready", error: `Could not start recording: ${describeError(error)}` });
      return;
    }
    if (context !== activity) return;
    set({ phase: "recording" });
    activity.log("record_start", { lineId: currentLine().id, round: get().round });
  },

  done: async () => {
    const activity = context;
    if (get().phase !== "recording" || !activity) return;
    set({ phase: "saving" });
    try {
      pendingTake = await getRecorder().stop();
    } catch (error) {
      if (context === activity) set({ phase: "ready", error: `Recording failed: ${describeError(error)}` });
      return;
    }
    activity.log("record_stop", {
      lineId: currentLine().id,
      round: get().round,
      durationMs: pendingTake.durationMs,
    });
    await persistPendingTake();
  },

  retrySave: async () => {
    if (get().phase !== "saveFailed") return;
    set({ phase: "saving", error: null });
    await persistPendingTake();
  },

  listen: () => {
    if (get().phase !== "ready") return;
    void playModel(get().activity === "rehearse" ? "listen_again" : "listen_carefully");
  },

  hearMine: async () => {
    const activity = context;
    const { phase, lastTakeId } = get();
    if (phase !== "ready" || !lastTakeId || !activity) return;
    set({ phase: "ownPlayback" });
    activity.log("own_playback_start", { recordingId: lastTakeId });
    try {
      const blob = await getTakeBlob(lastTakeId);
      if (blob) await audio.playBlob(blob);
    } catch {
      // Playback of an own take is a convenience; a failure must not block reading.
    }
    if (context !== activity) return;
    activity.log("own_playback_end", { recordingId: lastTakeId });
    if (get().phase === "ownPlayback") {
      set({ phase: "ready" });
      activity.log("turn_wait_start", { lineId: currentLine().id });
    }
  },

  readAgain: () => {
    const activity = context;
    const { phase, steps, stepIndex } = get();
    if (!activity) return;

    if (phase === "roundDone" || phase === "finished") {
      // Re-read the last student line of the round that just ended.
      const last = steps.findLastIndex((step) => step.kind === "student");
      if (last < 0) return;
      returnPhase = phase;
      set({ stepIndex: last, phase: "ready", error: null });
    } else if (phase === "ready") {
      // Go back to the student line read just before this one.
      const previous = steps.slice(0, stepIndex).findLastIndex((step) => step.kind === "student");
      if (previous < 0) return;
      audio.stop();
      set({ stepIndex: previous, error: null });
    } else {
      return;
    }
    const lineId = currentLine().id;
    activity.log("read_again", { lineId, round: get().round });
    activity.log("turn_wait_start", { lineId });
  },

  nextRound: () => {
    if (get().phase !== "roundDone") return;
    set({ round: get().round + 1, stepIndex: 0 });
    void beginStep();
  },

  finish: () => {
    if (get().phase === "finished") context?.complete();
  },
}));

function currentLine(): Line {
  const { lines, steps, stepIndex } = useReadingStore.getState();
  return lines[steps[stepIndex].lineIndex];
}

/** Starts whatever the current step calls for. */
async function beginStep(): Promise<void> {
  const activity = context;
  if (!activity) return;
  const { steps, stepIndex, modelFirst } = useReadingStore.getState();
  const line = currentLine();

  if (steps[stepIndex].kind === "partner") {
    useReadingStore.setState({ phase: "partnerPlaying" });
    activity.log("partner_play_start", { lineId: line.id });
    const result = await audio.play(line.audio);
    if (context !== activity || result !== "ended") return;
    activity.log("partner_play_end", { lineId: line.id });
    await advance();
    return;
  }

  if (modelFirst) {
    await playModel("auto");
    return;
  }
  useReadingStore.setState({ phase: "ready" });
  activity.log("turn_wait_start", { lineId: line.id });
}

/** Plays the model for the current line, then hands over to the student. */
async function playModel(reason: "auto" | "listen_again" | "listen_carefully"): Promise<void> {
  const activity = context;
  if (!activity) return;
  const line = currentLine();
  useReadingStore.setState({ phase: "modelPlaying" });
  activity.log("model_play_start", { lineId: line.id, reason });
  const result = await audio.play(line.audio);
  if (context !== activity || result !== "ended") return;
  activity.log("model_play_end", { lineId: line.id });
  if (useReadingStore.getState().phase === "modelPlaying") {
    useReadingStore.setState({ phase: "ready" });
    activity.log("turn_wait_start", { lineId: line.id });
  }
}

/** Writes the pending take, then moves on. On failure it stays put. */
async function persistPendingTake(): Promise<void> {
  const activity = context;
  const take = pendingTake;
  if (!activity || !take) return;
  const state = useReadingStore.getState();
  const line = currentLine();
  try {
    const row = await saveTake(
      {
        sessionId: activity.sessionId,
        activity: state.activity,
        round: state.round,
        lineId: line.id,
        characterId: line.characterId,
        startedAt: take.startedAt,
        durationMs: take.durationMs,
        mimeType: take.mimeType,
      },
      take.blob,
    );
    pendingTake = null;
    if (context !== activity) return;
    activity.log("take_saved", {
      recordingId: row.recordingId,
      lineId: line.id,
      round: row.round,
      take: row.take,
    });
    useReadingStore.setState({ lastTakeId: row.recordingId, error: null });
  } catch (error) {
    if (context !== activity) return;
    activity.log("take_save_failed", { lineId: line.id, message: describeError(error) });
    useReadingStore.setState({ phase: "saveFailed", error: "Could not save. Please ask your teacher for help." });
    return;
  }

  if (returnPhase) {
    // This was a re-read after the round had already ended.
    useReadingStore.setState({ phase: returnPhase });
    returnPhase = null;
    return;
  }
  await advance();
}

/** Moves to the next step, or ends the round after the last one. */
async function advance(): Promise<void> {
  const activity = context;
  if (!activity) return;
  const { stepIndex, steps, round, rounds, activity: name } = useReadingStore.getState();
  if (stepIndex + 1 < steps.length) {
    useReadingStore.setState({ stepIndex: stepIndex + 1 });
    await beginStep();
    return;
  }
  activity.log("round_complete", { round, required: rounds });
  // One star per completed round; it marks completion, not accuracy.
  activity.awardStar(`${name}_round_${round}`);
  useReadingStore.setState({ phase: round < rounds ? "roundDone" : "finished" });
}

function enter(activityContext: ActivityContext, activity: ReadingActivity): void {
  context = activityContext;
  pendingTake = null;
  returnPhase = null;
  const { material, config, mode } = activityContext;
  useReadingStore.setState({
    activity,
    mode,
    lines: material.lines,
    // Every line is read by the student. Mode B's "Read and Act" will replace
    // this plan with the chosen role's lines plus partner steps.
    steps: material.lines.map((_, lineIndex) => ({ lineIndex, kind: "student" as const })),
    modelFirst: activity === "rehearse",
    rounds: activity === "rehearse" ? 1 : config.performRounds,
    round: 1,
    stepIndex: 0,
    phase: "idle",
    lastTakeId: null,
    error: null,
  });
  void beginStep();
}

function leave(): void {
  context = null;
  pendingTake = null;
  returnPhase = null;
  audio.stop();
  // Abandons a take that is still being recorded, keeping the microphone
  // policy intact for the next activity.
  try {
    if (getRecorder().isRecording) void getRecorder().stop().catch(() => {});
  } catch {
    // No recorder: nothing to stop.
  }
  useReadingStore.setState({ phase: "idle" });
}

export const rehearseController: ActivityController = {
  enter: (activityContext) => enter(activityContext, "rehearse"),
  leave,
};

export const performController: ActivityController = {
  enter: (activityContext) => enter(activityContext, "perform"),
  leave,
};
