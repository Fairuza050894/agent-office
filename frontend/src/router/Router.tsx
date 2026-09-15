import { useEffect, useState, type ReactNode } from 'react'
import { RouterContext } from './RouterContext'
import { normalizePath } from './normalizePath'

export interface RouterProps {
  children: ReactNode
  initialPath?: string
}

export function Router({ children, initialPath }: RouterProps) {
  const [currentPath, setCurrentPath] = useState<string>(() => {
    if (initialPath) {
      return normalizePath(initialPath)
    }
    if (typeof window !== 'undefined' && window.location) {
      return normalizePath(window.location.pathname)
    }
    return '/overview'
  })

  useEffect(() => {
    if (typeof window === 'undefined') return

    const handlePopState = () => {
      setCurrentPath(normalizePath(window.location.pathname))
    }

    window.addEventListener('popstate', handlePopState)
    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
  }, [])

  const navigate = (path: string) => {
    const normalized = normalizePath(path)
    if (typeof window !== 'undefined' && window.history) {
      window.history.pushState({}, '', normalized)
    }
    setCurrentPath(normalized)
  }

  return (
    <RouterContext.Provider value={{ currentPath, navigate }}>
      {children}
    </RouterContext.Provider>
  )
}
