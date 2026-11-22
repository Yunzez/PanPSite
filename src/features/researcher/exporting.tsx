"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { buildExport, markExported, type ExportResult } from "@/data/export";

export const formatBytes = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/**
 * Exporting in two steps: first build the ZIP, then the researcher takes it
 * with Download or Share. The second step is a tap of its own, which browsers
 * require for downloads and the share sheet, and it is also the moment the
 * sessions are marked as exported: "exported" means handed over.
 */
export function useExport(onHandedOver?: () => void | Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState<{ result: ExportResult; url: string } | null>(null);

  // The object URL holds the whole ZIP in memory; release it when replaced.
  useEffect(() => {
    if (!ready) return;
    return () => URL.revokeObjectURL(ready.url);
  }, [ready]);

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

  const handedOver = async () => {
    if (!ready) return;
    await markExported(ready.result.sessionIds);
    await onHandedOver?.();
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

  return { busy, error, ready, prepare, handedOver, share };
}

/** Progress, errors and the Download / Share buttons for an export. */
export function ExportStatus({ exporter }: { exporter: ReturnType<typeof useExport> }) {
  const { busy, error, ready, handedOver, share } = exporter;
  const canShare =
    ready !== null &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [new File([], ready.result.filename, { type: "application/zip" })] });

  return (
    <>
      {busy && (
        <p role="status" className="font-bold">
          Building the ZIP…
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-md border-2 border-record bg-surface px-4 py-3 font-bold">
          {error}
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
    </>
  );
}
