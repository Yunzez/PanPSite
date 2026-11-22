import type { Metadata } from "next";
import { SpikeApp } from "@/features/spike/SpikeApp";

export const metadata: Metadata = {
  title: "M0 技术验证 · Read and Act",
};

export default function SpikePage() {
  return <SpikeApp />;
}
