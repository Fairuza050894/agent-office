import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'

import type { AgentRun } from '../api'
import { officeAgentState } from '../officeProjection'

const CHARACTER_URL = '/assets/office/quaternius-business-man.glb'
const MODEL_YAW_OFFSET = Math.PI

const CLIPS = {
  idle: 'CharacterArmature|Idle_Neutral',
  walk: 'CharacterArmature|Walk',
  work: 'CharacterArmature|Interact',
} as const

interface CharacterAssets {
  source: THREE.Group
  clips: Map<string, THREE.AnimationClip>
}

interface RiggedPresentation {
  model: THREE.Group
  mixer: THREE.AnimationMixer
  actions: Map<string, THREE.AnimationAction>
  ownedMaterials: THREE.Material[]
  activeClip: string
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
  finalStatus: string
  currentStatus: string
  moving: boolean
  pendingStatus: string | null
  pendingStatusAt: number | null
  rigged: RiggedPresentation | null
  disposed: boolean
  lastAnimationAt: number | null
}

let assetPromise: Promise<CharacterAssets> | null = null

function loadCharacterAssets(): Promise<CharacterAssets> {
  if (assetPromise) return assetPromise

  const loader = new GLTFLoader()
  assetPromise = loader.loadAsync(CHARACTER_URL).then((character) => ({
    source: character.scene,
    clips: new Map(character.animations.map((clip) => [clip.name, clip])),
  }))

  assetPromise.catch(() => {
    assetPromise = null
  })

  return assetPromise
}

function stableHash(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function suitTint(value: string): THREE.Color {
  const palette = [
    0x43566f,
    0x52615a,
    0x5b526d,
    0x67534b,
    0x465f64,
    0x5f5360,
  ]
  return new THREE.Color(palette[stableHash(value) % palette.length])
}

export function statusColor(status: string): number {
  switch (status.toUpperCase()) {
    case 'RUNNING':
    case 'COMPLETED':
      return 0x2fb176
    case 'STARTING':
    case 'WAITING':
      return 0xd09a35
    case 'BLOCKED':
    case 'FAILED':
      return 0xd24e43
    default:
      return 0x8491a3
  }
}

function createNameplate(name: string, status: string): {
  object: CSS2DObject
  element: HTMLDivElement
} {
  const element = document.createElement('div')
  element.className = 'office-avatar-nameplate'
  element.setAttribute('aria-hidden', 'true')

  const primary = document.createElement('strong')
  primary.textContent = name
  const secondary = document.createElement('span')
  secondary.textContent = officeAgentState(status).label
  element.append(primary, secondary)

  const object = new CSS2DObject(element)
  object.position.set(0, 2.16, 0)
  return { object, element }
}

function createFallback(profileKey: string): THREE.Group {
  const fallback = new THREE.Group()
  const palette = [0x43566f, 0x52615a, 0x5b526d, 0x67534b]
  const suit = new THREE.MeshStandardMaterial({
    color: palette[stableHash(profileKey) % palette.length],
    roughness: 0.8,
    metalness: 0.02,
  })
  const skin = new THREE.MeshStandardMaterial({
    color: 0xd7b08d,
    roughness: 0.88,
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
    new THREE.SphereGeometry(0.06, 12, 8),
    new THREE.MeshBasicMaterial({ color: statusColor(status) }),
  )
  statusLight.position.set(0.34, 1.94, 0)

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

function clipFor(runtime: RuntimeAgent): string {
  if (runtime.moving) return CLIPS.walk

  switch (runtime.currentStatus.toUpperCase()) {
    case 'RUNNING':
    case 'STARTING':
      return CLIPS.work
    default:
      return CLIPS.idle
  }
}

function playRigged(runtime: RuntimeAgent, force = false): void {
  const rigged = runtime.rigged
  if (!rigged) return

  const desired = clipFor(runtime)
  const next = rigged.actions.get(desired) ?? rigged.actions.get(CLIPS.idle)
  if (!next) return
  if (!force && rigged.activeClip === desired) return

  const previous = rigged.actions.get(rigged.activeClip)
  if (previous && previous !== next) previous.fadeOut(0.16)

  if (previous !== next || force) {
    next.reset().fadeIn(0.16).play()
  }
  rigged.activeClip = desired
}

async function attachRiggedPresentation(
  runtime: RuntimeAgent,
  profileKey: string,
  onReady?: () => void,
): Promise<void> {
  try {
    const assets = await loadCharacterAssets()
    if (runtime.disposed) return

    const model = cloneSkinned(assets.source) as THREE.Group
    model.name = 'agent-office-business-character'
    model.rotation.y = MODEL_YAW_OFFSET
    model.scale.setScalar(0.95)

    const ownedMaterials: THREE.Material[] = []
    const tint = suitTint(profileKey)

    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      object.castShadow = true
      object.receiveShadow = false

      const cloneSurface = (surface: THREE.Material): THREE.Material => {
        const copy = surface.clone()
        if (copy instanceof THREE.MeshStandardMaterial) {
          copy.roughness = Math.max(0.65, copy.roughness)
          copy.metalness = 0
          const identity = `${object.name} ${copy.name}`.toLowerCase()
          if (
            identity.includes('suit') ||
            identity.includes('body') ||
            identity.includes('legs')
          ) {
            copy.color.lerp(tint, 0.34)
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
    for (const name of Object.values(CLIPS)) {
      const clip = assets.clips.get(name)
      if (!clip) continue
      const action = mixer.clipAction(clip)
      action.setLoop(THREE.LoopRepeat, Infinity)
      actions.set(name, action)
    }

    runtime.root.add(model)
    runtime.rigged = {
      model,
      mixer,
      actions,
      ownedMaterials,
      activeClip: '',
    }
    runtime.fallback.visible = false
    playRigged(runtime, true)
    onReady?.()
  } catch (error) {
    console.warn(
      'Business character unavailable; using local fallback.',
      error,
    )
    onReady?.()
  }
}

export function createCharacterRuntime(
  agent: AgentRun,
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
    agent.status,
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
    finalStatus: agent.status,
    currentStatus: agent.status,
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
  if (secondary) secondary.textContent = officeAgentState(status).label

  playRigged(runtime)
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

  runtime.fallback.position.y =
    runtime.currentStatus.toUpperCase() === 'RUNNING'
      ? Math.sin(now * 0.0025) * 0.012
      : 0
  return runtime.currentStatus.toUpperCase() === 'RUNNING'
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
  return true
}

export function disposeCharacter(runtime: RuntimeAgent): void {
  runtime.disposed = true
  runtime.labelElement.remove()

  if (runtime.rigged) {
    runtime.rigged.mixer.stopAllAction()
    runtime.rigged.mixer.uncacheRoot(runtime.rigged.model)
    runtime.rigged.ownedMaterials.forEach((material) => material.dispose())
    runtime.root.remove(runtime.rigged.model)
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
