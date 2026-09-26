import * as THREE from 'three'
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js'

import type { AgentRun } from '../api'
import { officeAgentState } from '../officeProjection'

export interface StationPlacement {
  position: THREE.Vector3
  yaw: number
}

export interface RuntimeAgent {
  agentId: string
  name: string
  root: THREE.Group
  body: THREE.Group
  headPivot: THREE.Group
  leftArmPivot: THREE.Group
  rightArmPivot: THREE.Group
  leftLegPivot: THREE.Group
  rightLegPivot: THREE.Group
  leftFoot: THREE.Mesh
  rightFoot: THREE.Mesh
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
}

function stableHash(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function shirtColor(value: string): number {
  const palette = [
    0x4773a8,
    0x7b6398,
    0x43816c,
    0xa36d4d,
    0x526f8d,
    0x965f82,
    0x4d817f,
    0x8b744d,
  ]
  return palette[stableHash(value) % palette.length]
}

function skinColor(value: string): number {
  const palette = [0xf0c7a7, 0xe6ba98, 0xdca983, 0xca946f, 0xb67f5f]
  return palette[(stableHash(value) >> 3) % palette.length]
}

function hairColor(value: string): number {
  const palette = [0x2e3138, 0x4b352d, 0x6a4c37, 0x2f3b48, 0x5a463d]
  return palette[(stableHash(value) >> 6) % palette.length]
}

export function statusColor(status: string): number {
  switch (status.toUpperCase()) {
    case 'RUNNING':
    case 'COMPLETED':
      return 0x1d8b5a
    case 'STARTING':
    case 'WAITING':
      return 0xb7791f
    case 'BLOCKED':
    case 'FAILED':
      return 0xb42318
    default:
      return 0x7b8494
  }
}

function standardMaterial(color: number, roughness = 0.74): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness: 0.02,
  })
}

function capsule(
  radius: number,
  length: number,
  color: number,
  radialSegments = 10,
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(radius, length, 6, radialSegments),
    standardMaterial(color),
  )
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

function box(
  size: [number, number, number],
  color: number,
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(...size),
    standardMaterial(color),
  )
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
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
  object.position.set(0, 2.48, 0)
  return { object, element }
}

function setInteractive(root: THREE.Object3D, agentId: string): void {
  root.traverse((child) => {
    child.userData.agentId = agentId
  })
}

