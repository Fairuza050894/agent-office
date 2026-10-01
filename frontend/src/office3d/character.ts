import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'

import { officeAgentState } from '../officeProjection'
import {
  officeBehaviorLabel,
  type OfficeBehaviorKey,
} from './livingOffice'

export type CharacterVariantKey = 'suit' | 'casual' | 'hoodie' | 'dress' | 'smart'

interface CharacterVariant {
  url: string
  scale: number
}

export interface OfficeCharacterSource {
  id: string
  agent_profile_key: string
  status: string
  behavior?: OfficeBehaviorKey
}

export interface CharacterAppearance {
  id: string
  variant: CharacterVariantKey
  scale: number
  accent: number
  idleRate: number
  idlePhase: number
}

const MODEL_YAW_OFFSET = Math.PI

const CHARACTER_VARIANTS: Record<CharacterVariantKey, CharacterVariant> = {
  suit: {
    url: '/assets/office/char-m-suit.glb',
    scale: 0.98,
  },
  casual: {
    url: '/assets/office/char-m-casual.glb',
    scale: 0.98,
  },
  hoodie: {
    url: '/assets/office/char-m-hoodie.glb',
    scale: 0.98,
  },
  dress: {
    url: '/assets/office/char-f-dress.glb',
    scale: 0.98,
  },
  smart: {
    url: '/assets/office/char-f-smart.glb',
    scale: 0.98,
  },
}

const ROLE_APPEARANCES: Record<string, CharacterAppearance> = {
  architect: {
    id: 'architect-navy',
    variant: 'suit',
    scale: 1.0,
    accent: 0x365f86,
    idleRate: 0.84,
    idlePhase: 0.12,
  },
  explorer: {
    id: 'explorer-rust',
    variant: 'hoodie',
    scale: 0.98,
    accent: 0xa8673d,
    idleRate: 1.04,
    idlePhase: 0.44,
  },
  'backend-developer': {
    id: 'backend-teal',
    variant: 'casual',
    scale: 1.03,
    accent: 0x34766f,
    idleRate: 0.93,
    idlePhase: 0.28,
  },
  'frontend-developer': {
    id: 'frontend-violet',
    variant: 'smart',
    scale: 0.99,
    accent: 0x705b91,
    idleRate: 1.01,
    idlePhase: 0.61,
  },
  'qa-reviewer': {
    id: 'qa-amber',
    variant: 'dress',
    scale: 0.95,
    accent: 0xa97d34,
    idleRate: 0.89,
    idlePhase: 0.35,
  },
  'security-reviewer': {
    id: 'security-burgundy',
    variant: 'suit',
    scale: 1.09,
    accent: 0x814448,
    idleRate: 0.8,
    idlePhase: 0.72,
  },
  verifier: {
    id: 'verifier-green',
    variant: 'casual',
    scale: 0.94,
    accent: 0x477553,
    idleRate: 0.97,
    idlePhase: 0.53,
  },
  'documentation-writer': {
    id: 'documentation-blue',
    variant: 'dress',
    scale: 1.04,
    accent: 0x4a6d9a,
    idleRate: 0.87,
    idlePhase: 0.19,
  },
  'ux-reviewer': {
    id: 'ux-plum',
    variant: 'smart',
    scale: 0.97,
    accent: 0x855b7d,
    idleRate: 0.95,
    idlePhase: 0.67,
  },
  'product-manager': {
    id: 'pm-cobalt',
    variant: 'suit',
    scale: 1.0,
    accent: 0x426f9d,
    idleRate: 0.9,
    idlePhase: 0.23,
  },
  'system-analyst': {
    id: 'analyst-sage',
    variant: 'casual',
    scale: 0.98,
    accent: 0x5c7d72,
    idleRate: 0.96,
    idlePhase: 0.41,
  },
  'principal-engineer': {
    id: 'principal-indigo',
    variant: 'suit',
    scale: 1.06,
    accent: 0x59688f,
    idleRate: 0.82,
    idlePhase: 0.58,
  },
  'product-designer': {
    id: 'designer-coral',
    variant: 'smart',
    scale: 0.97,
    accent: 0xa26667,
    idleRate: 1.02,
    idlePhase: 0.31,
  },
  'backend-engineer': {
    id: 'backend-engineer-teal',
    variant: 'hoodie',
    scale: 1.02,
    accent: 0x32766f,
    idleRate: 0.94,
    idlePhase: 0.48,
  },
  'frontend-engineer': {
    id: 'frontend-engineer-violet',
    variant: 'smart',
    scale: 0.99,
    accent: 0x735c93,
    idleRate: 1.0,
    idlePhase: 0.64,
  },
  'qa-engineer': {
    id: 'qa-engineer-amber',
    variant: 'dress',
    scale: 0.96,
    accent: 0xa57b3b,
    idleRate: 0.88,
    idlePhase: 0.37,
  },
  'technical-writer': {
    id: 'technical-writer-blue',
    variant: 'dress',
    scale: 1.03,
    accent: 0x4f7399,
    idleRate: 0.86,
    idlePhase: 0.16,
  },
}

