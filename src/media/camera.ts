/**
 * Opens the front camera for the live filter preview (Mode B only).
 *
 * Frames are only ever drawn on this device. Nothing here records, stores or
 * uploads video.
 */
export function openCamera(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
    audio: false,
  });
}

export function closeStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}
