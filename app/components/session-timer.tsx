'use client';
import { useEffect, useState } from 'react';

// One shared 1-second ticker for every card, instead of one interval per machine.
const listeners = new Set<(now: number) => void>();
let ticker: number | undefined;

function subscribe(listener: (now: number) => void) {
  listeners.add(listener);
  ticker ??= window.setInterval(() => {
    const now = Date.now();
    listeners.forEach(notify => notify(now));
  }, 1000);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && ticker !== undefined) {
      window.clearInterval(ticker);
      ticker = undefined;
    }
  };
}

const clock = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total % 3600 / 60);
  const seconds = total % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const minutesText = (ms: number) => {
  const total = Math.max(0, Math.ceil(ms / 60000));
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return hours > 0 ? `${hours} ชม. ${minutes} นาที` : `${minutes} นาที`;
};

export default function SessionTimer({ startedAt, expiresAt }: { startedAt?: string; expiresAt?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => subscribe(setNow), []);

  const started = startedAt ? Date.parse(startedAt) : NaN;
  const expires = expiresAt ? Date.parse(expiresAt) : NaN;
  if (!Number.isFinite(started)) return null;

  const elapsed = now - started;
  const total = Number.isFinite(expires) ? expires - started : NaN;
  const remaining = Number.isFinite(expires) ? expires - now : NaN;
  const percent = Number.isFinite(total) && total > 0 ? Math.min(100, Math.max(0, elapsed / total * 100)) : 0;
  const tone = remaining <= 10 * 60000 ? 'is-critical' : remaining <= 30 * 60000 ? 'is-warning' : '';

  return <div className={`session-timer ${tone}`}>
    <div className="session-timer-row">
      <span>ใช้งานไปแล้ว</span>
      <strong className="session-timer-clock" aria-label={`ใช้งานไปแล้ว ${minutesText(elapsed)}`}>{clock(elapsed)}</strong>
    </div>
    {Number.isFinite(total) && <>
      <div className="session-timer-track" aria-hidden="true"><span style={{ width: `${percent}%` }} /></div>
      <small>{remaining > 0 ? `เหลืออีก ${minutesText(remaining)}` : 'หมดเวลาแล้ว'}</small>
    </>}
  </div>;
}
