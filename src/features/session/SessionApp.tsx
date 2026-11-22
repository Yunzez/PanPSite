"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import type { Mode } from "@/data/db";
import { logEvent } from "@/data/events";
import { ListenActivity } from "@/features/activities/listen/ListenActivity";
import { QuestionActivity } from "@/features/activities/questions/QuestionActivity";
import { ReadingActivity } from "@/features/activities/reading/ReadingActivity";
import { WordsActivity } from "@/features/activities/words/WordsActivity";
import { ACTIVITY_ORDER } from "./activity";
import { Star } from "./ActivityFrame";
import { ResearcherAccess } from "./ResearcherPanel";
import { useSessionStore } from "./sessionStore";
import { SetupScreen } from "./SetupScreen";

/** Keeps the screen from dimming or locking while a student is working. */
function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        const acquired = await navigator.wakeLock.request("screen");
        if (cancelled) void acquired.release();
        else sentinel = acquired;
      } catch {
        // Refused (for example in low-power mode); the session still works.
      }
    };
    // The browser drops the lock when the page is hidden; take it again on return.
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void acquire();
    };
    void acquire();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      void sentinel?.release();
    };
  }, [active]);
}

/**
 * One whole session on a single page. The URL never changes and the page is
 * never reloaded between screens, so microphone permission and unlocked audio
 * last from setup to the end.
 */
export function SessionApp({ mode }: { mode: Mode }) {
  const phase = useSessionStore((state) => state.phase);
  useWakeLock(phase !== "setup");

  useEffect(() => {
    // Time spent with the app in the background is part of the record.
    const onVisibilityChange = () =>
      logEvent("session", document.hidden ? "app_hidden" : "app_visible");
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      useSessionStore.getState().reset();
    };
  }, []);

  if (phase === "setup") {
    return (
      <div className="h-dvh overflow-y-auto">
        <SetupScreen mode={mode} />
      </div>
    );
  }

  return (
    // touch-manipulation turns off double-tap zoom; select-none stops text
    // selection handles from appearing under a child's finger.
    <div className="h-dvh touch-manipulation overflow-hidden select-none">
      {phase === "handover" && <HandoverScreen />}
      {phase === "activity" && <CurrentActivity />}
      {(phase === "saving" || phase === "saveFailed" || phase === "complete" || phase === "ended") && (
        <EndScreen />
      )}
      <ResearcherAccess />
      <div className="fixed inset-0 z-50 hidden items-center justify-center bg-background p-8 text-center text-3xl font-bold portrait:flex">
        Please turn the tablet sideways.
      </div>
    </div>
  );
}

function HandoverScreen() {
  const start = useSessionStore((state) => state.start);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-10">
      <h1 className="text-7xl font-bold">Let&apos;s read!</h1>
      <Button size="lg" className="min-w-64" onClick={start}>
        Start
      </Button>
    </div>
  );
}

function CurrentActivity() {
  const activity = useSessionStore((state) => ACTIVITY_ORDER[state.activityIndex]);
  switch (activity) {
    case "words":
      return <WordsActivity />;
    case "listen":
      return <ListenActivity />;
    case "rehearse":
    case "perform":
      return <ReadingActivity />;
    case "quiz":
    case "feedback":
      return <QuestionActivity />;
  }
}

/** Saving, then the congratulations, a request to fetch the teacher, or a plain "ended". */
function EndScreen() {
  const phase = useSessionStore((state) => state.phase);
  const stars = useSessionStore((state) => state.stars);
  const { retrySave, reset } = useSessionStore.getState();

  if (phase === "saving") {
    return (
      <p role="status" className="flex h-full items-center justify-center text-5xl font-bold">
        Saving...
      </p>
    );
  }

  if (phase === "saveFailed") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-8 p-8 text-center">
        <p role="alert" className="text-4xl font-bold">
          Could not save. Please ask your teacher for help.
        </p>
        <Button variant="quiet" onClick={() => void retrySave()}>
          Try Again
        </Button>
      </div>
    );
  }

  if (phase === "ended") {
    // The researcher stopped the session; nothing here is addressed to the student.
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 p-8 text-center">
        <h1 className="text-5xl font-bold">Session ended.</h1>
        <p className="text-xl text-ink-muted">
          What was recorded has been saved. Hold the top-right corner to export or add a note.
        </p>
        <button type="button" className="text-lg text-ink-muted underline" onClick={reset}>
          Researcher: start a new session
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 p-8 text-center">
      <div className="flex gap-2" role="img" aria-label={`${stars} stars`}>
        {Array.from({ length: stars }, (_, index) => (
          <Star key={index} earned size={72} />
        ))}
      </div>
      <h1 className="text-6xl font-bold">Congratulations! You did it!</h1>
      {/* For the researcher: small and plain, so it does not invite a child's tap. */}
      <button type="button" className="mt-8 text-lg text-ink-muted underline" onClick={reset}>
        Researcher: start a new session
      </button>
    </div>
  );
}
