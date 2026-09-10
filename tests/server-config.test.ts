import test from 'node:test';
import assert from 'node:assert/strict';
import { isKnownMachine } from '../lib/server/config';

test('accepts only the configured 201-machine inventory', () => {
  const config = { machinePrefix: 'PC-', machineCount: 201 } as Parameters<typeof isKnownMachine>[1];
  assert.equal(isKnownMachine('PC-001', config), true);
  assert.equal(isKnownMachine('PC-201', config), true);
  assert.equal(isKnownMachine('PC-000', config), false);
  assert.equal(isKnownMachine('PC-202', config), false);
  assert.equal(isKnownMachine('PC-1', config), false);
  assert.equal(isKnownMachine('PC-201x', config), false);
});
