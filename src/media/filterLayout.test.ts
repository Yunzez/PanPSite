import assert from "node:assert/strict";
import { test } from "node:test";
import { layoutFilter, type FacePoints, type FilterStyle, type Point } from "./filterLayout.ts";

// An upright face looking at the camera; eyes 100px apart.
const upright: FacePoints = {
  eyeOuterA: { x: 200, y: 200 },
  eyeOuterB: { x: 300, y: 200 },
  forehead: { x: 250, y: 120 },
  chin: { x: 250, y: 330 },
  noseTip: { x: 250, y: 250 },
  faceEdgeA: { x: 170, y: 220 },
  faceEdgeB: { x: 330, y: 220 },
};

const topEars: FilterStyle = {
  earAnchor: "top",
  earColor: "#111111",
  earInnerColor: "#222222",
  earRadiusX: 0.3,
  earRadiusY: 0.4,
  noseColor: "#333333",
  noseRadiusX: 0.3,
  noseRadiusY: 0.2,
  nostrilColor: "#444444",
};
const sideEars: FilterStyle = { ...topEars, earAnchor: "side", nostrilColor: undefined };

const near = (actual: number, expected: number, message?: string) =>
  assert.ok(Math.abs(actual - expected) < 1e-6, message ?? `${actual} should be about ${expected}`);

const mapPoints = (face: FacePoints, change: (point: Point) => Point): FacePoints =>
  Object.fromEntries(Object.entries(face).map(([key, point]) => [key, change(point)])) as FacePoints;

test("top ears sit above the forehead, one on each side", () => {
  const shapes = layoutFilter(upright, topEars);
  const [earA, , earB] = shapes;
  assert.ok(earA.center.y < upright.forehead.y, "left ear is above the forehead");
  assert.ok(earB.center.y < upright.forehead.y, "right ear is above the forehead");
  assert.ok(earA.center.x < upright.forehead.x && earB.center.x > upright.forehead.x);
  near(upright.forehead.x - earA.center.x, earB.center.x - upright.forehead.x);
});

test("side ears sit outside the edges of the face", () => {
  const [earA, , earB] = layoutFilter(upright, sideEars);
  assert.ok(earA.center.x < upright.faceEdgeA.x);
  assert.ok(earB.center.x > upright.faceEdgeB.x);
});

test("the nose is centred on the nose tip, with nostrils on both sides", () => {
  const shapes = layoutFilter(upright, topEars);
  const nose = shapes[4];
  assert.deepEqual(nose.center, upright.noseTip);
  near(nose.rotation, 0);
  const [nostrilA, nostrilB] = shapes.slice(5);
  assert.ok(nostrilA.center.x < nose.center.x && nostrilB.center.x > nose.center.x);
  assert.equal(layoutFilter(upright, sideEars).length, 5, "no nostrils without a nostril colour");
});

test("sizes scale with the face", () => {
  const small = layoutFilter(upright, topEars);
  const large = layoutFilter(mapPoints(upright, (p) => ({ x: p.x * 2, y: p.y * 2 })), topEars);
  small.forEach((shape, index) => {
    near(large[index].radiusX, shape.radiusX * 2);
    near(large[index].radiusY, shape.radiusY * 2);
    near(large[index].center.x, shape.center.x * 2);
  });
});

test("the overlay turns with a tilted head", () => {
  // Rotate the whole face a quarter turn clockwise (canvas y points down).
  const turn = (p: Point): Point => ({ x: -p.y, y: p.x });
  const turned = layoutFilter(mapPoints(upright, turn), topEars);
  layoutFilter(upright, topEars).forEach((shape, index) => {
    const expected = turn(shape.center);
    near(turned[index].center.x, expected.x);
    near(turned[index].center.y, expected.y);
    near(turned[index].rotation, shape.rotation + Math.PI / 2);
  });
});

test("draws nothing for a face too small to measure", () => {
  const collapsed = mapPoints(upright, () => ({ x: 10, y: 10 }));
  assert.deepEqual(layoutFilter(collapsed, topEars), []);
});
