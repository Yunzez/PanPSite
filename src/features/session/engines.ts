import { AudioEngine } from "@/media/audioEngine";
import { Recorder } from "@/media/recorder";
import type { SessionConfig } from "./config";

/**
 * The one audio engine and the one recorder a session uses. Sharing them is
 * what lets any activity silence everything with a single `audio.stop()`.
 */
export const audio = new AudioEngine();

let recorder: Recorder | null = null;

/** Creates the session's recorder and asks for the microphone (permission prompt). */
export async function prepareRecorder(config: SessionConfig): Promise<void> {
  recorder?.dispose();
  recorder = new Recorder(config.micPolicy, config.micProcessing);
  await recorder.prepare();
}

export function getRecorder(): Recorder {
  if (!recorder) throw new Error("The recorder has not been prepared yet");
  return recorder;
}

/** Stops all sound and releases the microphone. */
export function releaseMedia(): void {
  audio.stop();
  recorder?.dispose();
  recorder = null;
}
