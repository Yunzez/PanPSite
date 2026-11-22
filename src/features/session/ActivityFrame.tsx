"use client";

import type { ReactNode } from "react";
import { useTheme } from "@/theme/useTheme";
import { totalStars, useSessionStore } from "./sessionStore";

const STAR_PATH =
  "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z";

export function Star({ earned, size = 36 }: { earned: boolean; size?: number }) {
  const { color } = useTheme();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d={STAR_PATH}
        fill={earned ? color.secondary : "none"}
        stroke={earned ? color.secondaryDark : color.line}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Completion stars earned so far. They mark finishing an activity, never accuracy. */
export function StarBar() {
  const stars = useSessionStore((state) => state.stars);
  const material = useSessionStore((state) => state.material);
  const config = useSessionStore((state) => state.config);
  if (!material) return null;
  const total = totalStars(material, config);
  return (
    <div className="flex shrink-0 gap-1" role="img" aria-label={`${stars} of ${total} stars`}>
      {Array.from({ length: total }, (_, index) => (
        <Star key={index} earned={index < stars} />
      ))}
    </div>
  );
}

/**
 * The layout every student activity shares: the instruction and stars on
 * top, the content in the middle, and the controls along the bottom with the
 * one main button on the right.
 */
export function ActivityFrame({
  instruction,
  note,
  children,
  secondary,
  main,
}: {
  instruction: ReactNode;
  /** A smaller line under the instruction, e.g. the Chinese wording. */
  note?: ReactNode;
  children: ReactNode;
  secondary?: ReactNode;
  main: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <header className="flex items-start justify-between gap-6">
        <div>
          <p className="text-2xl font-bold">{instruction}</p>
          {note && <p className="text-xl text-ink-muted">{note}</p>}
        </div>
        <StarBar />
      </header>
      <div className="min-h-0 flex-1">{children}</div>
      <footer className="flex items-end justify-between gap-4">
        <div className="flex flex-wrap gap-3">{secondary}</div>
        <div className="flex shrink-0 gap-3">{main}</div>
      </footer>
    </div>
  );
}

/** Full-area message shown when an activity or a round is finished. */
export function DoneMessage({ message }: { message: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6">
      <Star earned size={120} />
      <p className="text-5xl font-bold">{message}</p>
    </div>
  );
}
