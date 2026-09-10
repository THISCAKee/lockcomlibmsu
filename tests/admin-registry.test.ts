import test from 'node:test';
import assert from 'node:assert/strict';
import { AdminRegistry, AdminConflictError, AdminPermissionError } from '../lib/server/admin-registry';
import { ManualClock } from './test-clock';

test('root Admin is khunanon and added Admins can sign in without management rights', () => {
  const clock = new ManualClock();
  const registry = new AdminRegistry('khunanon.m@msu.ac.th', 'msu.ac.th', clock);

  assert.equal(registry.isRoot('khunanon.m@msu.ac.th'), true);
  assert.equal(registry.isAdmin('staff@msu.ac.th'), false);
  assert.equal(registry.canManage('staff@msu.ac.th'), false);

  const added = registry.add('staff@msu.ac.th', 'khunanon.m@msu.ac.th');
  assert.equal(added.email, 'staff@msu.ac.th');
  assert.equal(registry.isAdmin('STAFF@MSU.AC.TH'), true);
  assert.equal(registry.canManage('staff@msu.ac.th'), false);
  assert.throws(() => registry.add('second@msu.ac.th', 'staff@msu.ac.th'), AdminPermissionError);
});

test('Admin registry rejects duplicate and non-MSU accounts', () => {
  const registry = new AdminRegistry('khunanon.m@msu.ac.th', 'msu.ac.th', new ManualClock());
  registry.add('staff@msu.ac.th', 'khunanon.m@msu.ac.th');
  assert.throws(() => registry.add('STAFF@msu.ac.th', 'khunanon.m@msu.ac.th'), AdminConflictError);
  assert.throws(() => registry.add('outside@example.com', 'khunanon.m@msu.ac.th'), /@msu\.ac\.th/);
});

test('Admin registry restores valid active rows and ignores revoked rows', () => {
  const registry = new AdminRegistry('khunanon.m@msu.ac.th', 'msu.ac.th', new ManualClock());
  registry.restore([
    ['staff@msu.ac.th', 'admin', 'Active', 'khunanon.m@msu.ac.th', '2026-09-10T08:00:00.000Z'],
    ['revoked@msu.ac.th', 'admin', 'Revoked', 'khunanon.m@msu.ac.th', '2026-09-10T08:00:00.000Z'],
    ['invalid@example.com', 'admin', 'Active', 'khunanon.m@msu.ac.th', 'invalid-date'],
  ]);
  assert.equal(registry.isAdmin('staff@msu.ac.th'), true);
  assert.equal(registry.isAdmin('revoked@msu.ac.th'), false);
  assert.equal(registry.list().length, 2);
});