const CLIPS = {
  idle: 'Idle',
  walk: 'Walk',
  run: 'Run',
} as const

const BEHAVIOR_CLIP_CANDIDATES: Record<OfficeBehaviorKey, string[]> = {
  ARRIVAL: ['Walk', 'Idle'],
  AVAILABLE: ['Idle'],
  DESK_FOCUS: ['Sitting_Idle_Loop', 'Interact', 'Idle'],
  PLANNING_MEETING: [
    'Sitting_Talking_Loop',
    'Idle_Talking_Loop',
    'Sitting_Idle_Loop',
    'Idle',
  ],
  WAITING_DECISION: ['Sitting_Idle_Loop', 'Idle'],
  WORK_WAITING: ['Sitting_Idle_Loop', 'Idle'],
  COFFEE_CHAT: ['Idle_Talking_Loop', 'Idle'],
  LUNCH: ['Sitting_Idle_Loop', 'Idle'],
  SOCIAL_CHAT: ['Idle_Talking_Loop', 'Sitting_Talking_Loop', 'Idle'],
  GAME_BREAK: ['Sitting_Idle_Loop', 'Idle'],
  PRAYER_QUIET: ['Idle'],
  OFFLINE: ['Idle'],
}

interface CharacterAssets {
  source: THREE.Group
  clips: Map<string, THREE.AnimationClip>
}

interface RiggedPresentation {
  pivot: THREE.Group
  model: THREE.Group
  mixer: THREE.AnimationMixer
  actions: Map<string, THREE.AnimationAction>
  ownedMaterials: THREE.Material[]
  activeClip: string
  idleRate: number
}

export interface StationPlacement {
  position: THREE.Vector3
  yaw: number
}

export interface RuntimeAgent {
  agentId: string
  name: string
  root: THREE.Group
  fallback: THREE.Group
  statusLight: THREE.Mesh
  selectionRing: THREE.Mesh
  label: CSS2DObject
  labelElement: HTMLDivElement
  target: THREE.Vector3
  path: THREE.Vector3[]
  station: THREE.Vector3
  stationYaw: number
  targetYaw: number
  finalStatus: string
  currentStatus: string
  behavior: OfficeBehaviorKey | null
  moving: boolean
  pendingStatus: string | null
  pendingStatusAt: number | null
  rigged: RiggedPresentation | null
  disposed: boolean
  lastAnimationAt: number | null
}

const assetPromises = new Map<CharacterVariantKey, Promise<CharacterAssets>>()


