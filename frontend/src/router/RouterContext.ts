import { createContext } from 'react'

export interface RouterContextValue {
  currentPath: string
  currentSearch: string
  navigate: (path: string) => void
}

export const RouterContext = createContext<RouterContextValue | null>(null)
