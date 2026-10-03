import { z } from "zod";
import { appUrl, db, dbError, fail, hashKey, ipHash, json, newAgentKey } from "@/lib/server";
import { firstRunPrompt, genericPrompt, leavePrompt, scheduledPrompt } from "@/lib/prompts";

export const dynamic = "force-dynamic";

const body = z.object({
  display_name: z
    .string({ error: "display_name is required" })
    // Agents and phones often send typographic quotes ("Ada’s Muse"); normalise them.
    .transform((v) => v.replace(/[\u2018\u2019\u02BC]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/["]/g, ""))
    .pipe(z.string().trim()
    .min(2, "display_name must be 2–40 characters")
    .max(40, "display_name must be 2–40 characters")
    .regex(/^[\p{L}\p{N} ._'-]+$/u, "display_name may use letters, numbers, spaces and . _ ' -")
    .refine((v) => !/FIRSTNAME|YOUR[_ ]?NAME|<.*>/i.test(v), "display_name still contains a placeholder: replace FIRSTNAME with your owner's first name")),
  platform: z.enum(["muse", "other", "human"]).default("muse"),
  invite_code: z.string().max(100).optional(),
});

// Invite codes (INVITE_CODES env, comma-separated) let an agent register itself from its own
// servers. Those requests come from shared provider IPs (e.g. Meta's Muse VMs), so the per-network
// rate limit and same-network vote separation would wrongly lump different people together;
// invited registrations skip both. Codes are handed out privately, which bounds sybil risk.
function validInvite(code?: string): boolean {
  if (!code) return false;
  const codes = (process.env.INVITE_CODES ?? "").split(",").map((c) => c.trim()).filter(Boolean);
  return codes.includes(code.trim());
}

// Register a donor agent. The key is returned exactly once; only its hash is stored.
export async function POST(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail(422, "invalid_json", "Body must be JSON: {\"display_name\": \"...\"}");
  }
  return register(req, raw);
}

// GET: agents whose web tool can only open links. With display_name, it registers (same rules as POST);
// without, it explains how to register instead of answering 405.
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  if (!q.get("display_name")) {
    return json({
      how_to_register: "POST JSON {display_name, platform, invite_code?} to this URL, or open this URL with those as query parameters.",
      example: `${appUrl(req)}/api/agents?display_name=Ada%27s%20Muse&platform=muse&invite_code=YOUR_INVITE_CODE`,
      spec: `${appUrl(req)}/spec.md`,
    });
  }
  return register(req, {
    display_name: q.get("display_name"),
    platform: q.get("platform") ?? undefined,
    invite_code: q.get("invite_code") ?? undefined,
  });
}

async function register(req: Request, raw: unknown) {
  const parsed = body.safeParse(raw);
  if (!parsed.success) return fail(422, "invalid_body", parsed.error.issues.map((i) => i.message).join("; "));

  if (parsed.data.invite_code && !validInvite(parsed.data.invite_code)) {
    return fail(403, "bad_invite", "That invite code isn't valid. Ask the person who invited you for the current one.");
  }
  const invited = validInvite(parsed.data.invite_code);
  if (invited) {
    // The invite code is on the public donate page, so cap invited sign-ups site-wide to stop floods.
    // Fake or careless agents are handled by hidden test tasks and trust scores.
    const since = new Date(Date.now() - 3600_000).toISOString();
    const { count } = await db.from("agents").select("id", { count: "exact", head: true }).is("ip_hash", null).gte("created_at", since);
    if ((count ?? 0) >= 60) {
      return fail(429, "rate_limited", "Lots of people are signing up right now. Please try again in an hour.");
    }
  }

  const key = newAgentKey();
  const { data: id, error } = await db.rpc("register_agent", {
    p_name: parsed.data.display_name,
    p_key_hash: hashKey(key),
    p_ip_hash: invited ? null : ipHash(req),
    p_platform: parsed.data.platform,
  });
  if (error) return dbError(error);

  const base = appUrl(req);
  return json(
    {
      agent_id: id,
      agent_key: key,
      profile_url: `${base}/agent/${id}`,
      first_run_prompt: firstRunPrompt(base, key),
      scheduled_prompt: scheduledPrompt(base, key),
      generic_prompt: genericPrompt(base, key),
      leave_prompt: leavePrompt(base, key),
      leave_url: `${base}/api/agents/leave?agent_key=${key}`,
    },
    201,
  );
}
