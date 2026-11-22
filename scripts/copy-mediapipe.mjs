// Copies MediaPipe's WebAssembly runtime from node_modules into public/, so
// the browser loads it from our own origin instead of a third-party CDN.
// Runs after every `npm install` (see "postinstall" in package.json).
//
// The copied files are build output and are git-ignored. The face model
// (public/mediapipe/face_landmarker.task) is not part of the npm package and
// is committed to the repository instead.
import { cp, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const target = join(root, "public", "mediapipe", "wasm");

await mkdir(target, { recursive: true });
await cp(source, target, { recursive: true });
console.log(`Copied MediaPipe wasm runtime to ${target}`);
