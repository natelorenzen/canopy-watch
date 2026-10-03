"""Shared helpers for Canopy Watch admin scripts. Python 3.11+, standard library only."""

from __future__ import annotations

import http.client
import json
import math
import os
import pathlib
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass

ROOT = pathlib.Path(__file__).resolve().parent.parent
MPC_STAC = "https://planetarycomputer.microsoft.com/api/stac/v1/search"
GFW_API = "https://data-api.globalforestwatch.org"
WINDOW_KM = 2.56
IMG_PX = 256


def gfw_headers() -> dict:
    """GFW checks the Origin header against the key's allowed domains (get_gfw_key.sh uses 'localhost')."""
    return {"x-api-key": need("GFW_API_KEY"), "origin": os.environ.get("GFW_ORIGIN", "http://localhost")}


_GFW_VERSIONS: dict[str, str] = {}


def gfw_query_url(dataset: str) -> str:
    """Query URL pinned to the dataset's current version. GFW answers /latest/query/json with a
    misleading 403 "missing valid API key", so resolve the `latest` redirect first."""
    if dataset not in _GFW_VERSIONS:
        req = urllib.request.Request(f"{GFW_API}/dataset/{dataset}/latest", method="GET", headers=gfw_headers())

        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, *args, **kwargs):  # noqa: ANN002, ANN003
                return None

        try:
            urllib.request.build_opener(NoRedirect).open(req, timeout=60)
            raise RuntimeError(f"expected a redirect from {dataset}/latest")
        except urllib.error.HTTPError as e:
            loc = e.headers.get("location", "")
            if e.code not in (301, 302, 307, 308) or not loc:
                raise RuntimeError(f"could not resolve {dataset}/latest: HTTP {e.code}") from None
            _GFW_VERSIONS[dataset] = loc.rstrip("/").rsplit("/", 1)[-1]
    return f"{GFW_API}/dataset/{dataset}/{_GFW_VERSIONS[dataset]}/query/json"


def load_env() -> None:
    """Load .env.local (then .env) into os.environ without overriding existing values."""
    for name in (".env.local", ".env"):
        path = ROOT / name
        if not path.exists():
            continue
        for line in path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"'))


def need(name: str) -> str:
    v = os.environ.get(name)
    if not v:
        raise SystemExit(f"Missing {name}. Add it to .env.local.")
    return v


def http_json(url: str, *, method: str = "GET", body=None, headers: dict | None = None, timeout: int = 120, retries: int = 3):
    """JSON over HTTPS via http.client, which sends header names exactly as given. (urllib rewrites
    them as "X-api-key", and GFW's gateway only recognises the lowercase "x-api-key".)"""
    u = urllib.parse.urlsplit(url)
    path = u.path + (f"?{u.query}" if u.query else "")
    data = None if body is None else json.dumps(body).encode()
    h = {"content-type": "application/json", "accept": "application/json", "user-agent": "canopy-watch-scripts/1.0", **(headers or {})}
    for attempt in range(retries):
        conn_cls = http.client.HTTPSConnection if u.scheme == "https" else http.client.HTTPConnection
        conn = conn_cls(u.netloc, timeout=timeout)
        try:
            conn.request(method, path, body=data, headers=h)
            r = conn.getresponse()
            raw = r.read()
        except (OSError, http.client.HTTPException):
            conn.close()
            if attempt < retries - 1:
                time.sleep(2 * (attempt + 1))
                continue
            raise
        conn.close()
        if r.status >= 400:
            if r.status in (429, 500, 502, 503, 504) and attempt < retries - 1:
                time.sleep(2 * (attempt + 1))
                continue
            raise RuntimeError(f"{method} {url.split('?')[0]} → HTTP {r.status}: {raw.decode(errors='replace')[:500]}")
        return json.loads(raw) if raw else None


