"use client";

import { Button } from "@/components/ui/Button";
import { extensionForMimeType } from "@/media/recorder";
import { spikeCharacters } from "./spikeContent";
import { useSpikeStore, type FilterStatus } from "./useSpikeStore";

const formatBytes = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

const formatSeconds = (ms: number) => `${(ms / 1000).toFixed(1)} 秒`;

/** Every take stored on this device, including ones from earlier page loads. */
export function TakesPanel() {
  const takes = useSpikeStore((state) => state.takes);
  const phase = useSpikeStore((state) => state.phase);
  const playingTakeId = useSpikeStore((state) => state.playingTakeId);
  const playTake = useSpikeStore((state) => state.playTake);
  const clearTakes = useSpikeStore((state) => state.clearTakes);
  const canPlay = phase === "setup" || phase === "ready" || phase === "done";

  return (
    <section className="rounded-lg border-2 border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold">本机录音（{takes.length}）</h2>
        <Button
          variant="quiet"
          size="sm"
          disabled={takes.length === 0 || !canPlay}
          onClick={() => {
            if (window.confirm("删除本机上所有验证录音？此操作无法撤销。")) void clearTakes();
          }}
        >
          清空
        </Button>
      </div>
      {takes.length === 0 ? (
        <p className="mt-3 text-ink-muted">
          还没有录音。录完后刷新页面，这里仍然列出它们，说明本地存储有效。
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {takes.map((take) => (
            <li
              key={take.recordingId}
              className="flex items-center justify-between gap-3 rounded-md border-2 border-line px-3 py-2"
            >
              <span>
                <span className="font-bold">{take.lineId}</span>
                {" · "}
                {take.characterId ? spikeCharacters[take.characterId]?.name : "—"}
                {" · 第 "}
                {take.take}
                {" 次 · "}
                {formatSeconds(take.durationMs)}
                {" · "}
                {formatBytes(take.sizeBytes)}
                {" · ."}
                {extensionForMimeType(take.mimeType)}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={!canPlay}
                onClick={() => void playTake(take.recordingId)}
              >
                {playingTakeId === take.recordingId ? "播放中" : "播放"}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const filterStatusLabel: Record<FilterStatus, string> = {
  off: "未启用",
  loading: "加载中",
  ready: "已就绪",
  failed: "加载失败",
};

/** What the browser actually gave us, plus a timeline of the run. */
export function DiagnosticsPanel() {
  const diagnostics = useSpikeStore((state) => state.diagnostics);
  const filterStatus = useSpikeStore((state) => state.filterStatus);
  const log = useSpikeStore((state) => state.log);
  const mic = diagnostics.micSettings;

  const rows: [string, string][] = [
    [
      "录音格式",
      diagnostics.mimeType === null ? "—" : diagnostics.mimeType || "浏览器默认",
    ],
    [
      "音频输出",
      diagnostics.audio ? `${diagnostics.audio.state} · ${diagnostics.audio.sampleRate} Hz` : "—",
    ],
    [
      "麦克风",
      mic
        ? `${mic.sampleRate ?? "?"} Hz · 回声消除 ${mic.echoCancellation ? "开" : "关"} · 降噪 ${
            mic.noiseSuppression ? "开" : "关"
          } · 自动增益 ${mic.autoGainControl ? "开" : "关"}`
        : "未打开",
    ],
    [
      "人脸追踪",
      filterStatus === "ready"
        ? `${diagnostics.fps} 帧/秒 · ${diagnostics.faceVisible ? "检测到人脸" : "未检测到人脸"}`
        : filterStatusLabel[filterStatus],
    ],
    [
      "持久化存储",
      diagnostics.persisted === null ? "—" : diagnostics.persisted ? "已授予" : "未授予",
    ],
    [
      "存储占用",
      diagnostics.storage
        ? `${formatBytes(diagnostics.storage.usage)} / ${formatBytes(diagnostics.storage.quota)}`
        : "—",
    ],
  ];

  return (
    <section className="rounded-lg border-2 border-line bg-surface p-4">
      <h2 className="text-xl font-bold">诊断</h2>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-ink-muted">{label}</dt>
            <dd className="break-words">{value}</dd>
          </div>
        ))}
      </dl>
      <h3 className="mt-4 font-bold">时间线</h3>
      {log.length === 0 ? (
        <p className="mt-1 text-ink-muted">点 Start 之后这里会记录每一步的耗时。</p>
      ) : (
        <ol className="mt-1 max-h-64 overflow-y-auto font-mono text-sm">
          {log.map((entry) => (
            <li key={entry.id}>
              <span className="text-ink-muted">{(entry.atMs / 1000).toFixed(2)}s</span>{" "}
              {entry.message}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
