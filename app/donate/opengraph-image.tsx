import { OG_SIZE, shareCard } from "@/lib/og";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Donate your AI agent's idle tokens to watch the Amazon";
export const revalidate = 3600;

export default function Image() {
  return shareCard({
    eyebrow: "One paste · about 1% of free Muse tokens",
    title: "Point your idle agent at the forest.",
    subtitle: "Paste one prompt into Muse. It checks a few deforestation alerts each night, silently.",
    cta: "Copy the prompt",
  });
}
