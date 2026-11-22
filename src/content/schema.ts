import { z } from "zod";

/**
 * The shape of a study material (public/content/<id>/material.json).
 *
 * Everything in a material is supplied by the researcher: words, chunk
 * boundaries, pictures, recordings and questions. The app never splits words
 * or generates speech or questions on its own. Validation runs when a
 * material is loaded on the setup screen, so a broken file is caught by the
 * researcher and never reaches a student.
 *
 * Asset paths are relative to the material's own folder.
 */

/** Splits a line into the words that are highlighted one by one. */
export function tokenize(text: string): string[] {
  return text.trim().split(/\s+/);
}

const id = z.string().min(1);
const assetPath = z.string().min(1);

const characterSchema = z.object({
  id,
  /** Shown in Mode B only. */
  name: z.string().min(1),
});

const wordSchema = z.object({
  id,
  text: z.string().min(1),
  image: assetPath,
  /** Researcher-defined parts of the word, e.g. ex / pl / ore. */
  chunks: z.array(z.object({ text: z.string().min(1), audio: assetPath })).min(1),
  /** Clips played in order when the model is shown, each lighting up some chunks. */
  model: z
    .array(
      z.object({
        audio: assetPath,
        highlight: z.union([z.literal("all"), z.array(z.number().int().nonnegative())]),
      }),
    )
    .min(1),
});

const lineSchema = z.object({
  id,
  characterId: id,
  text: z.string().min(1),
  audio: assetPath,
  /** Start and end of each word in the clip, in ms. Without it, only the line is highlighted. */
  words: z.array(z.object({ start: z.number(), end: z.number() })).optional(),
});

const questionSchema = z.object({
  id,
  version: z.string().min(1),
  prompt: z.string().min(1),
  options: z.array(z.object({ id, text: z.string().min(1) })).min(2).max(4),
  /** Used for scoring in the export only; never shown to the student. */
  correctOptionId: id.optional(),
});

const duplicates = (values: string[]) => values.filter((value, index) => values.indexOf(value) !== index);

export const materialSchema = z
  .object({
    id,
    /** Bump on any content change; it is stored with every session. */
    version: z.string().min(1),
    title: z.string().min(1),
    characters: z.array(characterSchema).min(1),
    /** Background picture, Mode B only. */
    scene: z.object({ image: assetPath }).optional(),
    words: z.array(wordSchema),
    lines: z.array(lineSchema).min(1),
    quiz: z.array(questionSchema),
  })
  .superRefine((material, context) => {
    const issue = (message: string, path: (string | number)[]) =>
      context.addIssue({ code: "custom", message, path });

    for (const [name, list] of [
      ["characters", material.characters],
      ["words", material.words],
      ["lines", material.lines],
      ["quiz", material.quiz],
    ] as const) {
      const repeated = duplicates(list.map((item) => item.id));
      if (repeated.length > 0) issue(`Duplicate id "${repeated[0]}"`, [name]);
    }

    const characterIds = new Set(material.characters.map((character) => character.id));
    material.lines.forEach((line, index) => {
      if (!characterIds.has(line.characterId)) {
        issue(`Unknown character "${line.characterId}"`, ["lines", index, "characterId"]);
      }
      const wordCount = tokenize(line.text).length;
      if (line.words && line.words.length !== wordCount) {
        issue(`Has ${line.words.length} word timings for ${wordCount} words`, ["lines", index, "words"]);
      }
    });

    material.words.forEach((word, index) => {
      if (word.chunks.map((chunk) => chunk.text).join("") !== word.text) {
        issue(`Chunks do not spell "${word.text}"`, ["words", index, "chunks"]);
      }
      word.model.forEach((step, stepIndex) => {
        if (step.highlight !== "all" && step.highlight.some((chunk) => chunk >= word.chunks.length)) {
          issue("Highlights a chunk that does not exist", ["words", index, "model", stepIndex]);
        }
      });
    });

    material.quiz.forEach((question, index) => {
      const optionIds = question.options.map((option) => option.id);
      if (duplicates(optionIds).length > 0) issue("Duplicate option id", ["quiz", index, "options"]);
      if (question.correctOptionId && !optionIds.includes(question.correctOptionId)) {
        issue("correctOptionId is not one of the options", ["quiz", index, "correctOptionId"]);
      }
    });
  });

export type Material = z.infer<typeof materialSchema>;
export type Character = Material["characters"][number];
export type WordItem = Material["words"][number];
export type Line = Material["lines"][number];
export type Question = Material["quiz"][number];

export const manifestSchema = z.object({
  materials: z.array(z.object({ id, title: z.string().min(1) })),
});
export type Manifest = z.infer<typeof manifestSchema>;

/** Pseudonymous student codes only; never names. */
export const rosterSchema = z.object({
  students: z.array(z.string().min(1)),
});
