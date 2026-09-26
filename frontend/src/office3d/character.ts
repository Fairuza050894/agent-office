import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'

import type { AgentRun } from '../api'
import { officeAgentState } from '../officeProjection'

const CHARACTER_URL =
  '/assets/office/quaternius-office-character.glb'
const ANIMATION_URL =
  '/assets/office/quaternius-universal-animation-library.glb'

const LOOP_CLIPS = [
  'Idle_Loop',
  'Walk_Loop',
  'Jog_Fwd_Loop',
  'Sitting_Idle',
  'Sitting_Talking',
  'Idle_Talking_Loop',
] as const

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
  localZ: number
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
  assetPromise = Promise.all([
    loader.loadAsync(CHARACTER_URL),
    loader.loadAsync(ANIMATION_URL),
  ]).then(([character, animations]) => {
    const clips = new Map(
      animations.animations.map((clip) => [clip.name, clip]),
    )

    animations.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      object.geometry.dispose()
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material]
      materials.forEach((material) => material.dispose())
    })

    return {
      source: character.scene,
      clips,
    }
  })

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
  object.position.set(0, 2.02, 0)
  return { object, element }
}

function createFallback(profileKey: string): THREE.Group {
  const fallback = new THREE.Group()
  const palette = [
    0x5277a4,
    0x667b55,
    0x8d6758,
    0x6e618f,
    0x4f7a78,
  ]
  const material = new THREE.MeshStandardMaterial({
    color: palette[stableHash(profileKey) % palette.length],
    roughness: 0.72,
    metalness: 0.02,
  })
  const skin = new THREE.MeshStandardMaterial({
    color: 0xd7b08d,
    roughness: 0.86,
  })

  const torso = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.24, 0.55, 6, 12),
    material,
  )
  torso.position.y = 1.02
  torso.castShadow = true
  fallback.add(torso)

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.25, 16, 12),
    skin,
  )
  head.position.y = 1.62
  head.castShadow = true
  fallback.add(head)

  fallback.scale.setScalar(0.86)
  fallback.userData.proceduralFallback = true
  return fallback
}

function createIndicator(
  status: string,
): { statusLight: THREE.Mesh; selectionRing: THREE.Mesh } {
  const statusLight = new THREE.Mesh(
    new THREE.SphereGeometry(0.065, 12, 8),
    new THREE.MeshBasicMaterial({ color: statusColor(status) }),
  )
  statusLight.position.set(0.34, 1.74, 0)

  const selectionRing = new THREE.Mesh(
    new THREE.RingGeometry(0.4, 0.5, 36),
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
  if (runtime.moving) return 'Walk_Loop'

  switch (runtime.currentStatus.toUpperCase()) {
    case 'RUNNING':
      return 'Sitting_Idle'
    case 'COMPLETED':
      return 'Sitting_Idle'
    case 'WAITING':
      return 'Idle_Loop'
    case 'BLOCKED':
    case 'FAILED':
      return 'Idle_Talking_Loop'
    default:
      return 'Idle_Loop'
  }
}

function playRigged(runtime: RuntimeAgent, force = false): void {
  const rigged = runtime.rigged
  if (!rigged) return

  const desired = clipFor(runtime)
  const next =
    rigged.actions.get(desired) ??
    rigged.actions.get('Idle_Loop')

  if (!next) return
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
  onReady?: () => void,
): Promise<void> {
  try {
    const assets = await loadCharacterAssets()
    if (runtime.disposed) return

    const model = cloneSkinned(assets.source) as THREE.Group
    model.name = 'agent-office-rigged-character'
    model.rotation.y = Math.PI
    model.scale.setScalar(0.86)

    const ownedMaterials: THREE.Material[] = []
    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      object.castShadow = true
      object.receiveShadow = false

      const cloneSurface = (surface: THREE.Material): THREE.Material => {
        const copy = surface.clone()
        if (copy instanceof THREE.MeshStandardMaterial) {
          copy.roughness = Math.max(0.48, copy.roughness)
          copy.metalness = Math.min(0.18, copy.metalness)
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
    for (const name of LOOP_CLIPS) {
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
      localZ: 0,
    }
    runtime.fallback.visible = false
    playRigged(runtime, true)
    onReady?.()
  } catch (error) {
    console.warn(
      'Rigged Office View character unavailable; using local fallback.',
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

  void attachRiggedPresentation(runtime, onVisualReady)
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
      Math.abs(Math.sin(phase * 2)) * 0.045
    runtime.fallback.rotation.z = Math.sin(phase) * 0.035
    return true
  }

  if (
    ['RUNNING', 'WAITING', 'BLOCKED', 'FAILED'].includes(
      runtime.currentStatus.toUpperCase(),
    )
  ) {
    runtime.fallback.position.y =
      Math.sin(now * 0.0025) * 0.018
    return true
  }

  runtime.fallback.position.y = 0
  runtime.fallback.rotation.set(0, 0, 0)
  return false
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

  const rigged = runtime.rigged
  playRigged(runtime)

  const seated =
    !runtime.moving &&
    ['RUNNING', 'COMPLETED'].includes(
      runtime.currentStatus.toUpperCase(),
    )
  const targetZ = seated ? 0.28 : 0
  rigged.localZ = THREE.MathUtils.lerp(
    rigged.localZ,
    targetZ,
    motionPaused ? 1 : Math.min(1, delta * 6),
  )
  rigged.model.position.z = rigged.localZ

  if (motionPaused) return false

  rigged.mixer.update(delta)
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
