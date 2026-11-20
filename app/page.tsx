'use client';

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { appPath } from '../lib/app-path';
import DailyUsageLookup from './components/daily-usage-lookup';
import SessionTimer from './components/session-timer';
import { filterMachines, type MachineStatusFilter } from '../lib/machines';

type Machine = {
  machineId: string;
  name: string;
  zone: string;
  dailyLimit: number | null;
  status: 'Available' | 'InUse';
  userEmail?: string;
  startedAt?: string;
  expiresAt?: string;
  sessionId?: string;
  online: boolean;
  lastSeenAt?: string;
};

type Admin = { email: string; role: 'root' | 'admin'; status: 'Active'; addedBy?: string; addedAt?: string };

const formatTime = (value?: string) => value
  ? new Date(value).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
  : '-';

// Each row holds 10 machines: 5 on the left side of the aisle, 5 on the right.
const PCS_PER_ROW = 10;
// Zones whose room is laid out differently from the default rows of 10 (matched by zone name).
const ZONE_LAYOUTS: Record<string, 'two-columns'> = { 'ชั้น-3': 'two-columns' };
// Display order on narrow screens; on wide screens each zone also gets a named grid area (see .seat-map in globals.css):
// left column A-407, A-410, DLP, pavilion; right column A-412 with ชั้น-3 below it.
const ZONE_ORDER = ['A-407', 'A-412', 'A-410', 'DLP', 'pavilion', 'ชั้น-3'];
const ZONE_AREAS: Record<string, string> = { 'A-407': 'z407', 'A-412': 'z412', 'A-410': 'z410', 'DLP': 'zdlp', 'pavilion': 'zpav', 'ชั้น-3': 'zfl3' };
const seatNumber = (machineId: string) => Number(/(\d+)$/.exec(machineId)?.[1] ?? 0);
// Same thresholds as SessionTimer: plenty of time left, 30 minutes or less, 10 minutes or less (or expired).
const sessionTone = (expiresAt?: string) => {
  const remaining = expiresAt ? Date.parse(expiresAt) - Date.now() : NaN;
  if (!Number.isFinite(remaining)) return 'ok';
  return remaining <= 10 * 60000 ? 'critical' : remaining <= 30 * 60000 ? 'warning' : 'ok';
};
const chunk = <T,>(items: T[], size: number) => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));

function RefreshIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6v5h-5M4 18v-5h5M18.5 9A7 7 0 0 0 6.7 6.7L4 9m16 6-2.7 2.3A7 7 0 0 1 5.5 15" /></svg>;
}

function SearchIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>;
}

function PowerIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v8m-4.95-5A8 8 0 1 0 16.95 6" /></svg>;
}

function CloseIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>;
}

