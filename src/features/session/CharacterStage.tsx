"use client";

import { useEffect, useRef } from "react";
import type { FilterStyle } from "@/media/filterLayout";
import { getCamera } from "./engines";

/**
 * Mode B's stage: the scene picture with the student's live camera preview
 * in the middle, wearing the current character's ears and nose.
 *
 * The preview is mirrored, like a mirror, and the overlay canvas is flipped
 * the same way. The whole stage clips its content, so the filter can never
 * reach the script text below it.
 */
export function CharacterStage({
  filter,
  sceneUrl,
  label,
  className = "",
}: {
  /** Ears and nose to draw, or null for none. */
  filter: FilterStyle | null;
  sceneUrl?: string;
  /** The character's name, shown in the corner. */
  label?: string;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The drawing loop reads the latest filter every frame, so a change of
  // speaker shows at once without restarting the camera preview.
  const filterRef = useRef(filter);
  useEffect(() => {
    filterRef.current = filter;
  }, [filter]);

  useEffect(() => {
    const camera = getCamera();
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!camera || !video || !canvas) return;
    video.srcObject = camera.stream;
    // Muted inline video is normally allowed to autoplay; ignore a refusal.
    void video.play().catch(() => {});
    camera.filter.start(video, canvas, () => filterRef.current);
    return () => {
      camera.filter.stop();
      video.srcObject = null;
    };
  }, []);

  return (
    <div className={`relative overflow-hidden rounded-lg border-2 border-line bg-surface ${className}`}>
      {sceneUrl && (
        // Researcher-supplied picture, sized by this container.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={sceneUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
      )}
      <div className="absolute inset-y-3 left-1/2 aspect-4/3 -translate-x-1/2 overflow-hidden rounded-md border-2 border-surface bg-ink">
        <video
          ref={videoRef}
          muted
          playsInline
          autoPlay
          className="absolute inset-0 h-full w-full -scale-x-100 object-cover"
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full -scale-x-100 object-cover"
        />
      </div>
      {label && (
        <p className="absolute top-3 left-3 rounded-md bg-surface px-3 py-1 text-xl font-bold">
          {label}
        </p>
      )}
    </div>
  );
}
