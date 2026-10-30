const EVENT_LABEL: Record<string, string> = {
  deviceOnline: 'Na mreži',
  deviceOffline: 'Van mreže',
  deviceUnknown: 'Status nepoznat',
  deviceInactive: 'Neaktivan',
  deviceMoving: 'Krenuo',
  deviceStopped: 'Zaustavio se',
  deviceOverspeed: 'Prekoračenje brzine',
  deviceFuelDrop: 'Pad goriva',
  deviceFuelIncrease: 'Dopuna goriva',
  geofenceEnter: 'Ulazak u lokaciju',
  geofenceExit: 'Izlazak iz lokacije',
  alarm: 'Alarm',
  ignitionOn: 'Kontakt uključen',
  ignitionOff: 'Kontakt isključen',
  maintenance: 'Održavanje',
  driverChanged: 'Promena vozača',
  textMessage: 'Poruka',
  commandResult: 'Odgovor na komandu',
};

const ALARM_LABEL: Record<string, string> = {
  tow: 'Moguće šlepanje',
  powerCut: 'Prekid napajanja',
  powerOff: 'Uređaj isključen',
  lowBattery: 'Slaba baterija',
  lowPower: 'Slab napon',
  sos: 'SOS',
  overspeed: 'Prekoračenje brzine',
  jamming: 'Ometanje signala',
  accident: 'Nezgoda',
  hardBraking: 'Naglo kočenje',
  hardAcceleration: 'Naglo ubrzanje',
  hardCornering: 'Oštro skretanje',
  vibration: 'Vibracija',
  movement: 'Pomeranje',
  tampering: 'Neovlašćeno otvaranje',
  idle: 'Rad u mestu',
};

/** Types offered in the filter, most useful first. */
export const EVENT_FILTER_TYPES = [
  'geofenceEnter',
  'geofenceExit',
  'alarm',
  'deviceOverspeed',
  'ignitionOn',
  'ignitionOff',
  'deviceMoving',
  'deviceStopped',
  'deviceOnline',
  'deviceOffline',
] as const;

export function eventLabel(type: string): string {
  return EVENT_LABEL[type] ?? type;
}

export function alarmLabel(alarm: string): string {
  return ALARM_LABEL[alarm] ?? alarm;
}
