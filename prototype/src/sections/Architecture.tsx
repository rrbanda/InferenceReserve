import { useState } from 'react';
import SubTabs from '../components/SubTabs';
import ArchDiagram from '../components/ArchDiagram';
import RequestFlow from '../components/RequestFlow';
import ComponentTable from '../components/ComponentTable';
import styles from './Architecture.module.css';

const tabs = ['Diagram', 'Request Flow', 'Component Map', 'Build Gap'];

export default function Architecture() {
  const [activeTab, setActiveTab] = useState('Diagram');

  return (
    <section id="architecture" className={styles.section}>
      <div className={styles.inner}>
        <SubTabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

        <div className={styles.content}>
          {activeTab === 'Diagram' && (
            <ArchDiagram />
          )}

          {activeTab === 'Request Flow' && (
            <RequestFlow />
          )}

          {activeTab === 'Component Map' && (
            <ComponentTable />
          )}

          {activeTab === 'Build Gap' && (
            <div className={styles.buildGap}>
              <p className={styles.buildDesc}>
                The upstream open-source stack provides serving, routing, isolation, and observability.
                The custom build is the product layer: lifecycle management, auth, sizing, chargeback metering, and dashboards.
              </p>
              <div className={styles.buildBar}>
                <div className={styles.upstream}>
                  <span className={styles.barPercent}>70%</span>
                  <span className={styles.barLabel}>Upstream</span>
                </div>
                <div className={styles.custom}>
                  <span className={styles.barPercent}>30%</span>
                  <span className={styles.barLabel}>Custom</span>
                </div>
              </div>
              <div className={styles.buildColumns}>
                <div className={styles.buildCol}>
                  <div className={styles.buildColTitle}>Upstream (use directly)</div>
                  <ul className={styles.buildList}>
                    <li>KServe LLMInferenceService</li>
                    <li>vLLM serving engine</li>
                    <li>llm-d Endpoint Picker</li>
                    <li>Gateway API InferencePool</li>
                    <li>Envoy AI Gateway</li>
                    <li>DCGM + Prometheus</li>
                    <li>Kueue (batch)</li>
                    <li>NVIDIA MIG (Phase 3)</li>
                  </ul>
                </div>
                <div className={styles.buildCol}>
                  <div className={styles.buildColTitleAccent}>Custom build</div>
                  <ul className={styles.buildList}>
                    <li>Reservation Manager + CRD</li>
                    <li>PT Auth Service</li>
                    <li>Sizing Calculator</li>
                    <li>PT Catalog</li>
                    <li>Chargeback Pipeline (Phase 2)</li>
                    <li>Consumer Dashboard</li>
                    <li>Fleet Dashboard</li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
