# Target UI Visual-Language Override

Status: **APPROVED FOR TARGET-UI WORK**

Owner direction for the target UI explicitly authorizes this scoped override of
`ao-ui-quality` for the 2D product shell and decision surfaces. `AGENTS.md`,
truthful-state rules, accessibility, safety, and workflow semantics remain
unchanged and take precedence.

## Scope

This override applies only to:

- global application shell and top navigation;
- Task Board;
- Inbox / Needs Your Decision;
- Task Detail / human result decision surface;
- Accepted-change KPI;
- in-app Accepted Change Dossier.

It does **not** relax the 3D Office truth boundary or authorize decorative
simulation to become workflow truth.

## Approved visual changes

The target UI may use:

- card radius up to `var(--ao-radius-lg)` / 12px;
- restrained column-specific accents on Task Board;
- thin accent borders on status/decision cards;
- subtle non-glowing elevation shadows for hierarchy;
- dense top navigation with Office, Board, Inbox, KPI, and Projects as primary
  destinations;
- compact popovers/menus for lower-frequency routes;
- stronger information density where labels, counts, and actions remain readable.

## Rules that remain mandatory

- status is never communicated by color alone; text and/or a semantic glyph is
  always present;
- no fabricated counts, percentages, health states, identity, dialogue, KPI,
  agent activity, compliance claims, or progress;
- no decorative gradients on the 2D decision surfaces introduced by this
  override;
- keyboard focus remains visible and high-contrast;
- `prefers-reduced-motion` is respected;
- layout must remain usable at 1440px, 1024px, and 390px widths;
- dense layouts must scroll rather than clip or hide canonical content;
- changing tabs, filters, search text, camera focus, or UI selection does not
  create domain Events;
- frontend presentation never mutates canonical Task/Run/AgentRun/Event/
  Evidence/ResultReview truth.

## Board accent mapping

Use existing semantic tokens rather than hard-coded mockup colors:

- Planning -> `--ao-text-muted`
- Ready -> existing blue/info token
- Running -> `--ao-live`
- In Review -> `--ao-waiting`
- Needs You -> `--ao-planning`
- Accepted -> `--ao-success`

Every colored header also renders its status name and count.

## Explicit product decisions

For the first target-UI program:

- navigation moves to the top bar on desktop;
- mobile retains a compact drawer reached from the hamburger control;
- the owner affordance is a generic **Local owner** marker with no invented
  email/name;
- sequential Task keys, priority, and Team are **not** added to the domain in
  U1-U7;
- the non-existent Design office zone is not displayed;
- the Office hero remains premium stylized/R3F for RC1. Photorealistic/Blender
  asset work is a separate optional U9 lane and must not block truthful 2D
  product completion.
