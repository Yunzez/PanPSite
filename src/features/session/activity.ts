import type { Material } from "@/content/schema";
import type { Mode } from "@/data/db";
import type { SessionConfig } from "./config";

/** The activities of a session, in the order students do them. */
export const ACTIVITY_ORDER = ["words", "listen", "rehearse", "perform", "quiz", "feedback"] as const;

export type ActivityId = (typeof ACTIVITY_ORDER)[number];

/** Names as the researcher knows them from the protocol. */
export function activityName(id: ActivityId, mode: Mode): string {
  switch (id) {
    case "words":
      return "Learn the Words";
    case "listen":
      return "Listen First";
    case "rehearse":
      return "Listen and Read";
    case "perform":
      return mode === "B" ? "Read and Act" : "Read Again";
    case "quiz":
      return "Check the Story";
    case "feedback":
      return "Feedback";
  }
}

/** Where an activity had got to, as it saved it. Each activity defines its own fields. */
export type ProgressDetail = Record<string, unknown>;

/** What the session hands an activity when it begins. */
export type ActivityContext = {
  sessionId: string;
  mode: Mode;
  material: Material;
  config: SessionConfig;
  /** Records an event under this activity's name. */
  log: (type: string, payload?: Record<string, unknown>) => void;
  /** Gives the student a completion star. Stars mark finishing, never accuracy. */
  awardStar: (reason: string) => void;
  /**
   * Remembers where the student is, so that if the page is closed the
   * session can carry on from here instead of starting the activity again.
   */
  saveProgress: (detail: ProgressDetail) => void;
  /** Tells the session this activity is finished. */
  complete: () => void;
};

/**
 * An activity is started and stopped by the session flow, not by a component
 * appearing on screen. Sound and recording therefore begin exactly once per
 * activity, whatever React does with rendering.
 */
export type ActivityController = {
  /** `resume` is what this activity last passed to `saveProgress`, when a session is resumed. */
  enter: (context: ActivityContext, resume?: ProgressDetail) => void;
  /** Must stop anything the activity started (sound, timers). */
  leave: () => void;
  /** Where the student is right now (e.g. which line), attached to researcher marks. */
  position?: () => Record<string, unknown>;
};