function stableHash(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function officeCharacterAppearance(
  profileKey: string,
): CharacterAppearance {
  const explicit = ROLE_APPEARANCES[profileKey]
  if (explicit) return explicit

  const fallbackVariants: CharacterVariantKey[] = [
    'suit',
    'casual',
    'hoodie',
    'dress',
    'smart',
  ]
  const fallbackAccents = [
    0x486785,
    0x5b765d,
    0x735c82,
    0x8a654d,
    0x497a78,
  ]
  const hash = stableHash(profileKey)
  const variant = fallbackVariants[hash % fallbackVariants.length]

  return {
    id: `fallback-${variant}-${hash.toString(16)}`,
    variant,
    scale: 0.97 + ((hash >>> 5) % 7) * 0.01,
    accent: fallbackAccents[(hash >>> 9) % fallbackAccents.length],
    idleRate: 0.84 + ((hash >>> 13) % 17) / 100,
    idlePhase: ((hash >>> 17) % 100) / 100,
  }
}

export function officeCharacterVariant(profileKey: string): CharacterVariantKey {
  return officeCharacterAppearance(profileKey).variant
}

export type OfficeMovementFacing = 'live' | 'replay' | 'workspace'

export function officeMovementYaw(
  direction: THREE.Vector3,
  facing: OfficeMovementFacing = 'live',
): number {
  const forwardYaw = Math.atan2(direction.x, direction.z)

  // Office walkers need the same presentation-facing correction as Replay.
  // Keep Live's existing convention: changing the model offset globally would
  // also rotate stationary characters and the already-verified Run view.
  return facing === 'live' ? forwardYaw : forwardYaw + Math.PI
}

function stableCharacterHash(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export interface WorkspaceIdlePose {
  lookYaw: number
  leanZ: number
  lateralX: number
  liftY: number
  breathScale: number
}

const NEUTRAL_WORKSPACE_IDLE_POSE: WorkspaceIdlePose = {
  lookYaw: 0,
  leanZ: 0,
  lateralX: 0,
  liftY: 0,
  breathScale: 1,
}

function smoothUnit(value: number): number {
  const clamped = Math.max(0, Math.min(1, value))
  return clamped * clamped * (3 - 2 * clamped)
}

function smoothPulse(
  phase: number,
  start: number,
  peak: number,
  end: number,
): number {
  if (phase <= start || phase >= end) return 0
  if (phase <= peak) {
    return smoothUnit((phase - start) / (peak - start))
  }
  return 1 - smoothUnit((phase - peak) / (end - peak))
}

export function workspaceIdlePose(
  agentId: string,
  now: number,
  behavior: OfficeBehaviorKey | null,
): WorkspaceIdlePose {
  if (behavior === 'PRAYER_QUIET' || behavior === 'OFFLINE') {
    return NEUTRAL_WORKSPACE_IDLE_POSE
  }

  const hash = stableCharacterHash(agentId)
  const cycleSeconds = 22 + (hash % 9)
  const offsetSeconds = ((hash >>> 5) % 1000) / 1000 * cycleSeconds
  const phase =
    ((now / 1000 + offsetSeconds) % cycleSeconds) / cycleSeconds
  const intensity =
    behavior === 'DESK_FOCUS'
      ? 0.72
      : behavior === 'PLANNING_MEETING'
        ? 0.86
        : behavior === 'WORK_WAITING'
          ? 1
          : 0.9

  // A readable but still professional standing-idle sequence:
  // breathe -> shift left -> look left -> settle -> look right -> shift right.
  const shiftLeft = smoothPulse(phase, 0.05, 0.15, 0.28)
  const lookLeft = smoothPulse(phase, 0.24, 0.34, 0.46)
  const lookRight = smoothPulse(phase, 0.49, 0.61, 0.74)
  const shiftRight = smoothPulse(phase, 0.7, 0.82, 0.96)
  const breath =
    0.5 + 0.5 * Math.sin(phase * Math.PI * 4 + ((hash >>> 9) % 16) * 0.17)

  const side = (hash & 1) === 0 ? 1 : -1
  return {
    lookYaw:
      side * (lookRight - lookLeft) * 0.27 * intensity,
    leanZ:
      side * (shiftLeft - shiftRight) * 0.038 * intensity,
    lateralX:
      side * (shiftRight - shiftLeft) * 0.045 * intensity,
    liftY: (breath - 0.5) * 0.018 * intensity,
    breathScale: 1 + breath * 0.006 * intensity,
  }
}

export function applyWorkspaceIdlePresentation(
  runtime: RuntimeAgent,
  now: number,
  enabled: boolean,
): boolean {
  const pose = enabled
    ? workspaceIdlePose(runtime.agentId, now, runtime.behavior)
    : NEUTRAL_WORKSPACE_IDLE_POSE

  if (runtime.rigged) {
    const pivot = runtime.rigged.pivot
    pivot.position.set(pose.lateralX, pose.liftY, 0)
    pivot.rotation.set(0, pose.lookYaw, pose.leanZ)
    pivot.scale.set(1, pose.breathScale, 1)
  } else if (!runtime.moving) {
    runtime.fallback.position.x = pose.lateralX
    runtime.fallback.position.y = pose.liftY
    runtime.fallback.rotation.y = pose.lookYaw
    runtime.fallback.rotation.z = pose.leanZ
    runtime.fallback.scale.set(
      0.88,
      0.88 * pose.breathScale,
      0.88,
    )
  }

  return (
    enabled &&
    runtime.behavior !== 'PRAYER_QUIET' &&
    runtime.behavior !== 'OFFLINE'
  )
}

export interface WorkspacePeerPosition {
  agentId: string
  position: THREE.Vector3
  moving: boolean
}

export function workspaceCandidateBlockedByPeer(
  agentId: string,
  candidate: THREE.Vector3,
  peers: WorkspacePeerPosition[],
): boolean {
  const softRadius = 0.62
  const hardRadius = 0.42

  for (const peer of peers) {
    if (peer.agentId === agentId) continue

    const distance = candidate.distanceTo(peer.position)
    if (distance < hardRadius) return true
    if (distance >= softRadius) continue

    if (!peer.moving) return true

    // Deterministic right-of-way: one walker clears the shared crossing while
    // the other yields, avoiding oscillation or both advancing together.
    if (agentId.localeCompare(peer.agentId) > 0) return true
  }

  return false
}

function loadCharacterAssets(
  variantKey: CharacterVariantKey,
): Promise<CharacterAssets> {
  const existing = assetPromises.get(variantKey)
  if (existing) return existing

  const variant = CHARACTER_VARIANTS[variantKey]
  const loader = new GLTFLoader()
  const pending = loader.loadAsync(variant.url).then((character) => {
    const clips = new Map(
      character.animations.map((clip) => [clip.name, clip]),
    )

    if (!clips.has(CLIPS.idle) || !clips.has(CLIPS.walk)) {
      throw new Error(
        `Office character ${variantKey} is missing required Idle/Walk clips.`,
      )
    }

    return {
      source: character.scene,
      clips,
    }
  })

  assetPromises.set(variantKey, pending)
  pending.catch(() => {
    assetPromises.delete(variantKey)
  })
  return pending
}

export function shouldShowOfficeNameplate(
  status: string,
  selected: boolean,
): boolean {
  if (selected) return true

  return [
    'RUNNING',
    'WORKING',
    'PLANNING',
    'WAITING',
    'WAITING_USER',
    'WAITING_WORK',
    'BLOCKED',
    'FAILED',
  ].includes(status.toUpperCase())
}

export function statusColor(status: string): number {
  switch (status.toUpperCase()) {
    case 'RUNNING':
    case 'WORKING':
    case 'PLANNING':
    case 'COMPLETED':
    case 'AVAILABLE':
      return 0x2fb176
    case 'STARTING':
    case 'ARRIVING':
    case 'WAITING':
    case 'WAITING_USER':
    case 'WAITING_WORK':
    case 'COFFEE_BREAK':
    case 'LUNCH_BREAK':
    case 'SOCIAL_BREAK':
    case 'PRAYER_BREAK':
      return 0xd09a35
    case 'BLOCKED':
    case 'FAILED':
      return 0xd24e43
    default:
      return 0x8491a3
  }
}

function createNameplate(
  name: string,
  stateLabel: string,
  profileKey: string,
): {
  object: CSS2DObject
  element: HTMLDivElement
} {
  const element = document.createElement('div')
  element.className = 'office-avatar-nameplate'
  element.setAttribute('aria-hidden', 'true')

  const primary = document.createElement('strong')
  primary.textContent = name
  const secondary = document.createElement('span')
  secondary.textContent = stateLabel
  element.append(primary, secondary)

  const object = new CSS2DObject(element)
  const hash = stableHash(profileKey)
  const horizontalOffset = ((hash % 5) - 2) * 0.055
  const verticalOffset = ((hash >>> 5) % 3) * 0.07
  object.position.set(horizontalOffset, 2.12 + verticalOffset, 0)
  return { object, element }
}

function createFallback(profileKey: string): THREE.Group {
  const fallback = new THREE.Group()
  const appearance = officeCharacterAppearance(profileKey)
  const suit = new THREE.MeshStandardMaterial({
    color: appearance.accent,
    roughness: 0.82,
    metalness: 0.01,
  })
  const skin = new THREE.MeshStandardMaterial({
    color: 0xd7b08d,
    roughness: 0.9,
  })

  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.24, 0.58, 6, 12),
    suit,
  )
  body.position.y = 1.04
  body.castShadow = true
  fallback.add(body)

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 16, 12),
    skin,
  )
  head.position.y = 1.68
  head.castShadow = true
  fallback.add(head)

  fallback.scale.setScalar(0.88)
  fallback.userData.proceduralFallback = true
  return fallback
}

