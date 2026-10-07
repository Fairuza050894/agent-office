import { describe, expect, it, vi } from 'vitest'

import {
  OFFICE_CAMERA_CONTROL_POLICY,
  attachControlledZoom,
  officeCameraView,
  officeCameraViews,
  officeRendererViewport,
} from './camera'

describe('office camera presets', () => {
  it('exposes three keyboard-addressable views for every floor', () => {
    for (const floor of ['commons', 'build', 'strategy'] as const) {
      const views = officeCameraViews(floor)

      expect(views).toHaveLength(3)
      expect(views.map((view) => view.key)).toEqual([
        'overview',
        'primary',
        'secondary',
      ])
      expect(views.map((view) => view.shortcut)).toEqual(['1', '2', '3'])
      expect(new Set(views.map((view) => view.label)).size).toBe(3)
    }
  })

  it('disables OrbitControls input so plain wheel scrolls the page', () => {
    expect(OFFICE_CAMERA_CONTROL_POLICY).toEqual({
      enablePan: false,
      enableRotate: false,
      enableZoom: false,
      minDistance: 7.5,
      maxDistance: 18.5,
    })
  })

  it('uses floor-specific semantic destinations instead of generic camera names', () => {
    expect(officeCameraView('commons', 'primary').label).toBe('Lounge')
    expect(officeCameraView('commons', 'secondary').label).toBe('Pantry')
    expect(officeCameraView('build', 'primary').label).toBe('Engineering')
    expect(officeCameraView('build', 'secondary').label).toBe('QA / Review')
    expect(officeCameraView('strategy', 'primary').label).toBe('Planning')
    expect(officeCameraView('strategy', 'secondary').label).toBe('Meeting')
  })

  it('keeps every snap preset inside the bounded zoom envelope', () => {
    for (const floor of ['commons', 'build', 'strategy'] as const) {
      for (const view of officeCameraViews(floor)) {
        const [x, y, z] = view.position
        const [tx, ty, tz] = view.target
        const distance = Math.hypot(x - tx, y - ty, z - tz)

        expect(distance).toBeGreaterThanOrEqual(
          OFFICE_CAMERA_CONTROL_POLICY.minDistance,
        )
        expect(distance).toBeLessThanOrEqual(
          OFFICE_CAMERA_CONTROL_POLICY.maxDistance,
        )
      }
    }
  })

  it('keeps overview framing close enough to read furniture and characters', () => {
    for (const floor of ['commons', 'build', 'strategy'] as const) {
      const view = officeCameraView(floor, 'overview')
      const [x, y, z] = view.position
      const [tx, ty, tz] = view.target
      const distance = Math.hypot(x - tx, y - ty, z - tz)

      expect(distance).toBeLessThanOrEqual(18)
      expect(y).toBeLessThanOrEqual(8)
    }
  })

  it('keeps overview framing intentionally different across floors', () => {
    const commons = officeCameraView('commons', 'overview')
    const build = officeCameraView('build', 'overview')
    const strategy = officeCameraView('strategy', 'overview')

    expect(commons.position).not.toEqual(build.position)
    expect(strategy.position).not.toEqual(build.position)
    expect(commons.target).not.toEqual(build.target)
  })

  it('keeps renderer aspect tied to the actual responsive host size', () => {
    expect(officeRendererViewport(370, 380)).toEqual({
      width: 370,
      height: 380,
    })
    expect(officeRendererViewport(1024, 612.4)).toEqual({
      width: 1024,
      height: 612,
    })
    expect(officeRendererViewport(0, 0)).toEqual({
      width: 1,
      height: 1,
    })
  })

  it('keeps every preset within a bounded office camera envelope', () => {
    for (const floor of ['commons', 'build', 'strategy'] as const) {
      for (const view of officeCameraViews(floor)) {
        const [x, y, z] = view.position
        const [tx, ty, tz] = view.target

        expect(Math.abs(x)).toBeLessThanOrEqual(16)
        expect(y).toBeGreaterThanOrEqual(4)
        expect(y).toBeLessThanOrEqual(9)
        expect(Math.abs(z)).toBeLessThanOrEqual(18)
        expect(Math.abs(tx)).toBeLessThanOrEqual(9)
        expect(ty).toBeGreaterThanOrEqual(0)
        expect(ty).toBeLessThanOrEqual(2)
        expect(Math.abs(tz)).toBeLessThanOrEqual(7)
      }
    }
  })

  it('zoom helpers only dolly on Ctrl/Cmd+wheel and stay inside the envelope', () => {
    const makeVector = (x: number, y: number, z: number) => ({
      x,
      y,
      z,
      clone() {
        return makeVector(this.x, this.y, this.z)
      },
      sub(other: { x: number; y: number; z: number }) {
        this.x -= other.x
        this.y -= other.y
        this.z -= other.z
        return this
      },
      add(other: { x: number; y: number; z: number }) {
        this.x += other.x
        this.y += other.y
        this.z += other.z
        return this
      },
      multiplyScalar(ratio: number) {
        this.x *= ratio
        this.y *= ratio
        this.z *= ratio
        return this
      },
      copy(other: { x: number; y: number; z: number }) {
        this.x = other.x
        this.y = other.y
        this.z = other.z
        return this
      },
      length() {
        return Math.hypot(this.x, this.y, this.z)
      },
    })
    const canvas = document.createElement('canvas')
    const camera = { position: makeVector(0, 0, 10) }
    const target = makeVector(0, 0, 0)
    const onChange = vi.fn()
    const detach = attachControlledZoom(
      canvas,
      camera,
      () => target,
      onChange,
    )

    const distance = () =>
      Math.hypot(
        camera.position.x - target.x,
        camera.position.y - target.y,
        camera.position.z - target.z,
      )

    // Plain wheel must be ignored so the page can scroll.
    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 100 }))
    expect(distance()).toBeCloseTo(10)
    expect(onChange).not.toHaveBeenCalled()

    // Pinch zoom in stays bounded.
    for (let i = 0; i < 30; i += 1) {
      canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, ctrlKey: true }))
    }
    expect(distance()).toBeGreaterThanOrEqual(
      OFFICE_CAMERA_CONTROL_POLICY.minDistance,
    )
    expect(onChange).toHaveBeenCalled()

    // Pinch zoom out stays bounded.
    for (let i = 0; i < 60; i += 1) {
      canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, ctrlKey: true }))
    }
    expect(distance()).toBeLessThanOrEqual(
      OFFICE_CAMERA_CONTROL_POLICY.maxDistance,
    )

    detach()
  })
})
