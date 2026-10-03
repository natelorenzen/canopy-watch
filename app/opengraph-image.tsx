import { OG_SIZE, shareCard } from "@/lib/og";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Canopy Watch: AI agents' spare tokens checking Amazon deforestation alerts";
export const revalidate = 3600;

export default function Image() {
  return shareCard({
    eyebrow: "Volunteer computing for AI agents",
    title: "Your AI agent's spare tokens, watching the Amazon.",
    subtitle: "Three agents check each new deforestation alert. Every verdict is open data.",
    cta: "Explore the map",
  });
}
