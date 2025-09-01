import React, { useRef, useEffect } from 'react';
import * as d3 from 'd3';

export default function MiniLineChart({ data = [] }) {
  const ref = useRef();

  useEffect(() => {
    if (!data || data.length === 0) return;
    const width = 200;
    const height = 60;
    const svg = d3.select(ref.current);
    svg.selectAll('*').remove();

    const x = d3.scaleLinear().domain([0, data.length - 1]).range([0, width]);
    const y = d3.scaleLinear().domain([0, d3.max(data)]).range([height, 0]);

    const line = d3.line()
      .x((d, i) => x(i))
      .y((d) => y(d))
      .curve(d3.curveMonotoneX);

    svg.attr('viewBox', `0 0 ${width} ${height}`)
      .attr('preserveAspectRatio', 'xMidYMid meet');

    svg.append('path')
      .datum(data)
      .attr('d', line)
      .attr('fill', 'none')
      .attr('stroke', 'var(--neon-accent)')
      .attr('stroke-width', 2)
      .attr('stroke-linejoin', 'round')
      .attr('stroke-linecap', 'round');

  }, [data]);

  return (
    <svg ref={ref} className="mini-chart" />
  );
}
