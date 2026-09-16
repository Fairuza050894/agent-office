import { type AnchorHTMLAttributes, type MouseEvent, type ReactNode } from 'react'
import { useRouter } from './useRouter'
import { normalizePath } from './normalizePath'

export interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string
  children: ReactNode
  activeClassName?: string
}

function extractSearch(href: string): string {
  const clean = href.trim().split('#')[0]
  const queryIndex = clean.indexOf('?')
  if (queryIndex < 0) return ''

  const params = new URLSearchParams(clean.slice(queryIndex + 1))
  const query = params.toString()
  return query ? `?${query}` : ''
}

export function Link({
  href,
  children,
  className = '',
  activeClassName = 'active',
  onClick,
  ...rest
}: LinkProps) {
  const { currentPath, currentSearch, navigate } = useRouter()
  const normalizedHref = normalizePath(href)
  const targetSearch = extractSearch(href)
  const targetHref = `${normalizedHref}${targetSearch}`
  const isActive = currentPath === normalizedHref
  const isSameLocation = isActive && currentSearch === targetSearch

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (onClick) {
      onClick(event)
    }

    if (
      event.defaultPrevented ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return
    }

    event.preventDefault()
    if (!isSameLocation) {
      navigate(targetHref)
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
      href={targetHref}
      className={combinedClassName}
      aria-current={isActive ? 'page' : undefined}
      onClick={handleClick}
      {...rest}
    >
      {children}
    </a>
  )
}
