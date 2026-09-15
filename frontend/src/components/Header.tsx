import { useRouter } from '../router/useRouter'
import { NAV_ITEMS } from '../types/navigation'

export interface HeaderProps {
  onToggleNav: () => void
  isNavOpen: boolean
}

export function Header({ onToggleNav, isNavOpen }: HeaderProps) {
  const { currentPath } = useRouter()
  const activeItem = NAV_ITEMS.find((item) => item.path === currentPath)

  return (
    <header className="app-header" role="banner">
      <div className="header-left">
        <button
          type="button"
          className="nav-toggle-btn"
          onClick={onToggleNav}
          aria-label="Toggle navigation menu"
          aria-expanded={isNavOpen}
        >
          <span className="nav-toggle-bar" />
          <span className="nav-toggle-bar" />
          <span className="nav-toggle-bar" />
        </button>

        <div className="header-breadcrumb" aria-label="Breadcrumb">
          <span className="breadcrumb-root">Agent Office</span>
          <span className="breadcrumb-separator" aria-hidden="true">
            /
          </span>
          <span className="breadcrumb-current">
            {activeItem ? activeItem.label : 'Operations'}
          </span>
        </div>
      </div>

      <div className="header-right">
        <div className="system-pill" title="Control plane status">
          <span className="status-dot disconnected" aria-hidden="true" />
          <span className="status-text">Phase 1G Shell</span>
          <span className="status-subtext">(No backend connected)</span>
        </div>
      </div>
    </header>
  )
}
