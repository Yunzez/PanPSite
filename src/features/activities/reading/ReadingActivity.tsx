"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { ActivityFrame, DoneMessage } from "@/features/session/ActivityFrame";
import { useSessionStore } from "@/features/session/sessionStore";
import { useReadingStore, type ReadingPhase } from "./readingStore";

const prompts: Partial<Record<ReadingPhase, string>> = {
  modelPlaying: "Listen.",
  partnerPlaying: "Listen to your friend.",
  ready: "Tap Record. Read the line. Tap Done when you finish.",
  arming: "Get ready…",
  recording: "Read the line. Tap Done when you finish.",
  saving: "Saving…",
  ownPlayback: "This is your reading.",
};

/** Listen and Read, and Read Again / Read and Act: the script plus Record → Done. */
export function ReadingActivity() {
  const activity = useReadingStore((state) => state.activity);
  const lines = useReadingStore((state) => state.lines);
  const steps = useReadingStore((state) => state.steps);
  const stepIndex = useReadingStore((state) => state.stepIndex);
  const phase = useReadingStore((state) => state.phase);
  const round = useReadingStore((state) => state.round);
  const rounds = useReadingStore((state) => state.rounds);
  const hasTake = useReadingStore((state) => state.lastTakeId !== null);
  const error = useReadingStore((state) => state.error);
  const mode = useSessionStore((state) => state.session?.mode);
  const characters = useSessionStore((state) => state.material?.characters);
  const actions = useReadingStore.getState();

  const currentLineIndex = steps[stepIndex]?.lineIndex ?? 0;
  const currentRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    // Keeps the current line in view, with its neighbours around it.
    currentRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [currentLineIndex, round]);

  const instruction = activity === "rehearse" ? "Listen and read." : "Read the lines again.";
  const roundNote = rounds > 1 ? `Round ${round} of ${rounds}` : undefined;

  if (phase === "roundDone" || phase === "finished") {
    return (
      <ActivityFrame
        instruction={instruction}
        note={roundNote}
        secondary={
          <Button variant="secondary" onClick={actions.readAgain}>
            Read again
          </Button>
        }
        main={
          <Button size="lg" onClick={phase === "finished" ? actions.finish : actions.nextRound}>
            Next
          </Button>
        }
      >
        <DoneMessage message={phase === "finished" ? "Practice done!" : `Round ${round} done!`} />
      </ActivityFrame>
    );
  }

  const canReadAgain =
    phase === "ready" && steps.slice(0, stepIndex).some((step) => step.kind === "student");

  return (
    <ActivityFrame
      instruction={instruction}
      note={roundNote}
      secondary={
        <>
          <Button variant="secondary" disabled={phase !== "ready"} onClick={actions.listen}>
            {activity === "rehearse" ? "Listen again" : "Listen carefully"}
          </Button>
          {activity === "rehearse" && (
            <Button
              variant="secondary"
              disabled={phase !== "ready" || !hasTake}
              onClick={() => void actions.hearMine()}
            >
              Hear my reading
            </Button>
          )}
          <Button variant="secondary" disabled={!canReadAgain} onClick={actions.readAgain}>
            Read again
          </Button>
        </>
      }
      main={<MainButton phase={phase} />}
    >
      <div className="flex h-full flex-col gap-3">
        <ol className="min-h-0 flex-1 overflow-y-auto rounded-lg border-2 border-line bg-surface p-6">
          {lines.map((line, index) => {
            const current = index === currentLineIndex;
            return (
              <li
                key={line.id}
                ref={current ? currentRef : undefined}
                aria-current={current ? "step" : undefined}
                className={`rounded-md px-4 py-3 leading-snug ${
                  current ? "bg-highlight text-4xl font-bold" : "text-2xl text-ink-muted"
                }`}
              >
                {/* Mode A is plain text: speaker names appear in Mode B only. */}
                {mode === "B" && (
                  <span className="mr-3 text-xl font-bold text-primary-dark">
                    {characters?.find((character) => character.id === line.characterId)?.name}
                  </span>
                )}
                {line.text}
              </li>
            );
          })}
        </ol>
        <p role="status" className="flex min-h-9 items-center gap-3 text-2xl">
          {phase === "recording" && (
            <span
              aria-hidden="true"
              className="inline-block size-5 animate-pulse rounded-full bg-record motion-reduce:animate-none"
            />
          )}
          {error ?? prompts[phase] ?? ""}
        </p>
      </div>
    </ActivityFrame>
  );
}

/** The one main control: Record, then Done. Done stops, saves and moves on. */
function MainButton({ phase }: { phase: ReadingPhase }) {
  const { record, done, retrySave } = useReadingStore.getState();
  if (phase === "recording") {
    return (
      <Button size="lg" onClick={() => void done()}>
        Done
      </Button>
    );
  }
  if (phase === "saveFailed") {
    return (
      <Button size="lg" onClick={() => void retrySave()}>
        Try again
      </Button>
    );
  }
  return (
    <Button variant="record" size="lg" disabled={phase !== "ready"} onClick={() => void record()}>
      Record
    </Button>
  );
}
