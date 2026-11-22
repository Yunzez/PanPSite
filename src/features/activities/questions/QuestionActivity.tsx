"use client";

import { Button } from "@/components/ui/Button";
import { ActivityFrame } from "@/features/session/ActivityFrame";
import { useTheme } from "@/theme/useTheme";
import { useQuestionStore, type QuestionItem } from "./questionStore";

// Mouth shapes for the four faces, from least to most positive.
const MOUTHS = [
  "M30 70 Q50 52 70 70",
  "M32 67 Q50 60 68 67",
  "M32 63 Q50 72 68 63",
  "M28 60 Q50 84 72 60",
];

/** One of four plain faces. All share one colour, so only the expression differs. */
function Face({ level }: { level: number }) {
  const { color } = useTheme();
  return (
    <svg viewBox="0 0 100 100" className="size-28" aria-hidden="true">
      <circle cx="50" cy="50" r="46" fill={color.secondary} stroke={color.secondaryDark} strokeWidth="3" />
      <circle cx="36" cy="42" r="5" fill={color.ink} />
      <circle cx="64" cy="42" r="5" fill={color.ink} />
      <path d={MOUTHS[level]} fill="none" stroke={color.ink} strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

const optionClass = (selected: boolean) =>
  `rounded-lg border-2 font-bold transition-colors ${
    selected ? "border-primary bg-highlight" : "border-line bg-surface"
  }`;

/** Check the Story and Post-Session Feedback: one question per screen. */
export function QuestionActivity() {
  const items = useQuestionStore((state) => state.items);
  const index = useQuestionStore((state) => state.index);
  const selectedId = useQuestionStore((state) => state.selectedId);
  const stage = useQuestionStore((state) => state.stage);
  const closingMessage = useQuestionStore((state) => state.closingMessage);
  const saving = useQuestionStore((state) => state.saving);
  const error = useQuestionStore((state) => state.error);
  const { select, next, finish } = useQuestionStore.getState();
  const item: QuestionItem | undefined = items[index];
  if (!item) return null;

  const isQuiz = item.kind === "quiz";
  const instruction = isQuiz
    ? "Choose the best answer."
    : "There are no right or wrong answers. Choose how you feel.";
  const note = isQuiz ? undefined : "这里没有正确或错误的答案，请选择你自己的感受。";

  if (stage === "closing") {
    return (
      <ActivityFrame
        instruction={instruction}
        note={note}
        main={
          <Button size="lg" onClick={finish}>
            Next
          </Button>
        }
      >
        <p className="flex h-full items-center justify-center text-center text-5xl font-bold">
          {closingMessage}
        </p>
      </ActivityFrame>
    );
  }

  const isLast = index === items.length - 1;
  const nextLabel = isQuiz ? (isLast ? "Done" : "Next") : isLast ? "Done / 完成" : "Next / 下一题";

  return (
    <ActivityFrame
      instruction={instruction}
      note={note}
      main={
        <Button size="lg" disabled={!selectedId || saving} onClick={() => void next()}>
          {nextLabel}
        </Button>
      }
    >
      <div className="flex h-full flex-col justify-center gap-8">
        <div>
          <p className="text-xl text-ink-muted">
            {index + 1} / {items.length}
          </p>
          <h2 className="text-4xl font-bold">{item.prompt}</h2>
          {item.promptZh && <p className="mt-1 text-3xl">{item.promptZh}</p>}
        </div>

        {item.display === "faces" ? (
          <div className="grid grid-cols-4 gap-4" role="radiogroup" aria-label={item.prompt}>
            {item.options.map((option, level) => (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={selectedId === option.id}
                onClick={() => select(option.id)}
                className={`flex flex-col items-center gap-2 p-4 ${optionClass(selectedId === option.id)}`}
              >
                <Face level={level} />
                <span className="text-xl">{option.label}</span>
                <span className="text-xl font-normal">{option.labelZh}</span>
              </button>
            ))}
          </div>
        ) : (
          <div
            className={`grid gap-4 ${item.options.length > 3 ? "grid-cols-2" : "grid-cols-1"}`}
            role="radiogroup"
            aria-label={item.prompt}
          >
            {item.options.map((option) => (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={selectedId === option.id}
                onClick={() => select(option.id)}
                className={`min-h-main-button px-6 py-3 text-left text-3xl ${optionClass(
                  selectedId === option.id,
                )}`}
              >
                {option.label}
                {option.labelZh && <span className="ml-3 font-normal">/ {option.labelZh}</span>}
              </button>
            ))}
          </div>
        )}

        {error && (
          <p role="alert" className="text-2xl font-bold">
            {error}
          </p>
        )}
      </div>
    </ActivityFrame>
  );
}
