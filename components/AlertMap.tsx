"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import * as maplibregl from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { TaskPanel, type Selected } from "@/components/TaskPanel";
import { DRIVER_META, LABEL_META } from "@/lib/drivers";

// Worker files are copied into public/ at build time (scripts/copy-maplibre-worker.mjs).
maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

const BASEMAP = "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/GoogleMapsCompatible/{z}/{y}/{x}.jpg";
const DEFAULT_CENTER: [number, number] = [-62.0, -8.8];

type AlertRow = {
  task_id: string; lat: number; lon: number; label: string; confidence: number;
  agreeing_agents: number; area_ha: number | null; summary: { driver?: string };
};
type QueueRow = {
  id: string; lat: number; lon: number; vote_count: number; required_votes: number; area_ha: number | null;
  alert: { first_detected?: string; approx_area_ha?: number } | null;
};

const driverColor: maplibregl.ExpressionSpecification = [
  "match",
  ["get", "driver"],
  ...Object.entries(DRIVER_META).flatMap(([k, v]) => [k, v.color]),
  DRIVER_META.unknown.color,
] as unknown as maplibregl.ExpressionSpecification;

export function AlertMap({ mini = false, initialTask }: { mini?: boolean; initialTask?: string }) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [selected, setSelected] = useState<Selected | null>(null);
  const [counts, setCounts] = useState({ confirmed: 0, other: 0, open: 0 });
  const [showOther, setShowOther] = useState(true);
  const [showOpen, setShowOpen] = useState(true);

  useEffect(() => {
    if (!el.current) return;
    const map = new maplibregl.Map({
      container: el.current,
      style: {
        version: 8,
        sources: {
          s2: {
            type: "raster",
            tiles: [BASEMAP],
            tileSize: 256,
            maxzoom: 15,
            attribution:
              'Sentinel-2 cloudless 2024 by <a href="https://s2maps.eu" target="_blank">EOX</a> (CC BY-NC-SA 4.0) · Alerts: Global Forest Watch',
          },
        },
        layers: [{ id: "s2", type: "raster", source: "s2", paint: { "raster-brightness-max": 0.85 } }],
      },
      center: DEFAULT_CENTER,
      zoom: mini ? 5.2 : 5.6,
      attributionControl: { compact: true },
      cooperativeGestures: mini,
    });
    mapRef.current = map;
    if (!mini) map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");

    // Fetch data in parallel with the basemap; add layers as soon as the style is ready rather than
    // waiting for "load" (which waits for every satellite tile).
    const data = Promise.all([
      fetch("/api/alerts?label=all&limit=500").then((r) => r.json()).catch(() => ({ alerts: [] })),
      fetch("/api/queue").then((r) => r.json()).catch(() => ({ tasks: [] })),
    ]);
    const styleReady = new Promise<void>((resolve) => (map.isStyleLoaded() ? resolve() : map.once("style.load", () => resolve())));

    Promise.all([data, styleReady]).then(([[alertsRes, queueRes]]) => {
      if (!mapRef.current) return;
      const alerts: AlertRow[] = alertsRes.alerts ?? [];
      const queue: QueueRow[] = queueRes.tasks ?? [];

      const done: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: alerts.map((a) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [a.lon, a.lat] },
          properties: {
            id: a.task_id,
            label: a.label,
            driver: a.summary?.driver ?? "unknown",
            confirmed: a.label === "clearing_confirmed" && a.agreeing_agents >= 2,
            area: a.area_ha ?? 1,
          },
        })),
      };
      const open: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: queue.map((q) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [q.lon, q.lat] },
          properties: { id: q.id, vote_count: q.vote_count, required_votes: q.required_votes, alert: JSON.stringify(q.alert ?? null) },
        })),
      };
      const confirmed = done.features.filter((f) => f.properties!.confirmed).length;
      setCounts({ confirmed, other: done.features.length - confirmed, open: open.features.length });

      map.addSource("done", { type: "geojson", data: done });
      map.addSource("open", { type: "geojson", data: open });

      map.addLayer({
        id: "open",
        type: "circle",
        source: "open",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 2.5, 10, 6, 14, 10],
          "circle-color": "rgba(255,255,255,0.15)",
          "circle-stroke-color": "rgba(255,255,255,0.75)",
          "circle-stroke-width": 1,
        },
      });
      map.addLayer({
        id: "other",
        type: "circle",
        source: "done",
        filter: ["!=", ["get", "confirmed"], true],
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 2.5, 10, 6, 14, 10],
          "circle-color": ["match", ["get", "label"], "no_clearing", LABEL_META.no_clearing.color, LABEL_META.uncertain.color],
          "circle-opacity": 0.8,
          "circle-stroke-color": "#000",
          "circle-stroke-width": 0.5,
        },
      });
      map.addLayer({
        id: "confirmed-glow",
        type: "circle",
        source: "done",
        filter: ["==", ["get", "confirmed"], true],
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 8, 10, 16, 14, 28],
          "circle-color": driverColor,
          "circle-opacity": 0.25,
          "circle-blur": 0.8,
        },
      });
      map.addLayer({
        id: "confirmed",
        type: "circle",
        source: "done",
        filter: ["==", ["get", "confirmed"], true],
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, ["+", 3, ["*", 0.15, ["sqrt", ["get", "area"]]]], 14, ["+", 9, ["sqrt", ["get", "area"]]]],
          "circle-color": driverColor,
          "circle-stroke-color": "#000",
          "circle-stroke-width": 1,
        },
      });

      // Frame whatever data exists.
      const all = [...done.features, ...open.features].map((f) => (f.geometry as GeoJSON.Point).coordinates as [number, number]);
      if (all.length) {
        const b = all.reduce((acc, c) => acc.extend(c), new maplibregl.LngLatBounds(all[0], all[0]));
        map.fitBounds(b, { padding: mini ? 30 : 80, maxZoom: 9, duration: 0 });
      }

      for (const layer of ["confirmed", "other", "open"]) {
        map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = ""));
      }
      map.on("click", (e: maplibregl.MapMouseEvent) => {
        const hit = map.queryRenderedFeatures(e.point, { layers: ["confirmed", "other", "open"] })[0];
        if (!hit) return;
        const p = hit.properties as Record<string, unknown>;
        if (mini) {
          window.location.href = `/map?task=${p.id}`;
          return;
        }
        if (hit.layer.id === "open") {
          const [lon, lat] = (hit.geometry as GeoJSON.Point).coordinates;
          setSelected({
            kind: "open",
            id: String(p.id),
            lat,
            lon,
            vote_count: Number(p.vote_count),
            required_votes: Number(p.required_votes),
            alert: JSON.parse(String(p.alert ?? "null")),
          });
        } else {
          setSelected({ kind: "done", id: String(p.id) });
        }
        map.easeTo({ center: (hit.geometry as GeoJSON.Point).coordinates as [number, number], zoom: Math.max(map.getZoom(), 10) });
      });

      if (initialTask) {
        const f = done.features.find((x) => x.properties!.id === initialTask);
        if (f) {
          setSelected({ kind: "done", id: initialTask });
          map.jumpTo({ center: (f.geometry as GeoJSON.Point).coordinates as [number, number], zoom: 11 });
        }
      }
    });

    return () => {
      mapRef.current = null;
      map.remove();
    };
  }, [mini, initialTask]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer("other")) return;
    map.setLayoutProperty("other", "visibility", showOther ? "visible" : "none");
    map.setLayoutProperty("open", "visibility", showOpen ? "visible" : "none");
  }, [showOther, showOpen, counts]);

  return (
    <div className="relative h-full w-full">
      {/* h-full, not absolute: maplibre-gl.css (unlayered) forces position: relative on this node */}
      <div ref={el} className="h-full w-full" />
      {!mini && (
        <div className="absolute left-14 top-3 z-10 max-w-[calc(100%-4.5rem)] rounded-lg border border-line bg-bg/85 p-3 text-xs backdrop-blur sm:max-w-xs">
          <p className="mb-2 font-medium text-fg">Forest Alert Triage</p>
          <ul className="space-y-1.5">
            <li className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-alert" />
              Clearing confirmed <span className="num ml-auto text-muted">{counts.confirmed}</span>
            </li>
            <li className="flex items-center gap-2">
              <label className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={showOther} onChange={(e) => setShowOther(e.target.checked)} className="accent-[var(--accent)]" />
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-accent" /> No clearing / uncertain
              </label>
              <span className="num ml-auto text-muted">{counts.other}</span>
            </li>
            <li className="flex items-center gap-2">
              <label className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={showOpen} onChange={(e) => setShowOpen(e.target.checked)} className="accent-[var(--accent)]" />
                <span className="inline-block h-2.5 w-2.5 rounded-full border border-white/80 bg-white/15" /> Awaiting votes
              </label>
              <span className="num ml-auto text-muted">{counts.open}</span>
            </li>
          </ul>
          <details className="mt-2 text-muted">
            <summary className="cursor-pointer">Cause colors</summary>
            <ul className="mt-1.5 grid grid-cols-2 gap-1">
              {Object.entries(DRIVER_META)
                .filter(([k]) => k !== "mixed")
                .map(([k, v]) => (
                  <li key={k} className="flex items-center gap-1.5">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ background: v.color }} />
                    {v.label}
                  </li>
                ))}
            </ul>
          </details>
        </div>
      )}
      {selected && !mini && <TaskPanel selected={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
