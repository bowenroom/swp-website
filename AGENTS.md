# swp.lionpilot.tech

Personal academic site for Weipeng Shi. Astro, static output, GitHub Pages.
Deploy with `./deploy.sh "what changed"` — see `deploy.sh` for what it does and waits for.

Domain vocabulary, settled decisions, and settled product decisions live in `CONTEXT.md`.
Architecture decisions live in `docs/adr/`.

## Agent skills

### Issue tracker

Local markdown under `.scratch/<feature>/` (specs, tickets, research). Not GitHub Issues —
the site is public. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five canonical roles: `needs-triage`, `needs-info`, `ready-for-agent`,
`ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

