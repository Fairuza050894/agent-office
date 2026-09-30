# Phase 10F Verification — Contextual Operations

Status: IMPLEMENTED / DRAFT REVIEW

Branch: `phase-10f-contextual-operations`

Base: `main@aaea623`

## Scope

Phase 10F introduces one contextual Office rail with:

- Discussion
- Details
- Files
- Logs
- canonical Task creation
- Task projection in the Bottom Operations Dock

It does not implement GitHub import, arbitrary file preview/download, or
planning-to-execution promotion.

## Automated verification

Run the canonical repository gate:

```bash
cd ~/Projects/agent-office
./scripts/verify.sh
```

Minimum expected evidence:

```text
backend pytest       PASS
backend Ruff         PASS
backend format       PASS
backend MyPy         PASS
frontend tests       PASS
frontend typecheck   PASS
frontend lint        PASS
frontend build       PASS
git diff check       PASS
full status reviewed
```

Focused frontend contracts include:

- contextual rail tab isolation
- collapsed/reopen control
- TaskQuickCreate validation
- Workspace rail -> canonical Task -> Dock projection
- Run AgentRun selection -> Details/Files factual context
- WorkspaceChangeSummary path rendering
- file-content gate messaging
- Operations Dock Tasks tab

## Rendered Workspace review

Open `/office` and verify:

1. Scene remains primary and the right rail is visually subordinate.
2. Discussion contains the real Universal Composer.
3. Discussion does not invent role replies.
4. Ambient member selection clearly states ambient presence is not an active agent.
5. Planning-member selection focuses the role without changing planning truth.
6. Manual Add project task creates a real Task and it appears in Dock > Tasks.
7. Approved RequirementCandidates may create a Task only after approval.
8. Details reports Project/repository/branch/thread/Task/latest Run facts.
9. Files reports structured PlanningArtifacts without fake download controls.
10. Logs shows durable PlanningEvents.
11. Rail collapse restores scene width.
12. L1/L2/L3 floor switching and Phase 10E camera controls remain usable.

## Rendered Live / Replay review

Open one canonical Run Office and verify:

1. Select an AgentRun from the 3D scene or Operations Dock.
2. The same rail changes to that AgentRun context.
3. Discussion shows canonical Events rather than fabricated chat.
4. Details reports Run/AgentRun/Executor/Workspace/Branch/Finding/Evidence facts.
5. Files shows WorkspaceChangeSummary relative paths and Evidence metadata.
6. No Preview/Download control is offered without a bounded Artifact content API.
7. Logs shows Events and Audit records.
8. Follow-up Task creation creates Task truth but does not interrupt the current AgentRun.
9. Dock > Tasks shows Project Tasks.
10. Live and Historical Replay scope switching remains correct.
11. Historical Replay movement remains forward-facing.
12. Normal and Maximize layouts do not clip the rail or Office Controls panel.

## Responsive review

At narrow viewport:

- scene and contextual rail stack rather than overlap
- rail remains collapsible
- four tabs remain reachable
- input controls remain keyboard accessible
- Operations Dock remains independently usable

## Deferred by design

### Artifact preview/download

Deferred until a bounded Artifact content API exists. Arbitrary Workspace path
reads are forbidden.

### GitHub discovery/import

Deferred until provider authentication, discovery, clone ownership, duplicate
handling, and local Project registration are specified end-to-end.

### Direct mid-run chat mutation

Deferred. Phase 10F does not inject ad-hoc user instructions into an active
AgentRun.

## Merge gate

Keep the PR Draft until:

- canonical local verification passes
- rendered Workspace review passes
- rendered Live/Replay review passes
- no movement regression is observed
- branch is current with main


## Rendered polish checkpoint

Workspace visual review additionally requires:

- floor navigation occupies its own contained row and never overlaps the Context Rail;
- the shared lift core remains in one consistent building-edge location on all floors;
- Commons pantry does not intersect or visually block the lift landing;
- Strategy roadmap / presentation surfaces do not cover the lift core;
- Build sprint notes are mounted vertically to the board with no floating-paper props;
- rear wall accent surfaces remain clear of both the window wall and lift core.
