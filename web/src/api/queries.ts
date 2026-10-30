import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './client';
import type {
  Driver,
  FleetEvent,
  Location,
  LocationInput,
  RoutePoint,
  Stop,
  Trip,
  Vehicle,
  VehicleToday,
} from './types';

export function useVehicles({ refetchInterval }: { refetchInterval?: number } = {}) {
  return useQuery({
    queryKey: ['vehicles'],
    queryFn: async () => (await apiFetch<{ vehicles: Vehicle[] }>('/vehicles')).vehicles,
    refetchInterval,
  });
}

export function useRoute(
  vehicleId: number | undefined,
  day: string,
  { refetchInterval }: { refetchInterval?: number } = {},
) {
  return useQuery({
    queryKey: ['route', vehicleId, day],
    enabled: vehicleId !== undefined,
    refetchInterval,
    queryFn: async () =>
      (await apiFetch<{ points: RoutePoint[] }>(`/vehicles/${vehicleId}/route?day=${day}`)).points,
  });
}

export function useTrips(vehicleId: number | undefined, day: string) {
  return useQuery({
    queryKey: ['trips', vehicleId, day],
    enabled: vehicleId !== undefined,
    queryFn: async () =>
      (await apiFetch<{ trips: Trip[] }>(`/vehicles/${vehicleId}/trips?from=${day}&to=${day}`))
        .trips,
  });
}

export function useStops(vehicleId: number | undefined, day: string) {
  return useQuery({
    queryKey: ['stops', vehicleId, day],
    enabled: vehicleId !== undefined,
    queryFn: async () =>
      (await apiFetch<{ stops: Stop[] }>(`/vehicles/${vehicleId}/stops?from=${day}&to=${day}`))
        .stops,
  });
}

export function useEvents(params: { from: string; to: string; type?: string; vehicle?: number }) {
  const search = new URLSearchParams({ from: params.from, to: params.to });
  if (params.type) search.set('type', params.type);
  if (params.vehicle) search.set('vehicle', String(params.vehicle));
  return useQuery({
    queryKey: ['events', params],
    queryFn: async () => (await apiFetch<{ events: FleetEvent[] }>(`/events?${search}`)).events,
  });
}

export function useVehicleToday(vehicleId: number | undefined) {
  return useQuery({
    queryKey: ['vehicle-today', vehicleId],
    enabled: vehicleId !== undefined,
    refetchInterval: 60_000,
    queryFn: () => apiFetch<VehicleToday>(`/vehicles/${vehicleId}/today`),
  });
}

export function useLocations() {
  return useQuery({
    queryKey: ['locations'],
    queryFn: async () => (await apiFetch<{ locations: Location[] }>('/locations')).locations,
    staleTime: 5 * 60_000,
  });
}

export function useSaveLocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      fromStop,
      input,
    }: {
      id?: number;
      fromStop?: boolean;
      input: LocationInput;
    }) => {
      const path =
        id !== undefined ? `/locations/${id}` : fromStop ? '/locations/from-stop' : '/locations';
      const res = await apiFetch<{ location: Location }>(path, {
        method: id !== undefined ? 'PUT' : 'POST',
        body: JSON.stringify(input),
      });
      return res.location;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['locations'] });
      void queryClient.invalidateQueries({ queryKey: ['vehicles'] });
    },
  });
}

export function useDeleteLocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiFetch<void>(`/locations/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['locations'] });
      void queryClient.invalidateQueries({ queryKey: ['vehicles'] });
    },
  });
}

export function useDrivers() {
  return useQuery({
    queryKey: ['drivers'],
    queryFn: async () => (await apiFetch<{ drivers: Driver[] }>('/drivers')).drivers,
  });
}

export interface DriverInput {
  name?: string;
  phone?: string | null;
  notes?: string | null;
  active?: boolean;
}

export function useSaveDriver() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id?: number; input: DriverInput }) =>
      (
        await apiFetch<{ driver: Driver }>(id !== undefined ? `/drivers/${id}` : '/drivers', {
          method: id !== undefined ? 'PUT' : 'POST',
          body: JSON.stringify(input),
        })
      ).driver,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['drivers'] });
      void queryClient.invalidateQueries({ queryKey: ['vehicles'] });
    },
  });
}

/** Sets the current driver of a vehicle; null leaves it without a driver. */
export function useDeleteDriver() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiFetch<void>(`/drivers/${id}`, { method: 'DELETE' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['drivers'] }),
  });
}

export function useAssignDriver() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ vehicleId, driverId }: { vehicleId: number; driverId: number | null }) =>
      apiFetch<void>(`/vehicles/${vehicleId}/driver`, {
        method: 'PUT',
        body: JSON.stringify({ driver_id: driverId }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['drivers'] });
      void queryClient.invalidateQueries({ queryKey: ['vehicles'] });
    },
  });
}
