import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { OfficePresenceMember } from '../office3d/livingOffice'
import { officeWorldContext } from '../office3d/officeWorld'
import { OfficeScene } from './OfficeScene'

vi.mock('./ThreeOfficeScene', () => ({
  ThreeOfficeScene: ({
    onSelectAgent,
    officeMode,
  }: {
    onSelectAgent: (agentId: string) => void
    officeMode?: string | null
  }) => (
    <button
      type="button"
      aria-label="Mock 3D member"
      data-office-mode={officeMode ?? ''}
      onClick={() => onSelectAgent('ambient:backend-engineer')}
    >
      member
    </button>
  ),
}))

const member: OfficePresenceMember = {
  id: 'ambient:backend-engineer',
  agent_profile_key: 'backend-engineer',
  name: 'Backend Engineer',
  status: 'SOCIAL_BREAK',
  behavior: 'GAME_BREAK',
  floor: 'commons',
  zone: 'game-corner',
  placementIndex: 1,
  truth: 'AMBIENT',
}

describe('OfficeScene operational scope', () => {
  it('keeps the same floor language while projecting canonical Run truth', () => {
    const onFloorChange = vi.fn()

    render(
      <OfficeScene
        stages={[]}
        agents={[]}
        profiles={[]}
        selectedAgentId={null}
        onSelectAgent={vi.fn()}
        motionPaused={false}
        mode="replay"
        replayNonce={1}
        replayStartedAt={0}
        replayRange={null}
        showRoster={false}
        presentation="operational"
        floor="strategy"
        onFloorChange={onFloorChange}
        operationalFloorCounts={{ commons: 0, build: 3, strategy: 2 }}
      />,
    )

    expect(screen.getAllByText('Strategy').length).toBeGreaterThan(0)
    expect(screen.getByText('Historical Run / AgentRun replay')).toBeInTheDocument()
    expect(
      screen.getByLabelText('Agent Office operational 3D projection'),
    ).toBeInTheDocument()
    const buildFloor = screen.getByRole('button', { name: /L2.*Build/i })
    expect(buildFloor).toBeInTheDocument()
    expect(buildFloor.closest('.office-floor-switcher')).not.toHaveClass(
      'office-floor-switcher-workspace',
    )

    fireEvent.click(buildFloor)
    expect(onFloorChange).toHaveBeenCalledWith('build')
  })
})