# ── Supabase (PostgREST with the service-role key) ─────────────────
class Supabase:
    def __init__(self) -> None:
        self.url = need("NEXT_PUBLIC_SUPABASE_URL").rstrip("/") + "/rest/v1"
        key = need("SUPABASE_SERVICE_ROLE_KEY")
        self.h = {"apikey": key, "authorization": f"Bearer {key}"}

    def select(self, table: str, query: str):
        return http_json(f"{self.url}/{table}?{query}", headers=self.h)

    def insert(self, table: str, rows: list[dict], *, on_conflict: str | None = None, ignore_duplicates: bool = False):
        if not rows:
            return []
        q = f"?on_conflict={on_conflict}" if on_conflict else ""
        prefer = ["return=representation"]
        if ignore_duplicates:
            prefer.append("resolution=ignore-duplicates")
        return http_json(f"{self.url}/{table}{q}", method="POST", body=rows, headers={**self.h, "prefer": ",".join(prefer)})

    def rpc(self, fn: str, args: dict):
        return http_json(f"{self.url}/rpc/{fn}", method="POST", body=args, headers=self.h)


# ── Geometry ───────────────────────────────────────────────────────
@dataclass
class Window:
    lat: float
    lon: float
    w: float
    s: float
    e: float
    n: float

    @classmethod
    def around(cls, lat: float, lon: float, km: float = WINDOW_KM) -> "Window":
        half_lat = (km / 2) / 111.32
        half_lon = (km / 2) / (111.32 * math.cos(math.radians(lat)))
        return cls(lat, lon, lon - half_lon, lat - half_lat, lon + half_lon, lat + half_lat)

    @property
    def bbox(self) -> list[float]:
        return [round(self.w, 5), round(self.s, 5), round(self.e, 5), round(self.n, 5)]

    def polygon(self) -> dict:
        w, s, e, n = self.bbox
        return {"type": "Polygon", "coordinates": [[[w, s], [e, s], [e, n], [w, n], [w, s]]]}

    def to_px(self, lat: float, lon: float) -> tuple[float, float]:
        x = (lon - self.w) / (self.e - self.w) * IMG_PX
        y = (self.n - lat) / (self.n - self.s) * IMG_PX
        return x, y


def polygon_of(bbox: list[float]) -> dict:
    w, s, e, n = bbox
    return {"type": "Polygon", "coordinates": [[[w, s], [e, s], [e, n], [w, n], [w, s]]]}


# ── Planetary Computer scene selection ─────────────────────────────
MPC_STATS = "https://planetarycomputer.microsoft.com/api/data/v1/item/statistics"
# Sentinel-2 scene classification (SCL): 0 no data, 1 saturated, 3 cloud shadow, 8/9 cloud, 10 cirrus.
SCL_BAD = {0, 1, 3, 8, 9, 10}


def window_cloud_pct(scene: str, win: Window) -> float | None:
    """Share of the window that is cloud, shadow or no-data, from the scene's SCL band.
    Scene-level eo:cloud_cover isn't enough: a 1% cloudy scene can still cover our 2.5 km window."""
    feature = {"type": "Feature", "properties": {}, "geometry": win.polygon()}
    qs = urllib.parse.urlencode({"collection": "sentinel-2-l2a", "item": scene, "assets": "SCL", "categorical": "true", "max_size": 256})
    try:
        res = http_json(f"{MPC_STATS}?{qs}", method="POST", body=feature, timeout=60)
    except RuntimeError:
        return None
    stats = (res.get("properties") or {}).get("statistics") or {}
    if not stats:
        return None
    s = next(iter(stats.values()))
    counts, classes = s["histogram"]
    total = sum(counts) or 1
    bad = sum(c for c, k in zip(counts, classes) if int(k) in SCL_BAD)
    return round(100 * bad / total, 2)


def window_aot(scene: str, win: Window) -> float | None:
    """Mean aerosol optical thickness in the window (Sentinel-2 L2A AOT band, ×1000). Smoke and haze
    from burning-season fires aren't classed as cloud by SCL but push AOT well above clear-day values
    (Rondônia, Sept 2026: clear ≈ 70–210, smoky ≈ 310–430)."""
    feature = {"type": "Feature", "properties": {}, "geometry": win.polygon()}
    qs = urllib.parse.urlencode({"collection": "sentinel-2-l2a", "item": scene, "assets": "AOT", "max_size": 256})
    try:
        res = http_json(f"{MPC_STATS}?{qs}", method="POST", body=feature, timeout=60)
    except RuntimeError:
        return None
    s = next(iter(((res.get("properties") or {}).get("statistics") or {}).values()), None)
    return float(s["mean"]) if s else None


