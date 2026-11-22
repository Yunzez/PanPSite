import type { Metadata } from "next";
import { SessionApp } from "@/features/session/SessionApp";

export const metadata: Metadata = {
  title: "Read and Act",
};

// Launch link for Mode A (Repeated Reading). The mode is fixed by the link.
export default function ModeAPage() {
  return <SessionApp mode="A" />;
}
