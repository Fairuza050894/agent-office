import { useCallback, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

import type { AgentProfile, AgentRun, RunStage } from '../api'
import { officeAgentState } from '../officeProjection'

export interface ThreeOfficeSceneProps {
  stages: RunStage[]
  agents: AgentRun[]
  profiles: AgentProfile[]
  selectedAgentId: string | null
  onSelectAgent: (agentId: string) => void
  motionPaused: boolean
  mode: 'live' | 'replay'
  replayNonce: number
}

interface RuntimeAgent {
  agentId: string
  name: string
  group: THREE.Group
  leftLeg: THREE.Mesh
  rightLeg: THREE.Mesh
  statusLight: THREE.Mesh
  selectionRing: THREE.Mesh
  label: THREE.Sprite
  labelTexture: THREE.CanvasTexture
  target: THREE.Vector3
  path: THREE.Vector3[]
  station: THREE.Vector3
  finalStatus: string
  currentStatus: string
  moving: boolean
}

interface ReplayEvent {
  at: number
  type: 'start' | 'finish'
  agentId: string
}

interface Engine {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  environment: THREE.Group
  agents: THREE.Group
  runtimes: Map<string, RuntimeAgent>
  clickable: THREE.Object3D[]
  frame: number | null
  lastFrameAt: number
  replayStartedAt: number | null
  replayEvents: ReplayEvent[]
  replayIndex: number
  disposed: boolean
}

const STAGE_CENTERS = [
  new THREE.Vector3(-6.3, 0, -3.6),
  new THREE.Vector3(0, 0, -3.6),
  new THREE.Vector3(6.3, 0, -3.6),
  new THREE.Vector3(-6.3, 0, 3.6),
  new THREE.Vector3(0, 0, 3.6),
  new THREE.Vector3(6.3, 0, 3.6),
]

const ENTRANCE = new THREE.Vector3(-10.1, 0, 6.6)
const WAITING = new THREE.Vector3(-9.6, 0, -6.3)
const INCIDENT = new THREE.Vector3(9.6, 0, -6.3)
const CORRIDOR_Z = 0

function stableHash(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function agentColor(value: string): number {
  const palette = [0x4f6d9a, 0x6d5b8c, 0x3f7b6a, 0x8a6547, 0x5f7087, 0x775d78]
  return palette[stableHash(value) % palette.length]
}

function statusColor(status: string): number {
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

function stageColor(status: string): number {
  switch (status.toUpperCase()) {
    case 'RUNNING':
      return 0xdde8f3
    case 'COMPLETED':
      return 0xdfe9e3
    case 'WAITING':
      return 0xf0e7d6
    case 'BLOCKED':
    case 'FAILED':
      return 0xf0dedb
    default:
      return 0xe6e9ed
  }
}

function stageCenter(index: number): THREE.Vector3 {
  if (index < STAGE_CENTERS.length) return STAGE_CENTERS[index].clone()
  const row = Math.floor(index / 3)
  const column = index % 3
  return new THREE.Vector3((column - 1) * 6.3, 0, (row - 0.5) * 7.2)
}

function stationOffset(index: number, count: number): THREE.Vector3 {
  if (count <= 1) return new THREE.Vector3(0, 0, 0.2)
  const offsets = [
    new THREE.Vector3(-1.25, 0, -0.55),
    new THREE.Vector3(1.25, 0, 0.55),
    new THREE.Vector3(-1.2, 0, 1.15),
    new THREE.Vector3(1.2, 0, -1.15),
  ]
  return offsets[index % offsets.length]
}

function bayOffset(index: number): THREE.Vector3 {
  const column = index % 3
  const row = Math.floor(index / 3)
  return new THREE.Vector3((column - 1) * 0.82, 0, (row - 1) * 0.72)
}

function makeTextSprite(text: string, secondary?: string): {
  sprite: THREE.Sprite
  texture: THREE.CanvasTexture
} {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 128
  const context = canvas.getContext('2d')
  if (!context) throw new Error('2D canvas context is unavailable.')

  context.clearRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = 'rgba(18, 25, 37, 0.88)'
  context.roundRect(8, 10, 496, 106, 12)
  context.fill()
  context.fillStyle = '#f7f9fb'
  context.font = '600 30px system-ui, sans-serif'
  context.fillText(text, 24, 55)
  if (secondary) {
    context.fillStyle = '#b7c0cc'
    context.font = '500 20px ui-monospace, monospace'
    context.fillText(secondary, 24, 91)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearFilter
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
  })
  const sprite = new THREE.Sprite(material)
  sprite.scale.set(2.7, 0.68, 1)
  sprite.renderOrder = 20
  return { sprite, texture }
}

function addBox(
  parent: THREE.Object3D,
  size: [number, number, number],
  position: [number, number, number],
  color: number,
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(...size),
    new THREE.MeshStandardMaterial({ color, roughness: 0.76, metalness: 0.04 }),
  )
  mesh.position.set(...position)
  mesh.castShadow = true
  mesh.receiveShadow = true
  parent.add(mesh)
  return mesh
}

function createDesk(position: THREE.Vector3): THREE.Group {
  const desk = new THREE.Group()
  desk.position.copy(position)
  addBox(desk, [1.7, 0.12, 0.78], [0, 0.7, 0], 0xb9c1cb)
  addBox(desk, [0.1, 0.66, 0.1], [-0.72, 0.35, -0.28], 0x8b95a3)
  addBox(desk, [0.1, 0.66, 0.1], [0.72, 0.35, -0.28], 0x8b95a3)
  addBox(desk, [0.1, 0.66, 0.1], [-0.72, 0.35, 0.28], 0x8b95a3)
  addBox(desk, [0.1, 0.66, 0.1], [0.72, 0.35, 0.28], 0x8b95a3)
  addBox(desk, [0.82, 0.48, 0.08], [0, 1.08, -0.08], 0x2c3543)
  addBox(desk, [0.68, 0.34, 0.025], [0, 1.08, -0.13], 0x7890ab)
  addBox(desk, [0.06, 0.38, 0.06], [0, 0.88, 0], 0x687384)
  return desk
}

function createAgentRuntime(
  agent: AgentRun,
  name: string,
  station: THREE.Vector3,
): RuntimeAgent {
  const group = new THREE.Group()
  group.userData.agentId = agent.id
  const color = agentColor(agent.agent_profile_key)

  const body = addBox(group, [0.56, 0.68, 0.38], [0, 0.86, 0], color)
  body.userData.agentId = agent.id

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.27, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0xe5c4a7, roughness: 0.8 }),
  )
  head.position.set(0, 1.43, 0)
  head.castShadow = true
  head.userData.agentId = agent.id
  group.add(head)

  const leftLeg = addBox(group, [0.17, 0.48, 0.18], [-0.16, 0.35, 0], 0x394354)
  const rightLeg = addBox(group, [0.17, 0.48, 0.18], [0.16, 0.35, 0], 0x394354)
  leftLeg.userData.agentId = agent.id
  rightLeg.userData.agentId = agent.id

  const statusLight = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 12, 8),
    new THREE.MeshBasicMaterial({ color: statusColor(agent.status) }),
  )
  statusLight.position.set(0.43, 1.52, 0)
  group.add(statusLight)

  const selectionRing = new THREE.Mesh(
    new THREE.RingGeometry(0.54, 0.66, 32),
    new THREE.MeshBasicMaterial({
      color: 0x3f7ad6,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
    }),
  )
  selectionRing.rotation.x = -Math.PI / 2
  selectionRing.position.y = 0.025
  selectionRing.visible = false
  group.add(selectionRing)

  const { sprite: label, texture: labelTexture } = makeTextSprite(
    name,
    officeAgentState(agent.status).label,
  )
  label.position.set(0, 2.15, 0)
  group.add(label)
  group.position.copy(station)

  return {
    agentId: agent.id,
    name,
    group,
    leftLeg,
    rightLeg,
    statusLight,
    selectionRing,
    label,
    labelTexture,
    target: station.clone(),
    path: [],
    station: station.clone(),
    finalStatus: agent.status,
    currentStatus: agent.status,
    moving: false,
  }
}

