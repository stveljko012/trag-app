import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { Vehicle } from './types';

/**
 * Forwarded positions from GET /api/live, written straight into the `['vehicles']` query.
 * Returns whether the stream is connected and the server has the webhook configured: the map
 * then polls only as a safety net. Locally, without a webhook secret, it polls as before.
 */
export function useLiveVehicles(): boolean {
  const queryClient = useQueryClient();
  const [live, setLive] = useState(false);

  useEffect(() => {
    const source = new EventSource('/api/live');
    let dropped = false;

    source.addEventListener('ready', (e) => {
      const { webhook } = JSON.parse((e as MessageEvent<string>).data) as { webhook: boolean };
      setLive(webhook);
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
    });
    // EventSource reconnects by itself; until then the map polls fast again.
    source.addEventListener('error', () => {
      dropped = true;
      setLive(false);
    });

    return () => source.close();
  }, [queryClient]);

  return live;
}
