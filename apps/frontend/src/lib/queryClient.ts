import { QueryClient } from "@tanstack/react-query";

/**
 * TanStack Query client configuration
 * Provides default settings for data fetching, caching, and synchronization
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Default stale time: 5 minutes
      staleTime: 1000 * 60 * 5,
      // Default cache time: 10 minutes
      gcTime: 1000 * 60 * 10,
      // Retry failed requests 3 times
      retry: 3,
      // Refetch on window focus
      refetchOnWindowFocus: true,
    },
    mutations: {
      // Retry failed mutations once
      retry: 1,
    },
  },
});