function replaceAgentLabel(runtime: RuntimeAgent, status: string): void {
  const oldMaterial = runtime.label.material
  runtime.group.remove(runtime.label)
  runtime.labelTexture.dispose()
  oldMaterial.dispose()
  const { sprite, texture } = makeTextSprite(
    runtime.name,
    officeAgentState(status).label,
  )
  sprite.position.set(0, 2.15, 0)
  runtime.label = sprite
  runtime.labelTexture = texture
  runtime.group.add(sprite)
}

function buildPath(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3[] {
  if (from.distanceTo(to) < 0.08) return []
  const points = [
    new THREE.Vector3(from.x, 0, CORRIDOR_Z),
    new THREE.Vector3(to.x, 0, CORRIDOR_Z),
    to.clone(),
  ]
  return points.filter((point, index) => {
    const previous = index === 0 ? from : points[index - 1]
    return previous.distanceTo(point) > 0.08
  })
}

function stateTarget(runtime: RuntimeAgent, status: string, index: number): THREE.Vector3 {
  switch (status.toUpperCase()) {
    case 'WAITING':
      return WAITING.clone().add(bayOffset(index))
    case 'BLOCKED':
    case 'FAILED':
      return INCIDENT.clone().add(bayOffset(index))
    default:
      return runtime.station.clone()
  }
}

function disposeObject(root: THREE.Object3D): void {
  root.traverse((object) => {
    const disposableTexture = object.userData.disposableTexture as THREE.Texture | undefined
    disposableTexture?.dispose()

    if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
      object.geometry.dispose()
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      materials.forEach((material) => material.dispose())
    }
    if (object instanceof THREE.Sprite) {
      object.material.map?.dispose()
      object.material.dispose()
    }
  })
}

