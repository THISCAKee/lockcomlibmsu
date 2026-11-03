'use client';
import { useState, type FormEvent } from 'react';
import { appPath } from '../../lib/app-path';

type ZoneUsage = { id: string; name: string; dailyLimit: number | null; used: number; remaining: number | null };
type Result = { email: string; zones: ZoneUsage[] };
export default function DailyUsageLookup() {
  const [email, setEmail] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function lookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setResult(null);
    try {
      const response = await fetch(appPath('/api/admin/usage-daily'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'ตรวจสอบสิทธิ์ไม่สำเร็จ');
      setResult(data as Result);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'ตรวจสอบสิทธิ์ไม่สำเร็จ'); }
    finally { setBusy(false); }
  }
  return <section className="panel daily-usage-panel">
    <div className="panel-heading"><div><p className="section-kicker">DAILY USAGE</p><h2>ตรวจสอบสิทธิ์รายวัน</h2><p>ค้นหาจำนวนครั้งที่ใช้และสิทธิ์คงเหลือแยกตามโซน รีเซ็ตเที่ยงคืนเวลาไทย</p></div></div>
    <form className="daily-usage-form" onSubmit={lookup}><label htmlFor="daily-usage-email">อีเมลผู้ใช้งาน</label><div><input id="daily-usage-email" type="email" required placeholder="ชื่อบัญชี@msu.ac.th" value={email} onChange={event => setEmail(event.target.value)} /><button className="button button-primary" type="submit" disabled={busy}>{busy ? 'กำลังค้นหา...' : 'ตรวจสอบสิทธิ์'}</button></div></form>
    {error && <p className="daily-usage-error" role="alert">{error}</p>}
    {result && <div className="daily-usage-results" aria-live="polite"><p>สิทธิ์วันนี้ของ <strong>{result.email}</strong></p>{result.zones.length === 0 ? <p>ยังไม่มีโซนที่กำหนด</p> : <div className="table-wrap"><table><thead><tr><th>โซน</th><th>ใช้แล้ว</th><th>กำหนดต่อวัน</th><th>คงเหลือ</th></tr></thead><tbody>{result.zones.map(zone => <tr key={zone.id}><td>{zone.name}</td><td>{zone.used} ครั้ง</td><td>{zone.dailyLimit === null ? 'ไม่จำกัด' : `${zone.dailyLimit} ครั้ง`}</td><td>{zone.remaining === null ? 'ไม่จำกัด' : `${zone.remaining} ครั้ง`}</td></tr>)}</tbody></table></div>}</div>}
  </section>;
}