function createIndicator(
  status: string,
): { statusLight: THREE.Mesh; selectionRing: THREE.Mesh } {
  const statusLight = new THREE.Mesh(
    new THREE.SphereGeometry(0.055, 12, 8),
    new THREE.MeshBasicMaterial({ color: statusColor(status) }),
  )
  statusLight.position.set(0.32, 1.96, 0)

  const selectionRing = new THREE.Mesh(
    new THREE.RingGeometry(0.38, 0.49, 36),
    new THREE.MeshBasicMaterial({
      color: 0x4a8ad4,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
    }),
  )
  selectionRing.rotation.x = -Math.PI / 2
  selectionRing.position.y = 0.025
  selectionRing.visible = false

  return { statusLight, selectionRing }
}

function setInteractive(root: THREE.Object3D, agentId: string): void {
  root.traverse((child) => {
    child.userData.agentId = agentId
  })
}

function availableClip(
  rigged: RiggedPresentation,
  candidates: string[],
): string {
  const byLower = new Map(
    [...rigged.actions.keys()].map((name) => [name.toLowerCase(), name]),
  )

  for (const candidate of candidates) {
    const resolved = byLower.get(candidate.toLowerCase())
    if (resolved) return resolved
  }

  return CLIPS.idle
}

function clipFor(runtime: RuntimeAgent): string {
  if (runtime.moving) return CLIPS.walk
  if (!runtime.rigged || !runtime.behavior) return CLIPS.idle

  return availableClip(
    runtime.rigged,
    BEHAVIOR_CLIP_CANDIDATES[runtime.behavior],
  )
}

