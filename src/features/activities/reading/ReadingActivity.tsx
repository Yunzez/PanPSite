"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { ActivityFrame, DoneMessage } from "@/features/session/ActivityFrame";
import { CharacterStage } from "@/features/session/CharacterStage";
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

const choiceClass = (selected: boolean) =>
  `rounded-lg border-2 font-bold transition-colors ${
    selected ? "border-primary bg-highlight" : "border-line bg-surface"
  }`;

/**
 * Listen and Read, and Read Again / Read and Act: the script plus Record → Done.
 *
 * Mode A shows plain text only. Mode B adds the stage above the script (scene,
 * camera preview with the character's ears and nose), speaker names, and in
 * Read and Act the choice of a character.
 */
export function ReadingActivity() {
  const activity = useReadingStore((state) => state.activity);
  const lines = useReadingStore((state) => state.lines);
  const steps = useReadingStore((state) => state.steps);
  const stepIndex = useReadingStore((state) => state.stepIndex);
  const phase = useReadingStore((state) => state.phase);
  const round = useReadingStore((state) => state.round);
  const rounds = useReadingStore((state) => state.rounds);
  const roleOptions = useReadingStore((state) => state.roleOptions);
  const pendingRole = useReadingStore((state) => state.pendingRole);
  const role = useReadingStore((state) => state.role);
  const hasTake = useReadingStore((state) => state.lastTakeId !== null);
  const error = useReadingStore((state) => state.error);
  const isModeB = useSessionStore((state) => state.session?.mode === "B");
  const material = useSessionStore((state) => state.material);
  const actions = useReadingStore.getState();

  const currentLineIndex = steps[stepIndex]?.lineIndex ?? 0;
  const currentRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    // Keeps the current line in view, with its neighbours around it.
    currentRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [currentLineIndex, round, phase]);

  const character = (characterId: string | null | undefined) =>
    material?.characters.find((candidate) => candidate.id === characterId);
  const acting = isModeB && activity === "perform";
  // Who the student appears as: the current speaker while rehearsing every
  // role, the chosen (or tapped) character in Read and Act.
  const stageCharacter = isModeB
    ? character(activity === "rehearse" ? lines[currentLineIndex]?.characterId : (role ?? pendingRole))
    : undefined;
  const stage = (className: string) => (
    <CharacterStage
      className={className}
      filter={stageCharacter?.filter ?? null}
      sceneUrl={material?.scene?.image}
      label={stageCharacter?.name}
    />
  );

  const roundNote = rounds > 1 ? `Round ${round} of ${rounds}` : undefined;
  const instruction =
    activity === "rehearse"
      ? "Listen and read."
      : acting
        ? "Listen to your friend. Read your lines when it is your turn."
        : "Read the lines again.";

  if (phase === "roleSelect") {
    return (
      <ActivityFrame
        instruction="Choose a character."
        note={roundNote}
        main={
          <Button size="lg" disabled={!pendingRole} onClick={actions.confirmRole}>
            Next
          </Button>
        }
      >
        <div className="flex h-full flex-col gap-4">
          {stage("min-h-0 flex-1")}
          <div className="flex justify-center gap-4" role="radiogroup" aria-label="Character">
            {roleOptions.map((characterId) => (
              <button
                key={characterId}
                type="button"
                role="radio"
                aria-checked={pendingRole === characterId}
                onClick={() => actions.chooseRole(characterId)}
                className={`min-h-main-button min-w-48 px-8 text-3xl ${choiceClass(pendingRole === characterId)}`}
              >
                {character(characterId)?.name}
              </button>
            ))}
          </div>
        </div>
      </ActivityFrame>
    );
  }

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
        {isModeB && stage("h-2/5 shrink-0")}
        <ol className="min-h-0 flex-1 overflow-y-auto rounded-lg border-2 border-line bg-surface p-4">
          {lines.map((line, index) => {
            const current = index === currentLineIndex;
            return (
              <li
                key={line.id}
                ref={current ? currentRef : undefined}
                aria-current={current ? "step" : undefined}
                className={`rounded-md px-4 py-2 leading-snug ${
                  current ? "bg-highlight text-4xl font-bold" : "text-2xl text-ink-muted"
                }`}
              >
                {/* Mode A is plain text: speaker names appear in Mode B only. */}
                {isModeB && (
                  <span className="mr-3 text-xl font-bold text-primary-dark">
                    {character(line.characterId)?.name}
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
          {error ? (
            error
          ) : acting && phase === "ready" ? (
            <>
              <span className="rounded-md bg-accent px-3 font-bold">Your turn!</span>
              Tap Record. Read like your role!
            </>
          ) : acting && phase === "recording" ? (
            "Read like your role! Tap Done when you finish."
          ) : (
            (prompts[phase] ?? "")
          )}
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
