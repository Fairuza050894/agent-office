import { type AnchorHTMLAttributes, type MouseEvent, type ReactNode } from 'react'
import { useRouter } from './useRouter'
import { normalizePath } from './normalizePath'

export interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string
  children: ReactNode
  activeClassName?: string
}

export function Link({
  href,
  children,
  className = '',
  activeClassName = 'active',
  onClick,
  ...rest
}: LinkProps) {
  const { currentPath, navigate } = useRouter()
  const normalizedHref = normalizePath(href)
  const isActive = currentPath === normalizedHref

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (onClick) {
      onClick(e)
    }

    // Allow default behavior for modifier keys (open in new tab/window)
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      return
    }

    e.preventDefault()
    if (!isActive) {
      navigate(normalizedHref)
    }
  }

  const combinedClassName = [
    className,
    isActive ? activeClassName : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <a
      href={normalizedHref}
      className={combinedClassName}
      aria-current={isActive ? 'page' : undefined}
      onClick={handleClick}
      {...rest}
    >
      {children}
    </a>
  )
}
