'use client';
import { useEffect, useState } from 'react';
import { appPath } from '../../../lib/app-path';
import type { Zone } from '../../../lib/server/zone-policy';

export default function ZonesPage() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [count, setCount] = useState(203);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { fetch(appPath('/api/admin/zones')).then(async response => {
    if (response.status === 403) { window.location.href = appPath('/auth/login?returnUrl=/admin/zones'); return; }
    if (!response.ok) throw new Error('โหลดการตั้งค่าไม่สำเร็จ');
    const data = await response.json(); setZones(data.zones); setCount(data.machineCount);
  }).catch(() => setMessage('โหลดการตั้งค่าไม่สำเร็จ')); }, []);
  const update = (index: number, patch: Partial<Zone>) => setZones(current => current.map((zone, i) => i === index ? { ...zone, ...patch } : zone));
  const save = async () => {
    setBusy(true); setMessage('');
    try {
      const response = await fetch(appPath('/api/admin/zones'), { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ zones }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'บันทึกไม่สำเร็จ');
      setZones(result.zones); setMessage('บันทึกการตั้งค่าแล้ว');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ'); }
    finally { setBusy(false); }
  };
  return <main className="zone-settings">
    <a href={appPath('/admin')}>← กลับหน้าสถานะเครื่อง</a>
    <h1>ตั้งค่าโซนและสิทธิ์การใช้งาน</h1>
    <p>กำหนดจำนวนครั้งต่ออีเมลในแต่ละโซน ระบบเริ่มนับใหม่ทุกเที่ยงคืนตามเวลาไทย เครื่องที่ไม่อยู่ในโซนจะไม่จำกัดจำนวนครั้ง</p>
    {zones.map((zone, index) => <section className="zone-settings-card" key={zone.id}>
      <div className="zone-settings-fields">
        <label>ชื่อโซน<input value={zone.name} onChange={event => update(index, { name: event.target.value })} /></label>
        <label>จำนวนครั้งต่อวัน<input type="number" min="1" placeholder="ไม่จำกัด" value={zone.dailyLimit ?? ''} onChange={event => update(index, { dailyLimit: event.target.value === '' ? null : Number(event.target.value) })} /></label>
        <button type="button" onClick={() => setZones(current => current.filter((_, i) => i !== index))}>ลบโซน</button>
      </div>
      <details><summary>เลือกเครื่อง ({zone.machines.length} เครื่อง)</summary><div className="zone-machine-grid">
        {Array.from({ length: count }, (_, i) => `PC-${String(i + 1).padStart(3, '0')}`).map(machine => {
          const assigned = zones.find((other, i) => i !== index && other.machines.includes(machine));
          return <label key={machine}><input type="checkbox" checked={zone.machines.includes(machine)} disabled={Boolean(assigned)} onChange={event => update(index, { machines: event.target.checked ? [...zone.machines, machine] : zone.machines.filter(id => id !== machine) })} />{machine}{assigned ? ` (${assigned.name})` : ''}</label>;
        })}
      </div></details>
    </section>)}
    <div className="zone-settings-actions"><button type="button" onClick={() => setZones(current => [...current, { id: crypto.randomUUID(), name: '', machines: [], dailyLimit: null }])}>เพิ่มโซน</button><button type="button" disabled={busy} onClick={save}>บันทึกการตั้งค่า</button><span role="status">{message}</span></div>
  </main>;
}
