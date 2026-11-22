import { create } from "zustand";
import { finalFeedbackItems, sessionFeedbackItems, type FeedbackItem } from "@/content/feedbackItems";
import type { ResponseRow } from "@/data/db";
import { saveResponse } from "@/data/sessions";
import type { ActivityContext, ActivityController } from "@/features/session/activity";

/**
 * One question per screen, one answer each. Used by two activities:
 *
 * - `quiz` (Check the Story, requirements §7): the material's comprehension
 *   questions, as plain text buttons.
 * - `feedback` (Post-Session Feedback, §8): three bilingual experience
 *   questions with face buttons, optionally followed by the two final
 *   character-feedback questions with text buttons.
 *
 * Nothing is preselected and there is no skip: Next works only after an
 * answer. The student may change their answer before Next; the first choice,
 * every change and the final choice are all stored. Answers never affect
 * stars and are never praised or corrected on screen.
 */
export type QuestionItem = {
  kind: ResponseRow["kind"];
  id: string;
  version: string;
  prompt: string;
  /** Chinese wording, for the bilingual experience questions. */
  promptZh?: string;
  display: "text" | "faces";
  options: { id: string; label: string; labelZh?: string }[];
  /** For scoring in the export only; never shown. */
  correctOptionId?: string;
};

type QuestionState = {
  items: QuestionItem[];
  index: number;
  selectedId: string | null;
  /** Shown after the last question, when the activity has a closing message. */
  stage: "asking" | "closing";
  closingMessage: string | null;
  saving: boolean;
  error: string | null;
  select: (optionId: string) => void;
  next: () => Promise<void>;
  finish: () => void;
};

let context: ActivityContext | null = null;
// The answer history of the question on screen.
let firstOptionId: string | null = null;
let changes: { optionId: string; t: number }[] = [];

export const useQuestionStore = create<QuestionState>((set, get) => ({
  items: [],
  index: 0,
  selectedId: null,
  stage: "asking",
  closingMessage: null,
  saving: false,
  error: null,

  select: (optionId) => {
    const { items, index, selectedId, stage, saving } = get();
    if (stage !== "asking" || saving || optionId === selectedId || !context) return;
    if (firstOptionId === null) firstOptionId = optionId;
    else changes.push({ optionId, t: Date.now() });
    set({ selectedId: optionId, error: null });
    context.log("answer_select", { questionId: items[index].id, optionId });
  },

  next: async () => {
    const activity = context;
    const { items, index, selectedId, stage, saving, closingMessage } = get();
    if (stage !== "asking" || saving || !selectedId || !activity) return;
    const item = items[index];
    const chosen = item.options.find((option) => option.id === selectedId);
    set({ saving: true });
    try {
      await saveResponse({
        sessionId: activity.sessionId,
        kind: item.kind,
        questionId: item.id,
        questionVersion: item.version,
        firstOptionId,
        changes,
        finalOptionId: selectedId,
        finalOptionLabel: chosen ? [chosen.label, chosen.labelZh].filter(Boolean).join(" / ") : null,
        correct: item.correctOptionId ? selectedId === item.correctOptionId : null,
        status: "answered",
      });
    } catch {
      // Stay on this question with the answer still selected.
      if (context === activity) {
        set({ saving: false, error: "Could not save. Please ask your teacher for help." });
      }
      return;
    }
    if (context !== activity) return;
    firstOptionId = null;
    changes = [];
    if (index + 1 < items.length) {
      set({ index: index + 1, selectedId: null, saving: false });
    } else if (closingMessage) {
      set({ stage: "closing", saving: false });
    } else {
      set({ saving: false });
      activity.complete();
    }
  },

  finish: () => {
    if (get().stage === "closing") context?.complete();
  },
}));

function enter(activityContext: ActivityContext, items: QuestionItem[], closingMessage: string | null): void {
  context = activityContext;
  firstOptionId = null;
  changes = [];
  if (items.length === 0) {
    activityContext.complete();
    return;
  }
  useQuestionStore.setState({
    items,
    index: 0,
    selectedId: null,
    stage: "asking",
    closingMessage,
    saving: false,
    error: null,
  });
}

function leave(): void {
  context = null;
}

const fromFeedback = (item: FeedbackItem, kind: QuestionItem["kind"], display: QuestionItem["display"]): QuestionItem => ({
  kind,
  id: item.id,
  version: item.version,
  prompt: item.en,
  promptZh: item.zh,
  display,
  options: item.options.map((option) => ({ id: option.id, label: option.en, labelZh: option.zh })),
});

export const quizController: ActivityController = {
  enter: (activityContext) =>
    enter(
      activityContext,
      activityContext.material.quiz.map((question) => ({
        kind: "quiz",
        id: question.id,
        version: question.version,
        prompt: question.prompt,
        display: "text",
        options: question.options.map((option) => ({ id: option.id, label: option.text })),
        correctOptionId: question.correctOptionId,
      })),
      null,
    ),
  leave,
};

export const feedbackController: ActivityController = {
  enter: (activityContext) =>
    enter(
      activityContext,
      [
        ...sessionFeedbackItems.map((item) => fromFeedback(item, "feedback", "faces")),
        ...(activityContext.config.finalFeedback
          ? finalFeedbackItems.map((item) => fromFeedback(item, "finalFeedback", "text"))
          : []),
      ],
      "Thank you for telling us! / 谢谢你告诉我们！",
    ),
  leave,
};
