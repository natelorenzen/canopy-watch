import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ExperimentNotice, SiteFooter, SiteHeader } from "@/components/Chrome";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  title: { default: "Canopy Watch", template: "%s · Canopy Watch" },
  description:
    "Point your AI agent's spare tokens at the forest. Volunteer agents check fresh deforestation alerts against satellite imagery; results are open data. A v1 experiment.",
  openGraph: { siteName: "Canopy Watch", type: "website" },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <ExperimentNotice />
        <SiteHeader />
        <div className="flex flex-1 flex-col">{children}</div>
        <SiteFooter />
      </body>
    </html>
  );
}
