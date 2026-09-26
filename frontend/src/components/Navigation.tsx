import { NAV_SECTIONS, NAV_ITEMS, type NavSection } from '../types/navigation'
import { Link } from '../router/Link'

export interface NavigationProps {
  isOpen: boolean
  onClose?: () => void
}

const SECTION_LABELS: Record<NavSection, string> = {
  WORK: 'Work',
  ENGINEERING: 'Engineering',
  OBSERVABILITY: 'Observability',
  CONTROL: 'Control',
}

export function Navigation({ isOpen, onClose }: NavigationProps) {
  const getItemsBySection = (section: NavSection) =>
    NAV_ITEMS.filter((item) => item.section === section)

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
        className={`app-sidebar ${isOpen ? 'open' : ''}`}
        aria-label="Sidebar Navigation"
      >
        <div className="sidebar-brand">
          <div className="brand-mark" aria-hidden="true">AO</div>
          <div className="brand-header">
            <span className="brand-title">Agent Office</span>
            <span className="brand-subtitle">Engineering control plane</span>
          </div>
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
          {NAV_SECTIONS.map((section) => {
            const items = getItemsBySection(section)
            return (
              <div key={section} className="nav-section">
                <div className="nav-section-title" id={`section-${section.toLowerCase()}`}>
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
        </nav>

        <div className="sidebar-footer">
          <span>Local-first</span>
          <span className="sidebar-footer-separator" aria-hidden="true">·</span>
          <span>Workspace isolated</span>
        </div>
      </aside>
    </>
  )
}
