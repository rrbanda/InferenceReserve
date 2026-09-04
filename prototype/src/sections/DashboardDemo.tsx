import { useState, useMemo } from 'react';
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import DashboardPanel from '../components/DashboardPanel';
import GaugeChart from '../components/GaugeChart';
import { generateTimeSeriesData, fleetData, reservationsData } from '../data/mockDashboard';
import styles from './DashboardDemo.module.css';

export default function DashboardDemo() {
  const [activeTab, setActiveTab] = useState<'consumer' | 'fleet'>('consumer');
  const data = useMemo(() => generateTimeSeriesData(24), []);

  const avgKvCache = data.reduce((sum, d) => sum + d.kvCacheHit, 0) / data.length;

  return (
    <section id="dashboard" className={styles.section}>
      <div className={styles.inner}>
        <div className={styles.tabs}>
          <button
            className={activeTab === 'consumer' ? styles.tabActive : styles.tab}
            onClick={() => setActiveTab('consumer')}
          >
            Consumer Dashboard
          </button>
          <button
            className={activeTab === 'fleet' ? styles.tabActive : styles.tab}
            onClick={() => setActiveTab('fleet')}
          >
            Fleet Dashboard
          </button>
        </div>

        {activeTab === 'consumer' && (
          <div className={styles.grid}>
            <DashboardPanel title="TPM — Committed vs Consumed">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E0E4E8" />
                  <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="tpmConsumed"
                    stroke="#00A3E0"
                    fill="rgba(0,163,224,0.15)"
                    name="Consumed"
                  />
                  <ReferenceLine
                    y={100000}
                    stroke="#003B70"
                    strokeDasharray="6 3"
                    label={{ value: 'Committed', position: 'insideTopRight', fontSize: 11 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </DashboardPanel>

            <DashboardPanel title="P95 TTFT (ms)">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E0E4E8" />
                  <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                  <YAxis domain={[200, 600]} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="ttftP95"
                    stroke="#003B70"
                    dot={false}
                    strokeWidth={2}
                    name="P95 TTFT"
                  />
                  <ReferenceLine
                    y={500}
                    stroke="#D0021B"
                    strokeDasharray="6 3"
                    label={{ value: 'SLA', position: 'insideTopRight', fontSize: 11 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </DashboardPanel>

            <DashboardPanel title="Spillover Events">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E0E4E8" />
                  <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="spillover" fill="#F5A623" name="Spillover" />
                </BarChart>
              </ResponsiveContainer>
            </DashboardPanel>

            <DashboardPanel title="KV Cache Hit Rate">
              <GaugeChart percentage={Math.round(avgKvCache)} label="Avg Cache Hit Rate" />
            </DashboardPanel>

            <DashboardPanel title="GPU Utilisation (%)">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E0E4E8" />
                  <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="gpuUtil"
                    stroke="#00875A"
                    dot={false}
                    strokeWidth={2}
                    name="GPU Util"
                  />
                </LineChart>
              </ResponsiveContainer>
            </DashboardPanel>

            <DashboardPanel title="Queue Depth">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E0E4E8" />
                  <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="queueDepth"
                    stroke="#003B70"
                    fill="rgba(0,59,112,0.1)"
                    name="Queue Depth"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </DashboardPanel>
          </div>
        )}

        {activeTab === 'fleet' && (
          <>
            <div className={styles.grid2col}>
              <DashboardPanel title="Fleet GPU Capacity">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={fleetData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E0E4E8" />
                    <XAxis dataKey="gpuType" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="committed" stackId="a" fill="#003B70" name="Committed" />
                    <Bar dataKey="available" stackId="a" fill="#00A3E0" name="Available" />
                  </BarChart>
                </ResponsiveContainer>
              </DashboardPanel>

              <DashboardPanel title="Aggregate GPU Utilisation">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E0E4E8" />
                    <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="gpuUtil"
                      stroke="#00875A"
                      dot={false}
                      strokeWidth={2}
                      name="GPU Util %"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </DashboardPanel>
            </div>

            <DashboardPanel title="Active Reservations" timeRange="Current">
              <div style={{ overflowX: 'auto' }}>
                <table className={styles.reservationsTable}>
                  <thead>
                    <tr>
                      <th>Tenant</th>
                      <th>Model</th>
                      <th>Committed TPM</th>
                      <th>Utilisation</th>
                      <th>SLA Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reservationsData.map((r) => (
                      <tr key={r.name}>
                        <td>{r.name}</td>
                        <td>{r.model}</td>
                        <td>{r.tpm.toLocaleString()}</td>
                        <td>{r.utilisation}%</td>
                        <td>
                          <span
                            className={
                              r.slaStatus === 'Meeting'
                                ? styles.slaPass
                                : r.slaStatus === 'At Risk'
                                  ? styles.slaRisk
                                  : styles.slaBreach
                            }
                          >
                            {r.slaStatus}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </DashboardPanel>

            <div className={styles.slaIndicators}>
              <div className={styles.slaCard}>
                <div className={styles.slaValue} style={{ color: 'var(--color-success-green)' }}>
                  4/5
                </div>
                <div className={styles.slaLabel}>Tenants Meeting SLA</div>
              </div>
              <div className={styles.slaCard}>
                <div className={styles.slaValue} style={{ color: 'var(--color-warning-amber)' }}>
                  1/5
                </div>
                <div className={styles.slaLabel}>Tenants At Risk</div>
              </div>
              <div className={styles.slaCard}>
                <div className={styles.slaValue} style={{ color: 'var(--color-success-green)' }}>
                  99.7%
                </div>
                <div className={styles.slaLabel}>Fleet Availability</div>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
