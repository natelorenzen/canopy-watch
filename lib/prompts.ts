// Donor prompts (BUILD_SPEC §8). Shared by POST /api/agents and the /donate page.
//
// Every prompt keeps volunteering isolated from the owner's normal use of their agent: no long-term
// memory writes, no changes to anything else, small capped shifts, silent background runs (the owner
// can ask, or check their impact page), and an easy way out.

const ISOLATION =
  "Keep this separate from everything else you do for me: don't save anything about Canopy Watch to long-term memory, and don't change any of my other tasks, settings, connectors or memories.";

/** The nightly shift instruction that lives inside the scheduled task (the only place the key is kept). */
export function nightlyShift(appUrl: string, key: string) {
  const host = new URL(appUrl).host;
  return `Canopy Watch volunteer shift. Read ${appUrl}/spec.md and follow it exactly with agent_key ${key}. Complete at most 5 tasks, then stop. Only contact ${host}. Start fresh each time and don't rely on earlier conversations. ${ISOLATION} Skip the shift if I'm running low on my weekly allowance or another of my tasks is running. Work silently in the background: don't message me about this shift. If I later ask what you've been doing for Canopy Watch, tell me and share my profile page.`;
}

/** One paste does everything: register, one supervised test task, nightly schedule. */
export function onePastePrompt(appUrl: string, inviteCode: string) {
  const host = new URL(appUrl).host;
  return `Set me up as a Canopy Watch volunteer: my spare tokens will help check deforestation alerts in the Amazon. Do these steps now, one after another, without waiting for me (except to ask approval to connect to ${host}).

1. Register me by opening this link once, with my first name in place of FIRSTNAME: ${appUrl}/api/agents?display_name=FIRSTNAME%27s%20Muse&platform=muse&invite_code=${inviteCode}
It returns JSON with agent_key and profile_url.

2. Test run: read ${appUrl}/spec.md and follow it to complete exactly ONE task with that agent_key.

3. Create a scheduled task that runs every night at 3:00 AM as its own separate task, with this instruction (put the real agent_key in place of KEY):
"${nightlyShift(appUrl, "KEY")}"

4. Tell me in two lines that I'm set up, and give me my profile_url. ${ISOLATION} After this, don't message me about Canopy Watch unless I ask.`;
}

export function firstRunPrompt(appUrl: string, key: string) {
  const host = new URL(appUrl).host;
  return `I'm volunteering for Canopy Watch. Read ${appUrl}/spec.md and follow it to complete exactly ONE task using agent_key ${key}. If you need my approval to connect to ${host}, ask me. ${ISOLATION} Show me the JSON you submit and the server's response.`;
}

export function scheduledPrompt(appUrl: string, key: string) {
  return `Create a scheduled task that runs every night at 3:00 AM, as its own separate task, with this instruction:
"${nightlyShift(appUrl, key)}"`;
}

export function genericPrompt(appUrl: string, key: string) {
  return `You are doing a volunteer shift for Canopy Watch. Fetch ${appUrl}/spec.md and follow it exactly. Your agent_key is ${key}. Complete at most 5 tasks, then stop. Don't store the key or anything about this shift anywhere else.`;
}

/** "Stop & forget": removes the schedule, invalidates the key server-side, and wipes local traces. */
export function leavePrompt(appUrl: string, key?: string) {
  const keyPart = key ? `agent_key ${key}` : "the Canopy Watch agent_key you have (it's in the scheduled task, if you have one)";
  return `Stop my Canopy Watch volunteering and forget it:
1. Delete every scheduled task that mentions Canopy Watch or ${new URL(appUrl).host}.
2. Open ${appUrl}/api/agents/leave?agent_key=KEY once, using ${keyPart} in place of KEY, so the key stops working.
3. Remove the agent key and anything about Canopy Watch from your memory and saved notes.
4. Confirm each step, and tell me if anything couldn't be done.`;
}
