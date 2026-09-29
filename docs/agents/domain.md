# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root, or
- **`CONTEXT-MAP.md`** at the repo root if it exists: it points at one `CONTEXT.md` per context. Read each one relevant to the topic.
- **`docs/adr/`**: read ADRs that touch the area you're about to work in. In multi-context repos, also check `src/<context>/docs/adr/` for context-scoped decisions.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

Single-context repo (this repo):

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-astro-as-site-framework.md
│   └── 0002-*.md
└── prototype/            # throwaway prototypes, not the shipped site
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, in a refactor proposal, in a hypothesis, in a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders), but worth reopening because…_

## Note on `prototype/`

`prototype/` holds throwaway answers to design questions, not the shipped site. The hero
scrub sequence, the Papers page, and the Blogs index were settled there and are now primary
sources for the Astro build that replaces them. When a prototype and `CONTEXT.md` disagree,
the more recent measured result wins — see the prototype validation notes in `CONTEXT.md`.

