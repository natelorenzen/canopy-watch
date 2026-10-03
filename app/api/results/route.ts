import { fail } from "@/lib/server";
import { submitResult } from "@/lib/submit";

export async function POST(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail(422, "invalid_json", "Body must be valid JSON with Content-Type: application/json");
  }
  return submitResult(req, raw);
}
