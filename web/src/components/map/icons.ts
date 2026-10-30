import L from 'leaflet';
import type { DisplayState } from '../../lib/vehicleState';

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

// Lucide "engine" icon (ISC license) as markup, since marker icons are HTML strings.
const ENGINE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M10 3h6"/><path d="M13 3v4"/><path d="M2 10v6"/><path d="M2 13h4"/>' +
  '<path d="M6 16a2 2 0 002 2h1a2 2 0 011.6.8l.3.4a2 2 0 001.6.8h2.264a2 2 0 001.789-1.106l1.67-3.341a1 1 0 01.895-.553H21a1 1 0 001-1v-4a1 1 0 00-1-1h-3.5a1 1 0 01-.8-.4l-.9-1.2A1 1 0 0015 7h-4a1 1 0 00-.8.4l-.9 1.2a1 1 0 01-.8.4H7a1 1 0 00-1 1z"/>' +
  '</svg>';

const vehicleIcons = new Map<string, L.DivIcon>();

/**
 * Plate pill with a state dot and an engine icon (green: ignition on, gray: off, none: unknown).
 * Cached so re-renders don't rebuild marker DOM.
 */
export function vehicleIcon(
  name: string,
  state: DisplayState,
  selected: boolean,
  speed: string | undefined,
  ignition: boolean | null,
) {
  const key = `${name}|${state}|${selected}|${speed ?? ''}|${ignition}`;
  let icon = vehicleIcons.get(key);
  if (!icon) {
    const classes = ['trag-vehicle-pill', `state-${state}`, selected ? 'selected' : ''].join(' ');
    const speedHtml = speed ? `<span class="trag-vehicle-speed">${escapeHtml(speed)}</span>` : '';
    const engineHtml =
      ignition === null
        ? ''
        : `<span class="trag-engine ${ignition ? 'trag-engine-on' : 'trag-engine-off'}" title="Motor ${ignition ? 'upaljen' : 'ugašen'}">${ENGINE_SVG}</span>`;
    icon = L.divIcon({
      className: 'trag-vehicle-marker',
      html: `<div class="${classes}"><span class="trag-dot trag-dot-${state}"></span><span class="trag-vehicle-name">${escapeHtml(name)}</span>${engineHtml}${speedHtml}</div>`,
      iconSize: [0, 0],
    });
    vehicleIcons.set(key, icon);
  }
  return icon;
}

export function stopIcon(label: string, selected: boolean) {
  return L.divIcon({
    className: 'trag-stop-marker',
    html: `<div class="trag-stop-pin${selected ? ' selected' : ''}">${escapeHtml(label)}</div>`,
    iconSize: [0, 0],
  });
}
