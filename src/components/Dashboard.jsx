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
  const [chartWidth, setChartWidth] = useState(null); // px
  const [chartHeight, setChartHeight] = useState(null); // px
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const panelRef = React.useRef(null);
  const chartRef = React.useRef(null);
  const resizingRef = React.useRef(false);
  const resizingYRef = React.useRef(false);

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
    const initWidth = saved?.chartWidth ?? null;
    const initHeight = saved?.chartHeight ?? null;
        setFromDate(initFrom);
        setToDate(initTo);
        setActiveTab(initTab);
  if (initWidth) setChartWidth(initWidth);
  if (initHeight) setChartHeight(initHeight);
        setLoading(true);
        const d = await fetchDaily(initFrom, initTo);
        setDaily(d);
        const l = await fetchLatest();
        setLatest(l);
      } catch (e) {
        console.warn('Failed to fetch sunspots', e);
        setError(e.message || String(e));
      } finally { setLoading(false); }
      // mark that we've applied initial settings so subsequent changes are persisted
      setSettingsLoaded(true);
    })();
  }, []);

  // When navigating back to the Sunspots tab, ensure saved dates are applied to the inputs
  useEffect(() => {
    if (activeTab !== 'Sunspots') return;
    const saved = loadSaved();
    if (!saved) return;
    const sf = saved.fromDate ?? fromDate;
    const st = saved.toDate ?? toDate;

    // If saved dates differ from current inputs, apply them and refresh data
    let needFetch = false;
    if (sf && sf !== fromDate) { setFromDate(sf); needFetch = true; }
    if (st && st !== toDate) { setToDate(st); needFetch = true; }

    if (needFetch) {
      (async () => {
        setError(null);
        setLoading(true);
        try {
          const d = await fetchDaily(sf, st);
          setDaily(d);
        } catch (e) {
          console.warn('Failed to fetch saved range', e);
          setError(e.message || String(e));
        } finally { setLoading(false); }
      })();
    }
  }, [activeTab]);

  // Persist key settings when they change
  useEffect(() => {
    // Don't persist until initial load has applied saved settings; this avoids
    // stomping existing saved values with initial empty defaults.
    if (!settingsLoaded) return;
    try {
      const obj = { activeTab, fromDate, toDate, chartWidth, chartHeight };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
    } catch (e) {
      // ignore
    }
  }, [settingsLoaded, activeTab, fromDate, toDate, chartWidth, chartHeight]);

  // resizing handlers
  useEffect(() => {
    function onMove(e) {
      const touch = e.touches && e.touches[0];
      // Horizontal (width)
      if (resizingRef.current) {
        const clientX = e.clientX ?? (touch && touch.clientX);
        if (panelRef.current && clientX != null) {
          const rect = panelRef.current.getBoundingClientRect();
          const min = 400, max = Math.max(480, window.innerWidth - 320 - 80);
          let w = Math.round(clientX - rect.left);
          if (w < min) w = min;
          if (w > max) w = max;
          setChartWidth(w);
        }
      }

      // Vertical (height)
      if (resizingYRef.current) {
        const clientY = e.clientY ?? (touch && touch.clientY);
        if (chartRef.current && clientY != null) {
          const rect = chartRef.current.getBoundingClientRect();
          const minH = 150, maxH = Math.max(200, window.innerHeight - 200);
          let h = Math.round(clientY - rect.top);
          if (h < minH) h = minH;
          if (h > maxH) h = maxH;
          setChartHeight(h);
        }
      }
    }
    function onUp() { resizingRef.current = false; resizingYRef.current = false; document.body.style.cursor = ''; document.body.style.userSelect = ''; }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchmove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchend', onUp);
    };
  }, []);

  function startResize(e) {
    e.preventDefault();
    resizingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  function startVResize(e) {
    e.preventDefault();
    resizingYRef.current = true;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  }

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
              <div className="panel large" ref={panelRef} style={(() => {
                const s = {};
                if (chartWidth) s.width = chartWidth + 'px';
                return Object.keys(s).length ? s : undefined;
              })()}>
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
                  <div className="chart-wrap" ref={chartRef} style={chartHeight ? {height: chartHeight + 'px'} : undefined}>
                    <SunspotChart data={daily} height={chartHeight} />
                    <div className="panel-vresizer" onMouseDown={startVResize} onTouchStart={startVResize} title="Drag to resize vertically" />
                  </div>
                </div>
                {/* resizer handle on the right edge of this panel */}
                <div className="panel-resizer" onMouseDown={startResize} onTouchStart={startResize} title="Drag to resize" />
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
