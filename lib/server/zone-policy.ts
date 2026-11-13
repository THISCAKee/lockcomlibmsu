export type Zone = { id: string; name: string; machines: string[]; dailyLimit: number | null };
export function validateZones(input: unknown, machineCount: number): Zone[] {
  if (!Array.isArray(input)) throw new TypeError('Invalid zones.');
  const ids = new Set<string>(), names = new Set<string>(), machines = new Set<string>();
  return input.map((item: any) => {
    if (!item || typeof item.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(item.id) || item.id === '_unassigned' || ids.has(item.id)) throw new TypeError('Invalid zone ID.');
    if (typeof item.name !== 'string' || !item.name.trim() || names.has(item.name.trim().toLowerCase())) throw new TypeError('Invalid zone name.');
    if (!Array.isArray(item.machines) || (item.dailyLimit !== null && (!Number.isSafeInteger(item.dailyLimit) || item.dailyLimit < 1))) throw new TypeError('Invalid zone limit or machines.');
    const normalized = item.machines.map((machine: unknown) => {
      if (typeof machine !== 'string' || !/^PC-\d{3}$/i.test(machine) || Number(machine.slice(3)) < 1 || Number(machine.slice(3)) > machineCount || machines.has(machine.toUpperCase())) throw new TypeError('Invalid or duplicate machine.');
      machines.add(machine.toUpperCase()); return machine.toUpperCase();
    });
    ids.add(item.id); names.add(item.name.trim().toLowerCase());
    return { id: item.id, name: item.name.trim(), machines: normalized, dailyLimit: item.dailyLimit };
  });
}
export function bangkokDay(value: string | Date) { return new Date(new Date(value).getTime() + 7 * 3600000).toISOString().slice(0, 10); }
export function dailyUsage(sessions: Iterable<{ userEmail: string; zoneId?: string; startedAt: string }>, email: string, zoneId: string, now: Date) {
  const today = bangkokDay(now);
  return Array.from(sessions).filter(s => s.zoneId === zoneId && s.userEmail.toLowerCase() === email.trim().toLowerCase() && bangkokDay(s.startedAt) === today).length;
}
