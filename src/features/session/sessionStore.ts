import { create } from "zustand";
import type { Material } from "@/content/schema";
import type { Mode, SessionRow } from "@/data/db";
import { flushEvents, logEvent, startEventLog, stopEventLog } from "@/data/events";
import { createSession, findMissingTakes, updateSession } from "@/data/sessions";
import { listenController } from "@/features/activities/listen/listenStore";
import { feedbackController, quizController } from "@/features/activities/questions/questionStore";
import { performController, rehearseController } from "@/features/activities/reading/readingStore";
import { wordsController } from "@/features/activities/words/wordsStore";
import { ACTIVITY_ORDER, type ActivityController, type ActivityId } from "./activity";
import { defaultSessionConfig, type SessionConfig } from "./config";
import { audio, releaseMedia } from "./engines";

/**
 * The overall flow of one session:
 *
 *   setup (researcher) → handover ("Let's read!") → the six activities, in
 *   order → saving → complete
 *
 * The mode comes from the launch link and is fixed for the session. Nothing
 * moves forward on a timer; every step follows a tap.
 */
export type SessionPhase = "setup" | "handover" | "activity" | "saving" | "saveFailed" | "complete";

type SessionState = {
  phase: SessionPhase;
  session: SessionRow | null;
  material: Material | null;
  config: SessionConfig;
  activityIndex: number;
  stars: number;
  error: string | null;

  /** Researcher has confirmed the setup: creates the session record. */
  begin: (input: { mode: Mode; studentId: string; material: Material; config: SessionConfig }) => Promise<void>;
  /** Student taps Start. */
  start: () => void;
  retrySave: () => Promise<void>;
  /** Back to the setup screen for the next student. */
  reset: () => void;
};

const controllers: Record<ActivityId, ActivityController> = {
  words: wordsController,
  listen: listenController,
  rehearse: rehearseController,
  perform: performController,
  quiz: quizController,
  feedback: feedbackController,
};

export const useSessionStore = create<SessionState>((set, get) => {
  const enterActivity = (index: number) => {
    const { session, material, config } = get();
    if (!session || !material) return;
    const id = ACTIVITY_ORDER[index];
    set({ phase: "activity", activityIndex: index });
    logEvent(id, "activity_start");
    // Remembered so an interrupted session can later resume at this activity.
    void updateSession(session.sessionId, { progress: { activity: id } }).catch(() => {});
    controllers[id].enter({
      sessionId: session.sessionId,
      mode: session.mode,
      material,
      config,
      log: (type, payload) => logEvent(id, type, payload),
      awardStar: (reason) => {
        set((state) => ({ stars: state.stars + 1 }));
        logEvent(id, "star_awarded", { reason });
      },
      complete: () => completeActivity(index),
    });
  };

  const completeActivity = (index: number) => {
    // Ignore a late call from an activity that is no longer the current one.
    if (get().phase !== "activity" || get().activityIndex !== index) return;
    const id = ACTIVITY_ORDER[index];
    controllers[id].leave();
    logEvent(id, "activity_end");
    if (index + 1 < ACTIVITY_ORDER.length) {
      enterActivity(index + 1);
    } else {
      logEvent("session", "session_end");
      void save();
    }
  };

  /** Shows "complete" only after everything is confirmed to be stored. */
  const save = async () => {
    const { session } = get();
    if (!session) return;
    set({ phase: "saving", error: null });
    try {
      await flushEvents();
      const missing = await findMissingTakes(session.sessionId);
      if (missing.length > 0) throw new Error(`${missing.length} recording(s) are missing`);
      await updateSession(session.sessionId, { status: "completed", endedAt: Date.now(), progress: null });
      releaseMedia();
      set({ phase: "complete" });
    } catch (error) {
      // Recordings and answers already stored stay where they are.
      set({ phase: "saveFailed", error: error instanceof Error ? error.message : String(error) });
    }
  };

  return {
    phase: "setup",
    session: null,
    material: null,
    config: defaultSessionConfig,
    activityIndex: 0,
    stars: 0,
    error: null,

    begin: async ({ mode, studentId, material, config }) => {
      if (get().phase !== "setup") return;
      const session = await createSession({
        studentId,
        materialId: material.id,
        materialVersion: material.version,
        mode,
        config: { ...config },
      });
      startEventLog(session.sessionId);
      logEvent("session", "setup_confirmed", { studentId, materialId: material.id, mode });
      set({ phase: "handover", session, material, config, activityIndex: 0, stars: 0, error: null });
    },

    start: () => {
      if (get().phase !== "handover") return;
      // Inside the student's tap: this is what lets audio play from now on.
      void audio.unlock();
      logEvent("session", "session_start");
      enterActivity(0);
    },

    retrySave: async () => {
      if (get().phase !== "saveFailed") return;
      await save();
    },

    reset: () => {
      const { phase, activityIndex } = get();
      if (phase === "activity") controllers[ACTIVITY_ORDER[activityIndex]].leave();
      releaseMedia();
      stopEventLog();
      set({ phase: "setup", session: null, material: null, activityIndex: 0, stars: 0, error: null });
    },
  };
});

/** Stars a student can earn in a session: words, rehearsal, and each perform round. */
export function totalStars(material: Material, config: SessionConfig): number {
  return (material.words.length > 0 ? 1 : 0) + 1 + config.performRounds;
}
