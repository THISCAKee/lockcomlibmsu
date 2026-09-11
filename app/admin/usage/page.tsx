'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { MACHINE_ZONES } from '../../../lib/server/zones';

type ReportRow = {
  zone: string;
  userEmail?: string;
  machineId?: string;
  sessionCount: number;
};

type ZoneReportRow = {
  zone: string;
  machineCount: number;
  sessionCount: number;
};

type Report = {
  month: string;
  rows: ReportRow[];
  zoneRows: ZoneReportRow[];
};

const emptyReport: Report = { month: '', rows: [], zoneRows: [] };

const currentMonthValue = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

const monthParts = (value: string) => {
  const [year, month] = value.split('-').map(Number);
  return { year, month };
};

const monthTitle = (value: string) => {
  const { year, month } = monthParts(value);
  return new Intl.DateTimeFormat('th-TH', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1));
};

function RefreshIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6v5h-5M4 18v-5h5M18.5 9A7 7 0 0 0 6.7 6.7L4 9m16 6-2.7 2.3A7 7 0 0 1 5.5 15" /></svg>;
}

function ChartIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19V9m7 10V5m7 14v-7" /></svg>;
}

function ArrowIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13m-5-5 5 5-5 5" /></svg>;
}

export default function UsagePage() {
  const [selectedMonth, setSelectedMonth] = useState(currentMonthValue);
  const [report, setReport] = useState<Report>(emptyReport);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(async (showRefresh = false) => {
    setError('');
    setLoading(true);
    if (showRefresh) setRefreshing(true);
    try {
      const me = await fetch('/api/me');
      if (!me.ok) {
        window.location.href = '/auth/login?returnUrl=/admin/usage';
        return;
      }

      const { year, month } = monthParts(selectedMonth);
      const response = await fetch(`/api/admin/reports/monthly?year=${year}&month=${month}`);
      if (!response.ok) throw new Error('โหลดข้อมูลการเข้าใช้งานไม่สำเร็จ');
      setReport(await response.json() as Report);
      setLastUpdated(new Date());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'โหลดข้อมูลการเข้าใช้งานไม่สำเร็จ');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedMonth]);

  useEffect(() => {
    load().catch(reason => setError(reason instanceof Error ? reason.message : 'เกิดข้อผิดพลาด'));
    const timer = window.setInterval(() => load().catch(() => undefined), 15000);
    return () => window.clearInterval(timer);
  }, [load]);

  const totalSessions = useMemo(
    () => report.zoneRows.reduce((total, row) => total + row.sessionCount, 0),
    [report.zoneRows],
  );
  const activeZones = useMemo(
    () => report.zoneRows.filter(row => row.sessionCount > 0).length,
    [report.zoneRows],
  );
  const leadingZone = useMemo(
    () => totalSessions > 0
      ? report.zoneRows.reduce<ZoneReportRow | null>((best, row) => !best || row.sessionCount > best.sessionCount ? row : best, null)
      : null,
    [report.zoneRows, totalSessions],
  );
  const machineUsage = useMemo(() => {
    const counts = new Map<string, { machineId: string; zone: string; sessionCount: number }>();
    for (const row of report.rows) {
      if (!row.machineId) continue;
      const current = counts.get(row.machineId) ?? { machineId: row.machineId, zone: row.zone, sessionCount: 0 };
      current.sessionCount += row.sessionCount;
      counts.set(row.machineId, current);
    }
    return Array.from(counts.values()).sort((left, right) => right.sessionCount - left.sessionCount || left.machineId.localeCompare(right.machineId));
  }, [report.rows]);
  const maxZoneSessions = Math.max(1, ...report.zoneRows.map(row => row.sessionCount));
  const maxMachineSessions = Math.max(1, ...(machineUsage.map(row => row.sessionCount)));
  const totalMachines = report.zoneRows.reduce((total, row) => total + row.machineCount, 0);

  if (loading && !lastUpdated) {
    return <main className="dashboard loading-screen">
      <div className="loading-mark"><span>LC</span></div>
      <div><strong>กำลังเตรียมข้อมูลการเข้าใช้งาน</strong><p>กำลังโหลดสถิติประจำเดือน...</p></div>
    </main>;
  }

  return <main className="dashboard usage-page">
    <header className="hero">
      <nav className="nav-bar">
        <div className="brand">
          <span className="brand-mark">LC</span>
          <span><strong>LockComputer</strong><small>MSU Library</small></span>
        </div>
        <div className="nav-actions">
          <a className="button button-ghost usage-nav-link" href="/admin"><ArrowIcon />สถานะเครื่อง</a>
          <button className="button button-ghost" onClick={() => load(true)} disabled={refreshing}>
            <RefreshIcon />{refreshing ? 'กำลังรีเฟรช' : 'รีเฟรช'}
          </button>
        </div>
      </nav>
      <div className="hero-copy">
        <p className="overline">USAGE ANALYTICS</p>
        <h1>ข้อมูลการเข้าใช้งาน</h1>
        <p>สรุปจำนวนครั้งการเข้าใช้งานเครื่อง แยกตามเดือน โซน และเครื่องคอมพิวเตอร์</p>
        <div className="updated">อัปเดตอัตโนมัติทุก 15 วินาที · ล่าสุด {lastUpdated?.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) ?? '-'}</div>
      </div>
    </header>

    <div className="content">
      {error && <div className="alert" role="alert"><strong>พบข้อผิดพลาด</strong><span>{error}</span></div>}

      <section className="panel usage-toolbar">
        <div><p className="section-kicker">MONTHLY SNAPSHOT</p><h2>สถิติประจำเดือน{monthTitle(selectedMonth)}</h2><p>เลือกเดือนเพื่อดูจำนวนครั้งการเข้าใช้งานของห้องคอมพิวเตอร์</p></div>
        <label className="usage-month-control"><span>เดือนที่ต้องการดู</span><input type="month" value={selectedMonth} onChange={event => setSelectedMonth(event.target.value)} /></label>
      </section>

      <section className="metrics usage-metrics" aria-label="สรุปข้อมูลการเข้าใช้งาน">
        <article className="metric-card metric-total"><span className="metric-icon"><ChartIcon /></span><div><p>เข้าใช้งานทั้งหมด</p><strong>{totalSessions.toLocaleString('th-TH')}</strong><small>ครั้งในเดือนนี้</small></div></article>
        <article className="metric-card metric-active"><span className="metric-icon">{activeZones}</span><div><p>โซนที่มีการใช้งาน</p><strong>{activeZones}</strong><small>จาก {MACHINE_ZONES.length} โซน</small></div></article>
        <article className="metric-card metric-available"><span className="metric-icon">{leadingZone?.zone.slice(0, 2) ?? '—'}</span><div><p>โซนที่ใช้งานสูงสุด</p><strong>{leadingZone?.zone ?? '—'}</strong><small>{leadingZone ? `${leadingZone.sessionCount.toLocaleString('th-TH')} ครั้ง` : 'ยังไม่มีข้อมูล'}</small></div></article>
        <article className="metric-card metric-rate"><div className="rate-copy"><div><p>เครื่องในระบบ</p><strong>{totalMachines.toLocaleString('th-TH')}</strong></div><small>ครอบคลุมทุกโซน</small></div><div className="progress"><span style={{ width: `${Math.min(100, totalMachines / 203 * 100)}%` }} /></div></article>
      </section>

      <section className="usage-analysis-grid">
        <article className="panel usage-chart-panel">
          <div className="panel-heading usage-panel-heading"><div><p className="section-kicker">ZONE ACTIVITY</p><h2>จำนวนครั้งแยกตามโซน</h2><p>เปรียบเทียบการเข้าใช้งานของแต่ละพื้นที่ในเดือนนี้</p></div><span className="result-count">{totalSessions.toLocaleString('th-TH')} ครั้ง</span></div>
          <div className="usage-chart" role="img" aria-label={`กราฟจำนวนครั้งเข้าใช้งานแยกตามโซน ประจำเดือน${monthTitle(selectedMonth)}`}>
            {report.zoneRows.map((row, index) => <div className="usage-chart-row" key={row.zone}>
              <div className="usage-chart-label"><span className="zone-dot" /><strong>{row.zone}</strong></div>
              <div className="usage-chart-track"><span className="usage-chart-bar" style={{ width: `${row.sessionCount / maxZoneSessions * 100}%`, animationDelay: `${index * 70}ms` }} /></div>
              <strong className="usage-chart-value">{row.sessionCount.toLocaleString('th-TH')}</strong>
            </div>)}
          </div>
        </article>

        <article className="panel machine-ranking">
          <div className="panel-heading usage-panel-heading"><div><p className="section-kicker">TOP MACHINES</p><h2>เครื่องที่ถูกใช้งานสูงสุด</h2><p>จัดอันดับจากจำนวนครั้งในเดือนนี้</p></div></div>
          {machineUsage.length > 0 ? <div className="ranking-list">{machineUsage.slice(0, 8).map((row, index) => <div className="ranking-row" key={row.machineId}>
            <span className="ranking-number">{String(index + 1).padStart(2, '0')}</span>
            <div className="ranking-copy"><strong>{row.machineId}</strong><span>{row.zone}</span><div className="ranking-track"><span style={{ width: `${row.sessionCount / maxMachineSessions * 100}%` }} /></div></div>
            <strong className="ranking-value">{row.sessionCount.toLocaleString('th-TH')}</strong>
          </div>)}</div> : <div className="usage-empty"><ChartIcon /><p>ยังไม่มีข้อมูลการเข้าใช้งานในเดือนนี้</p></div>}
        </article>
      </section>

      <section className="panel usage-table-panel">
        <div className="panel-heading usage-panel-heading"><div><p className="section-kicker">SESSION COUNTS</p><h2>รายละเอียดการเข้าใช้งาน</h2><p>จำนวนครั้งแยกตามผู้ใช้งานและเครื่อง</p></div><a className="button button-primary" href={`/api/admin/export/monthly.csv?year=${monthParts(selectedMonth).year}&month=${monthParts(selectedMonth).month}`}>ดาวน์โหลด CSV</a></div>
        {report.rows.length === 0 ? <div className="usage-empty"><ChartIcon /><p>ยังไม่มีข้อมูลการเข้าใช้งานในเดือนนี้</p></div> : <div className="table-wrap"><table><thead><tr><th>โซน</th><th>ผู้ใช้งาน</th><th>หมายเลขเครื่อง</th><th>จำนวนครั้ง</th></tr></thead><tbody>{report.rows.map(row => <tr key={`${row.userEmail}-${row.machineId}`}><td><span className="table-zone">{row.zone}</span></td><td><strong>{row.userEmail}</strong></td><td><span className="table-machine">{row.machineId}</span></td><td><strong>{row.sessionCount.toLocaleString('th-TH')}</strong></td></tr>)}</tbody></table></div>}
      </section>

      <footer><span>LockComputer Administration</span><span>มหาวิทยาลัยมหาสารคาม</span></footer>
    </div>
  </main>;
}
