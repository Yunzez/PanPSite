import { create } from "zustand";
import type { Material } from "@/content/schema";
import type { Mode, SessionRow } from "@/data/db";
import { flushEvents, logEvent, startEventLog, stopEventLog } from "@/data/events";
import {
  appendNote,
  createSession,
  findMissingTakes,
  readLogState,
  saveMissingResponses,
  updateSession,
} from "@/data/sessions";
import { listenController } from "@/features/activities/listen/listenStore";
import {
  feedbackController,
  feedbackItems,
  quizController,
  quizItems,
} from "@/features/activities/questions/questionStore";
import { performController, rehearseController } from "@/features/activities/reading/readingStore";
import { wordsController } from "@/features/activities/words/wordsStore";
import {
  ACTIVITY_ORDER,
  type ActivityController,
  type ActivityId,
  type ProgressDetail,
} from "./activity";
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
 *
 * The researcher can step in at any point: mark that they helped, add a note,
 * skip the current activity, or end the session early ("ended"). A session
 * cut short by the page closing can be resumed from the setup screen.
 */
export type SessionPhase =
  | "setup"
  | "handover"
  | "activity"
  | "saving"
  | "saveFailed"
  | "complete"
  | "ended";

/** What is stored in the session record so it can be resumed. */
type StoredProgress = { activity: ActivityId; detail?: ProgressDetail };

