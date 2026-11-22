import { create } from "zustand";
import type { WordItem } from "@/content/schema";
import type { ActivityContext, ActivityController } from "@/features/session/activity";
import { audio } from "@/features/session/engines";

/**
 * Learn the Words (requirements §3).
 *
 * For each word: the model sequence plays with the highlight following the
 * audio ("model"), then the student may tap any chunk to hear it, as often as
 * they like ("practice"). After the last word they get one completion star.
 * Nothing here judges pronunciation.
 */
export type WordsStage = "model" | "practice" | "finished";

/** Which chunks are lit: some chunk indexes, the whole word, or nothing. */
export type Highlight = number[] | "all" | null;

type WordsState = {
  words: WordItem[];
  index: number;
  stage: WordsStage;
  highlight: Highlight;
  listenAgain: () => void;
  tapChunk: (chunkIndex: number) => Promise<void>;
  next: () => void;
  finish: () => void;
};

let context: ActivityContext | null = null;

export const useWordsStore = create<WordsState>((set, get) => ({
  words: [],
  index: 0,
  stage: "model",
  highlight: null,

  listenAgain: () => {
    if (get().stage !== "practice") return;
    void playModel("listen_again");
  },

  tapChunk: async (chunkIndex) => {
    const word = get().words[get().index];
    const chunk = word?.chunks[chunkIndex];
    if (get().stage !== "practice" || !chunk || !context) return;
    const lit: Highlight = [chunkIndex];
    set({ highlight: lit });
    context.log("chunk_tap", { wordId: word.id, chunkIndex });
    await audio.play(chunk.audio);
    // Clear the light unless another tap has already replaced it.
    if (get().highlight === lit) set({ highlight: null });
  },

  next: () => {
    // Only reachable in "practice", i.e. once the model has been heard in full.
    if (get().stage !== "practice" || !context) return;
    audio.stop();
    const { index, words } = get();
    if (index + 1 < words.length) {
      set({ index: index + 1 });
      context.saveProgress({ index: index + 1 });
      void playModel("auto");
      return;
    }
    set({ stage: "finished", highlight: null });
    context.awardStar("words");
    context.saveProgress({ finished: true });
  },

  finish: () => {
    if (get().stage === "finished") context?.complete();
  },
}));

/** Plays the current word's model clips in order, lighting chunks as it goes. */
async function playModel(reason: "auto" | "listen_again"): Promise<void> {
  const activity = context;
  const { words, index } = useWordsStore.getState();
  const word = words[index];
  if (!word || !activity) return;
  useWordsStore.setState({ stage: "model", highlight: null });
  activity.log("model_play_start", { wordId: word.id, reason });
  const result = await audio.playSequence(
    word.model.map((step) => step.audio),
    (step) => useWordsStore.setState({ highlight: word.model[step].highlight }),
  );
  // "stopped" means the activity was left meanwhile; nothing more to do.
  if (result !== "ended" || context !== activity) return;
  activity.log("model_play_end", { wordId: word.id });
  useWordsStore.setState({ stage: "practice", highlight: null });
}

export const wordsController: ActivityController = {
  enter: (activityContext, resume) => {
    context = activityContext;
    const words = activityContext.material.words;
    if (words.length === 0) {
      activityContext.complete();
      return;
    }
    if (resume?.finished) {
      // The star was already given; only the final Next is left.
      useWordsStore.setState({ words, index: words.length - 1, stage: "finished", highlight: null });
      return;
    }
    const index = typeof resume?.index === "number" ? Math.min(resume.index, words.length - 1) : 0;
    useWordsStore.setState({ words, index, stage: "model", highlight: null });
    void playModel("auto");
  },
  leave: () => {
    context = null;
    audio.stop();
  },
  position: () => {
    const { words, index } = useWordsStore.getState();
    return { wordId: words[index]?.id };
  },
};
