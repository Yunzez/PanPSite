/**
 * Where a character's ears and nose go on a face. Pure geometry with no
 * browser or camera code, so it can be unit-tested.
 */

/**
 * How one character's ears and nose are drawn. Sizes are multiples of the
 * distance between the eyes, so the overlay scales with the face.
 *
 * These are flat placeholder shapes. Real character art will be image
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

export type Point = { x: number; y: number };

/**
 * The face landmarks the filter needs, in canvas pixels. "A" is on the left
 * of the (unmirrored) camera image, "B" on the right.
 */
export type FacePoints = {
  eyeOuterA: Point;
  eyeOuterB: Point;
  forehead: Point;
  chin: Point;
  noseTip: Point;
  faceEdgeA: Point;
  faceEdgeB: Point;
};

export type Ellipse = {
  center: Point;
  radiusX: number;
  radiusY: number;
  /** Radians, clockwise in canvas coordinates. */
  rotation: number;
  color: string;
};

/**
 * Returns the ellipses to draw, back to front: each ear with its inner part,
 * then the nose and nostrils. Returns an empty list when the face is too
 * small to place anything.
 */
export function layoutFilter(face: FacePoints, style: FilterStyle): Ellipse[] {
  const eyeDistance = Math.hypot(face.eyeOuterB.x - face.eyeOuterA.x, face.eyeOuterB.y - face.eyeOuterA.y);
  const faceHeight = Math.hypot(face.forehead.x - face.chin.x, face.forehead.y - face.chin.y);
  if (eyeDistance < 1 || faceHeight < 1) return [];

  // The face's own axes, so the overlay follows a tilted head:
  // `right` runs along the eye line, `up` from chin to forehead.
  const right: Point = {
    x: (face.eyeOuterB.x - face.eyeOuterA.x) / eyeDistance,
    y: (face.eyeOuterB.y - face.eyeOuterA.y) / eyeDistance,
  };
  const up: Point = {
    x: (face.forehead.x - face.chin.x) / faceHeight,
    y: (face.forehead.y - face.chin.y) / faceHeight,
  };
  const roll = Math.atan2(right.y, right.x);

  /** A point offset from `origin` along the face's axes, in eye-distance units. */
  const offset = (origin: Point, alongRight: number, alongUp: number): Point => ({
    x: origin.x + (right.x * alongRight + up.x * alongUp) * eyeDistance,
    y: origin.y + (right.y * alongRight + up.y * alongUp) * eyeDistance,
  });
  const ellipse = (center: Point, radiusX: number, radiusY: number, rotation: number, color: string): Ellipse => ({
    center,
    radiusX: radiusX * eyeDistance,
    radiusY: radiusY * eyeDistance,
    rotation,
    color,
  });

  const ears =
    style.earAnchor === "top"
      ? [
          { center: offset(face.forehead, -0.72, 0.42), tilt: -0.35 },
          { center: offset(face.forehead, 0.72, 0.42), tilt: 0.35 },
        ]
      : [
          { center: offset(face.faceEdgeA, -0.22, 0.3), tilt: 0 },
          { center: offset(face.faceEdgeB, 0.22, 0.3), tilt: 0 },
        ];

  const shapes: Ellipse[] = [];
  for (const ear of ears) {
    shapes.push(ellipse(ear.center, style.earRadiusX, style.earRadiusY, roll + ear.tilt, style.earColor));
    shapes.push(
      ellipse(ear.center, style.earRadiusX * 0.58, style.earRadiusY * 0.58, roll + ear.tilt, style.earInnerColor),
    );
  }

  shapes.push(ellipse(face.noseTip, style.noseRadiusX, style.noseRadiusY, roll, style.noseColor));
  if (style.nostrilColor) {
    const spread = style.noseRadiusX * 0.42;
    for (const side of [-1, 1]) {
      shapes.push(
        ellipse(
          offset(face.noseTip, side * spread, 0),
          style.noseRadiusX * 0.18,
          style.noseRadiusY * 0.34,
          roll,
          style.nostrilColor,
        ),
      );
    }
  }
  return shapes;
}
