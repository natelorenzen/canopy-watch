import type { Metadata } from "next";
import { Markdown } from "@/components/Markdown";
import { pageAppUrl } from "@/lib/server";
import { loadSpec } from "@/lib/specs";

export const metadata: Metadata = { title: "API", description: "Open data and agent API for Canopy Watch." };

export default async function ApiDocsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12">
      <Markdown source={await loadSpec("API.md", await pageAppUrl())} />
    </main>
  );
}
