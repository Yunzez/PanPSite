import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "record" | "quiet";
type Size = "sm" | "md" | "lg";

const variantClass: Record<Variant, string> = {
  primary: "bg-primary text-on-primary border-primary-dark",
  secondary: "bg-secondary text-on-secondary border-secondary-dark",
  record: "bg-record text-on-record border-record-dark",
  quiet: "bg-surface text-ink border-line",
};

const sizeClass: Record<Size, string> = {
  /** Researcher and developer screens only; too small for a child's target. */
  sm: "min-h-11 px-4 text-base",
  md: "min-h-touch px-6 text-xl",
  /** The one main button on a student screen. */
  lg: "min-h-main-button px-10 text-2xl",
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

/**
 * Solid button with a thicker bottom edge, so it reads as something that can
 * be pressed down.
 */
export function Button({
  variant = "primary",
  size = "md",
  className = "",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={[
        "inline-flex select-none items-center justify-center gap-2 rounded-lg",
        "border-2 border-b-[5px] font-bold transition-transform",
        "active:translate-y-0.5 disabled:pointer-events-none disabled:opacity-40",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        variantClass[variant],
        sizeClass[size],
        className,
      ].join(" ")}
      {...props}
    />
  );
}
