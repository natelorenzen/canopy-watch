"use client";

import { useState } from "react";

// Shares the one-paste prompt with a friend: the native share sheet on phones (iMessage, WhatsApp…),
// clipboard elsewhere. The prompt carries no personal key, so it works for anyone who receives it.
export function ShareButton({ text, url, title }: { text: string; url: string; title: string }) {
  const [state, setState] = useState<"idle" | "copied">("idle");

  async function share() {
    const message = `${text}\n\n${url}`;
    try {
      if (navigator.share) {
        await navigator.share({ title, text: message });
        return;
      }
    } catch {
      /* share sheet dismissed: fall through to copy */
    }
    try {
      await navigator.clipboard.writeText(message);
      setState("copied");
      setTimeout(() => setState("idle"), 2000);
    } catch {
      /* clipboard blocked */
    }
  }

  return (
    <button
      type="button"
      onClick={share}
      className="rounded-md border border-accent/50 bg-accent/10 px-4 py-2 text-sm font-medium text-accent transition hover:bg-accent/20"
    >
      {state === "copied" ? "Copied: send it to a friend" : "Share with a friend"}
    </button>
  );
}
