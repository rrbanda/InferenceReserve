import { useState } from 'react';
import Hero from '../components/Hero';
import OpportunityMap from '../components/OpportunityMap';
import ComparisonTable from '../components/ComparisonTable';
import FeatureGrid from '../components/FeatureGrid';
import ScopeOptions from '../components/ScopeOptions';
import SubTabs from '../components/SubTabs';
import styles from './ProductOverview.module.css';

const tabs = ['Opportunities', 'Features', 'Comparison', 'Scope Options'];

export default function ProductOverview() {
  const [activeTab, setActiveTab] = useState('Opportunities');

  return (
    <section id="overview" className={styles.section}>
      <Hero />
      <div className={styles.body}>
        <SubTabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
        {activeTab === 'Opportunities' && <OpportunityMap />}
        {activeTab === 'Features' && <FeatureGrid />}
        {activeTab === 'Comparison' && <ComparisonTable />}
        {activeTab === 'Scope Options' && <ScopeOptions />}
      </div>
    </section>
  );
}
