// Regenerates the placeholder audio of the demo material and of the /spike
// page with Kokoro, a small neural text-to-speech model that runs locally.
//
//   npm --prefix tools/tts install      (once; large, kept out of the web app)
//   npm --prefix tools/tts run generate
//
// The first run downloads the model (about 90 MB) from Hugging Face.
//
// This is for demo content only. Study materials use recordings supplied by
// the researcher; the app never generates speech itself.
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { KokoroTTS } from "kokoro-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const materialDir = join(root, "public", "content", "demo");
const spikeDir = join(root, "public", "spike", "audio");

// One voice per character, so the dialogue sounds like two speakers.
// Samples of every voice: https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX#samples
const CHARACTER_VOICES = { pig: "af_heart", monkey: "am_puck" };
const WORD_VOICE = "af_heart";
// A little slower than normal speech, for young learners.
const SPEED = 0.9;

// A chunk such as "geth" is not a word, so the voice needs a spelling that
// produces the intended sound instead of reading out letters.
const CHUNK_SPELLING = { hel: "hell", lo: "low", mon: "mun", key: "key", to: "too", geth: "geth", er: "er" };

const SILENCE_THRESHOLD = 0.012;
const PADDING_SECONDS = 0.12;

/** Cuts silence from both ends, leaving a short pad so the clip does not start abruptly. */
function trimSilence(samples, sampleRate) {
  let start = 0;
  let end = samples.length - 1;
  while (start < end && Math.abs(samples[start]) < SILENCE_THRESHOLD) start += 1;
  while (end > start && Math.abs(samples[end]) < SILENCE_THRESHOLD) end -= 1;
  const pad = Math.round(PADDING_SECONDS * sampleRate);
  return samples.subarray(Math.max(0, start - pad), Math.min(samples.length, end + pad));
}

const TARGET_RMS = 0.1;
const PEAK_LIMIT = 0.95;

/** Brings every clip to the same loudness; different voices come out at different levels. */
function normalizeLoudness(samples) {
  let sumOfSquares = 0;
  let peak = 0;
  for (const sample of samples) {
    sumOfSquares += sample * sample;
    peak = Math.max(peak, Math.abs(sample));
  }
  const rms = Math.sqrt(sumOfSquares / samples.length);
  if (rms === 0) return samples;
  // Never amplify so far that the loudest sample would clip.
  const gain = Math.min(TARGET_RMS / rms, PEAK_LIMIT / peak);
  return samples.map((sample) => sample * gain);
}

/** Encodes mono samples in -1..1 as a 16-bit PCM WAV file. */
function encodeWav(samples, sampleRate) {
  const buffer = Buffer.alloc(44 + samples.length * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + samples.length * 2, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
  }
  return buffer;
}

/**
 * Rough word timings: the clip is divided in proportion to word length, with
 * a little extra after punctuation. Good enough to show the highlighting;
 * real material should be aligned against the recording instead.
 */
function estimateWordTimings(text, seconds) {
  const tokens = text.trim().split(/\s+/);
  const weights = tokens.map(
    (token) => token.replace(/[^A-Za-z']/g, "").length + 1.5 + (/[!?,.]$/.test(token) ? 2 : 0),
  );
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const startAt = PADDING_SECONDS * 1000;
  const endAt = seconds * 1000 - PADDING_SECONDS * 1000;
  let cursor = startAt;
  return weights.map((weight) => {
    const start = Math.round(cursor);
    cursor += ((endAt - startAt) * weight) / total;
    return { start, end: Math.round(cursor) };
  });
}

console.log("Loading the voice model (downloads about 90 MB on the first run)…");
const tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
  dtype: "q8",
  device: "cpu",
});

/** Speaks `text` into `file` and returns the clip's length in seconds. */
async function speak(text, voice, file) {
  const result = await tts.generate(text, { voice, speed: SPEED });
  const samples = normalizeLoudness(trimSilence(result.audio, result.sampling_rate));
  await writeFile(file, encodeWav(samples, result.sampling_rate));
  const seconds = samples.length / result.sampling_rate;
  console.log(`  ${seconds.toFixed(2)}s  ${voice}  ${file.slice(root.length + 1)}  "${text}"`);
  return seconds;
}

const materialPath = join(materialDir, "material.json");
const material = JSON.parse(await readFile(materialPath, "utf8"));

console.log("Lines");
for (const line of material.lines) {
  const seconds = await speak(line.text, CHARACTER_VOICES[line.characterId], join(materialDir, line.audio));
  line.words = estimateWordTimings(line.text, seconds);
}

console.log("Words");
for (const word of material.words) {
  // The whole-word clip is the first step of the model sequence.
  await speak(word.text, WORD_VOICE, join(materialDir, word.model[0].audio));
  for (const chunk of word.chunks) {
    await speak(CHUNK_SPELLING[chunk.text] ?? chunk.text, WORD_VOICE, join(materialDir, chunk.audio));
  }
}

// The /spike page uses its own copies of the first four lines.
console.log("Spike page");
for (const line of material.lines.slice(0, 4)) {
  await speak(line.text, CHARACTER_VOICES[line.characterId], join(spikeDir, `${line.id}.wav`));
}

// New audio means new content: the version is stored with every session.
const [major, minor] = material.version.split(".").map(Number);
material.version = `${major}.${minor + 1}.0`;
await writeFile(materialPath, `${JSON.stringify(material, null, 2)}\n`);
console.log(`Done. Material version is now ${material.version}.`);
