"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { getDb, type SessionRow } from "@/data/db";
import { buildExport, markExported, type ExportResult } from "@/data/export";
import { listSessions } from "@/data/sessions";
import { estimateStorage, requestPersistentStorage } from "@/data/storage";
import { RESEARCHER_PIN } from "./pin";

const formatBytes = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

const formatTime = (ms: number) =>
  new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

const statusLabel: Record<SessionRow["status"], string> = {
  in_progress: "In progress",
  completed: "Completed",
  incomplete: "Incomplete",
};

export function ResearcherApp() {
  const [unlocked, setUnlocked] = useState(false);
  return unlocked ? <Dashboard /> : <PinGate onUnlock={() => setUnlocked(true)} />;
}

function PinGate({ onUnlock }: { onUnlock: () => void }) {
  const [pin, setPin] = useState("");
  const [wrong, setWrong] = useState(false);
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <form
        className="flex w-full max-w-xs flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (pin === RESEARCHER_PIN) onUnlock();
          else setWrong(true);
        }}
      >
        <h1 className="text-2xl font-bold">Researcher</h1>
        <label className="flex flex-col gap-1 font-bold">
          PIN
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            className="min-h-11 rounded-md border-2 border-line bg-surface px-3 text-lg"
            value={pin}
            onChange={(event) => {
              setPin(event.target.value);
              setWrong(false);
            }}
          />
        </label>
        {wrong && (
          <p role="alert" className="font-bold">
            That PIN is not right.
          </p>
        )}
        <Button type="submit" size="sm">
          Open
        </Button>
      </form>
    </main>
  );
}

type Overview = {
  sessions: SessionRow[];
  takes: Map<string, number>;
  storage: { usage: number; quota: number } | null;
  persisted: boolean | null;
};

async function loadOverview(): Promise<Overview> {
  const sessions = await listSessions();
  const takes = new Map<string, number>();
  await getDb().recordings.each((recording) => {
    takes.set(recording.sessionId, (takes.get(recording.sessionId) ?? 0) + 1);
  });
  return {
    sessions,
    takes,
    storage: await estimateStorage(),
    persisted: await requestPersistentStorage(),
  };
}

function Dashboard() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState<{ result: ExportResult; url: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadOverview().then(
      (loaded) => {
        if (!cancelled) setOverview(loaded);
      },
      (cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = async () => setOverview(await loadOverview());

  // The object URL holds the whole ZIP in memory; release it when replaced.
  useEffect(() => {
    if (!ready) return;
    return () => URL.revokeObjectURL(ready.url);
  }, [ready]);

  const sessions = overview?.sessions ?? [];
  const pending = sessions.filter((session) => session.exportedAt === null && session.status !== "in_progress");

  const prepare = async (sessionIds?: string[]) => {
    setBusy(true);
    setError(null);
    setReady(null);
    try {
      const result = await buildExport(sessionIds);
      setReady({ result, url: URL.createObjectURL(result.blob) });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  // Called when the researcher takes the file, so "exported" means handed over.
  const handedOver = async () => {
    if (!ready) return;
    await markExported(ready.result.sessionIds);
    await refresh();
  };

  const share = async () => {
    if (!ready) return;
    const file = new File([ready.result.blob], ready.result.filename, { type: "application/zip" });
    try {
      await navigator.share({ files: [file] });
      await handedOver();
    } catch {
      // Share sheet dismissed; nothing was handed over.
    }
  };

  const canShare =
    ready !== null &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({
      files: [new File([], ready.result.filename, { type: "application/zip" })],
    });

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-5 p-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-3xl font-bold">Sessions on this device</h1>
        <p className="text-ink-muted">
          {overview?.storage
            ? `${formatBytes(overview.storage.usage)} used of ${formatBytes(overview.storage.quota)}`
            : "Storage: unknown"}
          {overview?.persisted === false && " · not protected from clean-up"}
        </p>
      </header>

      <p
        role="status"
        className={`rounded-md px-4 py-3 font-bold ${
          pending.length > 0 ? "bg-highlight" : "border-2 border-line bg-surface"
        }`}
      >
        {pending.length > 0
          ? `${pending.length} session${pending.length === 1 ? "" : "s"} not exported yet. Data exists only on this device until you export it.`
          : "Everything on this device has been exported."}
      </p>

      {error && (
        <p role="alert" className="rounded-md border-2 border-record bg-surface px-4 py-3 font-bold">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <Button
          size="sm"
          disabled={busy || pending.length === 0}
          onClick={() => void prepare(pending.map((session) => session.sessionId))}
        >
          Prepare export of new sessions ({pending.length})
        </Button>
        <Button
          size="sm"
          variant="quiet"
          disabled={busy || sessions.length === 0}
          onClick={() => void prepare()}
        >
          Prepare export of all ({sessions.length})
        </Button>
      </div>

      {busy && (
        <p role="status" className="font-bold">
          Building the ZIP…
        </p>
      )}

      {ready && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border-2 border-primary bg-surface p-4">
          <p className="flex-1 font-bold">
            {ready.result.filename} · {formatBytes(ready.result.blob.size)} ·{" "}
            {ready.result.sessionIds.length} session{ready.result.sessionIds.length === 1 ? "" : "s"}
          </p>
          <a
            href={ready.url}
            download={ready.result.filename}
            onClick={() => void handedOver()}
            className="inline-flex min-h-11 items-center rounded-lg border-2 border-b-[5px] border-primary-dark bg-primary px-4 font-bold text-on-primary"
          >
            Download ZIP
          </a>
          {canShare && (
            <Button size="sm" variant="secondary" onClick={() => void share()}>
              Share…
            </Button>
          )}
        </div>
      )}

      {sessions.length === 0 ? (
        <p className="text-ink-muted">No sessions have been run on this device yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border-2 border-line bg-surface">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b-2 border-line">
                {["Started", "Student", "Mode", "Material", "Status", "Recordings", "Exported", ""].map(
                  (heading) => (
                    <th key={heading} className="px-3 py-2">
                      {heading}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => (
                <tr key={session.sessionId} className="border-b border-line last:border-b-0">
                  <td className="px-3 py-2">{formatTime(session.startedAt)}</td>
                  <td className="px-3 py-2 font-bold">{session.studentId}</td>
                  <td className="px-3 py-2">{session.mode}</td>
                  <td className="px-3 py-2">{session.materialId}</td>
                  <td className="px-3 py-2">{statusLabel[session.status]}</td>
                  <td className="px-3 py-2">{overview?.takes.get(session.sessionId) ?? 0}</td>
                  <td className="px-3 py-2">
                    {session.exportedAt === null ? "Not yet" : formatTime(session.exportedAt)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      size="sm"
                      variant="quiet"
                      disabled={busy}
                      onClick={() => void prepare([session.sessionId])}
                    >
                      Export
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
