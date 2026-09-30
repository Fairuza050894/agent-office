import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import {
  officeCharacterAppearance,
  officeCharacterVariant,
  officeMovementYaw,
  shouldShowOfficeNameplate,
  workspaceCandidateBlockedByPeer,
  workspaceIdlePose,
} from './character'

const CORE_ROLES = [
  'architect',
  'explorer',
  'backend-developer',
  'frontend-developer',
  'qa-reviewer',
  'security-reviewer',
  'verifier',
  'documentation-writer',
] as const

describe('officeCharacterAppearance', () => {
  it('gives all eight core roles a deterministic unique visual identity', () => {
    const appearances = CORE_ROLES.map((role) => officeCharacterAppearance(role))

    expect(new Set(appearances.map((appearance) => appearance.id)).size).toBe(8)
    expect(new Set(appearances.map((appearance) => appearance.accent)).size).toBe(8)
    expect(officeCharacterVariant('architect')).toBe('suit')
    expect(officeCharacterVariant('security-reviewer')).toBe('suit')
    expect(officeCharacterAppearance('architect').id).not.toBe(
      officeCharacterAppearance('security-reviewer').id,
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

  it('uses one normalized forward axis for Live and Workspace while preserving Replay correction', () => {
    const directions = [
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 0, -1),
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(-1, 0, 0),
    ]

    directions.forEach((direction) => {
      const liveYaw = officeMovementYaw(direction, 'live')
      const replayYaw = officeMovementYaw(direction, 'replay')
      const workspaceYaw = officeMovementYaw(direction, 'workspace')

      expect(workspaceYaw).toBeCloseTo(liveYaw)
      expect(replayYaw - liveYaw).toBeCloseTo(Math.PI)
    })

    expect(
      officeMovementYaw(new THREE.Vector3(0, 0, 1), 'workspace'),
    ).toBeCloseTo(0)
    expect(
      Math.abs(
        officeMovementYaw(new THREE.Vector3(0, 0, -1), 'workspace'),
      ),
    ).toBeCloseTo(Math.PI)
  })

  it('gives Workspace idle a deterministic Sims-like posture cycle', () => {
    const samples = Array.from({ length: 16 }, (_, index) =>
      workspaceIdlePose(
        'agent-a',
        index * 2_000,
        'WORK_WAITING',
      ),
    )
    const repeated = workspaceIdlePose(
      'agent-a',
      8_000,
      'WORK_WAITING',
    )

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

    expect(
      workspaceIdlePose('agent-a', 10_000, 'PRAYER_QUIET'),
    ).toEqual({
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

  it('keeps unknown-role fallback deterministic', () => {
    const first = officeCharacterAppearance('future-specialist')
    const second = officeCharacterAppearance('future-specialist')

    expect(second).toEqual(first)
    expect(['suit', 'casual', 'hoodie', 'dress', 'smart']).toContain(first.variant)
  })
})
