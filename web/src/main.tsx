import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ApiError } from './api/client';
import { App } from './App';
import { ME_KEY } from './auth/useAuth';
import 'leaflet/dist/leaflet.css';
import './styles/index.css';
import './styles/map.css';

// Any 401 means the session is gone: clearing `me` sends RequireAuth to the login page.
function onError(err: Error) {
  if (err instanceof ApiError && err.status === 401) queryClient.setQueryData(ME_KEY, null);
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError }),
  mutationCache: new MutationCache({ onError }),
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
