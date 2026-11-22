"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { logEvent } from "@/data/events";
import { ExportStatus, useExport } from "@/features/researcher/exporting";
import { ACTIVITY_ORDER, activityName } from "./activity";
import { useSessionStore } from "./sessionStore";

/** How long the corner must be held. Long enough that a child's tap never opens it. */
const HOLD_MS = 1500;

/**
 * The researcher's way in during a session: press and hold the top-right
 * corner. The corner is invisible, so nothing on a student's screen invites a
 * tap. Opening the panel does not pause or change the activity underneath.
 */
export function ResearcherAccess() {
  const [open, setOpen] = useState(false);
  const timer = useRef<number | null>(null);

  const cancelHold = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  const beginHold = () => {
    cancelHold();
    timer.current = window.setTimeout(() => {
      timer.current = null;
      logEvent("session", "researcher_panel_open");
      setOpen(true);
    }, HOLD_MS);
  };
  useEffect(() => cancelHold, []);

  return (
    <>
      <button
        type="button"
        aria-label="Researcher menu: press and hold"
        className="fixed top-0 right-0 z-40 size-16 touch-none opacity-0"
        onPointerDown={beginHold}
        onPointerUp={cancelHold}
        onPointerLeave={cancelHold}
        onPointerCancel={cancelHold}
        onContextMenu={(event) => event.preventDefault()}
      />
      {open && (
        <ResearcherPanel
          onClose={() => {
            logEvent("session", "researcher_panel_close");
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

function ResearcherPanel({ onClose }: { onClose: () => void }) {
  const phase = useSessionStore((state) => state.phase);
  const session = useSessionStore((state) => state.session);
  const activityIndex = useSessionStore((state) => state.activityIndex);
  const supportMarks = useSessionStore((state) => state.supportMarks);
  const { markSupport, addNote, skipActivity, endEarly, reset } = useSessionStore.getState();
  const [note, setNote] = useState("");
  const [noteStatus, setNoteStatus] = useState<string | null>(null);
  // Skipping and ending cannot be undone, so each needs a second tap.
  const [confirming, setConfirming] = useState<"skip" | "end" | null>(null);
  const exporter = useExport();
  if (!session) return null;

  const inActivity = phase === "activity";
  const beforeEnd = inActivity || phase === "handover";
  const afterEnd = phase === "complete" || phase === "ended";
  const where = inActivity
    ? activityName(ACTIVITY_ORDER[activityIndex], session.mode)
    : phase === "handover"
      ? "Not started yet"
      : phase === "complete"
        ? "Completed"
        : phase === "ended"
          ? "Ended early"
          : "Saving";

  const saveNote = async (kind: "note" | "interruption") => {
    try {
      await addNote(note, kind);
      setNote("");
      setNoteStatus(kind === "interruption" ? "Interruption recorded." : "Note saved.");
    } catch {
      setNoteStatus("Could not save the note. Try again.");
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Researcher"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-6"
    >
      <div className="flex max-h-full w-full max-w-xl flex-col gap-4 overflow-y-auto rounded-lg bg-surface p-6 select-text">
        <header>
          <h2 className="text-2xl font-bold">Researcher</h2>
          <p className="text-ink-muted">
            {session.studentId} · Mode {session.mode} · {where}
          </p>
        </header>

        {inActivity && (
          <div className="flex items-center gap-4">
            <Button
              onClick={() => {
                markSupport();
                onClose();
              }}
            >
              Support provided
            </Button>
            <p className="text-ink-muted">
              Marked {supportMarks} time{supportMarks === 1 ? "" : "s"} in this session
            </p>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1 font-bold">
            Note
            <textarea
              rows={2}
              className="rounded-md border-2 border-line bg-surface px-3 py-2 text-lg font-normal"
              placeholder="Device fault, noise in the room, what help was given"
              value={note}
              onChange={(event) => {
                setNote(event.target.value);
                setNoteStatus(null);
              }}
            />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" variant="secondary" disabled={!note.trim()} onClick={() => void saveNote("note")}>
              Save note
            </Button>
            <Button size="sm" variant="quiet" disabled={!note.trim()} onClick={() => void saveNote("interruption")}>
              Save as interruption
            </Button>
            {noteStatus && <p role="status">{noteStatus}</p>}
          </div>
        </div>

        {beforeEnd && (
          <div className="flex flex-wrap gap-3 border-t-2 border-line pt-4">
            {inActivity && (
              <Button
                size="sm"
                variant={confirming === "skip" ? "record" : "quiet"}
                onClick={() => {
                  if (confirming !== "skip") return setConfirming("skip");
                  skipActivity();
                  onClose();
                }}
              >
                {confirming === "skip" ? "Tap again to skip" : "Skip this activity"}
              </Button>
            )}
            <Button
              size="sm"
              variant={confirming === "end" ? "record" : "quiet"}
              onClick={() => {
                if (confirming !== "end") return setConfirming("end");
                void endEarly();
                onClose();
              }}
            >
              {confirming === "end" ? "Tap again to end" : "End session now"}
            </Button>
          </div>
        )}

        {afterEnd && (
          <div className="flex flex-col gap-3 border-t-2 border-line pt-4">
            <div className="flex flex-wrap gap-3">
              <Button size="sm" disabled={exporter.busy} onClick={() => void exporter.prepare([session.sessionId])}>
                Export this session
              </Button>
              <Button
                size="sm"
                variant="quiet"
                onClick={() => {
                  onClose();
                  reset();
                }}
              >
                Start a new session
              </Button>
            </div>
            <ExportStatus exporter={exporter} />
          </div>
        )}

        <Button size="sm" variant="quiet" className="self-end" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}
