import test from 'node:test';
import assert from 'node:assert/strict';
import { MACHINE_ZONES, machineCountForZone, zoneForMachine } from '../lib/server/zones';

test('maps every machine boundary to the approved zone', () => {
  assert.equal(zoneForMachine('PC-001'), 'A-407');
  assert.equal(zoneForMachine('PC-050'), 'A-407');
  assert.equal(zoneForMachine('PC-051'), 'A-412');
  assert.equal(zoneForMachine('PC-100'), 'A-412');
  assert.equal(zoneForMachine('PC-101'), 'A-410');
  assert.equal(zoneForMachine('PC-150'), 'A-410');
  assert.equal(zoneForMachine('PC-151'), 'ชั้น-3');
  assert.equal(zoneForMachine('PC-171'), 'ชั้น-3');
  assert.equal(zoneForMachine('PC-172'), 'DLP');
  assert.equal(zoneForMachine('PC-201'), 'DLP');
  assert.equal(zoneForMachine('PC-202'), 'ศูนย์อีสาน');
  assert.equal(zoneForMachine('PC-203'), 'ศูนย์อีสาน');
  assert.equal(zoneForMachine('PC-204'), null);
});

test('zone counts sum to the 203-machine inventory', () => {
  assert.deepEqual(MACHINE_ZONES.map(zone => machineCountForZone(zone.name)), [50, 50, 50, 21, 30, 2]);
  assert.equal(MACHINE_ZONES.reduce((total, zone) => total + machineCountForZone(zone.name), 0), 203);
});
