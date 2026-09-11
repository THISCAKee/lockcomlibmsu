import test from 'node:test';
import assert from 'node:assert/strict';
import { isKnownMachine } from '../lib/server/config';

test('accepts only the configured 203-machine inventory', () => {
  const config = { machinePrefix: 'PC-', machineCount: 203 } as Parameters<typeof isKnownMachine>[1];
  assert.equal(isKnownMachine('PC-001', config), true);
  assert.equal(isKnownMachine('PC-203', config), true);
  assert.equal(isKnownMachine('PC-000', config), false);
  assert.equal(isKnownMachine('PC-204', config), false);
  assert.equal(isKnownMachine('PC-1', config), false);
  assert.equal(isKnownMachine('PC-203x', config), false);
});