describe('OfficeScene workspace presence', () => {
  it('renders a truthful selected-member inspector', () => {
    const onSelectAgent = vi.fn()

    render(
      <OfficeScene
        stages={[]}
        agents={[]}
        profiles={[]}
        selectedAgentId={member.id}
        onSelectAgent={onSelectAgent}
        motionPaused={false}
        mode="live"
        replayNonce={0}
        replayStartedAt={null}
        replayRange={null}
        showRoster={false}
        presentation="workspace"
        floor="commons"
        workspaceMembers={[member]}
        onFloorChange={vi.fn()}
        presenceLabel="After hours · ambient"
        officeHour={23}
      />,
    )

    const inspector = screen.getByRole('complementary', {
      name: 'Office member inspector',
    })

    expect(inspector).toHaveTextContent('Backend Engineer')
    expect(inspector).toHaveTextContent('Game break')
    expect(inspector).toHaveTextContent('Commons · game corner')
    expect(inspector).toHaveTextContent('Ambient presentation')

    fireEvent.click(
      screen.getByRole('button', { name: 'Close office member inspector' }),
    )
    expect(onSelectAgent).toHaveBeenCalledWith(member.id)
  })

  it('does not show a stale inspector for a member on another floor', () => {
    render(
      <OfficeScene
        stages={[]}
        agents={[]}
        profiles={[]}
        selectedAgentId={member.id}
        onSelectAgent={vi.fn()}
        motionPaused={false}
        mode="live"
        replayNonce={0}
        replayStartedAt={null}
        replayRange={null}
        showRoster={false}
        presentation="workspace"
        floor="build"
        workspaceMembers={[member]}
        onFloorChange={vi.fn()}
        presenceLabel="Quiet floor · no presence"
        officeHour={23}
      />,
    )

    expect(
      screen.queryByRole('complementary', {
        name: 'Office member inspector',
      }),
    ).not.toBeInTheDocument()
  })

  it('renders explicit office time, mode, presence, and next event', () => {
    render(
      <OfficeScene
        stages={[]}
        agents={[]}
        profiles={[]}
        selectedAgentId={null}
        onSelectAgent={vi.fn()}
        motionPaused={false}
        mode="live"
        replayNonce={0}
        replayStartedAt={null}
        replayRange={null}
        showRoster={false}
        presentation="workspace"
        floor="commons"
        workspaceMembers={[]}
        onFloorChange={vi.fn()}
        presenceLabel="Quiet floor · no presence"
        officeHour={0}
        worldContext={officeWorldContext(
          new Date('2026-09-28T17:44:00Z'),
          'Asia/Jakarta',
        )}
        totalPresence={0}
      />,
    )

    const hud = screen.getByLabelText('Office world status')
    expect(hud).toHaveTextContent('00:44:00')
    expect(hud).toHaveTextContent('Night quiet')
    expect(hud).toHaveTextContent('Closed')
    expect(hud).toHaveTextContent('0 in office')
    expect(hud).toHaveTextContent('Ambient cap 0')
    expect(hud).toHaveTextContent('Morning arrival')
    expect(hud).toHaveTextContent('07:00')
    expect(screen.getByRole('button', { name: 'Mock 3D member' })).toHaveAttribute(
      'data-office-mode',
      'NIGHT_QUIET',
    )
  })

  it('keeps workspace context, controls, and world status hierarchically separate', () => {
    render(
      <OfficeScene
        stages={[]}
        agents={[]}
        profiles={[]}
        selectedAgentId={null}
        onSelectAgent={vi.fn()}
        motionPaused={false}
        mode="live"
        replayNonce={0}
        replayStartedAt={null}
        replayRange={null}
        showRoster={false}
        presentation="workspace"
        floor="build"
        workspaceMembers={[]}
        onFloorChange={vi.fn()}
        presenceLabel="Quiet floor · no presence"
        officeHour={9}
        worldContext={officeWorldContext(
          new Date('2026-09-29T02:20:00Z'),
          'Asia/Jakarta',
        )}
        totalPresence={0}
      />,
    )

    expect(screen.getByText('Office Workspace')).toBeInTheDocument()
    expect(
      screen.getByText('Live office view · No active run selected'),
    ).toBeInTheDocument()
    expect(screen.getByText('Controls')).toBeInTheDocument()
    expect(
      screen.queryByText(/No factual Run selected/i),
    ).not.toBeInTheDocument()
    const activeFloor = screen.getByRole('button', { name: /L2.*Build/i })
    expect(activeFloor).toBeInTheDocument()
    expect(activeFloor).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getAllByText('Build')).toHaveLength(1)
  })

  it('keeps every floor name contained inside its switcher card', () => {
    render(
      <OfficeScene
        stages={[]}
        agents={[]}
        profiles={[]}
        selectedAgentId={null}
        onSelectAgent={vi.fn()}
        motionPaused={false}
        mode="live"
        replayNonce={0}
        replayStartedAt={null}
        replayRange={null}
        showRoster={false}
        presentation="workspace"
        floor="commons"
        workspaceMembers={[member]}
        onFloorChange={vi.fn()}
        officeHour={20}
      />,
    )

    const switcher = screen.getByRole('group', { name: 'Office floor' })
    expect(switcher).toHaveClass('office-floor-switcher-workspace')
    expect(within(switcher).getAllByRole('button')).toHaveLength(3)

    for (const [shortLabel, label] of [
      ['L1', 'Commons'],
      ['L2', 'Build'],
      ['L3', 'Strategy'],
    ] as const) {
      const chip = within(switcher).getByRole('button', {
        name: new RegExp(`${shortLabel}.*${label}`, 'i'),
      })

      expect(within(chip).getByText(shortLabel)).toHaveClass(
        'office-floor-chip-code',
      )
      expect(within(chip).getByText(label)).toHaveClass(
        'office-floor-chip-name',
      )
      expect(within(chip).getByLabelText(/present/i)).toHaveClass(
        'office-floor-chip-count',
      )
    }

    expect(screen.getAllByText('Commons')).toHaveLength(1)
    expect(screen.getAllByText('Build')).toHaveLength(1)
    expect(screen.getAllByText('Strategy')).toHaveLength(1)
  })

  it('shows truthful per-floor presence counts', () => {
    render(
      <OfficeScene
        stages={[]}
        agents={[]}
        profiles={[]}
        selectedAgentId={null}
        onSelectAgent={vi.fn()}
        motionPaused={false}
        mode="live"
        replayNonce={0}
        replayStartedAt={null}
        replayRange={null}
        showRoster={false}
        presentation="workspace"
        floor="commons"
        workspaceMembers={[
          member,
          {
            ...member,
            id: 'planning:thread:product-manager',
            agent_profile_key: 'product-manager',
            name: 'Product Manager',
            floor: 'strategy',
            zone: 'planning-table',
            status: 'PLANNING',
            behavior: 'PLANNING_MEETING',
            truth: 'PLANNING',
          },
        ]}
        onFloorChange={vi.fn()}
        presenceLabel="Social break · ambient"
        officeHour={20}
      />,
    )

    expect(
      screen.getByRole('button', { name: /L1.*Commons/i }),
    ).toHaveTextContent('1')
    expect(
      screen.getByRole('button', { name: /L2.*Build/i }),
    ).toHaveTextContent('0')
    expect(
      screen.getByRole('button', { name: /L3.*Strategy/i }),
    ).toHaveTextContent('1')
  })

  it('keeps floor switching presentation-only', () => {
    const onFloorChange = vi.fn()

    render(
      <OfficeScene
        stages={[]}
        agents={[]}
        profiles={[]}
        selectedAgentId={null}
        onSelectAgent={vi.fn()}
        motionPaused={false}
        mode="live"
        replayNonce={0}
        replayStartedAt={null}
        replayRange={null}
        showRoster={false}
        presentation="workspace"
        floor="commons"
        workspaceMembers={[member]}
        onFloorChange={onFloorChange}
        presenceLabel="After hours · ambient"
        officeHour={23}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /L2.*Build/i }))
    expect(onFloorChange).toHaveBeenCalledWith('build')
  })
})
