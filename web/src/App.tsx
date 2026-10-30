import { createBrowserRouter, RouterProvider } from 'react-router';
import { RequireAuth } from './auth/RequireAuth';
import { Layout } from './components/Layout';
import { DriversPage } from './pages/DriversPage';
import { EventsPage } from './pages/EventsPage';
import { HistoryPage } from './pages/HistoryPage';
import { LocationsPage } from './pages/LocationsPage';
import { LoginPage } from './pages/LoginPage';
import { MapPage } from './pages/MapPage';
import { PlaceholderPage } from './pages/PlaceholderPage';

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: (
      <RequireAuth>
        <Layout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <MapPage /> },
      { path: 'history', element: <HistoryPage /> },
      { path: 'drivers', element: <DriversPage /> },
      { path: 'locations', element: <LocationsPage /> },
      { path: 'work-log', element: <PlaceholderPage title="Dnevnik rada" /> },
      { path: 'events', element: <EventsPage /> },
      { path: 'assistant', element: <PlaceholderPage title="Asistent" /> },
      { path: '*', element: <PlaceholderPage title="Stranica nije pronađena" /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
