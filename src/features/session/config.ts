import type { MicPolicy, MicProcessing } from "@/media/recorder";

/**
 * Settings a session runs with. A copy is stored with every session record,
 * so the data always shows which settings were in force.
 */
export type SessionConfig = {
  /** Rounds of "Read Again" / "Read and Act" the student must complete. */
  performRounds: number;
  /** Whether "Listen First" must be heard once in full before Next is allowed. */
  listenRequiresFullPlay: boolean;
  /** Adds the two final character-feedback questions after the usual three. */
  finalFeedback: boolean;
  micPolicy: MicPolicy;
  micProcessing: MicProcessing;
};

export const defaultSessionConfig: SessionConfig = {
  // Two rounds are provisional in the protocol; the researcher can change it on the setup screen.
  performRounds: 2,
  listenRequiresFullPlay: true,
  finalFeedback: false,
  // To be confirmed on the target browser with the /spike page.
  micPolicy: "keepOpen",
  // All processing off: the study wants the student's natural voice.
  micProcessing: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
};