def window_bright_frac(scene: str, win: Window, threshold: int = 2500) -> float | None:
    """Share of window pixels whose blue band (B02 DN) exceeds `threshold` (≈ 0.15 reflectance).
    Catches cloud that SCL misses: on 2026-09-28 a cumulus field scored < 1% cloud in SCL but 19% here,
    while clear scenes — even bright bare pasture — score 0%."""
    feature = {"type": "Feature", "properties": {}, "geometry": win.polygon()}
    qs = urllib.parse.urlencode({"collection": "sentinel-2-l2a", "item": scene, "assets": "B02", "max_size": 256,
                                 "histogram_bins": f"0,{threshold},100000"})
    try:
        res = http_json(f"{MPC_STATS}?{qs}", method="POST", body=feature, timeout=60)
    except RuntimeError:
        return None
    s = next(iter(((res.get("properties") or {}).get("statistics") or {}).values()), None)
    if not s:
        return None
    counts = s["histogram"][0]
    return counts[-1] / (sum(counts) or 1)


def window_grey_frac(scene: str, win: Window) -> float | None:
    """Share of window pixels that are bright AND colour-flat (blue ≥ 0.75 × red, offset-corrected):
    the signature of cloud and haze. Bare soil is red-dominant, forest is dark. Calibrated on
    Rondônia, Sept 2026: grey cumulus/smoke scenes 0.29–0.38, clear scenes (incl. bare pasture) ≤ 0.013.
    Catches dull grey clouds that both SCL and the B02 brightness test miss."""
    feature = {"type": "Feature", "properties": {}, "geometry": win.polygon()}
    qs = urllib.parse.urlencode({"collection": "sentinel-2-l2a", "item": scene, "asset_as_band": "true", "max_size": 256,
                                 "expression": "((B02>1600)&((B02-1000)>0.75*(B04-1000)))"})
    try:
        res = http_json(f"{MPC_STATS}?{qs}", method="POST", body=feature, timeout=60)
    except RuntimeError:
        return None
    s = next(iter(((res.get("properties") or {}).get("statistics") or {}).values()), None)
    return float(s["mean"]) if s else None


def scene_quality_ok(scene: str, win: Window, *, max_window_cloud: float = 5.0, max_aot: float = 250.0,
                     max_bright: float = 0.03, max_grey: float = 0.05) -> tuple[bool, float | None]:
    """All window checks: SCL cloud/shadow/no-data, smoke (AOT), bright cloud, and grey (colour-flat) cloud/haze."""
    pct = window_cloud_pct(scene, win)
    if pct is None or pct >= max_window_cloud:
        return False, pct
    aot = window_aot(scene, win)
    if aot is None or aot >= max_aot:
        return False, pct
    bright = window_bright_frac(scene, win)
    if bright is None or bright > max_bright:
        return False, pct
    grey = window_grey_frac(scene, win)
    if grey is None or grey > max_grey:
        return False, pct
    return True, pct


def find_scene(win: Window, start: str, end: str, *, newest: bool, max_scene_cloud: float = 30.0,
               max_window_cloud: float = 5.0, max_aot: float = 250.0, max_checks: int = 8) -> dict | None:
    """Newest (or oldest) scene whose footprint covers the window, whose pixels *inside the window*
    are < max_window_cloud % cloud/shadow/no-data, and whose mean AOT there is < max_aot (no smoke)."""
    body = {
        "collections": ["sentinel-2-l2a"],
        "intersects": win.polygon(),
        "datetime": f"{start}T00:00:00Z/{end}T23:59:59Z",
        "query": {"eo:cloud_cover": {"lt": max_scene_cloud}},
        "sortby": [{"field": "datetime", "direction": "desc" if newest else "asc"}],
        "limit": 50,
    }
    res = http_json(MPC_STAC, method="POST", body=body)
    checks = 0
    for f in res.get("features", []):
        bw, bs, be, bn = f["bbox"]
        if not (bw <= win.w and bs <= win.s and be >= win.e and bn >= win.n):
            continue
        checks += 1
        ok, pct = scene_quality_ok(f["id"], win, max_window_cloud=max_window_cloud, max_aot=max_aot)
        if ok:
            return {"scene": f["id"], "date": f["properties"]["datetime"][:10], "cloud_cover": pct}
        if checks >= max_checks:
            break
    return None