type SessionState = {
  phase: SessionPhase;
  session: SessionRow | null;
  material: Material | null;
  config: SessionConfig;
  activityIndex: number;
  stars: number;
  /** Times the researcher marked "support provided" in this session. */
  supportMarks: number;
  error: string | null;

  /** Researcher has confirmed the setup: creates the session record. */
  begin: (input: { mode: Mode; studentId: string; material: Material; config: SessionConfig }) => Promise<void>;
  /** Researcher chose to continue an unfinished session instead of starting a new one. */
  resume: (input: { session: SessionRow; material: Material }) => Promise<void>;
  /** Student taps Start. */
  start: () => void;
  retrySave: () => Promise<void>;

  // Researcher actions during a session.
  markSupport: () => void;
  addNote: (text: string, kind: "note" | "interruption") => Promise<void>;
  skipActivity: () => void;
  endEarly: () => Promise<void>;

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

/** Where a resumed session picks up; null for a session that starts fresh. */
let resumeAt: StoredProgress | null = null;

const clock = () => new Date().toLocaleTimeString(undefined, { hour12: false });

export const useSessionStore = create<SessionState>((set, get) => {
  const currentActivity = (): ActivityId | null =>
    get().phase === "activity" ? ACTIVITY_ORDER[get().activityIndex] : null;

  const storeProgress = (progress: StoredProgress) => {
    const { session } = get();
    // Best effort: losing one progress write only means resuming a little earlier.
    if (session) void updateSession(session.sessionId, { progress }).catch(() => {});
  };

  const enterActivity = (index: number, resume?: ProgressDetail) => {
    const { session, material, config } = get();
    if (!session || !material) return;
    const id = ACTIVITY_ORDER[index];
    set({ phase: "activity", activityIndex: index });
    if (resume) {
      // Marks the break in the record; the activity's first start stays its start.
      logEvent(id, "session_resumed", resume);
    } else {
      logEvent(id, "activity_start");
      storeProgress({ activity: id });
    }
    controllers[id].enter(
      {
        sessionId: session.sessionId,
        mode: session.mode,
        material,
        config,
        log: (type, payload) => logEvent(id, type, payload),
        awardStar: (reason) => {
          set((state) => ({ stars: state.stars + 1 }));
          logEvent(id, "star_awarded", { reason });
        },
        saveProgress: (detail) => storeProgress({ activity: id, detail }),
        complete: () => leaveActivity(index, true),
      },
      resume,
    );
  };

  /** Ends the current activity and moves on. `completed` is false when the researcher skipped it. */
  const leaveActivity = (index: number, completed: boolean) => {
    // Ignore a late call from an activity that is no longer the current one.
    if (get().phase !== "activity" || get().activityIndex !== index) return;
    const id = ACTIVITY_ORDER[index];
    controllers[id].leave();
    logEvent(id, "activity_end", { completed });
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
    supportMarks: 0,
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
      resumeAt = null;
      startEventLog(session.sessionId);
      logEvent("session", "setup_confirmed", { studentId, materialId: material.id, mode });
      set({
        phase: "handover",
        session,
        material,
        config,
        activityIndex: 0,
        stars: 0,
        supportMarks: 0,
        error: null,
      });
    },

    resume: async ({ session, material }) => {
      if (get().phase !== "setup") return;
      const log = await readLogState(session.sessionId);
      const progress = session.progress as StoredProgress | null;
      resumeAt = progress && ACTIVITY_ORDER.includes(progress.activity) ? progress : null;
      startEventLog(session.sessionId, log.nextSeq);
      logEvent("session", "interruption", { reason: "page_closed", activity: resumeAt?.activity ?? null });
      // New data will be added, so an earlier export of this session is out of date.
      await updateSession(session.sessionId, { exportedAt: null });
      set({
        phase: "handover",
        session: { ...session, exportedAt: null },
        material,
        // The settings the session started with, not whatever the form says now.
        config: { ...defaultSessionConfig, ...(session.config as Partial<SessionConfig>) },
        activityIndex: resumeAt ? ACTIVITY_ORDER.indexOf(resumeAt.activity) : 0,
        stars: log.stars,
        supportMarks: log.supportMarks,
        error: null,
      });
    },

    start: () => {
      if (get().phase !== "handover") return;
      // Inside the student's tap: this is what lets audio play from now on.
      void audio.unlock();
      if (resumeAt) {
        const { activity, detail } = resumeAt;
        resumeAt = null;
        // An empty detail still means "resuming": the activity looks up what it needs.
        enterActivity(ACTIVITY_ORDER.indexOf(activity), detail ?? {});
      } else {
        logEvent("session", "session_start");
        enterActivity(0);
      }
    },

    retrySave: async () => {
      if (get().phase !== "saveFailed") return;
      await save();
    },

    markSupport: () => {
      const activity = currentActivity();
      if (!activity) return;
      set((state) => ({ supportMarks: state.supportMarks + 1 }));
      logEvent(activity, "support_marked", controllers[activity].position?.() ?? {});
    },

    addNote: async (text, kind) => {
      const { session, phase, activityIndex } = get();
      const trimmed = text.trim();
      if (!session || !trimmed) return;
      const activity = phase === "activity" ? ACTIVITY_ORDER[activityIndex] : "session";
      logEvent(activity, kind === "interruption" ? "interruption" : "note_added", {
        text: trimmed,
        reason: kind === "interruption" ? "researcher" : undefined,
        ...(phase === "activity" ? controllers[ACTIVITY_ORDER[activityIndex]].position?.() : undefined),
      });
      const label = kind === "interruption" ? "interruption" : "note";
      await appendNote(session.sessionId, `[${clock()} ${activity}] ${label}: ${trimmed}`);
    },

    skipActivity: () => {
      const activity = currentActivity();
      if (!activity) return;
      logEvent(activity, "activity_skipped", controllers[activity].position?.() ?? {});
      leaveActivity(get().activityIndex, false);
    },

    endEarly: async () => {
      const { session, material, config, phase, activityIndex } = get();
      if (!session || !material || (phase !== "activity" && phase !== "handover")) return;
      if (phase === "activity") {
        const id = ACTIVITY_ORDER[activityIndex];
        controllers[id].leave();
        logEvent(id, "activity_end", { completed: false });
      }
      logEvent("session", "session_ended_early");
      releaseMedia();
      set({ phase: "saving", error: null });
      try {
        // Questions the student never reached are stored as missing, not left out.
        await saveMissingResponses(session.sessionId, [...quizItems(material), ...feedbackItems(config)]);
        await flushEvents();
        await updateSession(session.sessionId, { status: "incomplete", endedAt: Date.now() });
        set({ phase: "ended" });
      } catch (error) {
        set({ phase: "saveFailed", error: error instanceof Error ? error.message : String(error) });
      }
    },

    reset: () => {
      const activity = currentActivity();
      if (activity) controllers[activity].leave();
      releaseMedia();
      stopEventLog();
      resumeAt = null;
      set({
        phase: "setup",
        session: null,
        material: null,
        activityIndex: 0,
        stars: 0,
        supportMarks: 0,
        error: null,
      });
    },
  };
});

/** Stars a student can earn in a session: words, rehearsal, and each perform round. */
export function totalStars(material: Material, config: SessionConfig): number {
  return (material.words.length > 0 ? 1 : 0) + 1 + config.performRounds;
}
