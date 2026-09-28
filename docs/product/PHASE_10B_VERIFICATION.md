# Phase 10B Verification — Living Office Presence Behavior

Status: ACCEPTED FOR RENDERED REVIEW  
Date: 2026-09-28  
Branch: `phase-10b-presence-behavior`  
Base: merged `main@21afb8e`  
Implementation checkpoint: `3755fe3`  
Merge policy: manual only

## Goal

Phase 10B makes the Living Office feel less static without weakening the
canonical truth boundary established in Phase 10A.

The target is believable office behavior:

- role-specific ambient tendencies
- deterministic movement between office zones
- staggered arrivals and bounded break participation
- selected-member inspection
- time-of-day lighting
- planning behavior that remains distinct from operational execution

## Delivered

### Behavior vocabulary

`OfficePresenceMember` now carries an explicit `behavior`:

```text
ARRIVAL
AVAILABLE
DESK_FOCUS
PLANNING_MEETING
WAITING_DECISION
COFFEE_CHAT
LUNCH
SOCIAL_CHAT
GAME_BREAK
PRAYER_QUIET
OFFLINE
```

Behavior is presentation state. It does not create Task, Run, AgentRun, Event,
Finding, Evidence, or repository mutation.

### Role personality

Each core role has deterministic preferences for:

- coffee zones
- lunch zones
- after-hours zones

Examples include lounge, coffee bar, quiet room, and game corner. The resolver
does not randomly assign a new personality on reload.

### Natural office participation

The ambience scheduler no longer moves the full office in lockstep.

- arrivals are staggered per role
- coffee break participation is bounded to four eligible ambient members
- lunch participation is bounded to six eligible ambient members
- after-hours occupancy is bounded to two eligible ambient members
- active planning roles are excluded from ambient duplication
- scheduled events retain their own participant cap and optional role targeting

Non-participants remain AVAILABLE in their home zone. AVAILABLE is not presented
as active work.

### Deterministic ambient movement

Ambient members carry a deterministic `placementIndex` based on role identity
and a ten-minute ambience beat.

The environment:

- exposes zone capacity
- reserves unique zone slots when capacity permits
- accepts preferred placement indices
- updates a member's target when zone/placement changes

The existing shared Three.js movement loop then walks the same stable character
runtime to the new target. No per-agent animation loop was added.

### Workspace member inspector

Clicking a Living Office character now exposes a compact inspector with:

- display name
- derived behavior
- role key
- floor and zone
- truth type

Truth is explicitly shown as either:

```text
Planning truth
Ambient presentation
```

Changing floor clears the selected member rather than leaving a stale inspector.

### Time-of-day lighting

The renderer now has deterministic profiles:

```text
morning
day
evening
night
```

Each profile controls:

- scene background
- hemisphere light
- key light
- fill light
- tone-mapping exposure

The night profile is deliberately dimmer than daylight while preserving
readability.

### Selected-floor presence summary

The Office header now summarizes behavior actually visible on the selected floor
instead of blindly repeating the global ambient window.

This avoids claims such as "Coffee break" on a floor whose visible ambient
members are AVAILABLE.

## Animation asset audit

Phase 10B investigated adding real sitting/talking clips from the Quaternius
Universal Animation Library.

The candidate library was:

```text
J-Ponzo/gltf-universal-animation-library
commit e24c23cf2a1323488a3faa226ea7ea21f644b73e
CC0 1.0
```

The free standard library exposes useful clips including:

```text
Idle_Talking_Loop
Interact
PickUp_Table
Sitting_Idle_Loop
Sitting_Talking_Loop
```

A strict build-time compatibility check was attempted against all five current
Agent Office character variants.

Result: **rejected**.

The animation library targets the newer Quaternius `DEF-*` rig, while the
current character binaries use a different rig. The build correctly failed on
missing targets such as:

```text
root
DEF-hips
DEF-spine.001
DEF-spine.002
DEF-spine.003
DEF-neck
DEF-head
DEF-shoulder.L
```

The experiment was rolled back completely.

Consequences:

