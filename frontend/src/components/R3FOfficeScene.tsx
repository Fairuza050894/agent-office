import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import {
  useEffect,
  useMemo,
  useRef,
  type MutableRefObject,
} from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js'

import {
  animateCharacter,
  applyWorkspaceIdlePresentation,
  createCharacterRuntime,
  disposeCharacter,
  setCharacterSelected,
  type RuntimeAgent,
} from '../office3d/character'
import {
  createOfficeEnvironment,
  disposeObject,
} from '../office3d/environment'
import type { OfficeDioramaPilotMode } from '../office3d/dioramaDebug'
import { officeFurniturePolicy } from '../office3d/furniturePolicy'
import {
  OFFICE_CAMERA_CONTROL_POLICY,
  officeCameraView,
  type OfficeCameraViewKey,
} from '../office3d/camera'
import {
  type OfficeFloorKey,
  type OfficePresenceMember,
} from '../office3d/livingOffice'
import { officeLightingForHour } from '../office3d/lighting'
import type { OfficeModeKey } from '../office3d/officeWorld'

export interface R3FOfficeSceneProps {
  selectedAgentId: string | null
  onSelectAgent: (agentId: string) => void
  motionPaused: boolean
  floor: OfficeFloorKey
  workspaceMembers: OfficePresenceMember[]
  cameraResetNonce: number
  cameraView: OfficeCameraViewKey
  officeHour: number
  officeMode: OfficeModeKey | null
  dioramaPilot?: OfficeDioramaPilotMode
  labelsVisible: boolean
}

interface RendererInfo {
  calls: number
  triangles: number
  points: number
  lines: number
  geometries: number
  textures: number
  lights: {
    total: number
    hemisphere: number
    directional: number
    point: number
  }
}

type DioramaWindow = Window & {
  __AGENT_OFFICE_DIARAMA__?: {
    ready: boolean
    renderer?: 'three' | 'r3f'
    rendererInfo: RendererInfo
    characterReadiness: {
      expected: number
      rigged: number
      fallback: number
    }
  }
  __AGENT_OFFICE_DIARAMA_PILOT__?: {
    mode: OfficeDioramaPilotMode
    ready: boolean
    sourceAssetCount: number
    instanceCount: number
    bounds?: {
      min: [number, number, number]
      max: [number, number, number]
      size: [number, number, number]
    }
    error?: string
  }
}

function publishRendererInfo(
  gl: THREE.WebGLRenderer,
  scene: THREE.Scene,
  runtimes: Map<string, RuntimeAgent>,
): void {
  if (!import.meta.env.DEV || typeof window === 'undefined') return

  const params = new URLSearchParams(window.location.search)
  if (
    params.get('fixture') !== 'diorama' ||
    params.get('renderer') !== 'r3f'
  ) {
    return
  }

  const lights = {
    total: 0,
    hemisphere: 0,
    directional: 0,
    point: 0,
  }
  scene.traverse((object) => {
    if (!(object instanceof THREE.Light)) return
    lights.total += 1
    if (object instanceof THREE.HemisphereLight) lights.hemisphere += 1
    if (object instanceof THREE.DirectionalLight) lights.directional += 1
    if (object instanceof THREE.PointLight) lights.point += 1
  })

  const info = gl.info
  const expectedCharacters = runtimes.size
  const riggedCharacters = [...runtimes.values()].filter(
    (runtime) => runtime.rigged !== null,
  ).length
  ;(window as DioramaWindow).__AGENT_OFFICE_DIARAMA__ = {
    ready: true,
    renderer: 'r3f',
    characterReadiness: {
      expected: expectedCharacters,
      rigged: riggedCharacters,
      fallback: expectedCharacters - riggedCharacters,
    },
    rendererInfo: {
      calls: info.render.calls,
      triangles: info.render.triangles,
      points: info.render.points,
      lines: info.render.lines,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      lights,
    },
  }
}

