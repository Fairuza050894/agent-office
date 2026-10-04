import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import {
  officeCharacterAppearance,
  officeCharacterVariant,
  officeMovementYaw,
  shouldShowOfficeNameplate,
  workspaceCandidateBlockedByPeer,
  nameplateLabel,
  workspaceIdlePose,
} from './character'
import { LIVING_OFFICE_CORE_ROLES } from './livingOffice'

const LEGACY_EXECUTION_ROLES = [
  'architect',
  'explorer',
  'backend-developer',
  'frontend-developer',
  'qa-reviewer',
  'verifier',
  'documentation-writer',
  'ux-reviewer',
] as const

describe('officeCharacterAppearance', () => {
  it('gives the nine Living Office core roles deterministic unique visual identities', () => {
    const appearances = LIVING_OFFICE_CORE_ROLES.map((role) =>
      officeCharacterAppearance(role),
    )

    expect(LIVING_OFFICE_CORE_ROLES).toHaveLength(9)
    expect(new Set(appearances.map((appearance) => appearance.id)).size).toBe(9)
    expect(new Set(appearances.map((appearance) => appearance.accent)).size).toBe(9)
    expect(officeCharacterVariant('product-manager')).toBe('suit')
    expect(officeCharacterVariant('backend-engineer')).toBe('hoodie')
    expect(officeCharacterVariant('technical-writer')).toBe('dress')
    expect(officeCharacterAppearance('product-manager').id).not.toBe(
      officeCharacterAppearance('principal-engineer').id,
    )
  })

  it('keeps legacy execution roles deterministic while the Living Office catalog evolves', () => {
    const first = LEGACY_EXECUTION_ROLES.map((role) =>
      officeCharacterAppearance(role),
    )
    const second = LEGACY_EXECUTION_ROLES.map((role) =>
      officeCharacterAppearance(role),
    )

    expect(second).toEqual(first)
    expect(new Set(first.map((appearance) => appearance.id)).size).toBe(
      LEGACY_EXECUTION_ROLES.length,
    )
  })

  it('declutters transient and completed nameplates while keeping material and selected roles visible', () => {
    expect(shouldShowOfficeNameplate('COMPLETED', false)).toBe(false)
    expect(shouldShowOfficeNameplate('PENDING', false)).toBe(false)
    expect(shouldShowOfficeNameplate('AVAILABLE', false)).toBe(false)
    expect(shouldShowOfficeNameplate('STARTING', false)).toBe(false)
    expect(shouldShowOfficeNameplate('ARRIVING', false)).toBe(false)
    expect(shouldShowOfficeNameplate('COFFEE_BREAK', false)).toBe(false)
    expect(shouldShowOfficeNameplate('RUNNING', false)).toBe(true)
    expect(shouldShowOfficeNameplate('WAITING', false)).toBe(true)
    expect(shouldShowOfficeNameplate('BLOCKED', false)).toBe(true)
    expect(shouldShowOfficeNameplate('FAILED', false)).toBe(true)
    expect(shouldShowOfficeNameplate('COMPLETED', true)).toBe(true)
  })

  it('faces Office walkers along travel while preserving Live and Replay conventions', () => {
    const directions = [
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 0, -1),
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(1, 0, 1).normalize(),
      new THREE.Vector3(-1, 0, -1).normalize(),
    ]

    directions.forEach((direction) => {
      const liveYaw = officeMovementYaw(direction, 'live')
      const replayYaw = officeMovementYaw(direction, 'replay')
      const workspaceYaw = officeMovementYaw(direction, 'workspace')

      expect(liveYaw).toBeCloseTo(Math.atan2(direction.x, direction.z))
      expect(replayYaw - liveYaw).toBeCloseTo(Math.PI)
      expect(workspaceYaw).toBeCloseTo(replayYaw)

      const visibleForward = new THREE.Vector3(0, 0, -1).applyAxisAngle(
        new THREE.Vector3(0, 1, 0),
        workspaceYaw,
      )
      expect(visibleForward.dot(direction)).toBeCloseTo(1)
    })
  })

  it('gives Workspace idle a deterministic Sims-like posture cycle', () => {
    const samples = Array.from({ length: 16 }, (_, index) =>
      workspaceIdlePose('agent-a', index * 2_000, 'WORK_WAITING'),
    )
    const repeated = workspaceIdlePose('agent-a', 8_000, 'WORK_WAITING')

    expect(repeated).toEqual(samples[4])
    expect(
      Math.max(...samples.map((pose) => Math.abs(pose.lookYaw))),
    ).toBeGreaterThan(0.08)
    expect(
      Math.max(...samples.map((pose) => Math.abs(pose.lateralX))),
    ).toBeGreaterThan(0.015)
    expect(
      Math.max(...samples.map((pose) => Math.abs(pose.leanZ))),
    ).toBeGreaterThan(0.01)
    expect(
      Math.max(...samples.map((pose) => pose.breathScale)),
    ).toBeGreaterThan(1.002)

    expect(workspaceIdlePose('agent-a', 10_000, 'PRAYER_QUIET')).toEqual({
      lookYaw: 0,
      leanZ: 0,
      lateralX: 0,
      liftY: 0,
      breathScale: 1,
    })
  })

  it('enforces hard personal space and deterministic right-of-way for Workspace walkers', () => {
    const candidate = new THREE.Vector3(0, 0, 0)

    expect(
      workspaceCandidateBlockedByPeer('agent-b', candidate, [
        {
          agentId: 'agent-a',
          position: new THREE.Vector3(0.3, 0, 0),
          moving: true,
        },
      ]),
    ).toBe(true)

    expect(
      workspaceCandidateBlockedByPeer('agent-b', candidate, [
        {
          agentId: 'agent-a',
          position: new THREE.Vector3(0.52, 0, 0),
          moving: true,
        },
      ]),
    ).toBe(true)

    expect(
      workspaceCandidateBlockedByPeer('agent-a', candidate, [
        {
          agentId: 'agent-b',
          position: new THREE.Vector3(0.52, 0, 0),
          moving: true,
        },
      ]),
    ).toBe(false)

    expect(
      workspaceCandidateBlockedByPeer('agent-a', candidate, [
        {
          agentId: 'agent-b',
          position: new THREE.Vector3(0.52, 0, 0),
          moving: false,
        },
      ]),
    ).toBe(true)

    expect(
      workspaceCandidateBlockedByPeer('agent-a', candidate, [
        {
          agentId: 'agent-b',
          position: new THREE.Vector3(0.9, 0, 0),
          moving: false,
        },
      ]),
    ).toBe(false)
  })

  it('keeps WORK nameplates factual and break labels activity-neutral', () => {
    expect(
      nameplateLabel({
        status: 'RUNNING',
        behavior: 'DESK_FOCUS',
        taskTitle: 'Implement payment retry',
        stageKey: 'IMPLEMENTATION',
      }),
    ).toBe('Running · Implement payment retry · IMPLEMENTATION')
    expect(
      nameplateLabel({ status: 'RUNNING', behavior: 'DESK_FOCUS' }),
    ).toBe('Focus')
    expect(
      nameplateLabel({ status: 'AVAILABLE', behavior: null }),
    ).toBe('On standby')
    expect(
      nameplateLabel({ status: 'SOCIAL_BREAK', behavior: 'GAME_BREAK' }),
    ).toBe('On break')
  })

  it('keeps unknown-role fallback deterministic', () => {
    const first = officeCharacterAppearance('future-specialist')
    const second = officeCharacterAppearance('future-specialist')

    expect(second).toEqual(first)
    expect(['suit', 'casual', 'hoodie', 'dress', 'smart']).toContain(first.variant)
  })
})
