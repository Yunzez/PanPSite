import type { z } from "zod";
import { manifestSchema, materialSchema, rosterSchema, type Manifest, type Material } from "./schema";

const CONTENT_ROOT = "/content";

async function fetchJson<Schema extends z.ZodType>(url: string, schema: Schema): Promise<z.infer<Schema>> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Could not load ${url} (HTTP ${response.status})`);
  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) {
    const problems = parsed.error.issues
      .slice(0, 5)
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new Error(`${url} is not valid: ${problems}`);
  }
  return parsed.data;
}

export function loadManifest(): Promise<Manifest> {
  return fetchJson(`${CONTENT_ROOT}/manifest.json`, manifestSchema);
}

export async function loadRoster(): Promise<string[]> {
  return (await fetchJson(`${CONTENT_ROOT}/roster.json`, rosterSchema)).students;
}

/**
 * Loads and validates a material. Asset paths in the returned object are
 * already full URLs, so the rest of the app can use them directly.
 */
export async function loadMaterial(materialId: string): Promise<Material> {
  const base = `${CONTENT_ROOT}/${encodeURIComponent(materialId)}`;
  const material = await fetchJson(`${base}/material.json`, materialSchema);
  if (material.id !== materialId) {
    throw new Error(`Material in folder "${materialId}" has id "${material.id}"`);
  }
  const url = (path: string) => `${base}/${path}`;
  return {
    ...material,
    scene: material.scene && { image: url(material.scene.image) },
    words: material.words.map((word) => ({
      ...word,
      image: url(word.image),
      chunks: word.chunks.map((chunk) => ({ ...chunk, audio: url(chunk.audio) })),
      model: word.model.map((step) => ({ ...step, audio: url(step.audio) })),
    })),
    lines: material.lines.map((line) => ({ ...line, audio: url(line.audio) })),
  };
}

/** Every audio clip a session with this material can play. */
export function materialAudioUrls(material: Material): string[] {
  const urls = new Set<string>();
  for (const word of material.words) {
    word.chunks.forEach((chunk) => urls.add(chunk.audio));
    word.model.forEach((step) => urls.add(step.audio));
  }
  material.lines.forEach((line) => urls.add(line.audio));
  return [...urls];
}

export function materialImageUrls(material: Material): string[] {
  const urls = material.words.map((word) => word.image);
  if (material.scene) urls.push(material.scene.image);
  return [...new Set(urls)];
}

/** Downloads and decodes pictures ahead of time so they appear instantly. */
export async function preloadImages(urls: readonly string[]): Promise<void> {
  await Promise.all(
    urls.map(
      (url) =>
        new Promise<void>((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve();
          image.onerror = () => reject(new Error(`Could not load image ${url}`));
          image.src = url;
        }),
    ),
  );
}
