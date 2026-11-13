'use client';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { appPath } from '../../lib/app-path';

type Entry = {
  at: string;
  machineId: string;
  userEmail: string | null;
  action: string;
  label: string;
  actor: string | null;
  actorRole: 'user' | 'admin' | 'system';
  detail: string;
  sessionId: string;
  zone: string;
  usedMinutes: number | null;
};

const bangkokToday = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);

const timeText = (value: string) => new Date(value).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' });

const durationText = (minutes: number) => {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours} ชม. ${rest} นาที` : `${rest} นาที`;
};

const actorText = (entry: Entry) => {
  if (entry.actorRole === 'system') return entry.action === 'expired' ? 'ระบบ' : 'เครื่อง / ระบบ';
  if (entry.actorRole === 'user') return 'ผู้ใช้งานเอง';
  return `${entry.actor} (แอดมิน)`;
};

const tone = (action: string) => {
  if (action === 'check-in') return 'is-start';
  if (action === 'logout') return 'is-end';
  if (action === 'force-logout' || action === 'client-disconnected') return 'is-forced';
  if (action === 'expired') return 'is-expired';
  return 'is-command';
};

export default function ActivityLog() {
  const [date, setDate] = useState(bangkokToday);
  const [emailInput, setEmailInput] = useState('');
  const [email, setEmail] = useState('');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [zones, setZones] = useState<string[]>([]);
  const [zoneFilter, setZoneFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams({ date });
      if (email) query.set('email', email);
      const response = await fetch(appPath(`/api/admin/activity?${query}`));
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'โหลดประวัติเหตุการณ์ไม่สำเร็จ');
      setEntries(data.entries as Entry[]);
      setZones(data.zones as string[]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'โหลดประวัติเหตุการณ์ไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, [date, email]);

  useEffect(() => {
    load().catch(() => undefined);
    const timer = window.setInterval(() => load().catch(() => undefined), 15000);
    return () => window.clearInterval(timer);
  }, [load]);

  // Zones in configured order, plus any zone only seen in old records (e.g. renamed zones).
  const groups = useMemo(() => {
    const order = [...zones, ...entries.map(entry => entry.zone).filter(zone => !zones.includes(zone))];
    return Array.from(new Set(order)).map(zone => ({ zone, entries: entries.filter(entry => entry.zone === zone) }));
  }, [entries, zones]);
  const visibleGroups = groups.filter(group => group.entries.length > 0 && (zoneFilter === 'all' || group.zone === zoneFilter));
  const visibleCount = visibleGroups.reduce((total, group) => total + group.entries.length, 0);

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEmail(emailInput.trim().toLowerCase());
  }

  function clear() {
    setEmailInput('');
    setEmail('');
  }

  return <section className="panel usage-table-panel activity-log-panel">
    <div className="panel-heading usage-panel-heading">
      <div><p className="section-kicker">ACTIVITY LOG</p><h2>ประวัติเหตุการณ์</h2><p>เข้าใช้งาน ออกจากระบบ หมดเวลา และคำสั่งจากแอดมิน เรียงตามเวลา (เวลาไทย)</p></div>
      <span className="result-count">{visibleCount.toLocaleString('th-TH')} รายการ</span>
    </div>
    <form className="activity-log-filters" onSubmit={search}>
      <label className="usage-month-control"><span>วันที่</span><input type="date" value={date} onChange={event => setDate(event.target.value || bangkokToday())} /></label>
      <label className="usage-month-control activity-log-email"><span>อีเมลผู้ใช้งาน (ไม่บังคับ)</span><input type="search" placeholder="ชื่อบัญชี@msu.ac.th" value={emailInput} onChange={event => setEmailInput(event.target.value)} /></label>
      <div className="activity-log-actions">
        <button className="button button-primary" type="submit">ค้นหา</button>
        {email && <button className="button button-ghost" type="button" onClick={clear}>ล้างตัวกรอง</button>}
      </div>
    </form>
    <div className="filter-tabs activity-zone-tabs" role="group" aria-label="กรองตามโซน">
      {[['all', 'ทุกโซน', entries.length] as const, ...groups.map(group => [group.zone, group.zone, group.entries.length] as const)]
        .map(([value, label, count]) => <button key={value} type="button" className={zoneFilter === value ? 'active' : ''} onClick={() => setZoneFilter(value)}>{label}<span>{count}</span></button>)}
    </div>
    {error && <p className="daily-usage-error" role="alert">{error}</p>}
    {!error && visibleGroups.length === 0
      ? <div className="usage-empty"><p>{loading ? 'กำลังโหลด...' : email ? `ไม่พบเหตุการณ์ของ ${email} ในวันนี้` : zoneFilter === 'all' ? 'ยังไม่มีเหตุการณ์ในวันนี้' : `ยังไม่มีเหตุการณ์ในโซน ${zoneFilter} วันนี้`}</p></div>
      : visibleGroups.map(group => <div className="activity-zone-group" key={group.zone}>
        <h3 className="activity-zone-heading"><span className="zone-dot" />โซน {group.zone}<small>{group.entries.length.toLocaleString('th-TH')} รายการ</small></h3>
        <div className="table-wrap"><table>
          <thead><tr><th>เวลา</th><th>เครื่อง</th><th>ผู้ใช้งาน</th><th>เหตุการณ์</th><th>ผู้ทำ</th></tr></thead>
          <tbody>{group.entries.map((entry, index) => <tr key={`${entry.sessionId}-${entry.action}-${entry.at}-${index}`}>
            <td><strong>{timeText(entry.at)}</strong></td>
            <td><span className="table-machine">{entry.machineId}</span></td>
            <td>{entry.userEmail ?? '—'}</td>
            <td>
              <span className={`activity-event ${tone(entry.action)}`}>{entry.label}</span>
              {entry.usedMinutes !== null && <small className="activity-note">ใช้ไป {durationText(entry.usedMinutes)}</small>}
              {entry.detail && <small className="activity-note">{entry.detail}</small>}
            </td>
            <td>{actorText(entry)}</td>
          </tr>)}</tbody>
        </table></div>
      </div>)}
  </section>;
}
