import test from 'node:test';
import assert from 'node:assert/strict';
import { filterMachines } from '../lib/machines.ts';

const machines = [
  { machineId: 'PC-001', name: 'PC-001', status: 'Available' },
  { machineId: 'PC-002', name: 'PC-002', status: 'InUse', userEmail: 'student@msu.ac.th' },
  { machineId: 'PC-003', name: 'Reading Room', status: 'Available' },
];

test('machine search matches id, name, and current user without case sensitivity', () => {
  assert.deepEqual(filterMachines(machines, 'pc-002', 'all').map(machine => machine.machineId), ['PC-002']);
  assert.deepEqual(filterMachines(machines, 'reading', 'all').map(machine => machine.machineId), ['PC-003']);
  assert.deepEqual(filterMachines(machines, 'STUDENT', 'all').map(machine => machine.machineId), ['PC-002']);
});

test('machine status filter returns only the requested availability', () => {
  assert.deepEqual(filterMachines(machines, '', 'available').map(machine => machine.machineId), ['PC-001', 'PC-003']);
  assert.deepEqual(filterMachines(machines, '', 'inuse').map(machine => machine.machineId), ['PC-002']);
});
