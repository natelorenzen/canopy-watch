# Forest Alert Triage — Rubric

**project:** `forest-alerts`
**spec_version:** 0.1.0

A satellite system flagged possible forest loss at this spot. Your job: look at a satellite image from **before** the alert and one from **after**, then decide **(1) is there a real new clearing at the alert location, and (2) if so, what most likely caused it?** You are the human-style second look that the automated alert system doesn't have.

---

## 1. What you receive (`payload`)
```json
{
  "center": { "lat": -9.9312, "lon": -63.0145 },
  "window_km": 2.56,
  "alert": {
    "first_detected": "2026-08-14",
    "last_detected": "2026-09-02",
    "approx_area_ha": 12.4,
    "pixel_box": { "x0": 110, "y0": 115, "x1": 145, "y1": 140 }
  },
  "before": { "date": "2026-06-20", "url": "…/before.jpg", "cloud_cover": 1.2 },
  "after":  { "date": "2026-09-11", "url": "…/after.jpg",  "cloud_cover": 0.3 }
}
```
- Both images are **256 × 256 px**, true color, north up, covering the same 2.56 km square. 1 px = 10 m (the sensor's native resolution).
- `pixel_box` is where the alert is: x from the left edge, y from the top edge, in pixels. **Judge the alert box first.** Glance at the surroundings for context only.
- 1 hectare = 10 × 10 px. A 12 ha alert covers ≈ 35 × 35 px.
- Download and look at **both** images. If either fails to load, answer `uncertain` with `confidence: 0` and say which failed.

## 2. Labels

### `clearing_confirmed`
In the alert box, an area that was **tree canopy in `before`** (dark green, rough/textured, irregular natural edges) is **non-forest in `after`**: bare soil (tan/orange/red-brown), burned ground (black/charcoal), smooth light-green grass, water, or a road. Typical signs:
- straight edges, rectangles, or a new block cut from a forest patch;
- a new road or track with clearing beside it;
- an existing clearing whose edge has visibly advanced into forest;
- a ragged scar with burned (dark) ground.

The cleared area should be at least ~**0.5 ha (≈ 7 × 7 px)**. Alerts often cover only the first part of a clearing that is still growing.

### `no_clearing`
- The alert box looks like the same forest in both images.
- The area was **already non-forest in `before`** and only changed color (pasture greening or browning, crop harvested, field plowed). **Seasonal change on already-cleared land is not a clearing.**
- Differences are only lighting, haze, or color balance across the whole image.

### `uncertain`
- Cloud, cloud shadow, haze, or smoke covers the alert box in either image.
- You can't tell whether the area was forest or already-cleared land in `before`.
- The change is real but too small or too blurry to call.
- An image failed to load or the two images don't show the same place.

## 3. Answer fields
```json
{
  "label": "clearing_confirmed",
  "answer": {
    "driver": "pasture_or_crops",
    "extends_existing_clearing": true,
    "cloud_obstructed": false
  },
  "confidence": 0.8,
  "notes": "Alert box: ~30x25 px rectangular block of former canopy now bare tan soil with straight N and E edges, adjoining an older pasture to the west."
}
```
`answer.driver` is required. Use `"unknown"` unless the label is `clearing_confirmed`. Pick the **single best** fit:

| driver | Looks like |
|---|---|
| `pasture_or_crops` | Geometric blocks, often joining existing fields; bare soil or light grass; may show windrows (parallel lines of piled debris) |
| `mining` | Bright, discolored ground, pits, ponds of muddy or turquoise water, usually along a river or stream |
| `road` | A new thin line through forest, with little clearing beside it |
| `selective_logging` | Forest mostly still standing but speckled with small gaps, skid trails, and small log yards; canopy thinned rather than removed |
| `fire` | Black/charcoal or dull-brown scar with irregular edges, often ignoring property lines; canopy browned but not geometrically removed |
| `plantation_harvest` | A uniform tree plantation (even rows, uniform texture) cut in blocks |
| `natural` | River erosion, a meander shift, a landslide, wind-throw; no human geometry |
| `urban_or_infrastructure` | Buildings, lots, dam or power-line corridors |
| `unknown` | A real clearing whose cause you can't tell, or the label isn't `clearing_confirmed` |

- `extends_existing_clearing`: `true` if the new clearing touches non-forest that already existed in `before`.
- `cloud_obstructed`: `true` if cloud, shadow, or smoke hides any part of the alert box in either image.

## 4. Confidence
| Range | Meaning |
|---|---|
| 0.85–1.0 | Unmistakable. You'd bet on it. |
| 0.6–0.85 | Clear, with a plausible alternative explanation. |
| 0.4–0.6 | Leaning. Consider `uncertain`. |
| < 0.4 | Use `uncertain`. |

Confidence is about **the label**. If you're sure there's a clearing but unsure of the driver, keep the confidence high and pick `unknown` for the driver.

## 5. Notes
At least 20 characters. Say **where** (use the alert box, plus compass directions within it), **what changed** (from what to what), and **what shape**. Do not speculate about who did it, whether it was legal, or why. Imagery can't show that.

## 6. Common mistakes
- Calling a harvested or plowed field a clearing. Check: was it forest in `before`?
- Calling cloud shadow a burn scar. Shadows sit beside a cloud, with the same shape offset.
- Calling dry-season browning of standing forest a clearing. The texture is still canopy.
- Judging the whole image instead of the alert box.
