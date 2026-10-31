import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { Vehicle } from './types';

/** Without a live position for this long, the map falls back to fast polling. */
const FRESH_MS = 60_000;

/**
 * Forwarded positions from GET /api/live, written straight into the `['vehicles']` query.
 * Returns whether positions are arriving: the map then polls only as a safety net. Locally,
 * where Traccar cannot reach the API, the stream stays quiet and polling does the work.
 */
export function useLiveVehicles(): boolean {
  const queryClient = useQueryClient();
  const [fresh, setFresh] = useState(false);

  useEffect(() => {
    const source = new EventSource('/api/live');
    let staleTimer: ReturnType<typeof setTimeout> | undefined;
    let dropped = false;

    function markStale() {
      clearTimeout(staleTimer);
      setFresh(false);
    }

    source.addEventListener('ready', () => {
      // Back after a drop (deploy, network): catch up on what the stream missed.
      if (dropped) void queryClient.invalidateQueries({ queryKey: ['vehicles'], exact: true });
      dropped = false;
    });
    source.addEventListener('vehicle', (e) => {
      const vehicle = JSON.parse((e as MessageEvent<string>).data) as Vehicle;
      // Only known vehicles are replaced; a new one arrives with the next poll, in sorted order.
      queryClient.setQueryData<Vehicle[]>(['vehicles'], (list) =>
        list?.map((v) => (v.id === vehicle.id ? vehicle : v)),
      );
      setFresh(true);
      clearTimeout(staleTimer);
      staleTimer = setTimeout(markStale, FRESH_MS);
    });
    // EventSource reconnects by itself; until then the map polls fast again.
    source.addEventListener('error', () => {
      dropped = true;
      markStale();
    });

    return () => {
      clearTimeout(staleTimer);
      source.close();
    };
  }, [queryClient]);

  return fresh;
}
