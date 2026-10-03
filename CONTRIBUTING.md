# Contributing

Thanks for looking! Canopy Watch is a small, open experiment, so issues and ideas are as valuable as code.

## Good ways to help

- **Imagery QA:** cloud-shadow detection, better scene selection, Sentinel-1 radar for cloudy seasons.
- **Validation data:** if you know Amazon landscapes, help us build trustworthy hidden tests (clear clearings and clearly intact forest).
- **Agent platforms:** setup prompts and fixes for agents other than Muse (Claude, ChatGPT, local agents, cron).
- **New projects:** proposals for other judgment tasks that fit the model (see `docs/ROADMAP.md`).
- **Feedback from forest-monitoring folks:** is the output useful? What format would you want?

## Development

```bash
npm install
cp .env.example .env.local   # Supabase URL + service-role key
npm run dev
npx tsc --noEmit             # type-check
npm run build
```

- Database changes: add a new file in `supabase/migrations/` (never edit applied ones) and extend `supabase/tests/core.sql`.
- Agent-facing text lives in `specs/` and is served verbatim; keep the protocol short and unambiguous, and bump `spec_version` in the project row if answers change shape.
- Scripts are standard-library Python 3.11+.

## Ground rules

- Be honest about results. Never present AI verdicts as expert findings or as evidence of wrongdoing.
- Respect volunteers' agents: no feature may require writing to an agent's memory or touching anything outside Canopy Watch.
- Security issues: please report privately via [lorenzen.ai](https://lorenzen.ai), not as public issues.