function playRigged(runtime: RuntimeAgent, force = false): void {
  const rigged = runtime.rigged
  if (!rigged) return

  const desired = clipFor(runtime)
  const next = rigged.actions.get(desired) ?? rigged.actions.get(CLIPS.idle)
  if (!next) return

  const running =
    !runtime.moving &&
    ['RUNNING', 'STARTING', 'WORKING', 'PLANNING', 'ARRIVING'].includes(
      runtime.currentStatus.toUpperCase(),
    )
  const behaviorRate =
    runtime.behavior === 'WAITING_DECISION' ||
    runtime.behavior === 'PRAYER_QUIET'
      ? 0.72
      : runtime.behavior === 'PLANNING_MEETING' ||
          runtime.behavior === 'DESK_FOCUS'
        ? 1.04
        : 0.9
  next.setEffectiveTimeScale(
    runtime.moving
      ? 1
      : rigged.idleRate * (running ? behaviorRate : Math.min(1, behaviorRate)),
  )

  if (!force && rigged.activeClip === desired) return

  const previous = rigged.actions.get(rigged.activeClip)
  if (previous && previous !== next) previous.fadeOut(0.18)

  if (previous !== next || force) {
    next.reset().fadeIn(0.18).play()
  }
  rigged.activeClip = desired
}