function clearGroup(group: THREE.Group): void {
  for (const child of [...group.children]) {
    disposeObject(child)
    group.remove(child)
  }
}

function createEnvironment(
  engine: Engine,
  stages: RunStage[],
  agents: AgentRun[],
): Map<string, THREE.Vector3> {
  clearGroup(engine.environment)

  const floor = addBox(engine.environment, [22, 0.26, 16], [0, -0.18, 0], 0xe5e8ec)
  floor.receiveShadow = true

  const grid = new THREE.GridHelper(22, 22, 0xc5cbd3, 0xd8dde3)
  grid.position.y = -0.035
  grid.scale.z = 16 / 22
  engine.environment.add(grid)

  addBox(engine.environment, [22, 1.1, 0.2], [0, 0.45, -7.9], 0xcbd2da)
  addBox(engine.environment, [0.2, 1.1, 16], [-10.9, 0.45, 0], 0xcbd2da)
  addBox(engine.environment, [0.2, 1.1, 16], [10.9, 0.45, 0], 0xcbd2da)

  const stations = new Map<string, THREE.Vector3>()
  const sortedStages = stages.slice().sort((a, b) => a.order_hint - b.order_hint)

  sortedStages.forEach((stage, stageIndex) => {
    const center = stageCenter(stageIndex)
    const tile = addBox(
      engine.environment,
      [5.55, 0.1, 5.25],
      [center.x, 0.02, center.z],
      stageColor(stage.status),
    )
    tile.receiveShadow = true

    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(tile.geometry),
      new THREE.LineBasicMaterial({ color: 0xaab3bf }),
    )
    edges.position.copy(tile.position)
    engine.environment.add(edges)

    const { sprite, texture } = makeTextSprite(
      stage.stage_key,
      `Stage ${stage.order_hint} · ${stage.status}`,
    )
    sprite.position.set(center.x, 0.42, center.z - 2.25)
    sprite.scale.set(2.9, 0.72, 1)
    sprite.userData.disposableTexture = texture
    engine.environment.add(sprite)

    const stageAgents = agents.filter((agent) => agent.stage_key === stage.stage_key)
    stageAgents.forEach((agent, agentIndex) => {
      const station = center.clone().add(stationOffset(agentIndex, stageAgents.length))
      stations.set(agent.id, station)
      engine.environment.add(
        createDesk(station.clone().add(new THREE.Vector3(0, 0, -0.72))),
      )
    })
  })

  const zones = [
    { name: 'ENTRANCE', point: ENTRANCE, color: 0xdde4ed },
    { name: 'WAITING', point: WAITING, color: 0xeee5d4 },
    { name: 'INCIDENT', point: INCIDENT, color: 0xefdeda },
  ]
  zones.forEach((zone) => {
    addBox(engine.environment, [2.6, 0.08, 1.7], [zone.point.x, 0, zone.point.z], zone.color)
    const { sprite, texture } = makeTextSprite(zone.name)
    sprite.position.set(zone.point.x, 0.45, zone.point.z)
    sprite.scale.set(1.8, 0.45, 1)
    sprite.userData.disposableTexture = texture
    engine.environment.add(sprite)
  })

  ;[
    new THREE.Vector3(-10.1, 0, -2),
    new THREE.Vector3(10.1, 0, 2),
    new THREE.Vector3(0, 0, 7.1),
  ].forEach((point) => {
    addBox(engine.environment, [0.5, 0.38, 0.5], [point.x, 0.19, point.z], 0x8d7b68)
    const plant = new THREE.Mesh(
      new THREE.SphereGeometry(0.46, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0x4f7a60, roughness: 0.9 }),
    )
    plant.position.set(point.x, 0.72, point.z)
    plant.castShadow = true
    engine.environment.add(plant)
  })

  return stations
}

