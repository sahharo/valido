import { QueryCache, QueryClient, useQuery } from '@tanstack/react-query'
import { api, ApiError, qs } from './api.ts'
import type { Permission } from '../shared/domain.ts'
import type { Me } from './types.ts'

export const queryClient = new QueryClient({
  // An expired session on any request sends the user back to the login screen.
  queryCache: new QueryCache({
    onError: (err) => {
      if (err instanceof ApiError && err.status === 401) queryClient.setQueryData(['me'], null)
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: (n, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && n < 2,
      refetchOnWindowFocus: true,
    },
  },
})

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () =>
      api<Me>('/api/auth/me').catch((e) => {
        if (e instanceof ApiError && e.status === 401) return null
        throw e
      }),
    staleTime: Infinity,
  })
}

// Call after any change to lots/products so every screen (dashboard cards included) updates at once.
export const refreshData = () =>
  queryClient.invalidateQueries({
    predicate: (q) => ['dashboard', 'lots', 'lot', 'product', 'products', 'notifications', 'reports'].includes(q.queryKey[0] as string),
  })

export const setMe = (me: Me | null) => queryClient.setQueryData(['me'], me)

export const storeParam = (storeId: number | 'all') => (storeId === 'all' ? undefined : storeId)

export function useApi<T>(key: unknown[], path: string, params: Parameters<typeof qs>[0] = {}, enabled = true) {
  return useQuery({ queryKey: [...key, params], queryFn: () => api<T>(path + qs(params)), enabled })
}

export function useCan() {
  const { data } = useMe()
  return (p: Permission) => !!data?.permissions.includes(p)
}
