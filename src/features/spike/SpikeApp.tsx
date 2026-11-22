"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import type { MicPolicy, MicProcessing } from "@/media/recorder";
import { CameraPreview } from "./CameraPreview";
import { spikeCharacters, spikeLines } from "./spikeContent";
import { DiagnosticsPanel, TakesPanel } from "./SpikePanels";
import { activeLineIndex, useSpikeStore, type Phase } from "./useSpikeStore";

const phaseLabel: Record<Phase, string> = {
  setup: "未开始",
  starting: "正在准备",
  modelPlaying: "正在播放示范",
  ready: "等待录音",
  arming: "正在打开录音",
  recording: "录音中",
  saving: "正在保存",
  saveFailed: "保存失败",
  ownPlayback: "正在回放录音",
  sequencePlaying: "正在连续播放",
  done: "本轮完成",
};

const micPolicies: { value: MicPolicy; label: string; hint: string }[] = [
  { value: "keepOpen", label: "麦克风常开", hint: "录音立即开始；部分浏览器会压低播放音量" },
  { value: "perTake", label: "每次录音时打开", hint: "不影响播放；开始录音有短暂延迟" },
];

const processingOptions: { key: keyof MicProcessing; label: string }[] = [
  { key: "echoCancellation", label: "回声消除" },
  { key: "noiseSuppression", label: "降噪" },
  { key: "autoGainControl", label: "自动增益" },
];

/**
 * M0 technical check: camera + face filter + sequential playback + recording
 * + local storage + playback, all on one page. Run it on each target browser
 * and compare the two microphone settings.
 */
export function SpikeApp() {
  const phase = useSpikeStore((state) => state.phase);
  const error = useSpikeStore((state) => state.error);

  useEffect(() => {
    const store = useSpikeStore.getState();
    void store.loadTakes();
    const timer = window.setInterval(() => useSpikeStore.getState().refreshStats(), 1000);
    return () => {
      window.clearInterval(timer);
      // Releases the camera and microphone when leaving the page.
      useSpikeStore.getState().shutdown();
    };
  }, []);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold">M0 技术验证</h1>
        <p className="text-ink-muted">
          状态：<span className="font-bold text-ink">{phaseLabel[phase]}</span>
        </p>
      </header>

      {error && (
        <p role="alert" className="rounded-md border-2 border-record bg-surface px-4 py-3 font-bold">
          {error}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <CameraPreview />
        {phase === "setup" || phase === "starting" ? <SetupPanel /> : <RehearsalPanel />}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <TakesPanel />
        <DiagnosticsPanel />
      </div>
    </main>
  );
}

function SetupPanel() {
  const phase = useSpikeStore((state) => state.phase);
  const options = useSpikeStore((state) => state.options);
  const setOptions = useSpikeStore((state) => state.setOptions);
  const setProcessing = useSpikeStore((state) => state.setProcessing);
  const start = useSpikeStore((state) => state.start);
  const startStep = useSpikeStore((state) => state.startStep);
  const shutdown = useSpikeStore((state) => state.shutdown);

  return (
    <section className="flex flex-col gap-4 rounded-lg border-2 border-line bg-surface p-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-bold">麦克风</legend>
        {micPolicies.map((policy) => (
          <label key={policy.value} className="flex items-start gap-3">
            <input
              type="radio"
              name="micPolicy"
              className="mt-1.5 size-5 accent-primary"
              checked={options.micPolicy === policy.value}
              onChange={() => setOptions({ micPolicy: policy.value })}
            />
            <span>
              {policy.label}
              <span className="block text-sm text-ink-muted">{policy.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <fieldset className="flex flex-wrap gap-x-6 gap-y-2">
        <legend className="mb-1 font-bold">声音处理</legend>
        {processingOptions.map((option) => (
          <label key={option.key} className="flex items-center gap-2">
            <input
              type="checkbox"
              className="size-5 accent-primary"
              checked={options.processing[option.key]}
              onChange={(event) => setProcessing({ [option.key]: event.target.checked })}
            />
            {option.label}
          </label>
        ))}
      </fieldset>

      <label className="flex items-center gap-2 font-bold">
        <input
          type="checkbox"
          className="size-5 accent-primary"
          checked={options.camera}
          onChange={(event) => setOptions({ camera: event.target.checked })}
        />
        摄像头和滤镜（Mode B）
      </label>

      {phase === "starting" ? (
        <>
          <p role="status" className="rounded-md bg-highlight px-4 py-3 font-bold">
            {startStep ?? "正在准备"}
          </p>
          <Button variant="quiet" onClick={() => shutdown()}>
            取消
          </Button>
        </>
      ) : (
        <>
          <Button size="lg" onClick={() => void start()}>
            Start
          </Button>
          <p className="text-sm text-ink-muted">
            点 Start 后浏览器会请求麦克风和摄像头权限。示范音频是机器合成的占位内容。
          </p>
        </>
      )}
    </section>
  );
}

function RehearsalPanel() {
  const phase = useSpikeStore((state) => state.phase);
  const currentIndex = useSpikeStore(activeLineIndex);
  const hasTakes = useSpikeStore((state) => state.takes.length > 0);
  const actions = useSpikeStore.getState();

  return (
    <section className="flex flex-col gap-4 rounded-lg border-2 border-line bg-surface p-4">
      <ol className="flex flex-col gap-1">
        {spikeLines.map((line, index) => (
          <li
            key={line.id}
            aria-current={index === currentIndex ? "step" : undefined}
            className={`rounded-md px-4 py-2 text-2xl ${
              index === currentIndex ? "bg-highlight font-bold" : "text-ink-muted"
            }`}
          >
            <span className="mr-3 text-base font-bold text-primary-dark">
              {spikeCharacters[line.characterId].name}
            </span>
            {line.text}
          </li>
        ))}
      </ol>

      <MainButton phase={phase} />

      <div className="flex flex-wrap gap-3">
        <Button
          variant="secondary"
          disabled={phase !== "ready"}
          onClick={() => void actions.listenAgain()}
        >
          Listen again
        </Button>
        <Button
          variant="secondary"
          disabled={phase !== "ready" || !hasTakes}
          onClick={() => void actions.hearMyReading()}
        >
          Hear my reading
        </Button>
        <Button
          variant="quiet"
          disabled={phase !== "ready" && phase !== "done"}
          onClick={() => void actions.playAll()}
        >
          连续播放全部
        </Button>
        <Button variant="quiet" onClick={() => actions.shutdown()}>
          结束并释放设备
        </Button>
      </div>
    </section>
  );
}

/** The single main control: Record → Done, as in the real activity. */
function MainButton({ phase }: { phase: Phase }) {
  const actions = useSpikeStore.getState();
  switch (phase) {
    case "ready":
    case "arming":
      return (
        <Button
          variant="record"
          size="lg"
          disabled={phase === "arming"}
          onClick={() => void actions.record()}
        >
          Record
        </Button>
      );
    case "recording":
      return (
        <Button size="lg" onClick={() => void actions.done()}>
          Done
        </Button>
      );
    case "saveFailed":
      return (
        <Button size="lg" onClick={() => void actions.retrySave()}>
          Try again
        </Button>
      );
    case "done":
      return (
        <Button size="lg" onClick={() => void actions.restart()}>
          Read again
        </Button>
      );
    default:
      return (
        <Button variant="quiet" size="lg" disabled>
          {phase === "saving" ? "Saving…" : "Listen…"}
        </Button>
      );
  }
}
