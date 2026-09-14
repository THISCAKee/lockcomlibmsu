'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { appPath } from '../lib/app-path';
import { filterMachines, type MachineStatusFilter } from '../lib/machines';
import { MACHINE_ZONES, machineCountForZone } from '../lib/server/zones';

type Machine = {
  machineId: string;
  name: string;
  zone: string;
  status: 'Available' | 'InUse';
  userEmail?: string;
  expiresAt?: string;
  sessionId?: string;
  online: boolean;
  lastSeenAt?: string;
};

type Admin = { email: string; role: 'root' | 'admin'; status: 'Active'; addedBy?: string; addedAt?: string };

const formatTime = (value?: string) => value
  ? new Date(value).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
  : '-';

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
          <label className="zone-select"><span>โซน</span><select value={zoneFilter} onChange={event => setZoneFilter(event.target.value)} aria-label="กรองตามโซน"><option value="all">ทุกโซน</option>{MACHINE_ZONES.map(zone => <option key={zone.name} value={zone.name}>{zone.name} · {machineCountForZone(zone.name)} เครื่อง</option>)}</select></label>
          <div className="filter-tabs" role="group" aria-label="กรองสถานะเครื่อง">
            {([
              ['all', 'ทั้งหมด', machines.length],
              ['available', 'ว่าง', available],
              ['inuse', 'ใช้งานอยู่', used],
            ] as const).map(([value, label, count]) => <button key={value} className={statusFilter === value ? 'active' : ''} onClick={() => setStatusFilter(value)}>{label}<span>{count}</span></button>)}
          </div>
        </div>

        {visibleMachines.length > 0 ? <div className="machine-grid">
          {visibleMachines.map(machine => {
            const inUse = machine.status === 'InUse';
            return <article key={machine.machineId} className={`machine-card ${inUse ? 'is-active' : 'is-available'}`}>
              <div className="machine-top"><span className="computer-icon"><i /></span><div className="machine-badges"><span className={`connection-badge ${machine.online ? 'is-online' : 'is-offline'}`}><i />{machine.online ? 'ออนไลน์' : 'ออฟไลน์'}</span><span className="status-badge"><i />{inUse ? 'กำลังใช้งาน' : 'ว่าง'}</span></div></div>
              <div className="machine-name"><h3>{machine.name}</h3><span className="machine-zone-label">{machine.zone}</span><span>{machine.machineId}</span></div>
              {inUse ? <div className="session-detail">
                <p><span>ผู้ใช้งาน</span><strong title={machine.userEmail}>{machine.userEmail}</strong></p>
                <p><span>หมดเวลา</span><strong>{formatTime(machine.expiresAt)} น.</strong></p>
                <div className="machine-actions"><button className="button button-danger" disabled={!machine.sessionId || acting === machine.sessionId} onClick={() => forceLogout(machine.sessionId!)}>{acting === machine.sessionId ? 'กำลังดำเนินการ...' : 'บังคับออกจากระบบ'}</button><button className="button button-close" disabled={!machine.online || acting === `close:${machine.machineId}`} title={machine.online ? 'สั่งปิดโปรแกรม LockComputer' : 'เครื่องออฟไลน์'} onClick={() => closeMachine(machine.machineId)}><CloseIcon />{acting === `close:${machine.machineId}` ? 'กำลังส่งคำสั่ง...' : 'ปิดโปรแกรม'}</button><button className="button button-shutdown" disabled={!machine.online || acting === `shutdown:${machine.machineId}`} title={machine.online ? 'สั่งปิดเครื่อง Windows' : 'เครื่องออฟไลน์'} onClick={() => shutdownMachine(machine.machineId)}><PowerIcon />{acting === `shutdown:${machine.machineId}` ? 'กำลังส่งคำสั่ง...' : 'ปิดเครื่อง'}</button></div>
              </div> : <div className="available-copy"><span>พร้อมใช้งาน</span><p>ยังไม่มีผู้ใช้เครื่องนี้</p><div className="machine-actions"><button className="button button-close" disabled={!machine.online || acting === `close:${machine.machineId}`} title={machine.online ? 'สั่งปิดโปรแกรม LockComputer' : 'เครื่องออฟไลน์'} onClick={() => closeMachine(machine.machineId)}><CloseIcon />{acting === `close:${machine.machineId}` ? 'กำลังส่งคำสั่ง...' : 'ปิดโปรแกรม'}</button><button className="button button-shutdown" disabled={!machine.online || acting === `shutdown:${machine.machineId}`} title={machine.online ? 'สั่งปิดเครื่อง Windows' : 'เครื่องออฟไลน์'} onClick={() => shutdownMachine(machine.machineId)}><PowerIcon />{acting === `shutdown:${machine.machineId}` ? 'กำลังส่งคำสั่ง...' : 'ปิดเครื่อง'}</button></div></div>}
            </article>;
          })}
        </div> : <div className="empty-state"><SearchIcon /><h3>ไม่พบเครื่องที่ค้นหา</h3><p>ลองเปลี่ยนคำค้นหาหรือตัวกรองสถานะหรือโซน</p><button className="button button-ghost" onClick={() => { setQuery(''); setStatusFilter('all'); setZoneFilter('all'); }}>ล้างตัวกรอง</button></div>}
      </section>

      <footer><span>LockComputer Administration</span><span>มหาวิทยาลัยมหาสารคาม</span></footer>
    </div>
  </main>;
}
