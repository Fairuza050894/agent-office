import { NAV_SECTIONS, NAV_ITEMS, type NavSection } from '../types/navigation'
import { Link } from '../router/Link'
import { useRouter } from '../router/useRouter'

export interface NavigationProps {
  isOpen: boolean
  onClose?: () => void
  isCollapsed?: boolean
  onToggleCollapsed?: () => void
}

const SECTION_LABELS: Record<NavSection, string> = {
  WORK: 'Work',
  ENGINEERING: 'Engineering',
  OBSERVABILITY: 'Observability',
  CONTROL: 'Control',
}

const CORE_NAV_IDS = new Set(['office', 'projects', 'runs'])

export function Navigation({
  isOpen,
  onClose,
  isCollapsed = false,
  onToggleCollapsed,
}: NavigationProps) {
  const { currentPath } = useRouter()
  const coreItems = NAV_ITEMS.filter((item) => CORE_NAV_IDS.has(item.id))
  const utilityItems = NAV_ITEMS.filter((item) => !CORE_NAV_IDS.has(item.id))
  const utilityRouteActive = utilityItems.some((item) => item.path === currentPath)

  const getUtilityItemsBySection = (section: NavSection) =>
    utilityItems.filter((item) => item.section === section)

  return (
    <>
      {isOpen && (
        <div
          className="nav-backdrop"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        className={`app-sidebar ${isOpen ? 'open' : ''} ${isCollapsed ? 'sidebar-collapsed' : ''}`}
        aria-label="Sidebar Navigation"
      >
        <div className="sidebar-brand">
          <div className="brand-mark" aria-hidden="true">AO</div>
          <div className="brand-header">
            <span className="brand-title">Agent Office</span>
            <span className="brand-subtitle">Engineering control plane</span>
          </div>
          {onToggleCollapsed && (
            <button
              type="button"
              className="sidebar-collapse-btn"
              onClick={onToggleCollapsed}
              aria-label={isCollapsed ? 'Expand Office navigation' : 'Collapse Office navigation'}
              title={isCollapsed ? 'Expand navigation' : 'Collapse navigation for a wider Office'}
            >
              <span aria-hidden="true">{isCollapsed ? '›' : '‹'}</span>
            </button>
          )}
          {onClose && (
            <button
              type="button"
              className="nav-close-btn"
              onClick={onClose}
              aria-label="Close navigation menu"
            >
              ✕
            </button>
          )}
        </div>

        <nav className="sidebar-nav" aria-label="Primary Navigation">
          <div className="nav-section">
            <div className="nav-section-title">Core</div>
            <ul className="nav-list">
              {coreItems.map((item) => (
                <li key={item.id} className="nav-item">
                  <Link
                    href={item.path}
                    className="nav-link"
                    activeClassName="active"
                    onClick={onClose}
                  >
                    <span className="nav-label">{item.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {!isCollapsed && (
            <details
              className="nav-tools"
              open={utilityRouteActive ? true : undefined}
            >
              <summary>More tools</summary>
              <div className="nav-tools-body">
                {NAV_SECTIONS.map((section) => {
                  const items = getUtilityItemsBySection(section)
                  if (items.length === 0) return null

                  return (
                    <div key={section} className="nav-section nav-section-utility">
                      <div
                        className="nav-section-title"
                        id={`section-${section.toLowerCase()}`}
                      >
                        {SECTION_LABELS[section]}
                      </div>
                      <ul
                        className="nav-list"
                        aria-labelledby={`section-${section.toLowerCase()}`}
                      >
                        {items.map((item) => (
                          <li key={item.id} className="nav-item">
                            <Link
                              href={item.path}
                              className="nav-link"
                              activeClassName="active"
                              onClick={onClose}
                            >
                              <span className="nav-label">{item.label}</span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )
                })}
              </div>
            </details>
          )}
        </nav>

        <div className="sidebar-footer">
          <span>Local-first</span>
          <span className="sidebar-footer-separator" aria-hidden="true">·</span>
          <span>Isolated workspaces</span>
        </div>
      </aside>
    </>
  )
}
