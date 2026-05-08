# Architecture Decisions Log

Running log of choices that deviate from defaults, pin specific versions, or lock in
external contracts (API endpoints, formulas, schemas). Append-only. Each entry: what,
why, when.

---

## 2026-05-08 — Tailwind pinned to 3.4.17
NativeWind v4 does not support Tailwind v4. Do not upgrade `tailwindcss` past 3.x
until NativeWind ships explicit Tailwind 4 support. Upgrading will silently break
all styling.

## 2026-05-08 — Project docs live inside `networth/`, not parent `NW App/`
`CLAUDE.md`, `PRD.md`, `PROGRESS.md`, `DECISIONS.md` are tracked in the `networth/`
git repo. The parent `NW App/` is a workspace folder with no special meaning.
Always launch Claude Code from inside `networth/` so `CLAUDE.md` auto-loads.