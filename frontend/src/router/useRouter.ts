import { useContext } from 'react'
import { RouterContext, type RouterContextValue } from './RouterContext'

export function useRouter(): RouterContextValue {
  const context = useContext(RouterContext)
  if (!context) {
    throw new Error('useRouter must be used within a Router')
  }
  return context
}
