import type { components } from './schema.js';

type Schemas = components['schemas'];
type Attributes = Record<string, unknown>;
type WithAttributes<T> = Omit<T, 'attributes'> & { attributes?: Attributes };

// The generated schema marks every field optional; these narrow the ones Traccar always sends.
export type Device = WithAttributes<Schemas['Device']> & {
  id: number;
  name: string;
  category?: string | null;
};
export type Position = WithAttributes<Schemas['Position']> & {
  id: number;
  deviceId: number;
  latitude: number;
  longitude: number;
  fixTime: string;
};
export type Geofence = WithAttributes<Schemas['Geofence']> & {
  id: number;
  name: string;
  area: string;
};
export type GeofenceInput = Omit<Geofence, 'id'>;
// The published schema omits geofenceId/maintenanceId, which Traccar does return.
export type Event = WithAttributes<Schemas['Event']> & {
  id: number;
  type: string;
  eventTime: string;
  deviceId: number;
  positionId?: number;
  geofenceId?: number;
  maintenanceId?: number;
};
export type Trip = Schemas['ReportTrips'] & {
  deviceId: number;
  startTime: string;
  endTime: string;
};
// Traccar actually returns latitude/longitude on stops; the published schema says lat/lon.
export type Stop = Schemas['ReportStops'] & {
  deviceId: number;
  startTime: string;
  endTime: string;
  latitude?: number;
  longitude?: number;
};

export type Summary = Schemas['ReportSummary'] & { deviceId: number };

export interface TraccarConfig {
  url: string;
  token?: string;
  user?: string;
  pass?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

export class TraccarError extends Error {
  constructor(
    /** HTTP status from Traccar, or 0 when the request never got a response. */
    public readonly status: number,
    public readonly path: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'TraccarError';
  }
}

type QueryValue = string | number | Date | readonly (string | number)[] | undefined;

export class TraccarClient {
  private readonly baseUrl: string;
  private readonly authorization: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(config: TraccarConfig) {
    this.baseUrl = config.url.replace(/\/+$/, '');
    if (config.token) {
      this.authorization = `Bearer ${config.token}`;
    } else if (config.user && config.pass) {
      const basic = Buffer.from(`${config.user}:${config.pass}`).toString('base64');
      this.authorization = `Basic ${basic}`;
    } else {
      throw new Error('Traccar auth missing: set TRACCAR_TOKEN or TRACCAR_USER and TRACCAR_PASS');
    }
    this.timeoutMs = config.timeoutMs ?? 15_000;
    this.fetchImpl = config.fetch ?? fetch;
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    { query, body }: { query?: Record<string, QueryValue>; body?: unknown } = {},
  ): Promise<T> {
    const url = new URL(this.baseUrl + path);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value === undefined) continue;
      const items = Array.isArray(value) ? value : [value];
      for (const item of items) {
        url.searchParams.append(key, item instanceof Date ? item.toISOString() : String(item));
      }
    }

    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method,
        headers: {
          Authorization: this.authorization,
          // Without this, report endpoints answer with an Excel file.
          Accept: 'application/json',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      throw new TraccarError(
        0,
        path,
        `Traccar ${method} ${path} failed: ${(err as Error).message}`,
        {
          cause: err,
        },
      );
    }

    if (!res.ok) {
      const text = (await res.text().catch(() => '')).slice(0, 300);
      throw new TraccarError(
        res.status,
        path,
        `Traccar ${method} ${path} returned ${res.status}${text ? `: ${text}` : ''}`,
      );
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  /**
   * Cheap authenticated call that loads no data, to check reachability and the credentials.
   * (`GET /session` only knows cookie sessions and answers 404 to a bearer token.)
   */
  async ping(): Promise<void> {
    await this.request('GET', '/devices', { query: { id: 0 } });
  }

  getDevices(): Promise<Device[]> {
    return this.request('GET', '/devices');
  }

  /** Latest known position of every device the user can see. */
  getLatestPositions(): Promise<Position[]> {
    return this.request('GET', '/positions');
  }

  getPositions(deviceId: number, from: Date, to: Date): Promise<Position[]> {
    return this.request('GET', '/positions', { query: { deviceId, from, to } });
  }

  getRoute(deviceId: number, from: Date, to: Date): Promise<Position[]> {
    return this.request('GET', '/reports/route', { query: { deviceId, from, to } });
  }

  async getTrips(deviceIds: readonly number[], from: Date, to: Date): Promise<Trip[]> {
    if (deviceIds.length === 0) return [];
    return this.request('GET', '/reports/trips', { query: { deviceId: deviceIds, from, to } });
  }

  async getStops(deviceIds: readonly number[], from: Date, to: Date): Promise<Stop[]> {
    if (deviceIds.length === 0) return [];
    return this.request('GET', '/reports/stops', { query: { deviceId: deviceIds, from, to } });
  }

  async getEvents(
    deviceIds: readonly number[],
    from: Date,
    to: Date,
    types?: readonly string[],
  ): Promise<Event[]> {
    if (deviceIds.length === 0) return [];
    return this.request('GET', '/reports/events', {
      query: { deviceId: deviceIds, from, to, type: types?.length ? types : undefined },
    });
  }

  async getSummary(deviceIds: readonly number[], from: Date, to: Date): Promise<Summary[]> {
    if (deviceIds.length === 0) return [];
    return this.request('GET', '/reports/summary', { query: { deviceId: deviceIds, from, to } });
  }

  getGeofences(): Promise<Geofence[]> {
    return this.request('GET', '/geofences');
  }

  getGeofence(id: number): Promise<Geofence> {
    return this.request('GET', `/geofences/${id}`);
  }

  createGeofence(input: GeofenceInput): Promise<Geofence> {
    return this.request('POST', '/geofences', { body: input });
  }

  updateGeofence(geofence: Geofence): Promise<Geofence> {
    return this.request('PUT', `/geofences/${geofence.id}`, { body: geofence });
  }

  async deleteGeofence(id: number): Promise<void> {
    await this.request('DELETE', `/geofences/${id}`);
  }

  /** Links a geofence to a device; Traccar only raises geofence events for linked devices. */
  async linkGeofenceToDevice(geofenceId: number, deviceId: number): Promise<void> {
    await this.request('POST', '/permissions', { body: { deviceId, geofenceId } });
  }
}
