# Anti-AI-Slop Checklist

## Layout and hierarchy

- [ ] No decorative eyebrow above every page title.
- [ ] No giant blank bordered container used only to center an empty message.
- [ ] No card for a group already clear through spacing and dividers.
- [ ] No repeated border-box nesting.
- [ ] No marketing hero, bento feature grid, or landing-page composition in operational screens.
- [ ] Primary and secondary information do not have equal visual weight.

## Typography and data

- [ ] The declared UI font actually exists in the runtime.
- [ ] IDs, SHAs, capability keys, paths, and commands use monospace selectively.
- [ ] Operational numbers use tabular figures.
- [ ] Machine enum arrays are not dumped as comma-separated prose when a list or matrix is clearer.
- [ ] Title Case is not mechanically applied to every label.

## Components

- [ ] Pills are used only for compact status/label semantics, not ordinary text.
- [ ] Empty states provide a valid next action where one exists.
- [ ] Tables remain scannable at desktop and horizontally usable at narrower widths.
- [ ] Buttons have hover, active, focus, disabled, and error/loading behavior where relevant.
- [ ] No external image or font request exists solely for decoration.

## Truthfulness

- [ ] No fake KPI, progress percent, score, cost, quota, test, reviewer, agent, or activity.
- [ ] Unknown state is shown as unknown.
- [ ] Frontend does not infer completion independently from backend state.
- [ ] Office View does not invent typing, thinking, collaboration, or movement without canonical support.
- [ ] Phase or milestone text is not hard-coded where it can become stale.

## Accessibility

- [ ] Keyboard focus remains visible.
- [ ] Text and control contrast remains readable.
- [ ] Status is understandable without color alone.
- [ ] Responsive collapse is explicit for multi-column layouts.
- [ ] Operational information remains available outside Office View.
