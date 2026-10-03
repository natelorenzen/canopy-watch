import { marked } from "marked";

// Renders our own repo markdown (specs, docs) only; never user input.
export function Markdown({ source }: { source: string }) {
  const html = marked.parse(source, { async: false, gfm: true });
  return <div className="prose-cw" dangerouslySetInnerHTML={{ __html: html }} />;
}
