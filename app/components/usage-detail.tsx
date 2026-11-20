'use client';

import { useEffect, useMemo, useState } from 'react';
import { appPath } from '../../lib/app-path';

export type UsageRow = { zone: string; userEmail?: string; machineId?: string; sessionCount: number };
type ZoneLayout = { name: string; machines: string[] };
type View = 'map' | 'users' | 'table';
type MachineStat = { machineId: string; zone: string; sessionCount: number; users: { email: string; count: number }[] };

// One-hue sequential ramp for the dark theme: dim -> bright as use grows; zero use gets the neutral track color.
const RAMP = ['#184f95', '#256abf', '#3987e5', '#6da7ec', '#b7d3f6'];
const USERS_PAGE = 15;

const machineNumber = (id: string) => Number(/(\d+)$/.exec(id)?.[1] ?? 0);
const shortId = (id: string) => /(\d+)$/.exec(id)?.[1] ?? id;
const fmt = (value: number) => value.toLocaleString('th-TH');
const bucket = (count: number, max: number) => count <= 0 ? -1 : Math.min(RAMP.length - 1, Math.ceil(count / max * RAMP.length) - 1);

export default function UsageDetail({ rows, downloadHref }: { rows: UsageRow[]; downloadHref: string }) {
  const [view, setView] = useState<View>('map');
  const [layout, setLayout] = useState<ZoneLayout[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<{ id: string; x: number; y: number } | null>(null);
  const [query, setQuery] = useState('');
  const [userLimit, setUserLimit] = useState(USERS_PAGE);

  useEffect(() => {
    fetch(appPath('/api/admin/zones'))
      .then(response => response.ok ? response.json() : null)
      .then(data => setLayout(Array.isArray(data?.zones) ? data.zones.map((zone: ZoneLayout) => ({ name: zone.name, machines: zone.machines })) : []))
      .catch(() => setLayout([]));
  }, []);

  const machines = useMemo(() => {
    const stats = new Map<string, MachineStat>();
    for (const row of rows) {
      if (!row.machineId) continue;
      const stat = stats.get(row.machineId) ?? { machineId: row.machineId, zone: row.zone, sessionCount: 0, users: [] };
      stat.sessionCount += row.sessionCount;
      if (row.userEmail) stat.users.push({ email: row.userEmail, count: row.sessionCount });
      stats.set(row.machineId, stat);
    }
    for (const stat of stats.values()) stat.users.sort((a, b) => b.count - a.count || a.email.localeCompare(b.email));
    return stats;
  }, [rows]);

  // Every machine of every zone, so idle machines show up too; machines seen only in the report are added to their zone.
  const groups = useMemo(() => {
    const result = new Map<string, Set<string>>();
    for (const zone of layout ?? []) result.set(zone.name, new Set(zone.machines.map(id => id.toUpperCase())));
    for (const stat of machines.values()) {
      const known = Array.from(result.values()).some(set => set.has(stat.machineId.toUpperCase()));
      if (!known) result.set(stat.zone, (result.get(stat.zone) ?? new Set()).add(stat.machineId.toUpperCase()));
    }
    return Array.from(result, ([name, ids]) => {
      const list = Array.from(ids).sort((a, b) => machineNumber(a) - machineNumber(b));
      return { name, machines: list, total: list.reduce((sum, id) => sum + (machines.get(id)?.sessionCount ?? 0), 0), used: list.filter(id => machines.has(id)).length };
    }).filter(group => group.machines.length > 0);
  }, [layout, machines]);

  const maxMachine = Math.max(1, ...Array.from(machines.values(), stat => stat.sessionCount));

  const users = useMemo(() => {
    const totals = new Map<string, { email: string; count: number; machines: Set<string>; zones: Set<string> }>();
    for (const row of rows) {
      if (!row.userEmail) continue;
      const user = totals.get(row.userEmail) ?? { email: row.userEmail, count: 0, machines: new Set(), zones: new Set() };
      user.count += row.sessionCount;
      if (row.machineId) user.machines.add(row.machineId);
      user.zones.add(row.zone);
      totals.set(row.userEmail, user);
    }
    return Array.from(totals.values()).sort((a, b) => b.count - a.count || a.email.localeCompare(b.email));
  }, [rows]);

  const needle = query.trim().toLowerCase();
  const filteredUsers = needle ? users.filter(user => user.email.toLowerCase().includes(needle)) : users;
  const filteredRows = needle
    ? rows.filter(row => [row.userEmail, row.machineId, row.zone].some(value => value?.toLowerCase().includes(needle)))
    : rows;
  const maxUser = Math.max(1, ...users.map(user => user.count));
  const selectedStat = selected ? machines.get(selected) : undefined;
  const hoveredStat = hovered ? machines.get(hovered.id) : undefined;

  const tabs: { id: View; label: string }[] = [
    { id: 'map', label: 'แผนผังเครื่อง' },
    { id: 'users', label: `ผู้ใช้งาน (${fmt(users.length)})` },
    { id: 'table', label: `ตาราง (${fmt(rows.length)})` },
  ];

  return <section className="panel usage-table-panel usage-detail">
    <div className="panel-heading usage-panel-heading">
      <div><p className="section-kicker">SESSION COUNTS</p><h2>รายละเอียดการเข้าใช้งาน</h2><p>จำนวนครั้งแยกตามเครื่องและผู้ใช้งาน</p></div>
      <a className="button button-primary" href={downloadHref}>ดาวน์โหลด CSV</a>
    </div>

    <div className="usage-detail-toolbar">
      <div className="usage-tabs" role="tablist" aria-label="รูปแบบการแสดงผล">
        {tabs.map(tab => <button key={tab.id} type="button" role="tab" aria-selected={view === tab.id} className={view === tab.id ? 'is-active' : ''} onClick={() => setView(tab.id)}>{tab.label}</button>)}
      </div>
      {view === 'map'
        ? <div className="heat-legend" aria-label="ระดับจำนวนครั้ง">
            <span>ไม่มีการใช้</span><i className="heat-swatch is-empty" />
            <span className="heat-legend-gap">น้อย</span>{RAMP.map(color => <i key={color} className="heat-swatch" style={{ background: color }} />)}<span>มาก ({fmt(maxMachine)} ครั้ง)</span>
          </div>
        : <input className="usage-search" type="search" placeholder="ค้นหาอีเมล เครื่อง หรือโซน" value={query} onChange={event => { setQuery(event.target.value); setUserLimit(USERS_PAGE); }} />}
    </div>

    {rows.length === 0 ? <div className="usage-empty"><p>ยังไม่มีข้อมูลการเข้าใช้งานในเดือนนี้</p></div> : <>
      {view === 'map' && <div className="heat-map" onMouseLeave={() => setHovered(null)}>
        {layout === null && <p className="heat-note">กำลังโหลดผังเครื่อง...</p>}
        {groups.map(group => <div className="heat-zone" key={group.name}>
          <div className="heat-zone-head"><strong>{group.name}</strong><span>{fmt(group.total)} ครั้ง · ใช้ {group.used}/{group.machines.length} เครื่อง</span></div>
          <div className="heat-grid">
            {group.machines.map(id => {
              const stat = machines.get(id);
              const level = bucket(stat?.sessionCount ?? 0, maxMachine);
              return <button
                key={id}
                type="button"
                className={`heat-cell${level < 0 ? ' is-empty' : ''}${level >= 0 && level <= 2 ? ' is-dark' : ''}${selected === id ? ' is-selected' : ''}`}
                style={level >= 0 ? { background: RAMP[level] } : undefined}
                aria-label={`${id} ${fmt(stat?.sessionCount ?? 0)} ครั้ง`}
                aria-pressed={selected === id}
                onClick={() => setSelected(current => current === id ? null : id)}
                onMouseEnter={event => { const box = event.currentTarget.getBoundingClientRect(); const host = event.currentTarget.closest('.heat-map')!.getBoundingClientRect(); setHovered({ id, x: box.left - host.left + box.width / 2, y: box.top - host.top }); }}
                onFocus={event => { const box = event.currentTarget.getBoundingClientRect(); const host = event.currentTarget.closest('.heat-map')!.getBoundingClientRect(); setHovered({ id, x: box.left - host.left + box.width / 2, y: box.top - host.top }); }}
                onBlur={() => setHovered(null)}
              >{shortId(id)}</button>;
            })}
          </div>
        </div>)}
        {hovered && <div className="heat-tooltip" style={{ left: hovered.x, top: hovered.y }} role="status">
          <strong>{hovered.id}</strong>
          <span>{fmt(hoveredStat?.sessionCount ?? 0)} ครั้ง · {fmt(hoveredStat?.users.length ?? 0)} ผู้ใช้</span>
        </div>}
        <div className="heat-detail">
          {selectedStat
            ? <><div className="heat-detail-head"><strong>{selectedStat.machineId}</strong><span>{selectedStat.zone} · {fmt(selectedStat.sessionCount)} ครั้ง</span><button type="button" onClick={() => setSelected(null)}>ปิด</button></div>
                <ul>{selectedStat.users.map(user => <li key={user.email}><span>{user.email}</span><strong>{fmt(user.count)}</strong></li>)}</ul></>
            : selected
              ? <p className="heat-note">{selected} ยังไม่มีการใช้งานในเดือนนี้</p>
              : <p className="heat-note">กดที่เครื่องเพื่อดูรายชื่อผู้ใช้งาน</p>}
        </div>
      </div>}

      {view === 'users' && <div className="user-bars">
        {filteredUsers.length === 0 && <p className="heat-note">ไม่พบผู้ใช้งานที่ตรงกับคำค้น</p>}
        {filteredUsers.slice(0, userLimit).map((user, index) => <div className="user-bar-row" key={user.email}>
          <span className="ranking-number">{String(users.indexOf(user) + 1).padStart(2, '0')}</span>
          <div className="user-bar-copy">
            <div><strong>{user.email}</strong><span>{Array.from(user.zones).join(', ')} · {fmt(user.machines.size)} เครื่อง</span></div>
            <div className="usage-chart-track"><span className="user-bar-fill" style={{ width: `${user.count / maxUser * 100}%`, animationDelay: `${Math.min(index, 10) * 40}ms` }} /></div>
          </div>
          <strong className="ranking-value">{fmt(user.count)}</strong>
        </div>)}
        {filteredUsers.length > userLimit && <button type="button" className="button button-ghost user-bars-more" onClick={() => setUserLimit(limit => limit + USERS_PAGE)}>แสดงเพิ่ม ({fmt(filteredUsers.length - userLimit)} คน)</button>}
      </div>}

      {view === 'table' && <div className="table-wrap usage-table-scroll"><table>
        <thead><tr><th>โซน</th><th>ผู้ใช้งาน</th><th>หมายเลขเครื่อง</th><th>จำนวนครั้ง</th></tr></thead>
        <tbody>{filteredRows.map(row => <tr key={`${row.userEmail}-${row.machineId}`}><td><span className="table-zone">{row.zone}</span></td><td><strong>{row.userEmail}</strong></td><td><span className="table-machine">{row.machineId}</span></td><td><strong>{fmt(row.sessionCount)}</strong></td></tr>)}</tbody>
      </table></div>}
    </>}
  </section>;
}
