import type { Metadata } from "next";
import { SessionApp } from "@/features/session/SessionApp";

export const metadata: Metadata = {
  title: "Read and Act",
};

// Launch link for Mode B (Read and Act). The mode is fixed by the link.
export default function ModeBPage() {
  return <SessionApp mode="B" />;
}
