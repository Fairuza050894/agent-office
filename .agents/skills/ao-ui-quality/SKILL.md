---
name: ao-ui-quality
description: Design and review Agent Office frontend changes as a dense, truthful engineering control plane while preventing generic AI-generated UI patterns.
---

# Agent Office UI Quality

Use this skill for every frontend, UX, Office View, visual refactor, or screenshot-review task.

Agent Office is an engineering operations product. It is not a marketing site and it must not look like a generic AI-generated admin template.

## Product design read

Use these defaults unless a specific approved requirement overrides them:

- product type: engineering operations control plane
- audience: developers, QA, technical leads, engineering managers
- visual density: 7/10
- design variance: 3/10
- motion intensity: 2/10
- character: precise, technical, calm, trustworthy
- inspiration family: mature developer tooling and observability products
- primary goal: fast scanning of factual execution state

Do not imitate a named product pixel-for-pixel.

## Required workflow

1. Scan the existing screen and shared components before changing layout.
2. Diagnose the concrete problem: hierarchy, density, scanability, stale copy, empty-state quality, or component misuse.
3. Preserve backend truth and existing interaction semantics.
4. Prefer targeted changes over rewrites.
5. Reuse existing primitives when they remain appropriate.
6. Run frontend tests, typecheck, lint, and build.
7. Review screenshots at desktop and responsive widths before claiming visual completion.

Read:

- `references/visual-language.md`
- `references/anti-ai-slop.md`
- `references/screenshot-review.md`

## Non-negotiable rules

- Do not fabricate metrics, progress, health scores, token usage, cost, agents, tests, or activity.
- Do not add decorative gradients, glassmorphism, AI sparkles, cinematic hero sections, or marketing-page patterns.
- Do not solve every information group with a bordered card.
- Do not dump long machine enums as comma-separated prose when they can be scanned structurally.
- Do not use giant centered empty states inside large containers by default.
- Do not put a decorative eyebrow above every page or section heading.
- Do not add external runtime font or image requests merely for polish.
- Do not hide operational information only to make a screen appear cleaner.
- Do not make Office View the sole representation of canonical state.
- Keep keyboard, focus, contrast, and responsive behavior intact.

## Typography

Use the platform-native sans stack for UI text and a native monospace stack for identifiers, commands, enum keys, and dense numeric data.

Do not claim a font such as Inter is in use unless it is actually bundled or guaranteed by the runtime.

Use tabular numerals for operational counts and timestamps where alignment helps scanning.

## Surfaces

Prefer dividers, section rhythm, compact rows, semantic status text, restrained neutral surfaces, and one accent color for interaction.

Use elevation or a boxed card only when it communicates a real containment or hierarchy boundary.

## Empty states

An empty state must explain what is absent, whether that state is normal, and the next valid action when one exists.

Keep it compact. Do not center a tiny icon and two sentences inside a large blank rectangle unless the empty space itself communicates something useful.

## Attribution

This skill was informed by redesign-audit concepts in the user-provided `taste-skill` repository by Leonxlnx (MIT License). Agent Office adapts those concepts for dense engineering software rather than importing the upstream skill wholesale.
