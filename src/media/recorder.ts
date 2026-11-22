/** Browser audio processing applied to the microphone signal. */
export type MicProcessing = {
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
};

/**
 * - `keepOpen`: ask for the microphone once and hold it for the whole session.
 *   Recording starts instantly, but some browsers lower playback volume while
 *   a microphone is open.
 * - `perTake`: open the microphone when a take starts and release it when the
 *   take ends. Playback is unaffected, at the cost of a short start-up delay.
 */
export type MicPolicy = "keepOpen" | "perTake";

export type Take = {
  blob: Blob;
  mimeType: string;
  /** Wall-clock time the recording started (ms since epoch). */
  startedAt: number;
  durationMs: number;
};

// AAC in MP4 first: it is the one format both Safari and Chrome can record,
// so exported files are the same type whatever device was used.
const MIME_CANDIDATES = [
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
  "audio/webm;codecs=opus",
  "audio/webm",
];

/**
 * The recording format this browser will use: a MIME type, `""` when the
 * browser should pick its own default, or `null` when recording is unsupported.
 */
export function pickRecordingMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  return MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

export function extensionForMimeType(mimeType: string): string {
  if (mimeType.startsWith("audio/mp4")) return "m4a";
  if (mimeType.startsWith("audio/webm")) return "webm";
  if (mimeType.startsWith("audio/ogg")) return "ogg";
  return "bin";
}

/** Records the student's voice, one take at a time. */
export class Recorder {
  private stream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;
  private startedMono = 0;

  constructor(
    private readonly policy: MicPolicy,
    private readonly processing: MicProcessing,
  ) {}

  /**
   * Opens the microphone once so the permission prompt appears now, during
   * setup, instead of in front of the student. With `perTake` the microphone
   * is released again straight away.
   */
  async prepare(): Promise<void> {
    await this.openStream();
    if (this.policy === "perTake") this.release();
  }

  get isRecording(): boolean {
    return this.mediaRecorder !== null;
  }

  /** What the browser actually gave us, which can differ from what we asked for. */
  trackSettings(): MediaTrackSettings | null {
    return this.stream?.getAudioTracks()[0]?.getSettings() ?? null;
  }

  async start(): Promise<void> {
    if (this.mediaRecorder) throw new Error("A recording is already in progress");
    const stream = await this.openStream();
    const mimeType = pickRecordingMimeType();
    if (mimeType === null) throw new Error("This browser cannot record audio");

    const mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    this.chunks = [];
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) this.chunks.push(event.data);
    };
    await new Promise<void>((resolve, reject) => {
      mediaRecorder.onstart = () => resolve();
      mediaRecorder.onerror = () => reject(new Error("The recorder failed to start"));
      mediaRecorder.start();
    });
    mediaRecorder.onerror = null;
    this.startedAt = Date.now();
    this.startedMono = performance.now();
    this.mediaRecorder = mediaRecorder;
  }

  async stop(): Promise<Take> {
    const mediaRecorder = this.mediaRecorder;
    if (!mediaRecorder) throw new Error("No recording is in progress");
    const durationMs = Math.round(performance.now() - this.startedMono);

    // The final chunk is delivered before `stop` fires.
    await new Promise<void>((resolve) => {
      mediaRecorder.onstop = () => resolve();
      mediaRecorder.stop();
    });
    this.mediaRecorder = null;

    const mimeType = mediaRecorder.mimeType || this.chunks[0]?.type || "";
    const blob = new Blob(this.chunks, { type: mimeType });
    this.chunks = [];
    if (this.policy === "perTake") this.release();
    return { blob, mimeType, startedAt: this.startedAt, durationMs };
  }

  /** Stops any take in progress (discarding it) and releases the microphone. */
  dispose(): void {
    if (this.mediaRecorder) {
      this.mediaRecorder.onstop = null;
      this.mediaRecorder.ondataavailable = null;
      try {
        this.mediaRecorder.stop();
      } catch {
        // Already inactive.
      }
      this.mediaRecorder = null;
      this.chunks = [];
    }
    this.release();
  }

  private async openStream(): Promise<MediaStream> {
    const live = this.stream?.getAudioTracks().some((track) => track.readyState === "live");
    if (this.stream && live) return this.stream;
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { ...this.processing, channelCount: 1 },
      video: false,
    });
    return this.stream;
  }

  private release(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }
}
