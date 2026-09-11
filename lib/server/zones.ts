export type ZoneDefinition = {
  name: string;
  start: number;
  end: number;
};

export const MACHINE_ZONES: readonly ZoneDefinition[] = [
  { name: 'A-407', start: 1, end: 50 },
  { name: 'A-412', start: 51, end: 100 },
  { name: 'A-410', start: 101, end: 150 },
  { name: 'ชั้น-3', start: 151, end: 171 },
  { name: 'DLP', start: 172, end: 201 },
  { name: 'ศูนย์อีสาน', start: 202, end: 203 },
];

export function zoneForMachine(machineId: string): string | null {
  const match = /^PC-(\d{3})$/i.exec(machineId.trim());
  if (!match) return null;
  const machineNumber = Number(match[1]);
  return MACHINE_ZONES.find(zone => machineNumber >= zone.start && machineNumber <= zone.end)?.name ?? null;
}

export function machineCountForZone(zoneName: string) {
  const zone = MACHINE_ZONES.find(candidate => candidate.name === zoneName);
  return zone ? zone.end - zone.start + 1 : 0;
}
