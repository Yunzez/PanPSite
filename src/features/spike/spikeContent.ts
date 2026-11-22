import type { FilterStyle } from "@/media/faceFilter";

/**
 * Placeholder content for the M0 technical check only.
 *
 * The audio files are machine-generated stand-ins and the filter shapes are
 * flat drawings. None of this is study material: real texts, recordings and
 * character art come from the researcher.
 */
export type SpikeCharacter = {
  id: string;
  name: string;
  filter: FilterStyle;
};

export type SpikeLine = {
  id: string;
  characterId: string;
  text: string;
  audio: string;
};

export const spikeCharacters: Record<string, SpikeCharacter> = {
  pig: {
    id: "pig",
    name: "Pig",
    filter: {
      earAnchor: "top",
      earColor: "#F7A8B8",
      earInnerColor: "#E97F97",
      earRadiusX: 0.3,
      earRadiusY: 0.4,
      noseColor: "#F7A8B8",
      noseRadiusX: 0.3,
      noseRadiusY: 0.21,
      nostrilColor: "#C75B77",
    },
  },
  monkey: {
    id: "monkey",
    name: "Monkey",
    filter: {
      earAnchor: "side",
      earColor: "#A9744F",
      earInnerColor: "#E8C39E",
      earRadiusX: 0.28,
      earRadiusY: 0.36,
      noseColor: "#6B4226",
      noseRadiusX: 0.13,
      noseRadiusY: 0.09,
    },
  },
};

export const spikeLines: SpikeLine[] = [
  { id: "L01", characterId: "pig", text: "Hello! I am a little pig.", audio: "/spike/audio/L01.wav" },
  { id: "L02", characterId: "monkey", text: "Hi, Pig! I am a monkey.", audio: "/spike/audio/L02.wav" },
  { id: "L03", characterId: "pig", text: "Do you want to play with me?", audio: "/spike/audio/L03.wav" },
  { id: "L04", characterId: "monkey", text: "Yes! Let's play together.", audio: "/spike/audio/L04.wav" },
];