export function createCharacterRuntime(
  agent: AgentRun,
  name: string,
  station: StationPlacement,
): RuntimeAgent {
  const root = new THREE.Group()
  root.userData.agentId = agent.id
  root.position.copy(station.position)
  root.rotation.y = station.yaw
  root.scale.setScalar(0.78)

  const body = new THREE.Group()
  root.add(body)

  const hash = stableHash(agent.agent_profile_key)
  const shirt = shirtColor(agent.agent_profile_key)
  const skin = skinColor(agent.agent_profile_key)
  const hair = hairColor(agent.agent_profile_key)

  const contactShadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.48, 28),
    new THREE.MeshBasicMaterial({
      color: 0x18222f,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
    }),
  )
  contactShadow.rotation.x = -Math.PI / 2
  contactShadow.position.y = 0.018
  body.add(contactShadow)

  const pelvis = capsule(0.24, 0.16, 0x344255, 12)
  pelvis.scale.set(1.24, 1, 0.9)
  pelvis.position.set(0, 0.86, 0)
  body.add(pelvis)

  const torso = capsule(0.3, 0.45, shirt, 14)
  torso.scale.set(1.1, 1, 0.84)
  torso.position.set(0, 1.28, 0)
  body.add(torso)

  const collar = capsule(0.305, 0.06, 0xf0f3f7, 14)
  collar.scale.set(1.05, 1, 0.82)
  collar.position.set(0, 1.52, 0)
  body.add(collar)

  const headPivot = new THREE.Group()
  headPivot.position.set(0, 1.82, 0)
  body.add(headPivot)

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.31, 20, 16),
    standardMaterial(skin, 0.85),
  )
  head.castShadow = true
  headPivot.add(head)

  const nose = new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 8, 6),
    standardMaterial(skin, 0.82),
  )
  nose.scale.set(0.8, 0.9, 1.2)
  nose.position.set(0, -0.02, 0.305)
  headPivot.add(nose)

  const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x202631 })
  for (const x of [-0.09, 0.09]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), eyeMaterial)
    eye.position.set(x, 0.055, 0.292)
    headPivot.add(eye)
  }

  const hairCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.322, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.54),
    standardMaterial(hair, 0.9),
  )
  hairCap.position.y = 0.035
  hairCap.castShadow = true
  headPivot.add(hairCap)

  if (hash % 3 === 0) {
    const bun = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 12, 8),
      standardMaterial(hair, 0.9),
    )
    bun.position.set(0, 0.22, -0.22)
    bun.castShadow = true
    headPivot.add(bun)
  }

  const leftArmPivot = new THREE.Group()
  leftArmPivot.position.set(-0.41, 1.48, 0)
  body.add(leftArmPivot)
  const leftArm = capsule(0.085, 0.42, shirt, 9)
  leftArm.position.y = -0.27
  leftArmPivot.add(leftArm)
  const leftHand = new THREE.Mesh(
    new THREE.SphereGeometry(0.095, 10, 8),
    standardMaterial(skin, 0.85),
  )
  leftHand.position.y = -0.55
  leftArmPivot.add(leftHand)

  const rightArmPivot = new THREE.Group()
  rightArmPivot.position.set(0.41, 1.48, 0)
  body.add(rightArmPivot)
  const rightArm = capsule(0.085, 0.42, shirt, 9)
  rightArm.position.y = -0.27
  rightArmPivot.add(rightArm)
  const rightHand = new THREE.Mesh(
    new THREE.SphereGeometry(0.095, 10, 8),
    standardMaterial(skin, 0.85),
  )
  rightHand.position.y = -0.55
  rightArmPivot.add(rightHand)

  const trouserMaterial = standardMaterial(0x364255, 0.84)

  const leftLegPivot = new THREE.Group()
  leftLegPivot.position.set(-0.15, 0.73, 0)
  body.add(leftLegPivot)
  const leftLeg = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.105, 0.42, 6, 9),
    trouserMaterial,
  )
  leftLeg.position.y = -0.3
  leftLeg.castShadow = true
  leftLegPivot.add(leftLeg)

  const rightLegPivot = new THREE.Group()
  rightLegPivot.position.set(0.15, 0.73, 0)
  body.add(rightLegPivot)
  const rightLeg = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.105, 0.42, 6, 9),
    trouserMaterial.clone(),
  )
  rightLeg.position.y = -0.3
  rightLeg.castShadow = true
  rightLegPivot.add(rightLeg)

  const leftFoot = box([0.21, 0.12, 0.34], 0x253142)
  leftFoot.position.set(0, -0.56, 0.08)
  leftLegPivot.add(leftFoot)

  const rightFoot = box([0.21, 0.12, 0.34], 0x253142)
  rightFoot.position.set(0, -0.56, 0.08)
  rightLegPivot.add(rightFoot)

  const statusLight = new THREE.Mesh(
    new THREE.SphereGeometry(0.085, 12, 8),
    new THREE.MeshBasicMaterial({ color: statusColor(agent.status) }),
  )
  statusLight.position.set(0.42, 2.03, 0)
  body.add(statusLight)

  const selectionRing = new THREE.Mesh(
    new THREE.RingGeometry(0.52, 0.68, 40),
    new THREE.MeshBasicMaterial({
      color: 0x3b82d0,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    }),
  )
  selectionRing.rotation.x = -Math.PI / 2
  selectionRing.position.y = 0.025
  selectionRing.visible = false
  body.add(selectionRing)

  const { object: label, element: labelElement } = createNameplate(name, agent.status)
  root.add(label)

  setInteractive(body, agent.id)

  return {
    agentId: agent.id,
    name,
    root,
    body,
    headPivot,
    leftArmPivot,
    rightArmPivot,
    leftLegPivot,
    rightLegPivot,
    leftFoot,
    rightFoot,
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
  }
}

