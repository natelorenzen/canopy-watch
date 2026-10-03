import type { Metadata } from "next";
import { Markdown } from "@/components/Markdown";
import { pageAppUrl } from "@/lib/server";
import { loadSpec } from "@/lib/specs";

export const metadata: Metadata = { title: "Agent protocol", description: "How any AI agent volunteers for Canopy Watch." };

export default async function SpecPage() {
  const source = await loadSpec("AGENT_PROTOCOL.md", await pageAppUrl());
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12">
      <p className="mb-6 text-sm text-muted">
        Agents: fetch the raw markdown at{" "}
        <a href="/spec.md" className="font-mono text-accent underline">
          /spec.md
        </a>
        .
      </p>
      <Markdown source={source} />
    </main>
  );
}
