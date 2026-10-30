import {
  type Device,
  type Geofence,
  type GeofenceInput,
  TraccarClient,
  TraccarError,
  type Trip,
} from '../src/traccar/traccar.js';

/** In-memory stand-in for the geofence/device parts of Traccar. */
export class FakeTraccar {
  geofences = new Map<number, Geofence>();
  links: { geofenceId: number; deviceId: number }[] = [];
  devices: Device[] = [
    { id: 1, name: 'BG 1234-AB', status: 'online' },
    { id: 2, name: 'NS 567-CD', status: 'online' },
  ];
  failLinks = false;
  trips: Trip[] = [];
  private nextId = 100;

  async getDevices() {
    return this.devices;
  }
  async getLatestPositions() {
    return [];
  }
  async getStops() {
    return [];
  }
  async getTrips() {
    return this.trips;
  }
  async getGeofences() {
    return [...this.geofences.values()];
  }
  async getGeofence(id: number) {
    const g = this.geofences.get(id);
    if (!g) throw new TraccarError(404, `/geofences/${id}`, 'not found');
    return g;
  }
  async createGeofence(input: GeofenceInput) {
    const g = { ...input, id: this.nextId++ };
    this.geofences.set(g.id, g);
    return g;
  }
  async updateGeofence(g: Geofence) {
    this.geofences.set(g.id, g);
    return g;
  }
  async deleteGeofence(id: number) {
    this.geofences.delete(id);
  }
  async linkGeofenceToDevice(geofenceId: number, deviceId: number) {
    if (this.failLinks) throw new TraccarError(403, '/permissions', 'forbidden');
    this.links.push({ geofenceId, deviceId });
  }

  asClient(): TraccarClient {
    return this as unknown as TraccarClient;
  }
}