export function setCharacterStatus(runtime: RuntimeAgent, status: string): void {
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
}

function settleStanding(runtime: RuntimeAgent): void {
  runtime.body.position.y = 0
  runtime.body.rotation.set(0, 0, 0)
  runtime.leftArmPivot.rotation.set(0, 0, 0.06)
  runtime.rightArmPivot.rotation.set(0, 0, -0.06)
  runtime.leftLegPivot.rotation.set(0, 0, 0)
  runtime.rightLegPivot.rotation.set(0, 0, 0)
  runtime.leftFoot.rotation.set(0, 0, 0)
  runtime.rightFoot.rotation.set(0, 0, 0)
}

function poseWalk(runtime: RuntimeAgent, now: number): void {
  const phase = now * 0.011
  const swing = Math.sin(phase) * 0.62
  const counter = -swing

  runtime.body.position.y = Math.abs(Math.sin(phase * 2)) * 0.035
  runtime.body.rotation.z = Math.sin(phase) * 0.025
  runtime.leftLegPivot.rotation.x = swing
  runtime.rightLegPivot.rotation.x = counter
  runtime.leftArmPivot.rotation.x = counter * 0.72
  runtime.rightArmPivot.rotation.x = swing * 0.72
  runtime.headPivot.rotation.y = Math.sin(phase * 0.5) * 0.06
}

function poseWorking(runtime: RuntimeAgent, now: number): void {
  const phase = now * 0.008
  runtime.body.position.y = -0.17 + Math.sin(phase * 0.7) * 0.012
  runtime.body.rotation.x = -0.08
  runtime.leftLegPivot.rotation.x = -0.96
  runtime.rightLegPivot.rotation.x = -0.96
  runtime.leftArmPivot.rotation.x = -1.08 + Math.sin(phase * 2.2) * 0.08
  runtime.rightArmPivot.rotation.x = -1.08 - Math.sin(phase * 2.4) * 0.08
  runtime.leftArmPivot.rotation.z = 0.14
  runtime.rightArmPivot.rotation.z = -0.14
  runtime.headPivot.rotation.x = -0.12
  runtime.headPivot.rotation.y = Math.sin(phase * 0.55) * 0.08
}

function poseWaiting(runtime: RuntimeAgent, now: number): void {
  const phase = now * 0.0028
  settleStanding(runtime)
  runtime.body.position.y = Math.sin(phase) * 0.015
  runtime.headPivot.rotation.y = Math.sin(phase * 1.8) * 0.16
  runtime.leftArmPivot.rotation.z = 0.1
  runtime.rightArmPivot.rotation.z = -0.1
}

function poseAlert(runtime: RuntimeAgent, now: number): void {
  const phase = now * 0.004
  settleStanding(runtime)
  runtime.body.rotation.z = Math.sin(phase) * 0.018
  runtime.headPivot.rotation.y = Math.sin(phase * 1.4) * 0.1
}

export function animateCharacter(
  runtime: RuntimeAgent,
  now: number,
  motionPaused: boolean,
): boolean {
  runtime.selectionRing.rotation.z = 0

  if (motionPaused) {
    settleStanding(runtime)
    return false
  }

  if (runtime.moving) {
    poseWalk(runtime, now)
    return true
  }

  switch (runtime.currentStatus.toUpperCase()) {
    case 'RUNNING':
    case 'STARTING':
      poseWorking(runtime, now)
      return true
    case 'WAITING':
      poseWaiting(runtime, now)
      return true
    case 'BLOCKED':
    case 'FAILED':
      poseAlert(runtime, now)
      return true
    default:
      settleStanding(runtime)
      runtime.headPivot.rotation.x = 0
      runtime.headPivot.rotation.y = 0
      return false
  }
}

export function disposeCharacter(runtime: RuntimeAgent): void {
  runtime.labelElement.remove()
  runtime.root.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.geometry.dispose()
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material]
      materials.forEach((material) => material.dispose())
    }
  })
}
