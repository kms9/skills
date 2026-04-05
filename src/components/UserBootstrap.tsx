import { useEffect } from 'react'
import { useAuthStatus } from '../lib/useAuthStatus'

export function UserBootstrap() {
  const { isAuthenticated, isLoading } = useAuthStatus()

  // Phase 1: No user bootstrapping needed
  useEffect(() => {
    if (isLoading || !isAuthenticated) return
    // Phase 1: No-op, will be implemented in Phase 2
  }, [isAuthenticated, isLoading])

  return null
}
