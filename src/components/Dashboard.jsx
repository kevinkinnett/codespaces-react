import React, { useEffect, useState } from 'react';
import './dashboard.css';
import MiniLineChart from './MiniLineChart';
import SunspotChart from './SunspotChart';
import { fetchDaily, fetchLatest } from '../api/sunspots';

export default function Dashboard() {
  const [daily, setDaily] = useState([]);
  const [latest, setLatest] = useState(null);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('Overview');
  // Local storage key (versioned) for persisting dashboard settings
  const STORAGE_KEY = 'codespaces-react.dashboard.v1';

  // Load saved settings (if any)
  const loadSaved = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  };

  useEffect(() => {
    (async () => {
      try {
        // load saved settings or default to last 12 months
        const saved = loadSaved();
        const now = new Date();
        const defFrom = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()).toISOString().slice(0,10);
        const defTo = now.toISOString().slice(0,10);
        const initFrom = saved?.fromDate ?? defFrom;
        const initTo = saved?.toDate ?? defTo;
        const initTab = saved?.activeTab ?? 'Overview';
        setFromDate(initFrom);
        setToDate(initTo);
        setActiveTab(initTab);
        setLoading(true);
        const d = await fetchDaily(initFrom, initTo);
        setDaily(d);
        const l = await fetchLatest();
        setLatest(l);
      } catch (e) {
        console.warn('Failed to fetch sunspots', e);
        setError(e.message || String(e));
      } finally { setLoading(false); }
    })();
  }, []);

  // Persist key settings when they change
  useEffect(() => {
    try {
      const obj = { activeTab, fromDate, toDate };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
    } catch (e) {
      // ignore
    }
  }, [activeTab, fromDate, toDate]);

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
          <button className={activeTab==='Overview'? 'active':''} onClick={()=>setActiveTab('Overview')}>Overview</button>
          <button className={activeTab==='Sunspots'? 'active':''} onClick={()=>setActiveTab('Sunspots')}>Sunspots</button>
          <button className={activeTab==='Systems'? 'active':''} onClick={()=>setActiveTab('Systems')}>Systems</button>
          <button className={activeTab==='Analytics'? 'active':''} onClick={()=>setActiveTab('Analytics')}>Analytics</button>
          <button className={activeTab==='Settings'? 'active':''} onClick={()=>setActiveTab('Settings')}>Settings</button>
        </nav>
        <div className="sidebar-footer">v0.1 • static</div>
      </aside>

      <section className="main">
        <header className="topbar">
          <div className="title">Command HUD</div>
          <div className="controls">User • Engineer</div>
        </header>

        <div className="panels">
          {activeTab === 'Overview' && (
            <>
              <div className="panel large">
                <h2>Overview</h2>
                <div style={{display:'flex', alignItems:'center', gap:16, justifyContent:'space-between'}}>
                  <div>
                    <h3>Quick Summary</h3>
                    <div style={{color:'var(--muted)'}}>Sunspots summary and system overview</div>
                  </div>
                  <div style={{textAlign:'right'}}>
                    <div style={{fontSize:12, color:'var(--muted)'}}>Updated</div>
                    <div style={{fontWeight:700, color:'var(--neon-accent)'}}>{latest?.d ?? '—'}</div>
                  </div>
                </div>
                <div style={{marginTop:12}}>
                  <p style={{color:'var(--muted)'}}>Select the "Sunspots" tab to view charts and change date ranges.</p>
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
            </>
          )}

          {activeTab === 'Sunspots' && (
            <>
              <div className="panel large">
                <h2>Sunspots</h2>
                <div style={{display:'flex', alignItems:'center', gap:16, justifyContent:'space-between'}}>
                  <div>
                    <h3>Sunspots</h3>
                    <div style={{color:'var(--muted)'}}>Source: WDC-SILSO / NOAA</div>
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
                <h3>Data</h3>
                <div style={{fontSize:12, color:'var(--muted)'}}>Rows: {daily?.length ?? 0}</div>
              </aside>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
