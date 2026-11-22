"use client";

import { Button } from "@/components/ui/Button";
import { ActivityFrame, DoneMessage } from "@/features/session/ActivityFrame";
import { useWordsStore } from "./wordsStore";

const instructions = {
  model: "Watch and listen.",
  practice: "Tap a part. Listen. Now you try.",
  finished: "Word practice done!",
} as const;

export function WordsActivity() {
  const words = useWordsStore((state) => state.words);
  const index = useWordsStore((state) => state.index);
  const stage = useWordsStore((state) => state.stage);
  const highlight = useWordsStore((state) => state.highlight);
  const { listenAgain, tapChunk, next, finish } = useWordsStore.getState();
  const word = words[index];

  if (stage === "finished" || !word) {
    return (
      <ActivityFrame
        instruction={instructions.finished}
        main={
          <Button size="lg" onClick={finish}>
            Next
          </Button>
        }
      >
        <DoneMessage message="Word practice done!" />
      </ActivityFrame>
    );
  }

  const isLit = (chunkIndex: number) =>
    highlight === "all" || (Array.isArray(highlight) && highlight.includes(chunkIndex));
  const isLastWord = index === words.length - 1;

  return (
    <ActivityFrame
      instruction={instructions[stage]}
      secondary={
        <Button variant="secondary" disabled={stage !== "practice"} onClick={listenAgain}>
          Listen again
        </Button>
      }
      main={
        <Button size="lg" disabled={stage !== "practice"} onClick={next}>
          {isLastWord ? "Done" : "Next"}
        </Button>
      }
    >
      <div className="flex h-full items-center justify-center gap-12">
        {/* The picture is researcher-supplied content, sized by its container. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={word.image}
          alt=""
          className="aspect-square h-full max-h-80 rounded-lg border-2 border-line object-cover"
        />
        <div className="flex flex-col items-center gap-6">
          {/* The whole word stays visible; its parts are the buttons. */}
          <div className="flex gap-2" role="group" aria-label={word.text}>
            {word.chunks.map((chunk, chunkIndex) => (
              <button
                key={chunkIndex}
                type="button"
                onClick={() => void tapChunk(chunkIndex)}
                className={`min-h-touch rounded-md border-2 px-4 py-2 text-8xl font-bold transition-colors ${
                  isLit(chunkIndex) ? "border-primary bg-highlight" : "border-line bg-surface"
                }`}
              >
                {chunk.text}
              </button>
            ))}
          </div>
          <p className="text-xl text-ink-muted">
            {index + 1} / {words.length}
          </p>
        </div>
      </div>
    </ActivityFrame>
  );
}