async function attachRiggedPresentation(
  runtime: RuntimeAgent,
  profileKey: string,
  onReady?: () => void,
): Promise<void> {
  const appearance = officeCharacterAppearance(profileKey)
  const variantKey = appearance.variant

  try {
    const assets = await loadCharacterAssets(variantKey)
    if (runtime.disposed) return

    const variant = CHARACTER_VARIANTS[variantKey]
    const model = cloneSkinned(assets.source) as THREE.Group
    model.name = `agent-office-${variantKey}-character`
    model.rotation.y = MODEL_YAW_OFFSET
    const pivot = new THREE.Group()
    pivot.name = `agent-office-${variantKey}-presentation`
    pivot.add(model)
    model.scale.setScalar(variant.scale * appearance.scale)

    const ownedMaterials: THREE.Material[] = []
    const accent = new THREE.Color(appearance.accent)

    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      object.castShadow = true
      object.receiveShadow = false

      const cloneSurface = (surface: THREE.Material): THREE.Material => {
        const copy = surface.clone()
        if (copy instanceof THREE.MeshStandardMaterial) {
          copy.roughness = Math.max(0.72, copy.roughness)
          copy.metalness = 0

          const hsl = { h: 0, s: 0, l: 0 }
          copy.color.getHSL(hsl)
          if (hsl.l < 0.64) {
            copy.color.lerp(accent, 0.3)
          }
        }
        ownedMaterials.push(copy)
        return copy
      }

      object.material = Array.isArray(object.material)
        ? object.material.map(cloneSurface)
        : cloneSurface(object.material)
    })

    setInteractive(model, runtime.agentId)

    const mixer = new THREE.AnimationMixer(model)
    const actions = new Map<string, THREE.AnimationAction>()
    assets.clips.forEach((clip, name) => {
      const action = mixer.clipAction(clip)
      action.setLoop(THREE.LoopRepeat, Infinity)
      if (
        (name === CLIPS.idle || name.endsWith('_Idle_Loop')) &&
        clip.duration > 0
      ) {
        action.time = clip.duration * appearance.idlePhase
      }
      actions.set(name, action)
    })

    runtime.root.add(pivot)
    runtime.rigged = {
      pivot,
      model,
      mixer,
      actions,
      ownedMaterials,
      activeClip: '',
      idleRate: appearance.idleRate,
    }
    runtime.fallback.visible = false
    playRigged(runtime, true)
    onReady?.()
  } catch (error) {
    console.warn(
      `Office character variant ${variantKey} unavailable; using local fallback.`,
      error,
    )
    onReady?.()
  }
}

export function createCharacterRuntime(
  agent: OfficeCharacterSource,
  name: string,
  station: StationPlacement,
  onVisualReady?: () => void,
): RuntimeAgent {
  const root = new THREE.Group()
  root.userData.agentId = agent.id
  root.position.copy(station.position)
  root.rotation.y = station.yaw

  const fallback = createFallback(agent.agent_profile_key)
  root.add(fallback)

  const { statusLight, selectionRing } = createIndicator(agent.status)
  root.add(statusLight, selectionRing)

  const { object: label, element: labelElement } = createNameplate(
    name,
    agent.behavior
      ? officeBehaviorLabel(agent.behavior)
      : officeAgentState(agent.status).label,
    agent.agent_profile_key,
  )
  root.add(label)

  setInteractive(fallback, agent.id)

  const runtime: RuntimeAgent = {
    agentId: agent.id,
    name,
    root,
    fallback,
    statusLight,
    selectionRing,
    label,
    labelElement,
    target: station.position.clone(),
    path: [],
    station: station.position.clone(),
    stationYaw: station.yaw,
    targetYaw: station.yaw,
    finalStatus: agent.status,
    currentStatus: agent.status,
    behavior: agent.behavior ?? null,
    moving: false,
    pendingStatus: null,
    pendingStatusAt: null,
    rigged: null,
    disposed: false,
    lastAnimationAt: null,
  }

  void attachRiggedPresentation(
    runtime,
    agent.agent_profile_key,
    onVisualReady,
  )
  return runtime
}

