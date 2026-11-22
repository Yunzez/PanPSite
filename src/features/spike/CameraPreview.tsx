"use client";

import { useEffect, useRef } from "react";
import { startFilterPreview, useSpikeStore } from "./useSpikeStore";

/**
 * Mirrored camera preview with the filter drawn on a canvas above it.
 * Both layers are flipped the same way, so the overlay code can work in the
 * camera's own (unmirrored) coordinates.
 */
export function CameraPreview() {
  const stream = useSpikeStore((state) => state.cameraStream);
  const filterStatus = useSpikeStore((state) => state.filterStatus);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    // Muted inline video is normally allowed to autoplay; ignore a refusal.
    if (stream) void video.play().catch(() => {});
    return () => {
      video.srcObject = null;
    };
  }, [stream]);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !stream || filterStatus !== "ready") return;
    return startFilterPreview(video, canvas);
  }, [stream, filterStatus]);

  return (
    <div className="relative aspect-4/3 w-full overflow-hidden rounded-lg bg-ink">
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
      {!stream && (
        <p className="absolute inset-0 flex items-center justify-center text-lg text-surface">
          摄像头未开启
        </p>
      )}
    </div>
  );
}
