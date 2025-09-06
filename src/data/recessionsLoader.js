import localRecessions from './recessions';

export async function loadRecessions() {
  // 1) try local backend proxy first
  try {
    const proxy = '/api/fred/recessions';
    const pResp = await fetch(proxy);
    if (pResp.ok) {
      const pjson = await pResp.json();
      if (Array.isArray(pjson) && pjson.length) return pjson;
    }
  } catch (e) {
    // ignore and fallback
  }

  // 2) optional remote URL from env
  try {
    const url = import.meta.env.VITE_RECESSIONS_URL;
    if (url) {
      const resp = await fetch(url);
      if (resp.ok) {
        const json = await resp.json();
        if (Array.isArray(json) && json.length) return json;
      }
    }
  } catch (e) {
    console.warn('Recession loader: remote fetch failed, falling back to local list', e);
  }

  // 3) local fallback
  return localRecessions;
}