export default function AdminPage() {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [acting, setActing] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<MachineStatusFilter>('all');
  const [zoneFilter, setZoneFilter] = useState('all');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [canManageAdmins, setCanManageAdmins] = useState(false);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [adminSaving, setAdminSaving] = useState(false);
  const [adminMessage, setAdminMessage] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async (showRefresh = false) => {
    setError('');
    if (showRefresh) setRefreshing(true);
    try {
      const me = await fetch(appPath('/api/me'));
      if (!me.ok) {
        window.location.href = appPath('/auth/login?returnUrl=/admin');
        return;
      }

      const [machineResponse, adminsResponse] = await Promise.all([
        fetch(appPath('/api/machines')),
        fetch(appPath('/api/admin/admins')),
      ]);
      if (!machineResponse.ok || !adminsResponse.ok) throw new Error('โหลดข้อมูลแดชบอร์ดไม่สำเร็จ');

      setMachines(await machineResponse.json());
      const adminResult = await adminsResponse.json() as { admins: Admin[]; canManage: boolean };
      setAdmins(adminResult.admins);
      setCanManageAdmins(adminResult.canManage);
      setLastUpdated(new Date());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load().catch(reason => setError(reason instanceof Error ? reason.message : 'เกิดข้อผิดพลาด'));
    const timer = window.setInterval(() => load().catch(() => undefined), 15000);
    return () => window.clearInterval(timer);
  }, [load]);

  const forceLogout = async (sessionId: string) => {
    setActing(sessionId);
    setError('');
    try {
      const response = await fetch(appPath(`/api/admin/sessions/${sessionId}/force-logout`), { method: 'POST' });
      if (!response.ok) throw new Error('บังคับออกจากระบบไม่สำเร็จ');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'เกิดข้อผิดพลาด');
    } finally {
      setActing('');
    }
  };

  const shutdownMachine = async (machineId: string) => {
    if (!window.confirm(`ยืนยันการปิดเครื่อง ${machineId} หรือไม่?`)) return;
    setActing(`shutdown:${machineId}`);
    setError('');
    try {
      const response = await fetch(appPath(`/api/admin/machines/${machineId}/shutdown`), { method: 'POST' });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error ?? 'ไม่สามารถสั่งปิดเครื่องได้');
      }
      await load(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'ไม่สามารถสั่งปิดเครื่องได้');
    } finally {
      setActing('');
    }
  };

  const closeMachine = async (machineId: string) => {
    if (!window.confirm(`ยืนยันการปิดโปรแกรม LockComputer ของ ${machineId} หรือไม่?`)) return;
    setActing(`close:${machineId}`);
    setError('');
    try {
      const response = await fetch(appPath(`/api/admin/machines/${machineId}/close`), { method: 'POST' });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error ?? 'ไม่สามารถสั่งปิดโปรแกรมได้');
      }
      await load(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'ไม่สามารถสั่งปิดโปรแกรมได้');
    } finally {
      setActing('');
    }
  };

  const addAdmin = async (event: FormEvent) => {
    event.preventDefault();
    setAdminSaving(true);
    setAdminMessage('');
    setError('');
    try {
      const response = await fetch(appPath('/api/admin/admins'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: newAdminEmail }),
      });
      const body = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? 'เพิ่มผู้ดูแลไม่สำเร็จ');
      setNewAdminEmail('');
      setAdminMessage('เพิ่มผู้ดูแลเรียบร้อยแล้ว');
      await load(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'เพิ่มผู้ดูแลไม่สำเร็จ');
    } finally {
      setAdminSaving(false);
    }
  };

  const used = useMemo(() => machines.filter(machine => machine.status === 'InUse').length, [machines]);
  const available = machines.length - used;
  const utilization = machines.length ? Math.round((used / machines.length) * 100) : 0;
  const visibleMachines = useMemo(
    () => filterMachines(machines, query, statusFilter).filter(machine => zoneFilter === 'all' || machine.zone === zoneFilter),
    [machines, query, statusFilter, zoneFilter],
  );

  const visibleIds = useMemo(() => new Set(visibleMachines.map(machine => machine.machineId)), [visibleMachines]);
  // Every machine stays in its seat; filters only dim the ones that don't match, so the room layout never shifts.
  const seatZones = useMemo(() => {
    const zones = new Map<string, Machine[]>();
    const sorted = [...machines].sort((a, b) => seatNumber(a.machineId) - seatNumber(b.machineId));
    for (const machine of sorted) {
      if (zoneFilter !== 'all' && machine.zone !== zoneFilter) continue;
      zones.set(machine.zone, [...(zones.get(machine.zone) ?? []), machine]);
    }
    const order = (name: string) => { const index = ZONE_ORDER.indexOf(name); return index < 0 ? ZONE_ORDER.length : index; };
    return Array.from(zones, ([name, list]) => ({ name, machines: list, busy: list.filter(machine => machine.status === 'InUse').length }))
      .sort((a, b) => order(a.name) - order(b.name));
  }, [machines, zoneFilter]);
  const selectedMachine = selectedId ? machines.find(machine => machine.machineId === selectedId) : undefined;

  useEffect(() => {
    if (!selectedId) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setSelectedId(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId]);

  const renderPc = (machine: Machine) => {
    const inUse = machine.status === 'InUse';
    const state = !machine.online && !inUse ? 'is-offline' : inUse ? 'is-busy' : 'is-free';
    const tone = inUse ? sessionTone(machine.expiresAt) : '';
    return <button
      key={machine.machineId}
      type="button"
      className={`pc ${state}${tone ? ` glow-${tone}` : ''}${visibleIds.has(machine.machineId) ? '' : ' is-dimmed'}${selectedId === machine.machineId ? ' is-selected' : ''}`}
      title={`${machine.machineId} · ${inUse ? machine.userEmail ?? 'กำลังใช้งาน' : machine.online ? 'ว่าง' : 'ออฟไลน์'}`}
      aria-label={`${machine.machineId} ${inUse ? 'กำลังใช้งาน' : 'ว่าง'} ${machine.online ? 'ออนไลน์' : 'ออฟไลน์'}`}
      onClick={() => setSelectedId(machine.machineId)}
    >
      <span className="pc-icon" aria-hidden="true">{inUse && <s className="pc-glow" />}<i />{inUse && !machine.online && <b className="seat-offline-dot" />}</span>
      <span className="pc-label">{machine.machineId.replace(/^\D+/, '')}</span>
    </button>;
  };

  if (loading) {
    return <main className="dashboard loading-screen">
      <div className="loading-mark"><span>LC</span></div>
      <div><strong>กำลังเตรียมแดชบอร์ด</strong><p>กำลังโหลดสถานะเครื่องคอมพิวเตอร์...</p></div>
    </main>;
  }

  return <main className="dashboard">
    <header className="hero">
      <nav className="nav-bar">
        <div className="brand">
          <span className="brand-mark">LC</span>
          <span><strong>LockComputer</strong><small>MSU Library</small></span>
        </div>
        <div className="nav-actions">
          <span className="live-badge"><i /> ระบบออนไลน์</span>
          <a className="button button-ghost usage-nav-link" href={appPath('/admin/zones')}>ตั้งค่าโซน</a>
          <a className="button button-ghost usage-nav-link" href={appPath('/admin/usage')}>ข้อมูลการเข้าใช้งาน</a>
          <button className="button button-ghost" onClick={() => load(true).catch(reason => setError(reason instanceof Error ? reason.message : 'รีเฟรชไม่สำเร็จ'))} disabled={refreshing}>
            <RefreshIcon />{refreshing ? 'กำลังรีเฟรช' : 'รีเฟรช'}
          </button>
        </div>
      </nav>
      <div className="hero-copy">
        <p className="overline">ADMIN CONTROL CENTER</p>
        <h1>ภาพรวมการใช้งานห้องคอมพิวเตอร์</h1>
        <p>ติดตามสถานะเครื่องทั้ง {machines.length} เครื่อง และจัดการเซสชันแบบเรียลไทม์ในที่เดียว</p>
        <div className="updated">อัปเดตอัตโนมัติทุก 15 วินาที · ล่าสุด {lastUpdated?.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) ?? '-'}</div>
      </div>
    </header>

    <div className="content">
      {error && <div className="alert" role="alert"><strong>พบข้อผิดพลาด</strong><span>{error}</span></div>}

      <section className="metrics" aria-label="สรุปสถานะเครื่อง">
        <article className="metric-card metric-total"><span className="metric-icon">01</span><div><p>เครื่องทั้งหมด</p><strong>{machines.length}</strong><small>เครื่องในระบบ</small></div></article>
        <article className="metric-card metric-active"><span className="metric-icon">02</span><div><p>กำลังใช้งาน</p><strong>{used}</strong><small>เซสชันที่เปิดอยู่</small></div></article>
        <article className="metric-card metric-available"><span className="metric-icon">03</span><div><p>เครื่องว่าง</p><strong>{available}</strong><small>พร้อมให้บริการ</small></div></article>
        <article className="metric-card metric-rate">
          <div className="rate-copy"><div><p>อัตราการใช้งาน</p><strong>{utilization}%</strong></div><small>{used} จาก {machines.length} เครื่อง</small></div>
          <div className="progress"><span style={{ width: `${utilization}%` }} /></div>
        </article>
      </section>

      <DailyUsageLookup />

      <section className="panel admin-panel">
        <div className="panel-heading">
          <div><p className="section-kicker">ADMIN ACCESS</p><h2>ผู้ดูแลระบบ</h2><p>จัดการบัญชีที่มีสิทธิ์เข้าดูแดชบอร์ดและสั่งการระบบ</p></div>
          <span className="result-count">{admins.length} บัญชี</span>
        </div>
        <div className="admin-panel-body">
          <div className="admin-list">
            {admins.map(admin => <div className="admin-row" key={admin.email}>
              <div className="admin-avatar">{admin.role === 'root' ? 'R' : 'A'}</div>
              <div><strong>{admin.email}</strong><span>{admin.role === 'root' ? 'Root Admin' : `เพิ่มโดย ${admin.addedBy}`}</span></div>
              <em>{admin.role === 'root' ? 'หลัก' : 'Active'}</em>
            </div>)}
          </div>
          {canManageAdmins ? <form className="admin-form" onSubmit={addAdmin}>
            <label htmlFor="new-admin-email">เพิ่มผู้ดูแลใหม่</label>
            <div className="admin-form-row"><input id="new-admin-email" type="email" value={newAdminEmail} onChange={event => setNewAdminEmail(event.target.value)} placeholder="ชื่อบัญชี@msu.ac.th" required /><button className="button button-primary" type="submit" disabled={adminSaving}>{adminSaving ? 'กำลังเพิ่ม...' : 'เพิ่มผู้ดูแล'}</button></div>
            <small>รับเฉพาะบัญชีอีเมล @msu.ac.th และผู้ดูแลใหม่จะเข้าสู่ระบบด้วย Google OAuth</small>
            {adminMessage && <p className="admin-success" role="status">{adminMessage}</p>}
          </form> : <p className="admin-readonly">บัญชีนี้ดูรายชื่อผู้ดูแลได้ แต่ไม่มีสิทธิ์เพิ่มบัญชีใหม่</p>}
        </div>
      </section>

      <section className="panel machine-panel">
        <div className="panel-heading">
          <div><p className="section-kicker">LIVE STATUS</p><h2>สถานะเครื่องคอมพิวเตอร์</h2><p>เลือกดูและจัดการเครื่องที่กำลังใช้งาน</p></div>
          <span className="result-count">แสดง {visibleMachines.length} เครื่อง</span>
        </div>

        <div className="toolbar">
          <label className="search-box"><SearchIcon /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="ค้นหาหมายเลขเครื่องหรืออีเมลผู้ใช้" aria-label="ค้นหาเครื่อง" />{query && <button onClick={() => setQuery('')} aria-label="ล้างคำค้นหา">×</button>}</label>
          <label className="zone-select"><span>โซน</span><select value={zoneFilter} onChange={event => setZoneFilter(event.target.value)} aria-label="กรองตามโซน"><option value="all">ทุกโซน</option>{Array.from(new Set(machines.map(machine => machine.zone))).sort().map(zone => <option key={zone} value={zone}>{zone}</option>)}</select></label>
          <div className="filter-tabs" role="group" aria-label="กรองสถานะเครื่อง">
            {([
              ['all', 'ทั้งหมด', machines.length],
              ['available', 'ว่าง', available],
              ['inuse', 'ใช้งานอยู่', used],
            ] as const).map(([value, label, count]) => <button key={value} className={statusFilter === value ? 'active' : ''} onClick={() => setStatusFilter(value)}>{label}<span>{count}</span></button>)}
          </div>
        </div>

        {visibleMachines.length > 0 ? <div className={`seat-map${zoneFilter !== 'all' ? ' is-single-zone' : ''}`}>
          <div className="seat-legend" aria-label="คำอธิบายสัญลักษณ์">
            <span><i className="seat-key is-free" />ว่าง</span>
            <span><i className="seat-key is-busy" />กำลังใช้งาน</span>
            <span><i className="seat-key is-offline" />ออฟไลน์</span>
            <span className="glow-legend">แสงวิ่งรอบจอ: <i className="glow-dot glow-ok" />เหลือเกิน 30 นาที <i className="glow-dot glow-warning" />≤ 30 นาที <i className="glow-dot glow-critical" />≤ 10 นาที</span>
            <small>กดที่เครื่องเพื่อดูรายละเอียดและสั่งการ</small>
          </div>
          {seatZones.map(zone => <div className="seat-zone" key={zone.name} style={ZONE_AREAS[zone.name] ? { '--zone-area': ZONE_AREAS[zone.name] } as CSSProperties : undefined}>
            <div className="seat-zone-head"><strong>{zone.name}</strong><span>ใช้งาน {zone.busy}/{zone.machines.length} เครื่อง</span></div>
            {ZONE_LAYOUTS[zone.name] === 'two-columns'
              // ชั้น-3: the first machine stands alone above the right column; the rest run in two columns, left to right.
              ? <div className="pc-two-columns">
                  <div className="pc-pairs">
                    {zone.machines[0] && <div className="pc-corner">{renderPc(zone.machines[0])}</div>}
                    {zone.machines.slice(1).map(renderPc)}
                  </div>
                </div>
              : <div className="pc-rows">
                  {chunk(zone.machines, PCS_PER_ROW).map((row, rowIndex) => <div className="pc-row" key={rowIndex}>{row.map(renderPc)}</div>)}
                </div>}
          </div>)}
        </div> : <div className="empty-state"><SearchIcon /><h3>ไม่พบเครื่องที่ค้นหา</h3><p>ลองเปลี่ยนคำค้นหาหรือตัวกรองสถานะหรือโซน</p><button className="button button-ghost" onClick={() => { setQuery(''); setStatusFilter('all'); setZoneFilter('all'); }}>ล้างตัวกรอง</button></div>}
      </section>

      {selectedMachine && <div className="seat-overlay" onClick={() => setSelectedId(null)}>
        <div role="dialog" aria-modal="true" aria-label={`รายละเอียด ${selectedMachine.machineId}`} onClick={event => event.stopPropagation()}>
          {[selectedMachine].map(machine => {
            const inUse = machine.status === 'InUse';
            return <article key={machine.machineId} className={`machine-card seat-card ${inUse ? 'is-active' : 'is-available'}`}>
              <button type="button" className="seat-card-close" onClick={() => setSelectedId(null)} aria-label="ปิดการ์ด"><CloseIcon /></button>
              <div className="machine-top"><span className="computer-icon"><i /></span><div className="machine-badges"><span className={`connection-badge ${machine.online ? 'is-online' : 'is-offline'}`}><i />{machine.online ? 'ออนไลน์' : 'ออฟไลน์'}</span><span className="status-badge"><i />{inUse ? 'กำลังใช้งาน' : 'ว่าง'}</span></div></div>
              <div className="machine-name"><h3>{machine.name}</h3><span className="machine-zone-label">{machine.zone}</span><span>{machine.machineId}</span></div>
              <p className="machine-daily-limit">สิทธิ์ต่ออีเมล: {machine.dailyLimit === null ? 'ไม่จำกัด' : `${machine.dailyLimit} ครั้ง/วัน`}</p>
              {inUse ? <div className="session-detail">
                <p><span>ผู้ใช้งาน</span><strong title={machine.userEmail}>{machine.userEmail}</strong></p>
                <p><span>เริ่มใช้งาน</span><strong>{formatTime(machine.startedAt)} น.</strong></p>
                <p><span>หมดเวลา</span><strong>{formatTime(machine.expiresAt)} น.</strong></p>
                <SessionTimer startedAt={machine.startedAt} expiresAt={machine.expiresAt} />
                <div className="machine-actions"><button className="button button-danger" disabled={!machine.sessionId || acting === machine.sessionId} onClick={() => forceLogout(machine.sessionId!)}>{acting === machine.sessionId ? 'กำลังดำเนินการ...' : 'บังคับออกจากระบบ'}</button><button className="button button-close" disabled={!machine.online || acting === `close:${machine.machineId}`} title={machine.online ? 'สั่งปิดโปรแกรม LockComputer' : 'เครื่องออฟไลน์'} onClick={() => closeMachine(machine.machineId)}><CloseIcon />{acting === `close:${machine.machineId}` ? 'กำลังส่งคำสั่ง...' : 'ปิดโปรแกรม'}</button><button className="button button-shutdown" disabled={!machine.online || acting === `shutdown:${machine.machineId}`} title={machine.online ? 'สั่งปิดเครื่อง Windows' : 'เครื่องออฟไลน์'} onClick={() => shutdownMachine(machine.machineId)}><PowerIcon />{acting === `shutdown:${machine.machineId}` ? 'กำลังส่งคำสั่ง...' : 'ปิดเครื่อง'}</button></div>
              </div> : <div className="available-copy"><span>พร้อมใช้งาน</span><p>ยังไม่มีผู้ใช้เครื่องนี้</p><div className="machine-actions"><button className="button button-close" disabled={!machine.online || acting === `close:${machine.machineId}`} title={machine.online ? 'สั่งปิดโปรแกรม LockComputer' : 'เครื่องออฟไลน์'} onClick={() => closeMachine(machine.machineId)}><CloseIcon />{acting === `close:${machine.machineId}` ? 'กำลังส่งคำสั่ง...' : 'ปิดโปรแกรม'}</button><button className="button button-shutdown" disabled={!machine.online || acting === `shutdown:${machine.machineId}`} title={machine.online ? 'สั่งปิดเครื่อง Windows' : 'เครื่องออฟไลน์'} onClick={() => shutdownMachine(machine.machineId)}><PowerIcon />{acting === `shutdown:${machine.machineId}` ? 'กำลังส่งคำสั่ง...' : 'ปิดเครื่อง'}</button></div></div>}
            </article>;
          })}
        </div>
      </div>}

      <footer><span>LockComputer Administration</span><span>มหาวิทยาลัยมหาสารคาม</span></footer>
    </div>
  </main>;
}