export function setCharacterStatus(
  runtime: RuntimeAgent,
  status: string,
): void {
  runtime.currentStatus = status

  ;(runtime.statusLight.material as THREE.MeshBasicMaterial).color.setHex(
    statusColor(status),
  )

  runtime.labelElement.className = [
    'office-avatar-nameplate',
    `state-${officeAgentState(status).key}`,
  ].join(' ')

  const secondary = runtime.labelElement.querySelector('span')
  if (secondary) {
    secondary.textContent = runtime.behavior
      ? officeBehaviorLabel(runtime.behavior)
      : officeAgentState(status).label
  }

  const selected = runtime.labelElement.classList.contains('is-selected')
  runtime.labelElement.classList.toggle(
    'is-nameplate-visible',
    shouldShowOfficeNameplate(status, selected),
  )

  playRigged(runtime)
}

export function setCharacterBehavior(
  runtime: RuntimeAgent,
  behavior: OfficeBehaviorKey | null,
): void {
  runtime.behavior = behavior
  const secondary = runtime.labelElement.querySelector('span')
  if (secondary) {
    secondary.textContent = behavior
      ? officeBehaviorLabel(behavior)
      : officeAgentState(runtime.currentStatus).label
  }
  playRigged(runtime, true)
}

export function setCharacterSelected(
  runtime: RuntimeAgent,
  selected: boolean,
): void {
  runtime.selectionRing.visible = selected
  runtime.labelElement.classList.toggle('is-selected', selected)
  runtime.labelElement.classList.toggle(
    'is-nameplate-visible',
    shouldShowOfficeNameplate(runtime.currentStatus, selected),
  )
}

function animateFallback(
  runtime: RuntimeAgent,
  now: number,
  motionPaused: boolean,
): boolean {
  if (motionPaused) {
    runtime.fallback.position.y = 0
    runtime.fallback.rotation.set(0, 0, 0)
    return false
  }

  if (runtime.moving) {
    const phase = now * 0.009
    runtime.fallback.position.y =
      Math.abs(Math.sin(phase * 2)) * 0.04
    runtime.fallback.rotation.z = Math.sin(phase) * 0.03
    return true
  }

  const active = ['RUNNING', 'WORKING', 'PLANNING'].includes(
    runtime.currentStatus.toUpperCase(),
  )
  runtime.fallback.position.y = active
    ? Math.sin(now * 0.0025) * 0.012
    : 0
  return active
}

export function animateCharacter(
  runtime: RuntimeAgent,
  now: number,
  motionPaused: boolean,
): boolean {
  const previous = runtime.lastAnimationAt ?? now
  const delta = Math.min(0.05, Math.max(0, (now - previous) / 1000))
  runtime.lastAnimationAt = now

  if (!runtime.rigged) {
    return animateFallback(runtime, now, motionPaused)
  }

  playRigged(runtime)
  if (motionPaused) return false

  runtime.rigged.mixer.update(delta)
  return (
    runtime.moving ||
    [
      'RUNNING',
      'STARTING',
      'WORKING',
      'PLANNING',
      'ARRIVING',
      'WAITING',
      'WAITING_USER',
      'WAITING_WORK',
      'COFFEE_BREAK',
      'LUNCH_BREAK',
      'SOCIAL_BREAK',
      'PRAYER_BREAK',
      'BLOCKED',
      'FAILED',
    ].includes(
      runtime.currentStatus.toUpperCase(),
    )
  )
}

export function disposeCharacter(runtime: RuntimeAgent): void {
  runtime.disposed = true
  runtime.labelElement.remove()

  if (runtime.rigged) {
    runtime.rigged.mixer.stopAllAction()
    runtime.rigged.mixer.uncacheRoot(runtime.rigged.model)
    runtime.rigged.ownedMaterials.forEach((material) => material.dispose())
    runtime.root.remove(runtime.rigged.pivot)
  }

  runtime.fallback.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    object.geometry.dispose()
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material]
    materials.forEach((material) => material.dispose())
  })

  runtime.statusLight.geometry.dispose()
  ;(runtime.statusLight.material as THREE.Material).dispose()
  runtime.selectionRing.geometry.dispose()
  ;(runtime.selectionRing.material as THREE.Material).dispose()
}
