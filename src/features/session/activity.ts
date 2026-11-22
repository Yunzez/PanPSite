import type { Material } from "@/content/schema";
import type { Mode } from "@/data/db";
import type { SessionConfig } from "./config";

/** The activities of a session, in the order students do them. */
export const ACTIVITY_ORDER = ["words", "listen", "rehearse", "perform", "quiz", "feedback"] as const;

export type ActivityId = (typeof ACTIVITY_ORDER)[number];

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
  /** Tells the session this activity is finished. */
  complete: () => void;
};

/**
 * An activity is started and stopped by the session flow, not by a component
 * appearing on screen. Sound and recording therefore begin exactly once per
 * activity, whatever React does with rendering.
 */
export type ActivityController = {
  enter: (context: ActivityContext) => void;
  /** Must stop anything the activity started (sound, timers). */
  leave: () => void;
};
