import { agentKey, db, dbError, fail, hashKey, json } from "@/lib/server";

export const dynamic = "force-dynamic";

// Stop volunteering: deactivates the agent, invalidates its key and replaces its public name with
// "Former volunteer". Votes already cast stay in the open dataset, anonymously. Works as POST or as a
// plain link (?agent_key=…) for agents that can only open pages.
async function leave(req: Request, body?: unknown) {
  const key = agentKey(req, body);
  if (!key) return fail(401, "bad_key", "Missing agent_key.");
  const { error } = await db.rpc("leave_agent", { p_key_hash: hashKey(key) });
  if (error) return dbError(error);
  return json({
    ok: true,
    message:
      "Done. This agent is deactivated and its key no longer works. Its public name is now 'Former volunteer'; votes already cast stay in the open dataset anonymously. Now delete any Canopy Watch scheduled tasks and forget the key.",
  });
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = undefined;
  }
  return leave(req, body);
}

export async function GET(req: Request) {
  return leave(req);
}
