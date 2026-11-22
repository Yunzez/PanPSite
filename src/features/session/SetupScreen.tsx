"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  loadManifest,
  loadMaterial,
  loadRoster,
  materialAudioUrls,
  materialImageUrls,
  preloadImages,
} from "@/content/loader";
import type { Manifest, Material } from "@/content/schema";
import type { Mode } from "@/data/db";
import { defaultSessionConfig } from "./config";
import { audio, prepareRecorder } from "./engines";
import { useSessionStore } from "./sessionStore";

const modeNames: Record<Mode, string> = {
  A: "Mode A · Repeated Reading",
  B: "Mode B · Read and Act",
};

type LoadState =
  | { step: "idle" }
  | { step: "loading"; message: string }
  | { step: "ready"; material: Material }
  | { step: "failed"; message: string };

const fieldClass = "min-h-11 rounded-md border-2 border-line bg-surface px-3 text-lg";

/**
 * The researcher's screen. They pick the student and material, the app loads
 * everything the session needs and asks for the microphone, and only then
 * can the device be handed to the student.
 */
export function SetupScreen({ mode }: { mode: Mode }) {
  const [students, setStudents] = useState<string[]>([]);
  const [materials, setMaterials] = useState<Manifest["materials"]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [studentId, setStudentId] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [rounds, setRounds] = useState(defaultSessionConfig.performRounds);
  const [finalFeedback, setFinalFeedback] = useState(defaultSessionConfig.finalFeedback);
  const [load, setLoad] = useState<LoadState>({ step: "idle" });
  const begin = useSessionStore((state) => state.begin);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadRoster(), loadManifest()]).then(
      ([roster, manifest]) => {
        if (cancelled) return;
        setStudents(roster);
        setMaterials(manifest.materials);
      },
      (error: unknown) => {
        if (!cancelled) setListError(error instanceof Error ? error.message : String(error));
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const config = { ...defaultSessionConfig, performRounds: rounds, finalFeedback };
  const locked = load.step === "loading" || load.step === "ready";

  const prepare = async () => {
    // Runs inside the researcher's tap, so audio is unlocked for the test sound.
    const unlocked = audio.unlock();
    try {
      setLoad({ step: "loading", message: "Loading material…" });
      await unlocked;
      const material = await loadMaterial(materialId);
      const clips = materialAudioUrls(material);
      await audio.preload(clips, (done, total) =>
        setLoad({ step: "loading", message: `Loading audio ${done} / ${total}…` }),
      );
      setLoad({ step: "loading", message: "Loading pictures…" });
      await preloadImages(materialImageUrls(material));
      setLoad({
        step: "loading",
        message: "Waiting for microphone permission. Choose Allow in the browser prompt.",
      });
      await prepareRecorder(config);
      setLoad({ step: "ready", material });
    } catch (error) {
      setLoad({ step: "failed", message: error instanceof Error ? error.message : String(error) });
    }
  };

  const confirm = async () => {
    if (load.step !== "ready") return;
    try {
      await begin({ mode, studentId, material: load.material, config });
    } catch (error) {
      setLoad({ step: "failed", message: error instanceof Error ? error.message : String(error) });
    }
  };

  return (
    <main className="mx-auto flex h-full w-full max-w-2xl flex-col justify-center gap-5 p-6">
      <header>
        <h1 className="text-3xl font-bold">Session setup</h1>
        <p className="text-lg text-ink-muted">{modeNames[mode]} · fixed by this link</p>
      </header>

      {listError && (
        <p role="alert" className="rounded-md border-2 border-record bg-surface px-4 py-3 font-bold">
          {listError}
        </p>
      )}

      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1 font-bold">
          Student ID
          <select
            className={fieldClass}
            value={studentId}
            disabled={locked}
            onChange={(event) => setStudentId(event.target.value)}
          >
            <option value="">Select…</option>
            {students.map((student) => (
              <option key={student} value={student}>
                {student}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 font-bold">
          Material
          <select
            className={fieldClass}
            value={materialId}
            disabled={locked}
            onChange={(event) => setMaterialId(event.target.value)}
          >
            <option value="">Select…</option>
            {materials.map((material) => (
              <option key={material.id} value={material.id}>
                {material.title}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 font-bold">
          Reading rounds
          <input
            type="number"
            min={1}
            max={5}
            className={fieldClass}
            value={rounds}
            disabled={locked}
            onChange={(event) => setRounds(Math.min(5, Math.max(1, Number(event.target.value) || 1)))}
          />
        </label>
        <label className="flex items-center gap-3 self-end pb-2 font-bold">
          <input
            type="checkbox"
            className="size-5 accent-primary"
            checked={finalFeedback}
            disabled={locked}
            onChange={(event) => setFinalFeedback(event.target.checked)}
          />
          Add final character feedback
        </label>
      </div>

      {load.step === "loading" && (
        <p role="status" className="rounded-md bg-highlight px-4 py-3 font-bold">
          {load.message}
        </p>
      )}
      {load.step === "failed" && (
        <p role="alert" className="rounded-md border-2 border-record bg-surface px-4 py-3 font-bold">
          {load.message}
        </p>
      )}

      {load.step === "ready" ? (
        <div className="flex flex-col gap-3">
          <p role="status" className="rounded-md bg-highlight px-4 py-3 font-bold">
            Ready: {studentId} · {load.material.title} · {rounds} round{rounds === 1 ? "" : "s"}
          </p>
          <div className="flex gap-3">
            <Button
              variant="secondary"
              onClick={() => void audio.play(load.material.lines[0].audio)}
            >
              Test sound
            </Button>
            <Button variant="quiet" onClick={() => setLoad({ step: "idle" })}>
              Change
            </Button>
            <Button className="flex-1" onClick={() => void confirm()}>
              Confirm and hand over
            </Button>
          </div>
        </div>
      ) : (
        <Button
          disabled={!studentId || !materialId || load.step === "loading"}
          onClick={() => void prepare()}
        >
          Check and load
        </Button>
      )}
    </main>
  );
}
