import type { FaceLandmarker, NormalizedLandmark } from "@mediapipe/tasks-vision";

/**
 * How one character's ears and nose are drawn. Sizes are multiples of the
 * distance between the eyes, so the overlay scales with the face.
 *
 * These are flat placeholder shapes. The real character art will be PNG
 * sprites placed with the same anchor points.
 */
export type FilterStyle = {
  /** `top`: ears sit above the forehead. `side`: ears sit beside the head. */
  earAnchor: "top" | "side";
  earColor: string;
  earInnerColor: string;
  earRadiusX: number;
  earRadiusY: number;
  noseColor: string;
  noseRadiusX: number;
  noseRadiusY: number;
  /** Colour of the two nostril dots; omit for a plain nose. */
  nostrilColor?: string;
};

// Both are served from our own origin (see scripts/copy-mediapipe.mjs).
const WASM_PATH = "/mediapipe/wasm";
const MODEL_PATH = "/mediapipe/face_landmarker.task";

// Indices into MediaPipe's 478-point face mesh. "A" is on the left of the
// (unmirrored) camera image, "B" on the right.
const LANDMARK = {
  noseTip: 1,
  forehead: 10,
  chin: 152,
  eyeOuterA: 33,
  eyeOuterB: 263,
  faceEdgeA: 234,
  faceEdgeB: 454,
} as const;

type Point = { x: number; y: number };

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
  face: NormalizedLandmark[],
  width: number,
  height: number,
  style: FilterStyle,
): void {
  const point = (index: number): Point => ({ x: face[index].x * width, y: face[index].y * height });
  const eyeA = point(LANDMARK.eyeOuterA);
  const eyeB = point(LANDMARK.eyeOuterB);
  const forehead = point(LANDMARK.forehead);
  const chin = point(LANDMARK.chin);

  const eyeDistance = Math.hypot(eyeB.x - eyeA.x, eyeB.y - eyeA.y);
  const faceHeight = Math.hypot(forehead.x - chin.x, forehead.y - chin.y);
  if (eyeDistance < 1 || faceHeight < 1) return;

  // The face's own axes, so the overlay follows a tilted head:
  // `right` runs along the eye line, `up` from chin to forehead.
  const right: Point = { x: (eyeB.x - eyeA.x) / eyeDistance, y: (eyeB.y - eyeA.y) / eyeDistance };
  const up: Point = { x: (forehead.x - chin.x) / faceHeight, y: (forehead.y - chin.y) / faceHeight };
  const roll = Math.atan2(right.y, right.x);

  /** A point offset from `origin` along the face's axes, in eye-distance units. */
  const offset = (origin: Point, alongRight: number, alongUp: number): Point => ({
    x: origin.x + (right.x * alongRight + up.x * alongUp) * eyeDistance,
    y: origin.y + (right.y * alongRight + up.y * alongUp) * eyeDistance,
  });

  const ellipse = (center: Point, radiusX: number, radiusY: number, rotation: number, color: string) => {
    context.beginPath();
    context.ellipse(center.x, center.y, radiusX * eyeDistance, radiusY * eyeDistance, rotation, 0, Math.PI * 2);
    context.fillStyle = color;
    context.fill();
  };

  const ears: { center: Point; tilt: number }[] =
    style.earAnchor === "top"
      ? [
          { center: offset(forehead, -0.72, 0.42), tilt: -0.35 },
          { center: offset(forehead, 0.72, 0.42), tilt: 0.35 },
        ]
      : [
          { center: offset(point(LANDMARK.faceEdgeA), -0.22, 0.3), tilt: 0 },
          { center: offset(point(LANDMARK.faceEdgeB), 0.22, 0.3), tilt: 0 },
        ];
  for (const ear of ears) {
    ellipse(ear.center, style.earRadiusX, style.earRadiusY, roll + ear.tilt, style.earColor);
    ellipse(ear.center, style.earRadiusX * 0.58, style.earRadiusY * 0.58, roll + ear.tilt, style.earInnerColor);
  }

  const nose = point(LANDMARK.noseTip);
  ellipse(nose, style.noseRadiusX, style.noseRadiusY, roll, style.noseColor);
  if (style.nostrilColor) {
    const spread = style.noseRadiusX * 0.42;
    for (const side of [-1, 1]) {
      ellipse(
        offset(nose, side * spread, 0),
        style.noseRadiusX * 0.18,
        style.noseRadiusY * 0.34,
        roll,
        style.nostrilColor,
      );
    }
  }
}
