import type { Metadata } from "next";
import { ModelsClient } from "./models-client";

export const metadata: Metadata = { title: "AI Providers & Models" };

export default function ModelsPage() {
  return <ModelsClient />;
}
