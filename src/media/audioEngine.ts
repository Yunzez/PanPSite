export type PlayResult = "ended" | "stopped";

type ActiveClip = {
  source: AudioBufferSourceNode;
  /** Audio-clock time at which the clip started (seconds). */
  startedAt: number;
  finish: (result: PlayResult) => void;
};

/**
 * All sound the app makes goes through this one engine, so "stop everything"
 * is a single call. That is what guarantees no model or partner audio plays
 * while a student is recording.
 *
 * Clips are fetched and decoded up front (`preload`), then played from memory:
 * playback starts without a network round trip and keeps working offline.
 */
export class AudioEngine {
  private context: AudioContext | null = null;
  private readonly buffers = new Map<string, AudioBuffer>();
  private active: ActiveClip | null = null;
  /** Bumped by every `stop()`, so a running sequence can tell it was cancelled. */
  private generation = 0;
  private paused = false;

  private getContext(): AudioContext {
    if (!this.context) this.context = new AudioContext();
    return this.context;
  }

  /**
   * Browsers only let a page make sound after the user has interacted with it.
   * Call this from inside a tap handler before the first playback.
   */
  async unlock(): Promise<void> {
    const context = this.getContext();
    if (context.state !== "running") await context.resume();
  }

  async preload(
    urls: readonly string[],
    onProgress?: (loaded: number, total: number) => void,
  ): Promise<void> {
    const context = this.getContext();
    let loaded = 0;
    await Promise.all(
      urls.map(async (url) => {
        if (!this.buffers.has(url)) {
          const response = await fetch(url);
          if (!response.ok) {
            throw new Error(`Could not load audio ${url} (HTTP ${response.status})`);
          }
          const data = await response.arrayBuffer();
          this.buffers.set(url, await context.decodeAudioData(data));
        }
        loaded += 1;
        onProgress?.(loaded, urls.length);
      }),
    );
  }

  /** Plays one preloaded clip, stopping whatever was playing before. */
  play(url: string): Promise<PlayResult> {
    this.stop();
    const buffer = this.buffers.get(url);
    if (!buffer) return Promise.reject(new Error(`Audio was not preloaded: ${url}`));
    return this.startBuffer(buffer);
  }

  /**
   * Plays clips one after another. `onStep` fires as each clip starts, which
   * is what drives "highlighting follows the audio".
   */
  async playSequence(
    urls: readonly string[],
    onStep?: (index: number) => void,
  ): Promise<PlayResult> {
    this.stop();
    const generation = this.generation;
    for (let index = 0; index < urls.length; index += 1) {
      const buffer = this.buffers.get(urls[index]);
      if (!buffer) throw new Error(`Audio was not preloaded: ${urls[index]}`);
      onStep?.(index);
      const result = await this.startBuffer(buffer);
      if (result === "stopped" || generation !== this.generation) return "stopped";
    }
    return "ended";
  }

  /** Plays a recording straight from a Blob (the student's own take). */
  async playBlob(blob: Blob): Promise<PlayResult> {
    this.stop();
    const generation = this.generation;
    const buffer = await this.getContext().decodeAudioData(await blob.arrayBuffer());
    // A stop() may have arrived while decoding.
    if (generation !== this.generation) return "stopped";
    return this.startBuffer(buffer);
  }

  /** Freezes playback where it is; `resume()` continues from the same point. */
  async pause(): Promise<void> {
    if (!this.context || this.paused) return;
    this.paused = true;
    await this.context.suspend();
  }

  async resume(): Promise<void> {
    if (!this.context || !this.paused) return;
    this.paused = false;
    await this.context.resume();
  }

  /**
   * How far into the current clip playback is, in ms (0 when silent). It
   * follows the audio clock, so it stands still while paused. Word
   * highlighting reads this every frame.
   */
  elapsedMs(): number {
    if (!this.active || !this.context) return 0;
    return (this.context.currentTime - this.active.startedAt) * 1000;
  }

  /** Stops the current clip and cancels any running sequence. */
  stop(): void {
    this.generation += 1;
    // Never leave the engine paused, or the next clip would be silent.
    if (this.paused) void this.resume();
    const active = this.active;
    if (!active) return;
    active.source.onended = null;
    try {
      active.source.stop();
    } catch {
      // Already stopped; nothing to do.
    }
    active.finish("stopped");
  }

  get isPlaying(): boolean {
    return this.active !== null;
  }

  /** Snapshot for diagnostics screens. */
  info(): { state: string; sampleRate: number } | null {
    if (!this.context) return null;
    return { state: this.context.state, sampleRate: this.context.sampleRate };
  }

  private startBuffer(buffer: AudioBuffer): Promise<PlayResult> {
    const context = this.getContext();
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    return new Promise<PlayResult>((resolve) => {
      const clip: ActiveClip = {
        source,
        startedAt: context.currentTime,
        finish: (result) => {
          if (this.active === clip) this.active = null;
          resolve(result);
        },
      };
      source.onended = () => clip.finish("ended");
      this.active = clip;
      source.start();
    });
  }
}
