# Agent Office Contract Index

Use this index to locate the smallest authoritative specification sections for a task. Prefer targeted heading lookup with `rg -n '^## <number>\\.' <file>` (or the heading text) before reading a whole contract.

This index is navigation only. The referenced specifications remain authoritative.

## Phase and acceptance

- current milestone status → `.agents/skills/ao-milestone/references/current-phase.md`
- Phase 4 goal / worktree safety → `docs/product/MVP_ACCEPTANCE.md` §§58–71
- review / Finding / Evidence → `docs/product/MVP_ACCEPTANCE.md` §§72–79
- verification / merge / commit gates → `docs/product/MVP_ACCEPTANCE.md` §§80–84
- Phase 5 operational frontend → `docs/product/MVP_ACCEPTANCE.md` §§85–100

## Workspace and Git safety

- Workspace domain model / invariants → `docs/architecture/DOMAIN_MODEL.md` §§23–25
- workspace resolution → `docs/contracts/WORKFLOW_CONTRACT.md` §22
- write-agent execution → `docs/contracts/WORKFLOW_CONTRACT.md` §§24–26
- parallel writers / integration → `docs/contracts/WORKFLOW_CONTRACT.md` §§25–27
- repository and main-tree protection → `docs/security/WORKTREE_POLICY.md` §§4–11
- managed worktree allocation → `docs/security/WORKTREE_POLICY.md` §§12–23
- write ownership / parallel writers → `docs/security/WORKTREE_POLICY.md` §§24–30
- integration workspace → `docs/security/WORKTREE_POLICY.md` §§31–36
- forbidden/restricted Git and command safety → `docs/security/WORKTREE_POLICY.md` §§37–41
- worktree change detection / untracked files → `docs/security/WORKTREE_POLICY.md` §§42–46
- review workspace immutability → `docs/security/WORKTREE_POLICY.md` §§47–49
- cleanup / cancellation / unknown execution → `docs/security/WORKTREE_POLICY.md` §§51–62

## Review, Evidence, and completion truth

- CompletionGate domain model → `docs/architecture/DOMAIN_MODEL.md` §14
- Finding model / invariants → `docs/architecture/DOMAIN_MODEL.md` §§28–30
- Evidence model / status → `docs/architecture/DOMAIN_MODEL.md` §§31–32
- independent review and Finding creation → `docs/contracts/WORKFLOW_CONTRACT.md` §§32–40
- remediation / re-review → `docs/contracts/WORKFLOW_CONTRACT.md` §§41–44
- verification stage / command → `docs/contracts/WORKFLOW_CONTRACT.md` §§52–53
- completion gates / completed Run → `docs/contracts/WORKFLOW_CONTRACT.md` §§54–55
- Phase 4 Evidence acceptance/truthfulness → `docs/product/MVP_ACCEPTANCE.md` §§76–80

## Cancellation, retry, recovery

- retry semantics → `docs/contracts/WORKFLOW_CONTRACT.md` §§44–46
- cancellation → `docs/contracts/WORKFLOW_CONTRACT.md` §§47–49
- blocked/failed Run → `docs/contracts/WORKFLOW_CONTRACT.md` §§50–51
- restart recovery / unknown external state → `docs/contracts/WORKFLOW_CONTRACT.md` §§71–74
- cancellation and recovery domain model → `docs/architecture/DOMAIN_MODEL.md` §§59–60

## Executor boundary

- Executor domain model / capabilities → `docs/architecture/DOMAIN_MODEL.md` §§19–22
- ReferenceExecutor → `docs/architecture/DOMAIN_MODEL.md` §61
- executor resolution / capability gate → `docs/contracts/WORKFLOW_CONTRACT.md` §§20–21
- executor adapter responsibilities → `docs/contracts/WORKFLOW_CONTRACT.md` §78
- detailed adapter contract → `docs/contracts/EXECUTOR_ADAPTER.md` (use heading lookup for the requested executor concern)

## Events and audit

- Event domain model → `docs/architecture/DOMAIN_MODEL.md` §§26–27
- event ordering / examples → `docs/contracts/WORKFLOW_CONTRACT.md` §§75–76
- detailed event contract → `docs/contracts/EVENT_CONTRACT.md` (use heading lookup for the requested event concern)

## Frontend / UX

- Phase 5 acceptance → `docs/product/MVP_ACCEPTANCE.md` §§85–100
- information architecture → `docs/ux/INFORMATION_ARCHITECTURE.md` (use heading lookup for the requested screen/view)

## Phase 4C focused reading set

For explicit candidate scope, Evidence freshness, and multi-writer integration, start with only:

- `.agents/skills/ao-milestone/references/current-phase.md`
- `docs/architecture/DOMAIN_MODEL.md` §§14, 23–25, 31–32
- `docs/contracts/WORKFLOW_CONTRACT.md` §§22, 25–27, 32–40, 52–55
- `docs/security/WORKTREE_POLICY.md` §§24–35, 42–49
- `docs/product/MVP_ACCEPTANCE.md` §§58–84
- Phase 4A/4B verification documents and the existing Phase 4B tests

Expand beyond this set only when a discovered dependency requires it.
