import { useEffect, useState, type ReactNode } from 'react'
import { RouterContext } from './RouterContext'
import { normalizePath } from './normalizePath'

export interface RouterProps {
  children: ReactNode
  initialPath?: string
}

interface RouteLocation {
  path: string
  search: string
  href: string
}

function parseLocation(value: string): RouteLocation {
  const clean = value.trim().split('#')[0]
  const queryIndex = clean.indexOf('?')
  const rawPath = queryIndex >= 0 ? clean.slice(0, queryIndex) : clean
  const rawSearch = queryIndex >= 0 ? clean.slice(queryIndex + 1) : ''
  const path = normalizePath(rawPath)
  const params = new URLSearchParams(rawSearch)
  const query = params.toString()
  const search = query ? `?${query}` : ''

  return {
    path,
    search,
    href: `${path}${search}`,
  }
}

export function Router({ children, initialPath }: RouterProps) {
  const initialLocation = (() => {
    if (initialPath) {
      return parseLocation(initialPath)
    }
    if (typeof window !== 'undefined' && window.location) {
      return parseLocation(`${window.location.pathname}${window.location.search}`)
    }
    return parseLocation('/overview')
  })()

  const [currentPath, setCurrentPath] = useState(initialLocation.path)
  const [currentSearch, setCurrentSearch] = useState(initialLocation.search)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const handlePopState = () => {
      const location = parseLocation(`${window.location.pathname}${window.location.search}`)
      setCurrentPath(location.path)
      setCurrentSearch(location.search)
    }

    window.addEventListener('popstate', handlePopState)
    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
  }, [])

  const navigate = (target: string) => {
    const location = parseLocation(target)
    if (typeof window !== 'undefined' && window.history) {
      window.history.pushState({}, '', location.href)
    }
    setCurrentPath(location.path)
    setCurrentSearch(location.search)
  }

  return (
    <RouterContext.Provider value={{ currentPath, currentSearch, navigate }}>
      {children}
    </RouterContext.Provider>
  )
}
