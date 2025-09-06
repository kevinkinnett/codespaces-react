// Simple API client for sunspot endpoints
export async function fetchDaily(from, to) {
  const base = import.meta.env.VITE_API_BASE || '/api';
  // debug: show what base the built client is using at runtime
  try { console.debug && console.debug('sunspots client base:', base); } catch (e) {}
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const url = `${base}/sunspots/daily${params.toString() ? `?${params.toString()}` : ''}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch daily: ${res.status}`);
  return res.json();
}

export async function fetchLatest() {
  const base = import.meta.env.VITE_API_BASE || '/api';
  const res = await fetch(`${base}/sunspots/latest`);
  if (!res.ok) throw new Error(`Failed to fetch latest: ${res.status}`);
  return res.json();
}
