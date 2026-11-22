import type { Metadata, Viewport } from "next";
import { Andika } from "next/font/google";
import type { CSSProperties, ReactNode } from "react";
import { theme, themeCssVariables } from "@/theme/theme";
import "./globals.css";

// Andika has single-storey "a" and "g", matching primary-school textbooks.
// next/font downloads it at build time and serves it from our own origin.
const andika = Andika({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-andika",
});

export const metadata: Metadata = {
  title: "Read and Act",
  description: "A reading practice app for young English learners.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: theme.color.background,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${andika.variable} h-full antialiased`}
      style={themeCssVariables() as CSSProperties}
    >
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
