import type { Metadata } from "next";
import { ResearcherApp } from "@/features/researcher/ResearcherApp";

export const metadata: Metadata = {
  title: "Researcher · Read and Act",
};

export default function ResearcherPage() {
  return <ResearcherApp />;
}
