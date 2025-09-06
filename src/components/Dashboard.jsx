import React from 'react';
import './dashboard.css';
import MiniLineChart from './MiniLineChart';
import SunspotChart from './SunspotChart';
import { fetchDaily, fetchLatest } from '../api/sunspots';
import { useEffect, useState } from 'react';

export default function Dashboard() {
  const sample = [12, 19, 8, 14, 20, 18, 24];
  const [daily, setDaily] = useState([]);
  const [latest, setLatest] = useState(null);
  const [fromDate, setFromDate] = useState(null);
  const [toDate, setToDate] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    // initialize default range (last 12 months)
    (async () => {
      try {
        const now = new Date();
        const defFrom = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()).toISOString().slice(0,10);
        const defTo = now.toISOString().slice(0,10);
        setFromDate(defFrom);
        setToDate(defTo);
        setLoading(true);
        const d = await fetchDaily(defFrom, defTo);
        setDaily(d);
        const l = await fetchLatest();
        setLatest(l);
      } catch (e) {
        console.warn('Failed to fetch sunspots', e);
        setError(e.message || String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function updateRange() {
    if (!fromDate || !toDate) return;
    setError(null);
    setLoading(true);
    try {
      const d = await fetchDaily(fromDate, toDate);
      setDaily(d);
    } catch (e) {
      console.warn('Failed to fetch range', e);
      setError(e.message || String(e));
    } finally { setLoading(false); }
  }
  return (
    <div className="dashboard root-neon">
      <aside className="sidebar">
        <div className="brand">NEON-OPS</div>
        <nav>
          <a className="active">Overview</a>
          <a>Systems</a>
          <a>Analytics</a>
          <a>Settings</a>
        </nav>
        <div className="sidebar-footer">v0.1 • static</div>
      </aside>

      <section className="main">
        <header className="topbar">
          <div className="title">Command HUD</div>
          <div className="controls">User • Engineer</div>
        </header>

        <div className="panels">
          <div className="panel large">
            <h2>Overview</h2>
            <div style={{display:'flex', alignItems:'center', gap:16, justifyContent:'space-between'}}>
              <div>
                <h3>Sunspots (last 12 months)</h3>
                <div style={{color:'var(--muted)'}}>Source: WDC-SILSO / LISIRD</div>
              </div>
              <div style={{textAlign:'right'}}>
                <div style={{fontSize:12, color:'var(--muted)'}}>Updated</div>
                <div style={{fontWeight:700, color:'var(--neon-accent)'}}>{latest?.d ?? '—'}</div>
              </div>
            </div>
            <div style={{marginTop:12}}>
              <div style={{display:'flex', gap:8, alignItems:'center', marginBottom:8}}>
                <label style={{fontSize:12, color:'var(--muted)'}}>From</label>
                <input type="date" value={fromDate||''} onChange={e=>setFromDate(e.target.value)} />
                <label style={{fontSize:12, color:'var(--muted)'}}>To</label>
                <input type="date" value={toDate||''} onChange={e=>setToDate(e.target.value)} />
                <button onClick={updateRange} disabled={loading} style={{marginLeft:8}}>{loading? 'Loading...' : 'Update'}</button>
              </div>
              {error && <div style={{color:'var(--danger)', marginBottom:8}}>Error: {error}</div>}
              <SunspotChart data={daily} />
            </div>
          </div>

          <aside className="panel small">
            <h3>Quick Notes</h3>
            <ul className="notes">
              <li>Remember to wire Azure static deploy</li>
              <li>Integrate telemetry</li>
              <li>Dark neon theme enabled</li>
            </ul>
          </aside>
        </div>
      </section>
    </div>
  );
}
