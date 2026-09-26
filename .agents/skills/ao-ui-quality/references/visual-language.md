# Agent Office Visual Language

Agent Office should feel like a serious local engineering workstation: dense enough for operators, calm enough for long sessions, and explicit about state.

## Typography

UI text uses the platform-native sans stack. Technical text uses `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`.

Use monospace selectively for IDs, commit SHAs, capability keys, event types, commands, paths, and runtime versions. Do not render prose paragraphs in monospace.

## Hierarchy

A normal page usually needs one page title, one concise description when context is not obvious, section headings, and operational rows or tables. Navigation already supplies category context, so decorative page eyebrows are not the default.

## Density

Default desktop density is 7/10. Prefer compact registry rows and avoid excessive whitespace around empty operational states.

## Surfaces

Default structure is page background → section heading → divider → data rows → divider. A bordered box is not the default grouping mechanism.

## Status

Use restrained semantic color only when it communicates state: green for available/success, amber for degraded/waiting, red for failed/blocked, gray for neutral/unknown, and one blue accent for interaction.

## Motion

Motion intensity is 2/10. Use motion for navigation, focus/hover feedback, bounded loading transitions, and Office View state changes supported by canonical events. Avoid decorative entrance choreography.
