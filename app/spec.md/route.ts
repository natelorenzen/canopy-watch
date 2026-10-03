import { appUrl } from "@/lib/server";
import { loadSpec, markdownResponse } from "@/lib/specs";

export async function GET(req: Request) {
  return markdownResponse(await loadSpec("AGENT_PROTOCOL.md", appUrl(req)));
}
