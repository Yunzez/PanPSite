import { theme, type Theme } from "./theme";

/**
 * Returns the fixed theme tokens for code that cannot use Tailwind classes,
 * such as canvas drawing and animation values.
 *
 * The theme never changes at runtime. It is exposed as a hook so that call
 * sites would not need to change if it ever became dynamic.
 */
export function useTheme(): Theme {
  return theme;
}
