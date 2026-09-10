'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { filterMachines, type MachineStatusFilter } from '../lib/machines';

type Machine = {
  machineId: string;
  name: string;
  status: 'Available' | 'InUse';
  userEmail?: string;
  expiresAt?: string;
  sessionId?: string;
  online: boolean;
  lastSeenAt?: string;
};

type ReportRow = { userEmail?: string; machineId?: string; sessionCount: number; hours: number };
type Report = { totalHours: number; rows: ReportRow[] };

const monthQuery = () => {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
};

const formatTime = (value?: string) => value
  ? new Date(value).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
  : '-';

function RefreshIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6v5h-5M4 18v-5h5M18.5 9A7 7 0 0 0 6.7 6.7L4 9m16 6-2.7 2.3A7 7 0 0 1 5.5 15" /></svg>;
}

function SearchIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>;
}

function DownloadIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0 5-5m-5 5-5-5M5 20h14" /></svg>;
}

function PowerIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v8m-4.95-5A8 8 0 1 0 16.95 6" /></svg>;
}

export default function AdminPage() {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [report, setReport] = useState<Report>({ totalHours: 0, rows: [] });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [acting, setActing] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<MachineStatusFilter>('all');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(async (showRefresh = false) => {
    setError('');
    if (showRefresh) setRefreshing(true);
    try {
      const me = await fetch('/api/me');
      if (!me.ok) {
        window.location.href = '/auth/login?returnUrl=/admin';
        return;
      }

      const { year, month } = monthQuery();
      const [machineResponse, reportResponse] = await Promise.all([
        fetch('/api/machines'),
        fetch(`/api/admin/reports/monthly?year=${year}&month=${month}`),
      ]);
      if (!machineResponse.ok || !reportResponse.ok) throw new Error('โหลดข้อมูลแดชบอร์ดไม่สำเร็จ');

      setMachines(await machineResponse.json());
      setReport(await reportResponse.json());
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
      const response = await fetch(`/api/admin/sessions/${sessionId}/force-logout`, { method: 'POST' });
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
      const response = await fetch(`/api/admin/machines/${machineId}/shutdown`, { method: 'POST' });
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

  const used = useMemo(() => machines.filter(machine => machine.status === 'InUse').length, [machines]);
  const available = machines.length - used;
  const utilization = machines.length ? Math.round((used / machines.length) * 100) : 0;
  const visibleMachines = useMemo(
    () => filterMachines(machines, query, statusFilter),
    [machines, query, statusFilter],
  );
  const { year, month } = monthQuery();
  const monthName = new Intl.DateTimeFormat('th-TH', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1));

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
          <button className="button button-ghost" onClick={() => load(true).catch(reason => setError(reason instanceof Error ? reason.message : 'รีเฟรชไม่สำเร็จ'))} disabled={refreshing}>
            <RefreshIcon />{refreshing ? 'กำลังรีเฟรช' : 'รีเฟรช'}
          </button>
        </div>
      </nav>
      <div className="hero-copy">
        <p className="overline">ADMIN CONTROL CENTER</p>
        <h1>ภาพรวมการใช้งานห้องคอมพิวเตอร์</h1>
        <p>ติดตามสถานะเครื่องทั้ง 201 เครื่องและจัดการเซสชันแบบเรียลไทม์ในที่เดียว</p>
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

      <section className="panel machine-panel">
        <div className="panel-heading">
          <div><p className="section-kicker">LIVE STATUS</p><h2>สถานะเครื่องคอมพิวเตอร์</h2><p>เลือกดูและจัดการเครื่องที่กำลังใช้งาน</p></div>
          <span className="result-count">แสดง {visibleMachines.length} เครื่อง</span>
        </div>

        <div className="toolbar">
          <label className="search-box"><SearchIcon /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="ค้นหาหมายเลขเครื่องหรืออีเมลผู้ใช้" aria-label="ค้นหาเครื่อง" />{query && <button onClick={() => setQuery('')} aria-label="ล้างคำค้นหา">×</button>}</label>
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
              <div className="machine-name"><h3>{machine.name}</h3><span>{machine.machineId}</span></div>
              {inUse ? <div className="session-detail">
                <p><span>ผู้ใช้งาน</span><strong title={machine.userEmail}>{machine.userEmail}</strong></p>
                <p><span>หมดเวลา</span><strong>{formatTime(machine.expiresAt)} น.</strong></p>
                <div className="machine-actions"><button className="button button-danger" disabled={!machine.sessionId || acting === machine.sessionId} onClick={() => forceLogout(machine.sessionId!)}>{acting === machine.sessionId ? 'กำลังดำเนินการ...' : 'บังคับออกจากระบบ'}</button><button className="button button-shutdown" disabled={!machine.online || acting === `shutdown:${machine.machineId}`} title={machine.online ? 'สั่งปิดเครื่อง' : 'เครื่องออฟไลน์'} onClick={() => shutdownMachine(machine.machineId)}><PowerIcon />{acting === `shutdown:${machine.machineId}` ? 'กำลังส่งคำสั่ง...' : 'ปิดเครื่อง'}</button></div>
              </div> : <div className="available-copy"><span>พร้อมใช้งาน</span><p>ยังไม่มีผู้ใช้เครื่องนี้</p><div className="machine-actions"><button className="button button-shutdown" disabled={!machine.online || acting === `shutdown:${machine.machineId}`} title={machine.online ? 'สั่งปิดเครื่อง' : 'เครื่องออฟไลน์'} onClick={() => shutdownMachine(machine.machineId)}><PowerIcon />{acting === `shutdown:${machine.machineId}` ? 'กำลังส่งคำสั่ง...' : 'ปิดเครื่อง'}</button></div></div>}
            </article>;
          })}
        </div> : <div className="empty-state"><SearchIcon /><h3>ไม่พบเครื่องที่ค้นหา</h3><p>ลองเปลี่ยนคำค้นหาหรือตัวกรองสถานะ</p><button className="button button-ghost" onClick={() => { setQuery(''); setStatusFilter('all'); }}>ล้างตัวกรอง</button></div>}
      </section>

      <section className="panel report-panel">
        <div className="panel-heading report-heading">
          <div><p className="section-kicker">MONTHLY REPORT</p><h2>รายงานประจำเดือน{monthName}</h2><p>ชั่วโมงใช้งานรวม <strong>{report.totalHours.toLocaleString('th-TH')}</strong> ชั่วโมง</p></div>
          <a className="button button-primary" href={`/api/admin/export/monthly.csv?year=${year}&month=${month}`}><DownloadIcon />ดาวน์โหลด CSV</a>
        </div>
        {report.rows.length === 0 ? <div className="empty-report"><span>—</span><p>ยังไม่มีข้อมูลการใช้งานในเดือนนี้</p></div> : <div className="table-wrap"><table><thead><tr><th>ผู้ใช้งาน</th><th>หมายเลขเครื่อง</th><th>จำนวนเซสชัน</th><th>ชั่วโมงใช้งาน</th></tr></thead><tbody>{report.rows.map(row => <tr key={`${row.userEmail}-${row.machineId}`}><td><strong>{row.userEmail}</strong></td><td><span className="table-machine">{row.machineId}</span></td><td>{row.sessionCount.toLocaleString('th-TH')}</td><td>{row.hours.toLocaleString('th-TH')}</td></tr>)}</tbody></table></div>}
      </section>

      <footer><span>LockComputer Administration</span><span>มหาวิทยาลัยมหาสารคาม</span></footer>
    </div>
  </main>;
}
