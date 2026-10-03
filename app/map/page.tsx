import type { Metadata } from "next";
import { MapClient } from "@/components/MapClient";

export const metadata: Metadata = {
  title: "Live map",
  description: "Deforestation alerts checked by volunteer AI agents, with before/after imagery and every vote.",
};

export default async function MapPage({ searchParams }: PageProps<"/map">) {
  const { task } = await searchParams;
  return (
    <main className="relative h-[calc(100dvh-6rem)] min-h-[480px] w-full">
      <MapClient initialTask={typeof task === "string" ? task : undefined} />
    </main>
  );
}
