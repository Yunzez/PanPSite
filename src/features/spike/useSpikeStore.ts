import { create } from "zustand";
import type { RecordingRow } from "@/data/db";
import { deleteTakes, getTakeBlob, listTakes, saveTake } from "@/data/recordings";
import { estimateStorage, requestPersistentStorage } from "@/data/storage";
import { AudioEngine } from "@/media/audioEngine";
import { closeStream, openCamera } from "@/media/camera";
import { FaceFilter } from "@/media/faceFilter";
import {
  pickRecordingMimeType,
  Recorder,
  type MicPolicy,
  type MicProcessing,
  type Take,
} from "@/media/recorder";
import { spikeCharacters, spikeLines } from "./spikeContent";

/**
 * State machine for the M0 technical check. It runs the same loop the real
 * "Listen and Read" activity will run, on placeholder content:
 *
 *   modelPlaying → ready → arming → recording → saving → (next line) … → done
 *
 * Every action first checks the phase it is allowed in. That is how "no model
 * audio while the student is recording" and "one tap = one transition" are
 * enforced, instead of scattering checks through the UI.
 */
export type Phase =
  | "setup"
  | "starting"
  | "modelPlaying"
  | "ready"
  | "arming"
  | "recording"
  | "saving"
  | "saveFailed"
  | "ownPlayback"
  | "sequencePlaying"
  | "done";

export type SpikeOptions = {
  micPolicy: MicPolicy;
  processing: MicProcessing;
  camera: boolean;
};

export type FilterStatus = "off" | "loading" | "ready" | "failed";

export type LogEntry = { id: number; atMs: number; message: string };

export type Diagnostics = {
  mimeType: string | null;
  audio: { state: string; sampleRate: number } | null;
  micSettings: MediaTrackSettings | null;
  persisted: boolean | null;
  storage: { usage: number; quota: number } | null;
  fps: number;
  faceVisible: boolean;
};

type SpikeState = {
  phase: Phase;
  /** What `starting` is currently waiting for, shown to the person setting up. */
  startStep: string | null;
  error: string | null;
  options: SpikeOptions;
  lineIndex: number;
  /** Line being played by "play all"; only meaningful in `sequencePlaying`. */
  sequenceIndex: number;
  playingTakeId: string | null;
  cameraStream: MediaStream | null;
  filterStatus: FilterStatus;
  takes: RecordingRow[];
  log: LogEntry[];
  diagnostics: Diagnostics;

  setOptions: (patch: Partial<SpikeOptions>) => void;
  setProcessing: (patch: Partial<MicProcessing>) => void;
  loadTakes: () => Promise<void>;
  start: () => Promise<void>;
  record: () => Promise<void>;
  done: () => Promise<void>;
  retrySave: () => Promise<void>;
  listenAgain: () => Promise<void>;
  hearMyReading: () => Promise<void>;
  playTake: (recordingId: string) => Promise<void>;
  playAll: () => Promise<void>;
  restart: () => Promise<void>;
  clearTakes: () => Promise<void>;
  refreshStats: () => void;
  shutdown: () => void;
};

// Takes from every run are kept under one fixed session, so reloading the
// page shows whether local storage really persisted them.
const SESSION_ID = "spike";
const ACTIVITY = "rehearse";
const ROUND = 1;
const MAX_LOG_ENTRIES = 200;

// Media objects are not serialisable state, so they live beside the store.
const audio = new AudioEngine();
let recorder: Recorder | null = null;
let filter: FaceFilter | null = null;
/** A finished take that has not been written to the database yet. */
let pendingTake: Take | null = null;
/** Identifies the current run; bumped by `start` and `shutdown`. */
let runId = 0;
let startedMono = 0;
let nextLogId = 1;

const describeError = (error: unknown) => {
  if (!(error instanceof Error)) return String(error);
  // The two failures a researcher can fix themselves get a plain explanation.
  if (error.name === "NotAllowedError") {
    return "没有麦克风或摄像头的使用权限。请在浏览器的网站设置里允许后重试。";
  }
  if (error.name === "NotFoundError") {
    return "没有找到麦克风或摄像头。";
  }
  return `${error.name}: ${error.message}`;
};

const emptyDiagnostics: Diagnostics = {
  mimeType: null,
  audio: null,
  micSettings: null,
  persisted: null,
  storage: null,
  fps: 0,
  faceVisible: false,
};

