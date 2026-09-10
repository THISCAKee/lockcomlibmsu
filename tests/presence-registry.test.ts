import test from 'node:test';
import assert from 'node:assert/strict';
import { PresenceRegistry } from '../lib/server/presence-registry';
import { ManualClock } from './test-clock';

test('registers a Client online and accepts one shutdown command', () => {
  const registry = new PresenceRegistry(new ManualClock());
  assert.equal(registry.poll('PC-001').online, true);
  assert.equal(registry.getSnapshot('PC-001').online, true);
  const command = registry.tryQueueShutdown('PC-001');
  assert.equal(command?.type, 'shutdown');
});

test('rejects duplicate shutdown commands and offline machines', () => {
  const clock = new ManualClock();
  const registry = new PresenceRegistry(clock);
  registry.poll('PC-001');
  assert.equal(registry.tryQueueShutdown('PC-001')?.type, 'shutdown');
  assert.equal(registry.tryQueueShutdown('PC-001'), null);
  clock.advance(30_001);
  assert.equal(registry.canQueueShutdown('PC-001'), false);
  assert.equal(registry.tryQueueShutdown('PC-001'), null);
});

test('poll consumes a shutdown command exactly once', () => {
  const registry = new PresenceRegistry(new ManualClock());
  registry.poll('PC-001');
  const command = registry.tryQueueShutdown('PC-001');
  assert.equal(registry.poll('PC-001').command?.id, command?.id);
  assert.equal(registry.poll('PC-001').command, null);
});
