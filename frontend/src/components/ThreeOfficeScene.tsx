import { useCallback, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js'

import type { AgentProfile, AgentRun, RunStage } from '../api'
import {
  animateCharacter,
  createCharacterRuntime,
  disposeCharacter,
  setCharacterStatus,
  type RuntimeAgent,
  type StationPlacement,
} from '../office3d/character'
import {
  buildOfficePath,
  entrancePosition,
  incidentPosition,
  createOfficeEnvironment,
  disposeObject,
  stageCenter,
  waitingPosition,
} from '../office3d/environment'
import {
  officeReplayPlan,
  type OfficeReplayEvent,
  type OfficeReplayRange,
} from '../office3d/replay'

export interface ThreeOfficeSceneProps {
  stages: RunStage[]
  agents: AgentRun[]
  profiles: AgentProfile[]
  selectedAgentId: string | null
  onSelectAgent: (agentId: string) => void
  motionPaused: boolean
  mode: 'live' | 'replay'
  replayNonce: number
  replayStartedAt: number | null
  replayRange: OfficeReplayRange | null
}

interface Engine {
  renderer: THREE.WebGLRenderer
  labels: CSS2DRenderer
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
  replayEvents: OfficeReplayEvent[]
  replayIndex: number
  focusTarget: THREE.Vector3 | null
  focusUntil: number | null
  disposed: boolean
}

function stateTarget(
  runtime: RuntimeAgent,
  status: string,
  index: number,
): StationPlacement {
  switch (status.toUpperCase()) {
    case 'WAITING':
      return {
        position: waitingPosition(index),
        yaw: Math.PI * 0.5,
      }
    case 'BLOCKED':
    case 'FAILED':
      return {
        position: incidentPosition(index),
        yaw: Math.PI * 0.5,
      }
    default:
      return {
        position: runtime.station.clone(),
        yaw: runtime.stationYaw,
      }
  }
}

function moveRuntime(
  runtime: RuntimeAgent,
  target: StationPlacement,
): void {
  runtime.target.copy(target.position)
  runtime.targetYaw = target.yaw
  runtime.path = buildOfficePath(runtime.root.position, target.position)
  runtime.moving = runtime.path.length > 0
}

function webGlUnavailable(): boolean {
  return (
    typeof window === 'undefined' ||
    (typeof window.WebGLRenderingContext === 'undefined' &&
      typeof window.WebGL2RenderingContext === 'undefined')
  )
}

function renderEngine(engine: Engine): void {
  engine.renderer.render(engine.scene, engine.camera)
  engine.labels.render(engine.scene, engine.camera)
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
  replayStartedAt,
  replayRange,
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
      const delta = Math.min(
        0.05,
        Math.max(0.001, (now - current.lastFrameAt) / 1000),
      )
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
              runtime.root.visible = true
              runtime.root.position.copy(
                entrancePosition(current.replayIndex),
              )
              runtime.root.rotation.y = 0
              runtime.pendingStatus = null
              runtime.pendingStatusAt = null
              setCharacterStatus(runtime, 'STARTING')
              moveRuntime(runtime, {
                position: runtime.station.clone(),
                yaw: runtime.stationYaw,
              })
              current.focusTarget = runtime.station.clone()
              current.focusUntil = now + 950
            } else if (runtime.moving) {
              runtime.pendingStatus = runtime.finalStatus
              runtime.pendingStatusAt = null
            } else {
              runtime.pendingStatus = runtime.finalStatus
              runtime.pendingStatusAt = now + 1600
            }
          }

          current.replayIndex += 1
        }
      }

      let needsFrame = false

      if (current.focusTarget && current.focusUntil !== null) {
        const before = current.controls.target.clone()
        current.controls.target.lerp(
          current.focusTarget,
          Math.min(1, delta * 4.6),
        )
        const shift = current.controls.target.clone().sub(before)
        current.camera.position.add(shift)
        needsFrame = true

        if (
          now >= current.focusUntil ||
          current.controls.target.distanceTo(current.focusTarget) < 0.035
        ) {
          current.focusTarget = null
          current.focusUntil = null
        }
      }

      if (current.controls.update()) {
        needsFrame = true
      }

      current.runtimes.forEach((runtime) => {
        runtime.selectionRing.visible =
          runtime.agentId === selectedAgentIdRef.current

        if (
          runtime.pendingStatus &&
          runtime.pendingStatusAt !== null &&
          now >= runtime.pendingStatusAt
        ) {
          setCharacterStatus(runtime, runtime.pendingStatus)
          runtime.pendingStatus = null
          runtime.pendingStatusAt = null
        }

        if (
          !motionPausedRef.current &&
          runtime.moving &&
          runtime.path.length > 0
        ) {
          const waypoint = runtime.path[0]
          const direction = waypoint.clone().sub(runtime.root.position)
          const distance = direction.length()
          const step = 2.15 * delta

          if (distance <= step) {
            runtime.root.position.copy(waypoint)
            runtime.path.shift()
            runtime.moving = runtime.path.length > 0

            if (!runtime.moving) {
              runtime.root.rotation.y = runtime.targetYaw
              if (runtime.currentStatus === 'STARTING') {
                setCharacterStatus(runtime, 'RUNNING')
                if (runtime.pendingStatus) {
                  runtime.pendingStatusAt = now + 1800
                }
              }
            }
          } else {
            direction.normalize()
            runtime.root.position.addScaledVector(direction, step)
            // Quaternius models are authored facing -Z. The character module
            // rotates the GLB presentation by PI, so the runtime root itself
            // follows the canonical +Z Three.js heading convention here.
            runtime.root.rotation.y = Math.atan2(direction.x, direction.z)
          }
        }

        needsFrame =
          animateCharacter(runtime, now, motionPausedRef.current) || needsFrame

        if (runtime.moving || runtime.pendingStatus) {
          needsFrame = true
        }
      })

      renderEngine(current)

      const replayPending =
        modeRef.current === 'replay' &&
        current.replayIndex < current.replayEvents.length

      if ((needsFrame || replayPending) && !motionPausedRef.current) {
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
      renderer.toneMapping = THREE.ACESFilmicToneMapping
      renderer.toneMappingExposure = 1.05
      renderer.setClearColor(0x111820, 1)
      renderer.domElement.className = 'office-three-canvas'
      renderer.domElement.setAttribute(
        'aria-label',
        'Interactive 3D office scene',
      )
      renderer.domElement.tabIndex = 0
      host.appendChild(renderer.domElement)

      const labels = new CSS2DRenderer()
      labels.domElement.className = 'office-three-label-layer'
      labels.domElement.setAttribute('aria-hidden', 'true')
      host.appendChild(labels.domElement)

      const scene = new THREE.Scene()
      scene.background = new THREE.Color(0x111820)

      const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100)
      camera.position.set(15.7, 12.3, 17.4)
      camera.lookAt(0, 0.72, 0.35)

      const controls = new OrbitControls(camera, renderer.domElement)
      controls.target.set(0, 0.72, 0.35)
      controls.enableDamping = true
      controls.dampingFactor = 0.075
      controls.enablePan = true
      controls.enableRotate = true
      controls.screenSpacePanning = true
      controls.minDistance = 10
      controls.maxDistance = 34
      controls.minPolarAngle = Math.PI * 0.16
      controls.maxPolarAngle = Math.PI * 0.48

      scene.add(new THREE.HemisphereLight(0xdce9f4, 0x1a232d, 2.0))

      const keyLight = new THREE.DirectionalLight(0xfff0d2, 2.8)
      keyLight.position.set(-7, 15, 10)
      keyLight.castShadow = true
      keyLight.shadow.mapSize.set(2048, 2048)
      keyLight.shadow.camera.left = -16
      keyLight.shadow.camera.right = 16
      keyLight.shadow.camera.top = 14
      keyLight.shadow.camera.bottom = -14
      scene.add(keyLight)

      const fillLight = new THREE.DirectionalLight(0x8fb8dc, 0.8)
      fillLight.position.set(10, 10, -7)
      scene.add(fillLight)

      const environment = new THREE.Group()
      const agentLayer = new THREE.Group()
      scene.add(environment, agentLayer)

      engine = {
        renderer,
        labels,
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
        focusTarget: null,
        focusUntil: null,
        disposed: false,
      }
      engineRef.current = engine

      const render = () => renderEngine(engine!)
      const resize = () => {
        if (!host.isConnected || !engine) return
        const width = Math.max(host.clientWidth, 320)
        const height = Math.max(host.clientHeight, 480)
        camera.aspect = width / height
        camera.updateProjectionMatrix()
        renderer.setSize(width, height, false)
        labels.setSize(width, height)
        render()
      }

      resizeObserver = new ResizeObserver(resize)
      resizeObserver.observe(host)
      resize()
      controls.addEventListener('change', render)
      controls.addEventListener('start', startLoop)

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
        controls.removeEventListener('start', startLoop)
        renderer.domElement.removeEventListener('click', handleClick)

        const frame = engine?.frame
        if (frame !== null && frame !== undefined) {
          cancelAnimationFrame(frame)
        }

        if (engine) {
          engine.disposed = true
          engine.runtimes.forEach(disposeCharacter)
          disposeObject(engine.environment)
        }

        controls.dispose()
        renderer.dispose()
        renderer.forceContextLoss()
        renderer.domElement.remove()
        labels.domElement.remove()
        engineRef.current = null
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'WebGL renderer is unavailable.'
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

    const profileByKey = new Map(
      profiles.map((profile) => [profile.key, profile]),
    )
    const stations = createOfficeEnvironment(
      engine.environment,
      stages,
      agents,
    )

    const liveIds = new Set(agents.map((agent) => agent.id))

    engine.runtimes.forEach((runtime, id) => {
      if (!liveIds.has(id)) {
        disposeCharacter(runtime)
        engine.agents.remove(runtime.root)
        engine.runtimes.delete(id)
      }
    })

    agents.forEach((agent, agentIndex) => {
      const stageIndex = Math.max(
        0,
        stages.findIndex((stage) => stage.stage_key === agent.stage_key),
      )
      const fallback: StationPlacement = {
        position: stageCenter(stageIndex),
        yaw: stageIndex < 3 ? Math.PI : 0,
      }
      const station = stations.get(agent.id) ?? fallback
      const name =
        profileByKey.get(agent.agent_profile_key)?.name ??
        agent.agent_profile_key

      let runtime = engine.runtimes.get(agent.id)

      if (!runtime) {
        runtime = createCharacterRuntime(agent, name, station, () => {
          if (engine.disposed) return
          renderEngine(engine)
          if (!motionPausedRef.current) startLoop()
        })
        engine.runtimes.set(agent.id, runtime)
        engine.agents.add(runtime.root)
      } else {
        runtime.station.copy(station.position)
        runtime.stationYaw = station.yaw
        runtime.finalStatus = agent.status
      }

      runtime.selectionRing.visible = selectedAgentId === agent.id

      if (mode === 'live') {
        const target = stateTarget(runtime, agent.status, agentIndex)

        if (firstSyncRef.current) {
          runtime.root.visible = true
          runtime.root.position.copy(target.position)
          runtime.root.rotation.y = target.yaw
          runtime.target.copy(target.position)
          runtime.targetYaw = target.yaw
          runtime.path = []
          runtime.moving = false
          runtime.pendingStatus = null
          runtime.pendingStatusAt = null
          setCharacterStatus(runtime, agent.status)
        } else if (
          runtime.currentStatus !== agent.status ||
          runtime.target.distanceTo(target.position) > 0.1
        ) {
          runtime.root.visible = true
          runtime.pendingStatus = null
          runtime.pendingStatusAt = null
          setCharacterStatus(runtime, agent.status)
          moveRuntime(runtime, target)
        }
      }
    })

    engine.clickable = []
    engine.runtimes.forEach((runtime) => {
      runtime.root.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          engine.clickable.push(child)
        }
      })
    })

    firstSyncRef.current = false
    renderEngine(engine)
    if (mode === 'live') startLoop()
  }, [agents, mode, profiles, selectedAgentId, stages, startLoop])

  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return

    engine.runtimes.forEach((runtime) => {
      runtime.selectionRing.visible = runtime.agentId === selectedAgentId
    })

    if (selectedAgentId) {
      const runtime = engine.runtimes.get(selectedAgentId)
      if (runtime) {
        engine.focusTarget = runtime.root.position.clone()
        engine.focusUntil = performance.now() + 850
        startLoop()
      }
    }

    renderEngine(engine)
  }, [selectedAgentId])

  useEffect(() => {
    const engine = engineRef.current
    if (!engine || mode !== 'replay' || replayStartedAt === null) return

    engine.replayEvents = officeReplayPlan(agents, replayRange)
    engine.replayIndex = 0
    engine.replayStartedAt = replayStartedAt

    engine.runtimes.forEach((runtime) => {
      runtime.root.visible = false
      runtime.root.position.copy(entrancePosition(0))
      runtime.root.rotation.y = 0
      runtime.path = []
      runtime.moving = false
      runtime.pendingStatus = null
      runtime.pendingStatusAt = null
      setCharacterStatus(runtime, 'PENDING')
    })

    renderEngine(engine)
    startLoop()
  }, [
    agents,
    mode,
    replayNonce,
    replayStartedAt,
    replayRange,
    startLoop,
  ])

  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return
    if (!motionPaused) startLoop()
    renderEngine(engine)
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
