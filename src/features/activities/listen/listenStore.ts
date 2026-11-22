import { create } from "zustand";
import type { Line } from "@/content/schema";
import type { ActivityContext, ActivityController } from "@/features/session/activity";
import { audio } from "@/features/session/engines";

/**
 * Listen First (requirements §4).
 *
 * The whole story plays line by line while the word being spoken is
 * highlighted. The student can pause, resume and listen again; nothing
 * advances on its own. Every playback is logged.
 */
export type ListenStatus = "idle" | "playing" | "paused" | "ended";

type ListenState = {
  lines: Line[];
  status: ListenStatus;
  /** Line being spoken, or -1. */
  lineIndex: number;
  /** Word being spoken within that line, or -1. */
  wordIndex: number;
  /** Whether the story has been heard once from start to finish. */
  heardOnce: boolean;
  /** Whether Next is allowed before a full listen (from the session settings). */
  canSkip: boolean;
  toggle: () => Promise<void>;
  listenAgain: () => void;
  next: () => void;
};

let context: ActivityContext | null = null;
let frame: number | null = null;

export const useListenStore = create<ListenState>((set, get) => ({
  lines: [],
  status: "idle",
  lineIndex: -1,
  wordIndex: -1,
  heardOnce: false,
  canSkip: false,

  toggle: async () => {
    const { status } = get();
    if (status === "idle" || status === "ended") {
      void playStory("play");
    } else if (status === "playing") {
      set({ status: "paused" });
      context?.log("pause");
      await audio.pause();
    } else {
      set({ status: "playing" });
      context?.log("resume");
      await audio.resume();
    }
  },

  listenAgain: () => {
    if (get().status === "idle") return;
    void playStory("listen_again");
  },

  next: () => {
    if (!get().heardOnce && !get().canSkip) return;
    logInterruptedPlayback();
    context?.complete();
  },
}));

/** Keeps `wordIndex` in step with the audio clock while the story plays. */
function followWords(): void {
  frame = requestAnimationFrame(followWords);
  const { status, lines, lineIndex, wordIndex } = useListenStore.getState();
  if (status !== "playing" || lineIndex < 0) return;
  const timings = lines[lineIndex].words;
  if (!timings) return;
  const elapsed = audio.elapsedMs();
  // A word stays lit until the next one starts, so nothing flickers in the gaps.
  let current = -1;
  for (let index = 0; index < timings.length && elapsed >= timings[index].start; index += 1) {
    current = index;
  }
  if (current !== wordIndex) useListenStore.setState({ wordIndex: current });
}

function stopFollowing(): void {
  if (frame !== null) cancelAnimationFrame(frame);
  frame = null;
}

/** Closes the log entry of a playback that is about to be cut short. */
function logInterruptedPlayback(): void {
  const { status } = useListenStore.getState();
  if (status === "playing" || status === "paused") {
    context?.log("model_play_end", { completed: false });
  }
}

async function playStory(reason: "play" | "listen_again"): Promise<void> {
  const activity = context;
  if (!activity) return;
  const { lines } = useListenStore.getState();
  logInterruptedPlayback();
  activity.log("model_play_start", { reason });
  useListenStore.setState({ status: "playing", lineIndex: 0, wordIndex: -1 });
  if (frame === null) followWords();
  const result = await audio.playSequence(
    lines.map((line) => line.audio),
    (index) => useListenStore.setState({ lineIndex: index, wordIndex: -1 }),
  );
  // "stopped": restarted by "Listen again" (that run now owns the state) or left.
  if (context !== activity || result !== "ended") return;
  stopFollowing();
  activity.log("model_play_end", { completed: true });
  useListenStore.setState({ status: "ended", lineIndex: -1, wordIndex: -1, heardOnce: true });
}

export const listenController: ActivityController = {
  enter: (activityContext) => {
    context = activityContext;
    useListenStore.setState({
      lines: activityContext.material.lines,
      status: "idle",
      lineIndex: -1,
      wordIndex: -1,
      heardOnce: false,
      canSkip: !activityContext.config.listenRequiresFullPlay,
    });
  },
  leave: () => {
    context = null;
    stopFollowing();
    audio.stop();
  },
};
