"use client";

import { Button } from "@/components/ui/Button";
import { tokenize } from "@/content/schema";
import { ActivityFrame } from "@/features/session/ActivityFrame";
import { useListenStore } from "./listenStore";

export function ListenActivity() {
  const lines = useListenStore((state) => state.lines);
  const status = useListenStore((state) => state.status);
  const lineIndex = useListenStore((state) => state.lineIndex);
  const wordIndex = useListenStore((state) => state.wordIndex);
  const canGoOn = useListenStore((state) => state.heardOnce || state.canSkip);
  const { toggle, listenAgain, next } = useListenStore.getState();

  return (
    <ActivityFrame
      instruction="Listen to the story. Follow the words."
      secondary={
        <Button variant="secondary" disabled={status === "idle"} onClick={listenAgain}>
          Listen again
        </Button>
      }
      main={
        <>
          {status !== "ended" && (
            <Button size="lg" onClick={() => void toggle()}>
              {status === "playing" ? "Pause" : "Play"}
            </Button>
          )}
          <Button
            size="lg"
            variant={status === "ended" ? "primary" : "quiet"}
            disabled={!canGoOn}
            onClick={next}
          >
            Next
          </Button>
        </>
      }
    >
      <div className="flex h-full flex-col justify-center gap-3 overflow-y-auto rounded-lg border-2 border-line bg-surface p-8">
        {lines.map((line, index) => {
          const speaking = index === lineIndex;
          return (
            // The same plain text in both modes: this step uses identical
            // content in A and B, so no speaker names here.
            <p key={line.id} className="text-3xl leading-relaxed">
              {tokenize(line.text).map((word, position) => {
                // Without word timings the whole line is highlighted instead.
                const lit = speaking && (line.words ? position === wordIndex : true);
                return (
                  <span key={position}>
                    <span className={`rounded-sm px-1 ${lit ? "bg-highlight" : ""}`}>{word}</span>{" "}
                  </span>
                );
              })}
            </p>
          );
        })}
      </div>
    </ActivityFrame>
  );
}
