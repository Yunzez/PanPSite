import { AudioEngine } from "@/media/audioEngine";
import { closeStream, openCamera } from "@/media/camera";
import { FaceFilter } from "@/media/faceFilter";
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

let camera: { stream: MediaStream; filter: FaceFilter } | null = null;

/**
 * Mode B only: opens the front camera (permission prompt) and loads face
 * tracking. The picture is only ever drawn on this device; it is never
 * recorded, stored or sent anywhere.
 */
export async function prepareCamera(onStep?: (step: "camera" | "tracking") => void): Promise<void> {
  releaseCamera();
  onStep?.("camera");
  const stream = await openCamera();
  try {
    onStep?.("tracking");
    camera = { stream, filter: await FaceFilter.create() };
  } catch (error) {
    closeStream(stream);
    throw error;
  }
}

/** The session's camera and face filter, or null when there is none (Mode A). */
export function getCamera(): { stream: MediaStream; filter: FaceFilter } | null {
  return camera;
}

/** Turns the camera off. Called as soon as the last activity that shows it ends. */
export function releaseCamera(): void {
  camera?.filter.dispose();
  closeStream(camera?.stream ?? null);
  camera = null;
}

/** Stops all sound and releases the microphone and camera. */
export function releaseMedia(): void {
  audio.stop();
  recorder?.dispose();
  recorder = null;
  releaseCamera();
}
