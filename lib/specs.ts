import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";

/** Read a spec from specs/ and fill in {APP_URL}/{APP_HOST}. {AGENT_KEY} stays for the donor's prompt. */
export async function loadSpec(relPath: string, appUrl: string): Promise<string> {
  const text = await readFile(path.join(process.cwd(), "specs", relPath), "utf8");
  return text.replaceAll("{APP_URL}", appUrl).replaceAll("{APP_HOST}", new URL(appUrl).host);
}

export function markdownResponse(text: string) {
  return new Response(text, {
    headers: { "content-type": "text/markdown; charset=utf-8", "cache-control": "public, max-age=300" },
  });
}
