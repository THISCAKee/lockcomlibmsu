import { randomUUID } from 'node:crypto';
import type { Clock } from './session-manager';

export type RemoteCommand = {
  id: string;
  type: 'shutdown';
  requestedAt: string;
};

export type PollResult = {
  online: boolean;
  command: RemoteCommand | null;
};

export type PresenceSnapshot = {
  online: boolean;
  lastSeenAt?: string;
};

type PresenceEntry = {
  lastSeenAt: number;
  pending?: RemoteCommand;
};

export class PresenceRegistry {
  private readonly entries = new Map<string, PresenceEntry>();

  constructor(private readonly clock: Clock, private readonly onlineWindowMs = 30_000) {}

  poll(machineId: string): PollResult {
    const key = machineId.trim().toLowerCase();
    const entry = this.entries.get(key) ?? { lastSeenAt: 0 };
    entry.lastSeenAt = this.clock.now().getTime();
    const command = entry.pending ?? null;
    delete entry.pending;
    this.entries.set(key, entry);
    return { online: true, command };
  }

  getSnapshot(machineId: string): PresenceSnapshot {
    const entry = this.entries.get(machineId.trim().toLowerCase());
    if (!entry) return { online: false };
    const online = this.clock.now().getTime() - entry.lastSeenAt <= this.onlineWindowMs;
    return { online, lastSeenAt: new Date(entry.lastSeenAt).toISOString() };
  }

  canQueueShutdown(machineId: string) {
    const entry = this.entries.get(machineId.trim().toLowerCase());
    return Boolean(entry && this.getSnapshot(machineId).online && !entry.pending);
  }

  tryQueueShutdown(machineId: string, commandId = randomUUID().replaceAll('-', '')): RemoteCommand | null {
    if (!this.canQueueShutdown(machineId)) return null;
    const key = machineId.trim().toLowerCase();
    const entry = this.entries.get(key)!;
    const command: RemoteCommand = { id: commandId, type: 'shutdown', requestedAt: this.clock.now().toISOString() };
    entry.pending = command;
    return command;
  }
}
