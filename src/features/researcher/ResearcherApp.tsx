"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { getDb, type SessionRow } from "@/data/db";
import { listSessions } from "@/data/sessions";
import { estimateStorage, requestPersistentStorage } from "@/data/storage";
import { ExportStatus, formatBytes, useExport } from "./exporting";
import { RESEARCHER_PIN } from "./pin";

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
  const [error, setError] = useState<string | null>(null);
  const exporter = useExport(async () => setOverview(await loadOverview()));

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

  const sessions = overview?.sessions ?? [];
  // Anything not handed over yet, including sessions that were never finished.
  const pending = sessions.filter((session) => session.exportedAt === null);
  const { busy, prepare } = exporter;

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

      <ExportStatus exporter={exporter} />

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
