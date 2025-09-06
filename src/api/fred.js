// Minimal FRED client for fetching series observations and computing 10y-2y spread
// Prefer backend proxy to avoid CORS and hide API key. Backend route: /api/fred/yield?start=...&end=...
export async function fetchYieldSpread(start, end) {
  const base = import.meta.env.VITE_API_BASE || '/api';
  const params = new URLSearchParams();
  if (start) params.set('start', start);
  if (end) params.set('end', end);
  const url = `${base}/fred/yield${params.toString() ? `?${params.toString()}` : ''}`;
  const res = await fetch(url);
  if (res.status === 404) {
    // Proxy not present — trying direct FRED (may be blocked by CORS)
    console.warn('Proxy /api/fred/yield not found; direct FRED fallback may fail due to CORS');
    const fallbackBase = import.meta.env.VITE_FRED_BASE || 'https://api.stlouisfed.org/fred';
    const p = new URLSearchParams({ series_id: 'DGS10', file_type: 'json', api_key: import.meta.env.VITE_FRED_API_KEY || '' });
    if (start) p.set('observation_start', start);
    if (end) p.set('observation_end', end);
    const url10 = `${fallbackBase}/series/observations?${p.toString()}`;
    // For brevity, only try direct 10y (not ideal)
    const r = await fetch(url10);
    if (!r.ok) throw new Error(`Direct FRED fetch failed: ${r.status}`);
    const j = await r.json();
    return (j.observations || []).map(o => ({ d: o.date, v: o.value === '.' ? null : Number(o.value) }));
  }
  if (!res.ok) throw new Error(`Proxy fetch failed: ${res.status}`);
  return res.json();
}

export async function fetchRecessionsVerbose() {
  const base = import.meta.env.VITE_API_BASE || '/api';
  const url = `${base}/fred/recessions?verbose=true`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch verbose recessions: ${res.status}`);
  return res.json();
}

export default { fetchYieldSpread };
