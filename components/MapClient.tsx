"use client";

import dynamic from "next/dynamic";

// MapLibre touches `window` at import time, so it only loads in the browser.
export const MapClient = dynamic(() => import("@/components/AlertMap").then((m) => m.AlertMap), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-panel" />,
});
