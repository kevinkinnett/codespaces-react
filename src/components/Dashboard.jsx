import React from 'react';
import './dashboard.css';
import MiniLineChart from './MiniLineChart';

export default function Dashboard() {
  const sample = [12, 19, 8, 14, 20, 18, 24];
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
            <div className="panel-grid">
              <div className="card">
                <h3>Active Alerts</h3>
                <p className="big">3</p>
              </div>
              <div className="card">
                <h3>CPU</h3>
                <MiniLineChart data={sample} />
              </div>
              <div className="card">
                <h3>Memory</h3>
                <MiniLineChart data={[8,10,12,9,13,11,15]} />
              </div>
              <div className="card">
                <h3>Network</h3>
                <MiniLineChart data={[2,4,1,5,3,6,4]} />
              </div>
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