function parseTime(value: string | null): number | null {
  if (!value) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function replayPlan(agents: AgentRun[]): ReplayEvent[] {
  const raw: Array<{ time: number; type: ReplayEvent['type']; agentId: string }> = []
  agents.forEach((agent) => {
    const started = parseTime(agent.started_at)
    const completed = parseTime(agent.completed_at)
    if (started !== null) raw.push({ time: started, type: 'start', agentId: agent.id })
    if (completed !== null) raw.push({ time: completed, type: 'finish', agentId: agent.id })
  })

  if (raw.length === 0) return []
  raw.sort((a, b) => a.time - b.time || a.agentId.localeCompare(b.agentId))
  const min = raw[0].time
  const max = raw[raw.length - 1].time
  const factualSpan = Math.max(1, max - min)
  const playbackSpan = Math.min(14_000, Math.max(7_000, factualSpan / 4))
  const scale = playbackSpan / factualSpan
  const simultaneous = new Map<number, number>()

  return raw.map((event) => {
    const count = simultaneous.get(event.time) ?? 0
    simultaneous.set(event.time, count + 1)
    return {
      at: 450 + (event.time - min) * scale + count * 140,
      type: event.type,
      agentId: event.agentId,
    }
  })
}

function moveRuntime(runtime: RuntimeAgent, target: THREE.Vector3): void {
  runtime.target.copy(target)
  runtime.path = buildPath(runtime.group.position, target)
  runtime.moving = runtime.path.length > 0
}

function webGlUnavailable(): boolean {
  return (
    typeof window === 'undefined' ||
    (typeof window.WebGLRenderingContext === 'undefined' &&
      typeof window.WebGL2RenderingContext === 'undefined')
  )
}

export function ThreeOfficeScene({
  stages,
  agents,
  profiles,
  selectedAgentId,
  onSelectAgent,
  motionPaused,
  mode,
  replayNonce,
}: ThreeOfficeSceneProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<Engine | null>(null)
  const onSelectRef = useRef(onSelectAgent)
  const motionPausedRef = useRef(motionPaused)
  const modeRef = useRef(mode)
  const selectedAgentIdRef = useRef(selectedAgentId)
  const firstSyncRef = useRef(true)
  const [rendererError, setRendererError] = useState<string | null>(() =>
    webGlUnavailable() ? 'WebGL is unavailable in this browser.' : null,
  )

  useEffect(() => {
    onSelectRef.current = onSelectAgent
  }, [onSelectAgent])

  useEffect(() => {
    motionPausedRef.current = motionPaused
  }, [motionPaused])

  useEffect(() => {
    modeRef.current = mode
  }, [mode])

  useEffect(() => {
    selectedAgentIdRef.current = selectedAgentId
  }, [selectedAgentId])

  const startLoop = useCallback(() => {
    const engine = engineRef.current
    if (!engine || engine.frame !== null || engine.disposed) return

    const tick = (now: number) => {
      const current = engineRef.current
      if (!current || current.disposed) return
      current.frame = null

      const delta = Math.min(0.05, Math.max(0.001, (now - current.lastFrameAt) / 1000))
      current.lastFrameAt = now

      if (modeRef.current === 'replay' && current.replayStartedAt !== null) {
        const elapsed = now - current.replayStartedAt
        while (
          current.replayIndex < current.replayEvents.length &&
          current.replayEvents[current.replayIndex].at <= elapsed
        ) {
          const event = current.replayEvents[current.replayIndex]
          const runtime = current.runtimes.get(event.agentId)
          if (runtime) {
            if (event.type === 'start') {
              runtime.group.visible = true
              runtime.group.position.copy(ENTRANCE.clone().add(bayOffset(current.replayIndex)))
              runtime.currentStatus = 'STARTING'
              replaceAgentLabel(runtime, runtime.currentStatus)
              moveRuntime(runtime, runtime.station)
            } else {
              runtime.currentStatus = runtime.finalStatus
              replaceAgentLabel(runtime, runtime.currentStatus)
              const index = Array.from(current.runtimes.keys()).indexOf(runtime.agentId)
              moveRuntime(
                runtime,
                stateTarget(runtime, runtime.finalStatus, Math.max(0, index)),
              )
            }
          }
          current.replayIndex += 1
        }
      }

      let moving = false
      current.runtimes.forEach((runtime) => {
        runtime.selectionRing.visible =
          runtime.agentId === selectedAgentIdRef.current
        ;(runtime.statusLight.material as THREE.MeshBasicMaterial).color.setHex(
          statusColor(runtime.currentStatus),
        )

        if (
          motionPausedRef.current ||
          !runtime.moving ||
          runtime.path.length === 0
        ) {
          runtime.leftLeg.rotation.x = 0
          runtime.rightLeg.rotation.x = 0
          return
        }

        const waypoint = runtime.path[0]
        const direction = waypoint.clone().sub(runtime.group.position)
        const distance = direction.length()
        const step = 2.6 * delta

        if (distance <= step) {
          runtime.group.position.copy(waypoint)
          runtime.path.shift()
          runtime.moving = runtime.path.length > 0
          if (!runtime.moving && runtime.currentStatus === 'STARTING') {
            runtime.currentStatus = 'RUNNING'
            replaceAgentLabel(runtime, runtime.currentStatus)
          }
        } else {
          direction.normalize()
          runtime.group.position.addScaledVector(direction, step)
          runtime.group.rotation.y = Math.atan2(direction.x, direction.z)
          const phase = now * 0.014
          runtime.leftLeg.rotation.x = Math.sin(phase) * 0.48
          runtime.rightLeg.rotation.x = -Math.sin(phase) * 0.48
        }

        moving = moving || runtime.moving
      })

      current.renderer.render(current.scene, current.camera)

      const replayPending =
        modeRef.current === 'replay' &&
        current.replayIndex < current.replayEvents.length
      if ((moving || replayPending) && !motionPausedRef.current) {
        current.frame = requestAnimationFrame(tick)
      }
    }

    engine.lastFrameAt = performance.now()
    engine.frame = requestAnimationFrame(tick)
  }, [])

  useEffect(() => {
    const host = hostRef.current
    if (!host || rendererError) return

    let engine: Engine | null = null
    let resizeObserver: ResizeObserver | null = null

    try {
      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
      })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7))
      renderer.shadowMap.enabled = true
      renderer.shadowMap.type = THREE.PCFSoftShadowMap
      renderer.outputColorSpace = THREE.SRGBColorSpace
      renderer.setClearColor(0xf0f2f5, 1)
      renderer.domElement.className = 'office-three-canvas'
      renderer.domElement.setAttribute('aria-label', 'Interactive 3D office scene')
      renderer.domElement.tabIndex = 0
      host.appendChild(renderer.domElement)

      const scene = new THREE.Scene()
      scene.background = new THREE.Color(0xf0f2f5)

      const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100)
      camera.position.set(13.5, 13.5, 17.5)
      camera.lookAt(0, 0, 0)

      const controls = new OrbitControls(camera, renderer.domElement)
      controls.target.set(0, 0.3, 0)
      controls.enableDamping = false
      controls.enablePan = true
      controls.minDistance = 11
      controls.maxDistance = 30
      controls.minPolarAngle = Math.PI * 0.2
      controls.maxPolarAngle = Math.PI * 0.47

      scene.add(new THREE.HemisphereLight(0xffffff, 0x9ca6b3, 2.1))
      const keyLight = new THREE.DirectionalLight(0xffffff, 3)
      keyLight.position.set(-7, 15, 10)
      keyLight.castShadow = true
      keyLight.shadow.mapSize.set(2048, 2048)
      keyLight.shadow.camera.left = -14
      keyLight.shadow.camera.right = 14
      keyLight.shadow.camera.top = 12
      keyLight.shadow.camera.bottom = -12
      scene.add(keyLight)

      const environment = new THREE.Group()
      const agentLayer = new THREE.Group()
      scene.add(environment, agentLayer)

      engine = {
        renderer,
        scene,
        camera,
        controls,
        environment,
        agents: agentLayer,
        runtimes: new Map(),
        clickable: [],
        frame: null,
        lastFrameAt: performance.now(),
        replayStartedAt: null,
        replayEvents: [],
        replayIndex: 0,
        disposed: false,
      }
      engineRef.current = engine

      const render = () => renderer.render(scene, camera)
      const resize = () => {
        if (!host.isConnected) return
        const width = Math.max(host.clientWidth, 320)
        const height = Math.max(host.clientHeight, 520)
        camera.aspect = width / height
        camera.updateProjectionMatrix()
        renderer.setSize(width, height, false)
        render()
      }

      resizeObserver = new ResizeObserver(resize)
      resizeObserver.observe(host)
      resize()
      controls.addEventListener('change', render)

      const raycaster = new THREE.Raycaster()
      const pointer = new THREE.Vector2()
      const handleClick = (event: MouseEvent) => {
        const current = engineRef.current
        if (!current) return
        const rect = renderer.domElement.getBoundingClientRect()
        pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
        pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
        raycaster.setFromCamera(pointer, camera)
        const hit = raycaster.intersectObjects(current.clickable, true)[0]
        if (!hit) return
        let object: THREE.Object3D | null = hit.object
        while (object && !object.userData.agentId) object = object.parent
        const agentId = object?.userData.agentId as string | undefined
        if (agentId) onSelectRef.current(agentId)
      }
      renderer.domElement.addEventListener('click', handleClick)

      return () => {
        resizeObserver?.disconnect()
        controls.removeEventListener('change', render)
        renderer.domElement.removeEventListener('click', handleClick)
        if (engine?.frame !== null) cancelAnimationFrame(engine.frame)
        if (engine) engine.disposed = true
        disposeObject(scene)
        controls.dispose()
        renderer.dispose()
        renderer.forceContextLoss()
        renderer.domElement.remove()
        engineRef.current = null
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'WebGL renderer is unavailable.'
      queueMicrotask(() => setRendererError(message))
      if (engine) {
        engine.disposed = true
        engine.renderer.dispose()
      }
    }
  }, [rendererError])

  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return

    const profileByKey = new Map(profiles.map((profile) => [profile.key, profile]))
    const stations = createEnvironment(engine, stages, agents)

    const liveIds = new Set(agents.map((agent) => agent.id))
    engine.runtimes.forEach((runtime, id) => {
      if (!liveIds.has(id)) {
        disposeObject(runtime.group)
        engine.agents.remove(runtime.group)
        engine.runtimes.delete(id)
      }
    })

    agents.forEach((agent, agentIndex) => {
      const stageIndex = Math.max(
        0,
        stages.findIndex((stage) => stage.stage_key === agent.stage_key),
      )
      const station = stations.get(agent.id) ?? stageCenter(stageIndex)
      const name =
        profileByKey.get(agent.agent_profile_key)?.name ??
        agent.agent_profile_key
      let runtime = engine.runtimes.get(agent.id)

      if (!runtime) {
        runtime = createAgentRuntime(agent, name, station)
        engine.runtimes.set(agent.id, runtime)
        engine.agents.add(runtime.group)
      } else {
        runtime.station.copy(station)
        runtime.finalStatus = agent.status
        if (runtime.name !== name) {
          runtime.name = name
          replaceAgentLabel(runtime, runtime.currentStatus)
        }
      }

      runtime.selectionRing.visible = selectedAgentId === agent.id

      if (mode === 'live') {
        const target = stateTarget(runtime, agent.status, agentIndex)
        if (firstSyncRef.current) {
          runtime.group.visible = true
          runtime.group.position.copy(target)
          runtime.path = []
          runtime.moving = false
          runtime.currentStatus = agent.status
          replaceAgentLabel(runtime, runtime.currentStatus)
        } else if (
          runtime.currentStatus !== agent.status ||
          runtime.target.distanceTo(target) > 0.1
        ) {
          runtime.group.visible = true
          runtime.currentStatus = agent.status
          replaceAgentLabel(runtime, runtime.currentStatus)
          moveRuntime(runtime, target)
        }
      }
    })

    engine.clickable = []
    engine.runtimes.forEach((runtime) => {
      runtime.group.traverse((child) => {
        if (child instanceof THREE.Mesh) engine.clickable.push(child)
      })
    })

    firstSyncRef.current = false
    engine.renderer.render(engine.scene, engine.camera)
    if (mode === 'live') startLoop()
  }, [agents, mode, profiles, selectedAgentId, stages, startLoop])

  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return
    engine.runtimes.forEach((runtime) => {
      runtime.selectionRing.visible = runtime.agentId === selectedAgentId
    })
    engine.renderer.render(engine.scene, engine.camera)
  }, [selectedAgentId])

  useEffect(() => {
    const engine = engineRef.current
    if (!engine || mode !== 'replay') return

    engine.replayEvents = replayPlan(agents)
    engine.replayIndex = 0
    engine.replayStartedAt = performance.now()

    engine.runtimes.forEach((runtime) => {
      runtime.group.visible = false
      runtime.group.position.copy(ENTRANCE)
      runtime.path = []
      runtime.moving = false
      runtime.currentStatus = 'PENDING'
      replaceAgentLabel(runtime, runtime.currentStatus)
    })

    engine.renderer.render(engine.scene, engine.camera)
    startLoop()
  }, [agents, mode, replayNonce, startLoop])

  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return
    if (!motionPaused) startLoop()
    engine.renderer.render(engine.scene, engine.camera)
  }, [motionPaused, startLoop])

  if (rendererError) {
    return (
      <div className="office-three-fallback" role="status">
        <strong>3D renderer unavailable</strong>
        <span>{rendererError}</span>
      </div>
    )
  }

  return <div ref={hostRef} className="office-three-host" />
}
