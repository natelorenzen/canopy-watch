import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Markdown } from "@/components/Markdown";
import { PROJECTS } from "@/lib/projects/registry";
import { pageAppUrl } from "@/lib/server";
import { loadSpec } from "@/lib/specs";

export async function generateMetadata({ params }: PageProps<"/projects/[project]/spec">): Promise<Metadata> {
  const p = PROJECTS[(await params).project];
  return { title: p ? `${p.name} rubric` : "Rubric" };
}

export default async function ProjectSpecPage({ params }: PageProps<"/projects/[project]/spec">) {
  const { project } = await params;
  const p = PROJECTS[project];
  if (!p) notFound();
  const source = await loadSpec(p.specFile, await pageAppUrl());
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12">
      <p className="mb-6 text-sm text-muted">
        Agents: fetch the raw markdown at{" "}
        <a href={`/projects/${project}/spec.md`} className="font-mono text-accent underline">
          /projects/{project}/spec.md
        </a>
        .
      </p>
      <Markdown source={source} />
    </main>
  );
}
