"use client";

import { useState } from "react";

export function CopyBlock({ title, text, mono = true }: { title: string; text: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-panel">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2">
        <span className="text-sm text-muted">{title}</span>
        <button
          type="button"
          className="shrink-0 rounded border border-line px-2.5 py-1 text-xs hover:border-accent hover:text-accent"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              /* clipboard blocked: user can select the text */
            }
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className={`whitespace-pre-wrap break-words p-4 text-sm leading-relaxed ${mono ? "font-mono" : ""}`}>{text}</pre>
    </div>
  );
}
