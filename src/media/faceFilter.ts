import type { FaceLandmarker, NormalizedLandmark } from "@mediapipe/tasks-vision";
import { layoutFilter, type FacePoints, type FilterStyle } from "./filterLayout";

export type { FilterStyle } from "./filterLayout";

// Both are served from our own origin (see scripts/copy-mediapipe.mjs).
const WASM_PATH = "/mediapipe/wasm";
const MODEL_PATH = "/mediapipe/face_landmarker.task";

// Indices into MediaPipe's 478-point face mesh. "A" is on the left of the
// (unmirrored) camera image, "B" on the right.
const LANDMARK: Record<keyof FacePoints, number> = {
  noseTip: 1,
  forehead: 10,
  chin: 152,
  eyeOuterA: 33,
  eyeOuterB: 263,
  faceEdgeA: 234,
  faceEdgeB: 454,
};

let consoleFiltered = false;

/**
 * MediaPipe writes informational start-up lines ("INFO: Created TensorFlow
 * Lite XNNPACK delegate for CPU.") through console.error. Development tools
 * then report an error that is not one, on top of the student's controls.
 * This passes exactly those lines on as info and leaves every other error
 * untouched.
 */
function quietMediaPipeInfo(): void {
  if (consoleFiltered) return;
  consoleFiltered = true;
  const original = console.error;
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].startsWith("INFO:")) console.info(...args);
    else original(...args);
  };
}

/**
 * Tracks one face in a video element and draws ears and a nose over it on a
 * canvas. The child's real face stays visible; only the overlay is drawn.
 */
export class FaceFilter {
  private frameRequest: number | null = null;
  private lastVideoTime = -1;
  private lastDetectionAt = 0;
  private smoothedFps = 0;
  private faceVisible = false;

  private constructor(private readonly landmarker: FaceLandmarker) {}

  static async create(): Promise<FaceFilter> {
    quietMediaPipeInfo();
    // Loaded on demand so Mode A never downloads the face-tracking code.
    const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
    const fileset = await FilesetResolver.forVisionTasks(WASM_PATH);
    const createWith = (delegate: "GPU" | "CPU") =>
      FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_PATH, delegate },
        runningMode: "VIDEO",
        numFaces: 1,
      });
    try {
      return new FaceFilter(await createWith("GPU"));
    } catch {
      return new FaceFilter(await createWith("CPU"));
    }
  }

  /**
   * Starts the tracking loop. `getStyle` is read every frame, so the overlay
   * switches character the moment the script moves to another speaker.
   * Return `null` from it to draw nothing.
   */
  start(
    video: HTMLVideoElement,
    canvas: HTMLCanvasElement,
    getStyle: () => FilterStyle | null,
  ): void {
    this.stop();
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not get a 2D canvas context");

    const tick = () => {
      this.frameRequest = requestAnimationFrame(tick);
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.videoWidth === 0) return;
      // Only run detection when the camera has produced a new frame.
      if (video.currentTime === this.lastVideoTime) return;
      this.lastVideoTime = video.currentTime;

      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }

      const now = performance.now();
      const result = this.landmarker.detectForVideo(video, now);
      if (this.lastDetectionAt > 0) {
        const instantFps = 1000 / (now - this.lastDetectionAt);
        this.smoothedFps = this.smoothedFps ? this.smoothedFps * 0.9 + instantFps * 0.1 : instantFps;
      }
      this.lastDetectionAt = now;

      context.clearRect(0, 0, canvas.width, canvas.height);
      const face = result.faceLandmarks[0];
      this.faceVisible = Boolean(face);
      const style = getStyle();
      if (face && style) drawFilter(context, face, canvas.width, canvas.height, style);
    };
    this.frameRequest = requestAnimationFrame(tick);
  }

  stop(): void {
    if (this.frameRequest !== null) cancelAnimationFrame(this.frameRequest);
    this.frameRequest = null;
    this.lastVideoTime = -1;
    this.lastDetectionAt = 0;
  }

  dispose(): void {
    this.stop();
    this.landmarker.close();
  }

  stats(): { fps: number; faceVisible: boolean } {
    return { fps: Math.round(this.smoothedFps), faceVisible: this.faceVisible };
  }
}

function drawFilter(
  context: CanvasRenderingContext2D,
  landmarks: NormalizedLandmark[],
  width: number,
  height: number,
  style: FilterStyle,
): void {
  // Landmarks come normalised to 0..1; the layout works in canvas pixels.
  const face = Object.fromEntries(
    Object.entries(LANDMARK).map(([name, index]) => [
      name,
      { x: landmarks[index].x * width, y: landmarks[index].y * height },
    ]),
  ) as FacePoints;

  for (const shape of layoutFilter(face, style)) {
    context.beginPath();
    context.ellipse(shape.center.x, shape.center.y, shape.radiusX, shape.radiusY, shape.rotation, 0, Math.PI * 2);
    context.fillStyle = shape.color;
    context.fill();
  }
}
