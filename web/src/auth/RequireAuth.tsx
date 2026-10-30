import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useMe } from './useAuth';

export function RequireAuth({ children }: { children: ReactNode }) {
  const me = useMe();
  const location = useLocation();

  if (me.isPending) return null;
  if (!me.data) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}
