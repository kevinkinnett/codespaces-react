import React, { useMemo } from 'react';
import {
  LineChart,
  Line,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';

function rollingMean(data, window = 30) {
  const res = [];
  for (let i = 0; i < data.length; i++) {
    const start = Math.max(0, i - window + 1);
    const slice = data.slice(start, i + 1).map(d => d.r);
    const mean = slice.reduce((s, v) => s + v, 0) / slice.length;
    res.push(mean);
  }
  return res;
}

export default function SunspotChart({ data = [], height = 360 }) {
  const chartData = useMemo(() => {
    const daily = data.map(d => ({ x: d.d, r: d.r }));
    const mean = rollingMean(daily, 30);
    return daily.map((d, i) => ({ ...d, mean: Math.round(mean[i] * 100) / 100 }));
  }, [data]);

  return (
    <div className="sunspot-chart" style={{ width: '100%', height: height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="x" minTickGap={30} />
          <YAxis />
          <Tooltip />
          <Area type="monotone" dataKey="mean" stroke="none" fill="rgba(122,252,255,0.06)" />
          <Line type="monotone" dataKey="r" stroke="#7afcff" dot={false} strokeWidth={2} />
          <Line type="monotone" dataKey="mean" stroke="#ff6ec7" dot={false} strokeDasharray="4 2" />
        </LineChart>
    </ResponsiveContainer>
    </div>
  );
}