- no incompatible animation assets are shipped
- no runtime retargeting hack was introduced
- no character deformation risk was accepted
- the verified existing character asset bootstrap remains unchanged
- Phase 10B behavior uses the existing guaranteed Idle / Walk / Run clips
- optional future behavior clip names gracefully fall back to Idle

Real seated/talking/typing animation remains deferred until Agent Office has a
validated retargeted character/animation asset pipeline.

## Verification

GitHub Actions run `36455559684`: **GREEN**

```text
repository whitespace  passed

backend pytest         657 passed
ruff                   passed
ruff format            203 files already formatted
mypy                   no issues in 136 source files

frontend vitest        18 files passed
frontend tests         99 passed
frontend typecheck     passed
frontend lint          0 errors / 2 existing ThreeOfficeScene warnings
frontend build         passed
```

The two lint warnings are the pre-existing exhaustive-deps warnings around the
shared `startLoop` callback.

## Automated acceptance

PASS:

- behavior derivation respects Planning vs Ambient truth
- game/social/prayer behavior mapping is deterministic
- after-hours role personality is deterministic
- ambience changes across ten-minute beats
- zone capacities are explicit
- staggered arrival completes before focus hours
- coffee participation is bounded
- lunch participation is bounded
- after-hours occupancy remains bounded
- planning roles are not duplicated as ambient roles
- member inspector exposes truth type
- floor switching remains presentation-only
- morning/day/evening/night lighting profiles are deterministic
- night lighting is dimmer than day
- existing Run Office tests remain green
- backend suite remains unchanged and green
- ambient social-zone occupancy never exceeds actual 3D slot capacity
- scheduled events reserve zone capacity before lower-priority ambience
- scheduled participant count is clamped to zone capacity
- semantic ambient capacity is test-locked to actual environment slot capacity
- member inspector disappears when the selected member is no longer on the active floor
- daily ambient-role rotation uses the local calendar day instead of a UTC day bucket

## Final audit hardening

A final code audit after the first green Phase 10B checkpoint found several edge
cases that were not visible in the initial rendered design review:

1. lunch/coffee role preferences could over-subscribe a small social zone,
   forcing the environment to reuse an occupied 3D slot;
2. a high-priority scheduled event could lose capacity to a lower-priority
   ambient assignment processed earlier in role order;
3. scheduled `maxParticipants` could exceed the physical capacity of its target
   zone;
4. a selected-member inspector could remain visible after that member moved to
   another floor on a later ambience beat;
5. daily role rotation used an epoch/UTC day bucket instead of the browser-local
   office calendar day.

Hardening at `3755fe3` closes those gaps:

- ambient zone assignment is capacity-aware
- scheduled-event slots are reserved before baseline ambience allocation
- scheduled participation is clamped to semantic/physical zone capacity
- environment tests lock semantic capacity to actual zone slots
- cross-floor stale inspector state is suppressed
- daily rotation uses a local calendar date bucket

The final automated run for this code checkpoint is `36455559684` and is
green.

## Rendered gate still required

Before closing Phase 10B, review locally:

1. Open L1 Commons at the current evening/night window.
2. Confirm the night lighting is visibly darker but still readable.
3. Confirm after-hours members occupy role-appropriate social zones.
4. Click a character and verify the member inspector is compact and truthful.
5. Keep L1 open across a ten-minute ambience boundary, or temporarily test at
   a boundary, and verify movement occurs rather than character teleportation.
6. Open an active TDP planning thread on L3 and verify the planning team remains
   distinct from ambient presence.
7. Resolve/enter an AWAITING_USER state and verify Waiting for you remains
   visually truthful.
8. Confirm no obvious furniture clipping occurs during ambient movement.
9. Confirm L2 can remain quiet when there is no execution truth.

## Deferred intentionally

Not part of Phase 10B:

- real seated/typing/talking clip playback
- runtime skeleton retargeting
- durable office timezone / working-hours configuration
- production prayer-time provider
- operational Activity Interpreter for IMPLEMENTING / TESTING / REVIEWING /
  DOCUMENTING
- rooftop floor
- persistent user-configurable ambience density

Those require separate, reviewable contracts rather than implicit behavior.
