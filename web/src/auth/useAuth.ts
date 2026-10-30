import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, apiFetch } from '../api/client';

export interface User {
  id: number;
  email: string;
  name: string;
  role: 'owner' | 'viewer';
}

export const ME_KEY = ['me'] as const;

export function useMe() {
  return useQuery({
    queryKey: ME_KEY,
    queryFn: async () => {
      try {
        return (await apiFetch<{ user: User }>('/auth/me')).user;
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: Infinity,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; password: string }) =>
      apiFetch<{ user: User }>('/auth/login', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: ({ user }) => queryClient.setQueryData(ME_KEY, user),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<void>('/auth/logout', { method: 'POST' }),
    onSettled: () => {
      queryClient.clear();
      queryClient.setQueryData(ME_KEY, null);
    },
  });
}