function CameraRig({
  floor,
  cameraView,
  cameraResetNonce,
  selectedAgentId,
  runtimes,
}: {
  floor: OfficeFloorKey
  cameraView: OfficeCameraViewKey
  cameraResetNonce: number
  selectedAgentId: string | null
  runtimes: MutableRefObject<Map<string, RuntimeAgent>>
}) {
  const { camera, gl } = useThree()
  const controlsRef = useRef<OrbitControls | null>(null)

  useEffect(() => {
    const controls = new OrbitControls(camera, gl.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.075
    controls.enablePan = OFFICE_CAMERA_CONTROL_POLICY.enablePan
    controls.enableRotate = OFFICE_CAMERA_CONTROL_POLICY.enableRotate
    controls.enableZoom = OFFICE_CAMERA_CONTROL_POLICY.enableZoom
    controls.screenSpacePanning = false
    controls.minDistance = OFFICE_CAMERA_CONTROL_POLICY.minDistance
    controls.maxDistance = OFFICE_CAMERA_CONTROL_POLICY.maxDistance
    controlsRef.current = controls

    return () => {
      controls.dispose()
      controlsRef.current = null
    }
  }, [camera, gl])

  useEffect(() => {
    const controls = controlsRef.current
    if (!controls) return

    const preset = officeCameraView(floor, cameraView)
    camera.position.set(...preset.position)
    controls.target.set(...preset.target)
    controls.update()
  }, [camera, cameraResetNonce, cameraView, floor])

  useEffect(() => {
    const controls = controlsRef.current
    if (!controls || !selectedAgentId) return

    const runtime = runtimes.current.get(selectedAgentId)
    if (!runtime) return

    const previousTarget = controls.target.clone()
    controls.target.copy(runtime.root.position)
    camera.position.add(
      controls.target.clone().sub(previousTarget),
    )
    controls.update()
  }, [camera, runtimes, selectedAgentId])

  useFrame(() => {
    controlsRef.current?.update()
  })

  return null
}

function LabelLayer({ visible }: { visible: boolean }) {
  const { camera, gl, scene, size } = useThree()
  const rendererRef = useRef<CSS2DRenderer | null>(null)

  useEffect(() => {
    const host = gl.domElement.parentElement
    if (!host) return

    const labels = new CSS2DRenderer()
    labels.domElement.className = 'office-three-label-layer'
    labels.domElement.setAttribute('aria-hidden', 'true')
    host.appendChild(labels.domElement)
    rendererRef.current = labels

    return () => {
      labels.domElement.remove()
      rendererRef.current = null
    }
  }, [gl])

  useEffect(() => {
    const labels = rendererRef.current
    if (!labels) return
    labels.setSize(size.width, size.height)
    labels.domElement.style.display = visible ? '' : 'none'
  }, [size.height, size.width, visible])

  useFrame(() => {
    rendererRef.current?.render(scene, camera)
  })

  return null
}

function RendererEvidence({
  runtimes,
}: {
  runtimes: MutableRefObject<Map<string, RuntimeAgent>>
}) {
  const { gl, scene } = useThree()

  useFrame(() => {
    publishRendererInfo(gl, scene, runtimes.current)
  })

  return null
}

function SceneContents({
  selectedAgentId,
  onSelectAgent,
  motionPaused,
  floor,
  workspaceMembers,
  cameraResetNonce,
  cameraView,
  officeHour,
  officeMode,
  dioramaPilot,
  labelsVisible,
}: R3FOfficeSceneProps) {
  const { invalidate } = useThree()
  const environment = useMemo(() => new THREE.Group(), [])
  const agentLayer = useMemo(() => new THREE.Group(), [])
  const runtimesRef = useRef<Map<string, RuntimeAgent>>(new Map())
  const generationRef = useRef(0)
  const visibleMembers = useMemo(
    () => workspaceMembers.filter((member) => member.floor === floor),
    [floor, workspaceMembers],
  )
  const lighting = officeLightingForHour(officeHour)

  useEffect(() => {
    const generation = generationRef.current + 1
    generationRef.current = generation
    const furniture = officeFurniturePolicy(floor, dioramaPilot)
    const stations = createOfficeEnvironment(
      environment,
      [],
      visibleMembers,
      floor,
      officeMode,
      furniture.initialPresentation,
    )

    const runtimes = new Map<string, RuntimeAgent>()
    visibleMembers.forEach((member) => {
      const station = stations.get(member.id)
      if (!station) return

      const runtime = createCharacterRuntime(
        member,
        member.name,
        station,
        invalidate,
      )
      runtime.root.userData.agentId = member.id
      runtimes.set(member.id, runtime)
      agentLayer.add(runtime.root)
    })
    runtimesRef.current = runtimes

    if (
      import.meta.env.DEV &&
      dioramaPilot &&
      typeof window !== 'undefined'
    ) {
      ;(window as DioramaWindow).__AGENT_OFFICE_DIARAMA_PILOT__ = {
        mode: dioramaPilot,
        ready: dioramaPilot === 'primitive',
        sourceAssetCount: 0,
        instanceCount: 0,
      }
    }

    if (furniture.loadKit) {
      void import('../office3d/officeFurnitureKit')
        .then(({ mountEngineeringPodFurnitureKit }) =>
          mountEngineeringPodFurnitureKit(environment),
        )
        .then((mount) => {
          if (generationRef.current !== generation) {
            environment.remove(mount.group)
            disposeObject(mount.group)
            return
          }

          if (furniture.keepPrimitiveFallbackUntilReady) {
            const primitive = environment.getObjectByName(
              'office-engineering-pod-primitive',
            )
            if (primitive?.parent) {
              primitive.parent.remove(primitive)
              disposeObject(primitive)
            }
          }

          if (
            import.meta.env.DEV &&
            dioramaPilot === 'kit' &&
            typeof window !== 'undefined'
          ) {
            ;(window as DioramaWindow).__AGENT_OFFICE_DIARAMA_PILOT__ = {
              mode: 'kit',
              ready: true,
              sourceAssetCount: mount.sourceAssetCount,
              instanceCount: mount.instanceCount,
              bounds: mount.bounds,
            }
          }
          invalidate()
        })
        .catch((error: unknown) => {
          const message =
            error instanceof Error ? error.message : String(error)
          if (
            import.meta.env.DEV &&
            dioramaPilot === 'kit' &&
            typeof window !== 'undefined'
          ) {
            ;(window as DioramaWindow).__AGENT_OFFICE_DIARAMA_PILOT__ = {
              mode: 'kit',
              ready: false,
              sourceAssetCount: 0,
              instanceCount: 0,
              error: message,
            }
          }
          console.error('R3F Office furniture kit failed:', error)
        })
    }

    invalidate()

    return () => {
      generationRef.current += 1
      runtimes.forEach(disposeCharacter)
      runtimes.clear()
      runtimesRef.current = new Map()
      disposeObject(environment)
      environment.clear()
      agentLayer.clear()
    }
  }, [
    agentLayer,
    dioramaPilot,
    environment,
    floor,
    invalidate,
    officeMode,
    visibleMembers,
  ])

  useEffect(() => {
    runtimesRef.current.forEach((runtime) => {
      setCharacterSelected(
        runtime,
        runtime.agentId === selectedAgentId,
      )
    })
    invalidate()
  }, [invalidate, selectedAgentId])

  useFrame((state) => {
    let animated = false
    runtimesRef.current.forEach((runtime) => {
      animated =
        animateCharacter(runtime, state.clock.elapsedTime * 1000, motionPaused) ||
        animated
      animated =
        applyWorkspaceIdlePresentation(
          runtime,
          state.clock.elapsedTime * 1000,
          !runtime.moving && !motionPaused,
        ) || animated
    })

    if (animated && !motionPaused) invalidate()
  })

  const handleAgentClick = (event: ThreeEvent<MouseEvent>) => {
    let object: THREE.Object3D | null = event.object
    while (object && !object.userData.agentId) object = object.parent
    const agentId = object?.userData.agentId as string | undefined
    if (!agentId) return
    event.stopPropagation()
    onSelectAgent(agentId)
  }

  return (
    <>
      <color attach="background" args={[lighting.background]} />
      <hemisphereLight
        color={lighting.hemisphereSky}
        groundColor={lighting.hemisphereGround}
        intensity={lighting.hemisphereIntensity}
      />
      <directionalLight
        color={lighting.keyColor}
        intensity={lighting.keyIntensity}
        position={[-7, 15, 10]}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-16}
        shadow-camera-right={16}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
      />
      <primitive object={environment} />
      <primitive object={agentLayer} onClick={handleAgentClick} />
      <CameraRig
        floor={floor}
        cameraView={cameraView}
        cameraResetNonce={cameraResetNonce}
        selectedAgentId={selectedAgentId}
        runtimes={runtimesRef}
      />
      <LabelLayer visible={labelsVisible} />
      <RendererEvidence runtimes={runtimesRef} />
    </>
  )
}

export function R3FOfficeScene(props: R3FOfficeSceneProps) {
  const preset = officeCameraView(props.floor, props.cameraView)
  const lighting = officeLightingForHour(props.officeHour)
  return (
    <div
      className="office-three-host office-three-host-r3f"
      data-office-renderer="r3f"
    >
      <Canvas
        className="office-r3f-canvas-shell"
        style={{ width: '100%', height: '100%' }}
        shadows
        dpr={[1, 1.7]}
        camera={{
          fov: 38,
          near: 0.1,
          far: 100,
          position: preset.position,
        }}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: 'high-performance',
          outputColorSpace: THREE.SRGBColorSpace,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: lighting.exposure,
        }}
        onCreated={({ gl }) => {
          gl.domElement.classList.add('office-three-canvas')
          gl.domElement.setAttribute(
            'aria-label',
            'R3F Planning Office 3D scene',
          )
          gl.domElement.tabIndex = 0
        }}
        fallback={
          <div className="office-three-fallback">
            R3F Planning Office WebGL unavailable
          </div>
        }
        onPointerMissed={() => {
          // The HTML roster remains the complete non-3D selection path.
        }}
      >
        <SceneContents {...props} />
      </Canvas>
    </div>
  )
}

export default R3FOfficeScene
