import React, { useEffect, useState } from 'react';
import './dashboard.css';
import MiniLineChart from './MiniLineChart';
import SunspotChart from './SunspotChart';
import YieldChart from './YieldChart';
import { fetchDaily, fetchLatest } from '../api/sunspots';
import { fetchYieldSpread } from '../api/fred';

export default function Dashboard() {
  const [daily, setDaily] = useState([]);
  const [latest, setLatest] = useState(null);
  const [yieldDaily, setYieldDaily] = useState([]);
  const [consecutiveInverted, setConsecutiveInverted] = useState(0);
  const [inversionStart, setInversionStart] = useState(null);
  const [yieldFrom, setYieldFrom] = useState('');
  const [yieldTo, setYieldTo] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('Overview');
  // Local storage key (versioned) for persisting dashboard settings
  const STORAGE_KEY = 'codespaces-react.dashboard.v1';
  const [chartWidth, setChartWidth] = useState(null); // px
  const [chartHeight, setChartHeight] = useState(null); // px
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const panelRef = React.useRef(null);
  const chartRef = React.useRef(null);
  const resizingYRef = React.useRef(false);

  // Load saved settings (if any)
  const loadSaved = () => {
    try {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return {};
  return JSON.parse(raw);
    } catch (e) {
  return {};
    }
  };

  useEffect(() => {
    // compute consecutive inverted days (most recent contiguous negative spread)
    if (!yieldDaily || !yieldDaily.length) { setConsecutiveInverted(0); return; }
    // yieldDaily is expected in chronological order; ensure we use last entries
    let count = 0;
    for (let i = yieldDaily.length - 1; i >= 0; i--) {
      const v = yieldDaily[i]?.v;
      if (v == null) break;
      if (v < 0) count++; else break;
    }
    setConsecutiveInverted(count);
    // compute inversion start date if count > 0
    if (count > 0) {
      const startIdx = yieldDaily.length - count;
      setInversionStart(yieldDaily[startIdx]?.d ?? null);
    } else {
      setInversionStart(null);
    }
  }, [yieldDaily]);

  useEffect(() => {
    (async () => {
      try {
  // load saved settings or default to last 12 months
  const saved = loadSaved() || {};
        const now = new Date();
        const defFrom = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()).toISOString().slice(0,10);
        const defTo = now.toISOString().slice(0,10);
  const initTab = saved?.activeTab ?? 'Overview';
  // per-tab saved values
  const tabs = saved?.tabs ?? {};
  const sun = tabs?.Sunspots ?? {};
  const yld = tabs?.Yield ?? {};
  const initFrom = sun.fromDate ?? defFrom;
  const initTo = sun.toDate ?? defTo;
  const initYieldFrom = yld.yieldFrom ?? initFrom;
  const initYieldTo = yld.yieldTo ?? initTo;
  setFromDate(initFrom);
  setToDate(initTo);
  setYieldFrom(initYieldFrom);
  setYieldTo(initYieldTo);
  setActiveTab(initTab);
  // apply chart dimensions and right-panel collapsed from the active tab if available
  const dims = (tabs[initTab] && { w: tabs[initTab].chartWidth, h: tabs[initTab].chartHeight, c: tabs[initTab].collapsed }) || {};
  if (dims.w) setChartWidth(dims.w);
  if (dims.h) setChartHeight(dims.h);
  setRightCollapsed(!!dims.c);
        setLoading(true);
  const d = await fetchDaily(initFrom, initTo);
  setDaily(d);
  const l = await fetchLatest();
  setLatest(l);
  // If initial tab is Yield, fetch yield spread from FRED; otherwise leave yieldDaily empty until user updates
  if (initTab === 'Yield') {
    try {
      const yd = await fetchYieldSpread(initYieldFrom, initYieldTo);
      setYieldDaily(yd);
    } catch (e) {
      console.warn('Failed to fetch initial yield data', e);
    }
  }
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
  const saved = loadSaved() || {};
  const tabs = saved.tabs || {};
  const sf = tabs?.Sunspots?.fromDate ?? fromDate;
  const st = tabs?.Sunspots?.toDate ?? toDate;
  const sc = tabs?.Sunspots?.collapsed ?? false;
  setRightCollapsed(!!sc);

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

  // When navigating to Yield tab, restore saved yield dates and data
  useEffect(() => {
    if (activeTab !== 'Yield') return;
  const saved = loadSaved() || {};
  const tabs = saved.tabs || {};
  const sf = tabs?.Yield?.yieldFrom ?? yieldFrom;
  const st = tabs?.Yield?.yieldTo ?? yieldTo;
  const yc = tabs?.Yield?.collapsed ?? false;
  setRightCollapsed(!!yc);

    let needFetch = false;
    if (sf && sf !== yieldFrom) { setYieldFrom(sf); needFetch = true; }
    if (st && st !== yieldTo) { setYieldTo(st); needFetch = true; }

    if (needFetch) {
      (async () => {
        setError(null);
        setLoading(true);
        try {
          const d = await fetchYieldSpread(sf, st);
          setYieldDaily(d);
        } catch (e) {
          console.warn('Failed to fetch saved yield range', e);
          setError(e.message || String(e));
        } finally { setLoading(false); }
      })();
    }
  }, [activeTab]);

  // Persist key settings when they change
  useEffect(() => {
    if (!settingsLoaded) return;
    try {
      const saved = loadSaved() || {};
      if (!saved.tabs) saved.tabs = {};
      const tabObj = saved.tabs[activeTab] || {};
      // Save fields depending on tab
      if (activeTab === 'Sunspots') {
        tabObj.fromDate = fromDate;
        tabObj.toDate = toDate;
      } else if (activeTab === 'Yield') {
        tabObj.yieldFrom = yieldFrom;
        tabObj.yieldTo = yieldTo;
      }
      // chart sizes are tab-specific
      tabObj.chartWidth = chartWidth;
      tabObj.chartHeight = chartHeight;
    tabObj.collapsed = !!rightCollapsed;
      saved.tabs[activeTab] = tabObj;
      saved.activeTab = activeTab;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    } catch (e) {
      // ignore
    }
  }, [settingsLoaded, activeTab, fromDate, toDate, yieldFrom, yieldTo, chartWidth, chartHeight, rightCollapsed]);

  // resizing handlers
  useEffect(() => {
    function onMove(e) {
      const touch = e.touches && e.touches[0];
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
    function onUp() { resizingYRef.current = false; document.body.style.cursor = ''; document.body.style.userSelect = ''; }
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
          <button className={activeTab==='Yield'? 'active':''} onClick={()=>setActiveTab('Yield')}>Yield</button>
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
                <button
                  className="collapse-btn"
                  title={rightCollapsed ? 'Expand panel' : 'Collapse panel'}
                  onClick={() => setRightCollapsed(prev => !prev)}
                  style={{ position: 'absolute', right: '-44px', top: 8 }}
                >
                  {rightCollapsed ? '›' : '‹'}
                </button>
                <h2>Overview</h2>
                <div style={{display:'flex', alignItems:'center', gap:16, justifyContent:'space-between'}}>
                  <div>
                    <h3>Quick Summary</h3>
                    <div style={{color:'var(--muted)'}}>Sunspots summary and system overview</div>
                  </div>
                  <div style={{textAlign:'right'}}>
                    <div style={{fontSize:12, color:'#222'}}>Updated</div>
                    <div style={{fontWeight:700, color:'#111'}}>{latest?.d ?? '—'}</div>
                  </div>
                </div>
                <div style={{marginTop:12}}>
                  <p style={{color:'var(--muted)'}}>Select the "Sunspots" tab to view charts and change date ranges.</p>
                </div>
              </div>

              <aside className={`panel small ${rightCollapsed ? 'collapsed' : ''}`}>
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
                <button
                  className="collapse-btn"
                  title={rightCollapsed ? 'Expand panel' : 'Collapse panel'}
                  onClick={() => setRightCollapsed(prev => !prev)}
                  style={{ position: 'absolute', right: '-44px', top: 8 }}
                >
                  {rightCollapsed ? '›' : '‹'}
                </button>
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
                {/* horizontal resizer removed */}
              </div>

              <aside className={`panel small ${rightCollapsed ? 'collapsed' : ''}`}>
                <h3>Data</h3>
                <div style={{fontSize:12, color:'var(--muted)'}}>Rows: {daily?.length ?? 0}</div>
              </aside>
            </>
          )}

          {activeTab === 'Yield' && (
            <>
              <div className="panel large" ref={panelRef} style={(() => {
                const s = {};
                if (chartWidth) s.width = chartWidth + 'px';
                return Object.keys(s).length ? s : undefined;
              })()}>
                <button
                  className="collapse-btn"
                  title={rightCollapsed ? 'Expand panel' : 'Collapse panel'}
                  onClick={() => setRightCollapsed(prev => !prev)}
                  style={{ position: 'absolute', right: '-44px', top: 8 }}
                >
                  {rightCollapsed ? '›' : '‹'}
                </button>
                <h2>Inverted Yield Curve</h2>
                <div style={{display:'flex', alignItems:'center', gap:16, justifyContent:'space-between'}}>
                  <div>
                    <h3>Yield Curve (inversion tracker)</h3>
                    <div style={{color:'var(--muted)'}}>Source: TBD (fetched later)</div>
                  </div>
                </div>

                <div style={{marginTop:12}}>
                    <div style={{display:'flex', gap:8, alignItems:'center', marginBottom:8}}>
                    <label style={{fontSize:12, color:'var(--muted)'}}>From</label>
                    <input type="date" value={yieldFrom||''} onChange={e=>setYieldFrom(e.target.value)} />
                    <label style={{fontSize:12, color:'var(--muted)'}}>To</label>
                    <input type="date" value={yieldTo||''} onChange={e=>setYieldTo(e.target.value)} />
                    <button onClick={async () => {
                      if (!yieldFrom || !yieldTo) return;
                      setLoading(true); setError(null);
                      try {
                        const d = await fetchYieldSpread(yieldFrom, yieldTo);
                        setYieldDaily(d);
                      } catch (e) { setError(e.message || String(e)); }
                      finally { setLoading(false); }
                    }} disabled={loading} style={{marginLeft:8}}>{loading? 'Loading...' : 'Update'}</button>
                  </div>
                  {error && <div style={{color:'var(--danger)', marginBottom:8}}>Error: {error}</div>}
                  {/* quick summary */}
                  <div style={{display:'flex', gap:12, marginBottom:10}}>
                    <div className="card" style={{padding:10}}>
                      <div style={{fontSize:12, color:'var(--muted)'}}>Latest 10y</div>
                      <div style={{fontWeight:700, color:'var(--neon-accent)'}}>{yieldDaily?.slice().reverse()[0]?.dgs10 ?? '—'}</div>
                    </div>
                    <div className="card" style={{padding:10}}>
                      <div style={{fontSize:12, color:'var(--muted)'}}>Latest 2y</div>
                      <div style={{fontWeight:700, color:'var(--neon-accent)'}}>{yieldDaily?.slice().reverse()[0]?.dgs2 ?? '—'}</div>
                    </div>
                    <div className="card" style={{padding:10}}>
                      <div style={{fontSize:12, color:'var(--muted)'}}>Latest Spread</div>
                      <div style={{fontWeight:700, color: (yieldDaily?.slice().reverse()[0]?.v ?? 0) < 0 ? '#ff6ec7' : 'var(--neon-accent)'}}>{yieldDaily?.slice().reverse()[0]?.v ?? '—'}</div>
                    </div>
                    <div className="card" style={{padding:10}}>
                      <div style={{fontSize:12, color:'var(--muted)'}}>Consecutive Inverted Days</div>
                      <div style={{fontWeight:700, color: consecutiveInverted > 0 ? '#ff6ec7' : 'var(--neon-accent)'}}>{consecutiveInverted}</div>
                    </div>
                  </div>

                  <div className="chart-wrap" ref={chartRef} style={chartHeight ? {height: chartHeight + 'px'} : undefined}>
                    <YieldChart data={yieldDaily} height={chartHeight} inversionStart={inversionStart} />
                    <div className="panel-vresizer" onMouseDown={startVResize} onTouchStart={startVResize} title="Drag to resize vertically" />
                  </div>
                </div>
              </div>

              <aside className={`panel small ${rightCollapsed ? 'collapsed' : ''}`}>
                <h3>Data</h3>
                <div style={{fontSize:12, color:'var(--muted)'}}>Rows: {yieldDaily?.length ?? 0}</div>
              </aside>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
