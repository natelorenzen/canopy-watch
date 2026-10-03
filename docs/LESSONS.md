# Lessons learned (so far)

An honest log of what broke while building v1, and what we changed. Most of these were caught by the volunteer agents themselves.

## Imagery is the bottleneck, not the AI

Finding alerts is easy: one Pará region alone produced ~4,000 alert patches since June. Finding a **clear** before/after pair is hard, especially in burning and early rainy season. We added the window checks one failure at a time:

1. **Scene-level cloud cover lies about small windows.** A scene rated 1.2% cloudy was 86% cloud over our 2.5 km window. → Measure SCL classes *inside the window*.
2. **Smoke isn't cloud.** Burning-season smoke passed SCL entirely. → Mean aerosol optical thickness (AOT) < 250.
3. **SCL misses some cumulus.** A thick cumulus field scored < 1% cloud in SCL. Muse answered "uncertain, thick white cloud", and it was right. → Bright-pixel share in B02.
4. **Dull grey cloud passes everything.** Ten straight tasks came back "uncertain" from a Muse agent; the images were covered in grey cloud that wasn't bright enough to trip check 3. → A "bright and colour-flat" share (blue ≈ red).
5. **Shadows still slip through.** Most remaining disagreements involve cloud shadow. → Next on the roadmap.

**Takeaway:** agents answering "uncertain" are a quality signal. Watch for runs of it.

## Agents in the wild

- **Unattended runs differ from supervised ones.** The first scheduled Muse shift fetched everything and never submitted. Simplifying the connection and adding explicit fallbacks fixed it.
- **Agents open links rather than calling APIs.** A friend's Muse first tried to *open* the registration endpoint as a page (405). → Every agent-facing action now also works as a plain link.
- **Placeholders get sent literally.** One Muse registered as "FIRSTNAME's Muse". → The server rejects obvious placeholders with a fix-it message.
- **Typographic quotes.** Phones send "Shannon’s", not "Shannon's". → Normalise before validating.
- **Re-pasting a setup prompt re-registers.** → Separate "set up" and "do another shift" prompts; empty duplicates are pruned.
- **Agents stop at "Starting now…".** Some end their turn before doing the work. → Prompts say "do all steps now, without waiting for me".
- **People worried volunteering would disrupt their agent.** → Isolation rules (no memory, touch nothing else), silent shifts, a one-paste Stop & forget.

## Third-party APIs

- **The GFW Data API returned "missing valid API key" for two unrelated reasons:** querying the `latest` version alias, and Python's `urllib` sending the header as `X-api-key`. → Resolve the dataset version first; send headers with exact casing (`http.client`).
- **The GFW raster query caps responses at ~6 MB.** → Split busy cells recursively.
- **MapLibre v6's worker didn't load under Turbopack.** → Serve the worker from `public/`. Also, MapLibre's unlayered CSS overrode Tailwind's `absolute`, giving the map zero height.

## Process

- **Never bulk-delete a shared log after handing a test to a person.** We wiped the first real Muse submission this way and reconstructed it from request logs.
- **Hidden tests need trustworthy truth.** A GFW `highest`-confidence alert can still show no visible change at 10 m. We retired one such test rather than penalise careful agents.
