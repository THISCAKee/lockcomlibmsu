export type MachineStatusFilter = 'all' | 'available' | 'inuse';

export type FilterableMachine = {
  machineId: string;
  name: string;
  status: 'Available' | 'InUse';
  userEmail?: string;
};

export function filterMachines<T extends FilterableMachine>(
  machines: T[],
  query: string,
  status: MachineStatusFilter,
) {
  const normalizedQuery = query.trim().toLocaleLowerCase();

  return machines.filter(machine => {
    const matchesStatus = status === 'all' ||
      (status === 'available' && machine.status === 'Available') ||
      (status === 'inuse' && machine.status === 'InUse');
    const searchableText = `${machine.machineId} ${machine.name} ${machine.userEmail ?? ''}`.toLocaleLowerCase();
    return matchesStatus && (!normalizedQuery || searchableText.includes(normalizedQuery));
  });
}
