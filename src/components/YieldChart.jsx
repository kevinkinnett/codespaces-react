import React, { useMemo, useEffect, useState, useRef } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ReferenceArea,
} from 'recharts';
import { loadRecessions } from '../data/recessionsLoader';

// helper to test if a date is inside any recession range
function inRecession(d, ranges) {
  if (!ranges || !ranges.length) return false;
  for (let r of ranges) {
    if (d >= r.start && d <= r.end) return true;
  }
  return false;
}

// Expect data: [{ d: 'YYYY-MM-DD', dgs10: number|null, dgs2: number|null, v: spread|null }]
export default function YieldChart({ data = [], height = 360, inversionStart = null }) {
  const [recs, setRecs] = useState([]);
  const containerRef = useRef(null);
  useEffect(() => {
    let mounted = true;
    (async () => {
      const r = await loadRecessions();
      if (mounted) setRecs(r || []);
    })();
    return () => { mounted = false; };
  }, []);
  const chartData = useMemo(() => data.map(d => ({ x: d.d, dgs10: d.dgs10, dgs2: d.dgs2, spread: d.v })), [data]);
  // compute visible recession ranges mapped to chartData indices to ensure alignment
  const visibleRecs = useMemo(() => {
    if (!recs || !recs.length || !chartData || !chartData.length) return [];
    const firstX = chartData[0].x;
    const lastX = chartData[chartData.length - 1].x;
    const lastIdx = chartData.length - 1;
    function toYMD(d) { const yr = d.getFullYear(); const m = d.getMonth()+1; return `${yr}-${String(m).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
    function quarterBoundsFromISO(iso) {
      const dt = new Date(iso);
      const y = dt.getFullYear(); const m = dt.getMonth(); const qStartMonth = Math.floor(m/3)*3;
      const start = new Date(y, qStartMonth, 1);
      const end = new Date(y, qStartMonth+3, 0);
      return { start: toYMD(start), end: toYMD(end) };
    }

    const out = [];
    for (const r of recs) {
      const nb = quarterBoundsFromISO(r.start);
      const rstart = nb.start;
      const rend = r.end || nb.end;
      // skip if completely outside current chart range
      if (rstart > lastX || rend < firstX) continue;
      // find nearest start index (first >= rstart) but clamp to 0..lastIdx
      let sIdx = chartData.findIndex(d => d.x >= rstart);
      if (sIdx === -1) sIdx = 0; // if rstart before first chart date
      // find nearest end index (last <= rend)
      let eIdx = -1;
      for (let k = chartData.length - 1; k >= 0; k--) {
        if (chartData[k].x <= rend) { eIdx = k; break; }
      }
      if (eIdx === -1) eIdx = lastIdx; // if rend after last chart date
      if (sIdx > eIdx) continue;
      out.push({ startIdx: sIdx, endIdx: eIdx, startX: chartData[sIdx].x, endX: chartData[eIdx].x, label: `${r.start.slice(0,4)}–${r.end.slice(0,4)}` });
    }
    return out;
  }, [recs, chartData]);

  return (
  <div className="sunspot-chart" ref={containerRef} style={{ width: '100%', height: height, position: 'relative' }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          {/* render recession bands */}
          {visibleRecs.map((r, idx) => (
            <ReferenceArea key={idx} x1={r.startX} x2={r.endX} stroke="rgba(255,80,80,0.6)" strokeWidth={0.6} fill="rgba(255,80,80,0.18)" />
          ))}
          {/* inversion start marker */}
          {inversionStart && <ReferenceLine x={inversionStart} stroke="#ff6ec7" strokeWidth={1} strokeDasharray="4 4" />}
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="x" minTickGap={30} tick={{ fill: '#e6eef8' }} />
          <YAxis tick={{ fill: '#e6eef8' }} />
          <Tooltip
            wrapperStyle={{ background: '#0b1220', border: '1px solid rgba(255,255,255,0.06)' }}
            contentStyle={{ color: '#e8f1ff' }}
            formatter={(val, name) => [val, name]}
            labelFormatter={(label) => {
              const recession = inRecession(label, recs);
              return `${label}${recession ? ' • Recession' : ''}`;
            }}
          />
          <Legend />
          <ReferenceLine y={0} stroke="rgba(255,255,255,0.3)" strokeDasharray="3 3" />
          <Line name="10y (long)" type="monotone" dataKey="dgs10" stroke="#FF6B6B" dot={false} strokeWidth={2} />
          <Line name="2y (short)" type="monotone" dataKey="dgs2" stroke="#4D96FF" dot={false} strokeWidth={2} />
          <Line name="Spread (10y-2y)" type="monotone" dataKey="spread" stroke="#FFD166" dot={false} strokeDasharray="6 4" strokeWidth={1.5} />
        </LineChart>
      </ResponsiveContainer>
      {/* Render small labels for each recession band positioned by chart data index */}
      {chartData && chartData.length > 0 && visibleRecs && visibleRecs.length > 0 && visibleRecs.map((r, i) => {
        const lastIdx = chartData.length - 1;
        const midIdx = Math.round((r.startIdx + r.endIdx) / 2);
        const leftPercent = (midIdx / Math.max(1, lastIdx)) * 100;
        return (
          <div key={`rec-label-${i}`} style={{ position: 'absolute', left: `${leftPercent}%`, top: 6, transform: 'translateX(-50%)', pointerEvents: 'none' }}>
            <div style={{ background: 'rgba(255,80,80,0.92)', color: '#081020', fontSize: 11, padding: '3px 6px', borderRadius: 4, fontWeight:700, whiteSpace:'nowrap' }}>{r.label}</div>
          </div>
        );
      })}
    </div>
  );
}
