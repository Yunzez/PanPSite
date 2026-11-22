/**
 * The single source of truth for the app's look. Change colors, radii and
 * sizes here only.
 *
 * The root layout injects these as CSS variables (`--theme-<group>-<name>`),
 * and `src/app/globals.css` maps them to Tailwind utilities (`bg-primary`,
 * `rounded-lg`, `min-h-touch`, ...). When adding a token, add one mapping
 * line there as well.
 *
 * The theme is fixed and shared by Mode A and Mode B, so the visual style is
 * never a difference between the two study conditions.
 */
export const theme = {
  color: {
    /** Main actions: Start, Next, Done. */
    primary: "#1E88D9",
    primaryDark: "#1669AD",
    onPrimary: "#FFFFFF",
    /** Secondary actions and stars. */
    secondary: "#FFC83D",
    secondaryDark: "#D9A520",
    onSecondary: "#2E2A47",
    /** Small accents such as the "Your turn!" prompt. */
    accent: "#FF6B5E",
    /** Reserved for the Record button. */
    record: "#EF4A54",
    recordDark: "#B8323B",
    onRecord: "#FFFFFF",
    /** Current word / current chunk marker. */
    highlight: "#FFE27A",
    background: "#FFF8EE",
    surface: "#FFFFFF",
    line: "#E9DFCF",
    ink: "#2E2A47",
    inkMuted: "#6B6680",
  },
  radius: {
    sm: "8px",
    md: "12px",
    lg: "16px",
  },
  size: {
    /** Minimum touch target for anything a child taps. */
    touch: "64px",
    /** Height of the one main button on a screen. */
    mainButton: "80px",
  },
} as const;

export type Theme = typeof theme;

const toKebabCase = (name: string) =>
  name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

/** Flattens the theme into CSS custom properties, e.g. `--theme-color-primary-dark`. */
export function themeCssVariables(source: Theme = theme): Record<string, string> {
  const variables: Record<string, string> = {};
  for (const [group, tokens] of Object.entries(source)) {
    for (const [name, value] of Object.entries(tokens)) {
      variables[`--theme-${group}-${toKebabCase(name)}`] = value;
    }
  }
  return variables;
}