export const useSpikeStore = create<SpikeState>((set, get) => {
  const log = (message: string) =>
    set((state) => ({
      log: [
        ...state.log,
        { id: nextLogId++, atMs: Math.round(performance.now() - startedMono), message },
      ].slice(-MAX_LOG_ENTRIES),
    }));

  const patchDiagnostics = (patch: Partial<Diagnostics>) =>
    set((state) => ({ diagnostics: { ...state.diagnostics, ...patch } }));

  /** Plays the model for the current line, then waits for the student. */
  const playModel = async () => {
    const line = spikeLines[get().lineIndex];
    set({ phase: "modelPlaying" });
    log(`示范开始 ${line.id}`);
    const result = await audio.play(line.audio);
    // "stopped" means another action took over and already set the phase.
    if (result === "ended" && get().phase === "modelPlaying") {
      set({ phase: "ready" });
      log("示范结束，等待 Record");
    }
  };

  /** Writes the pending take, then moves on. On failure it stays put. */
  const persistPendingTake = async () => {
    const take = pendingTake;
    if (!take) return;
    const { lineIndex } = get();
    const line = spikeLines[lineIndex];
    const writeStarted = performance.now();
    try {
      const row = await saveTake(
        {
          sessionId: SESSION_ID,
          activity: ACTIVITY,
          round: ROUND,
          lineId: line.id,
          characterId: line.characterId,
          startedAt: take.startedAt,
          durationMs: take.durationMs,
          mimeType: take.mimeType,
        },
        take.blob,
      );
      pendingTake = null;
      set((state) => ({ takes: [...state.takes, row], error: null }));
      log(`已保存 ${line.id} 第 ${row.take} 次（写库 ${Math.round(performance.now() - writeStarted)} ms）`);
    } catch (error) {
      // The take stays in memory and the script does not advance.
      set({ phase: "saveFailed", error: `保存失败：${describeError(error)}` });
      log("保存失败，录音保留在内存中");
      return;
    }
    patchDiagnostics({ storage: await estimateStorage() });
    if (lineIndex + 1 < spikeLines.length) {
      set({ lineIndex: lineIndex + 1 });
      await playModel();
    } else {
      set({ phase: "done" });
      log("本轮完成");
    }
  };

  /** Plays one saved take and then returns to the phase we came from. */
  const playOwn = async (recordingId: string) => {
    const previous = get().phase;
    if (previous !== "setup" && previous !== "ready" && previous !== "done") return;
    // Start unlocking synchronously: this runs inside the tap that called us.
    const unlocked = audio.unlock();
    set({ phase: "ownPlayback", playingTakeId: recordingId, error: null });
    try {
      await unlocked;
      const blob = await getTakeBlob(recordingId);
      if (!blob) throw new Error("找不到这段录音");
      await audio.playBlob(blob);
    } catch (error) {
      set({ error: `回放失败：${describeError(error)}` });
    } finally {
      if (get().phase === "ownPlayback") set({ phase: previous, playingTakeId: null });
    }
  };

  return {
    phase: "setup",
    startStep: null,
    error: null,
    options: {
      micPolicy: "keepOpen",
      // Off by default: the study wants the student's natural voice.
      processing: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      camera: true,
    },
    lineIndex: 0,
    sequenceIndex: 0,
    playingTakeId: null,
    cameraStream: null,
    filterStatus: "off",
    takes: [],
    log: [],
    diagnostics: emptyDiagnostics,

    setOptions: (patch) => set((state) => ({ options: { ...state.options, ...patch } })),

    setProcessing: (patch) =>
      set((state) => ({
        options: { ...state.options, processing: { ...state.options.processing, ...patch } },
      })),

    loadTakes: async () => {
      try {
        set({ takes: await listTakes(SESSION_ID) });
      } catch (error) {
        set({ error: `读取本地录音失败：${describeError(error)}` });
      }
    },

    start: async () => {
      if (get().phase !== "setup") return;
      // A permission prompt can stay open indefinitely. If the run is
      // cancelled meanwhile, whatever resolves later must be thrown away.
      const run = ++runId;
      const cancelled = () => run !== runId;
      startedMono = performance.now();
      set({
        phase: "starting",
        startStep: "正在加载音频",
        error: null,
        log: [],
        lineIndex: 0,
        diagnostics: emptyDiagnostics,
      });
      try {
        // Must come first: audio can only be unlocked inside the tap itself.
        await audio.unlock();
        log("音频已解锁");
        await audio.preload(spikeLines.map((line) => line.audio));
        if (cancelled()) return;
        log(`已预加载 ${spikeLines.length} 段音频`);

        const { options } = get();
        set({ startStep: "等待麦克风权限，请在浏览器的提示里选择允许" });
        const newRecorder = new Recorder(options.micPolicy, options.processing);
        await newRecorder.prepare();
        if (cancelled()) {
          newRecorder.dispose();
          return;
        }
        recorder = newRecorder;
        log("麦克风已授权");

        if (options.camera) {
          set({ startStep: "等待摄像头权限，请在浏览器的提示里选择允许" });
          const stream = await openCamera();
          if (cancelled()) {
            closeStream(stream);
            return;
          }
          set({ cameraStream: stream, filterStatus: "loading" });
          log("摄像头已打开");
          // The loop can begin before the face model is ready; the overlay
          // simply appears once it has loaded.
          void FaceFilter.create().then(
            (created) => {
              if (!get().cameraStream) {
                created.dispose();
                return;
              }
              filter = created;
              set({ filterStatus: "ready" });
              log("人脸模型已加载");
            },
            (error) => {
              set({ filterStatus: "failed" });
              log(`人脸模型加载失败：${describeError(error)}`);
            },
          );
        }

        const persisted = await requestPersistentStorage();
        const storage = await estimateStorage();
        if (cancelled()) return;
        patchDiagnostics({
          mimeType: pickRecordingMimeType(),
          audio: audio.info(),
          micSettings: newRecorder.trackSettings(),
          persisted,
          storage,
        });
        set({ startStep: null });
        await playModel();
      } catch (error) {
        if (cancelled()) return;
        get().shutdown();
        set({ error: `启动失败：${describeError(error)}` });
      }
    },

    record: async () => {
      if (get().phase !== "ready" || !recorder) return;
      const tappedAt = performance.now();
      audio.stop();
      // "arming" covers the moment before the recorder is really running, so
      // a quick second tap cannot reach Done too early.
      set({ phase: "arming", error: null });
      try {
        await recorder.start();
        set({ phase: "recording" });
        log(`录音开始（点击后 ${Math.round(performance.now() - tappedAt)} ms）`);
        patchDiagnostics({ micSettings: recorder.trackSettings(), audio: audio.info() });
      } catch (error) {
        set({ phase: "ready", error: `无法开始录音：${describeError(error)}` });
      }
    },

    done: async () => {
      if (get().phase !== "recording" || !recorder) return;
      const tappedAt = performance.now();
      set({ phase: "saving" });
      try {
        pendingTake = await recorder.stop();
        log(
          `录音结束：${pendingTake.durationMs} ms，${pendingTake.blob.size} 字节` +
            `（停止耗时 ${Math.round(performance.now() - tappedAt)} ms）`,
        );
      } catch (error) {
        set({ phase: "ready", error: `录音停止失败：${describeError(error)}` });
        return;
      }
      await persistPendingTake();
    },

    retrySave: async () => {
      if (get().phase !== "saveFailed") return;
      set({ phase: "saving", error: null });
      await persistPendingTake();
    },

    listenAgain: async () => {
      if (get().phase !== "ready") return;
      await playModel();
    },

    hearMyReading: async () => {
      const latest = get().takes.at(-1);
      if (get().phase !== "ready" || !latest) return;
      await playOwn(latest.recordingId);
    },

    playTake: (recordingId) => playOwn(recordingId),

    playAll: async () => {
      const previous = get().phase;
      if (previous !== "ready" && previous !== "done") return;
      set({ phase: "sequencePlaying", sequenceIndex: 0 });
      log("连续播放开始");
      const result = await audio.playSequence(
        spikeLines.map((line) => line.audio),
        (index) => set({ sequenceIndex: index }),
      );
      if (get().phase === "sequencePlaying") {
        set({ phase: previous });
        log(result === "ended" ? "连续播放结束" : "连续播放被打断");
      }
    },

    restart: async () => {
      if (get().phase !== "done") return;
      set({ lineIndex: 0 });
      await playModel();
    },

    clearTakes: async () => {
      await deleteTakes(SESSION_ID);
      set({ takes: [] });
      patchDiagnostics({ storage: await estimateStorage() });
    },

    refreshStats: () => {
      const stats = filter?.stats() ?? { fps: 0, faceVisible: false };
      const current = get().diagnostics;
      const audioInfo = audio.info();
      const unchanged =
        current.fps === stats.fps &&
        current.faceVisible === stats.faceVisible &&
        current.audio?.state === audioInfo?.state;
      if (!unchanged) patchDiagnostics({ ...stats, audio: audioInfo });
    },

    shutdown: () => {
      runId += 1;
      audio.stop();
      recorder?.dispose();
      recorder = null;
      filter?.dispose();
      filter = null;
      pendingTake = null;
      closeStream(get().cameraStream);
      set({
        phase: "setup",
        startStep: null,
        lineIndex: 0,
        playingTakeId: null,
        cameraStream: null,
        filterStatus: "off",
      });
    },
  };
});

/** The line whose speaker the filter and highlight should follow right now. */
export function activeLineIndex(state: Pick<SpikeState, "phase" | "lineIndex" | "sequenceIndex">): number {
  return state.phase === "sequencePlaying" ? state.sequenceIndex : state.lineIndex;
}

/**
 * Starts drawing the filter over the camera preview. Returns a function that
 * stops it. Does nothing until the face model has loaded.
 */
export function startFilterPreview(video: HTMLVideoElement, canvas: HTMLCanvasElement): () => void {
  const active = filter;
  if (!active) return () => {};
  active.start(video, canvas, () => {
    const line = spikeLines[activeLineIndex(useSpikeStore.getState())];
    return spikeCharacters[line.characterId].filter;
  });
  return () => active.stop();
}
