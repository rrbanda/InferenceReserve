import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Header, { sections } from './components/Header';
import NavArrow from './components/NavArrow';
import ProductOverview from './sections/ProductOverview';
import ConsumerJourney from './sections/ConsumerJourney';
import ProducerJourney from './sections/ProducerJourney';
import Architecture from './sections/Architecture';
import DashboardDemo from './sections/DashboardDemo';
import SectionHeader from './components/SectionHeader';
import SizingCalculator from './components/SizingCalculator';
import styles from './App.module.css';

const sectionComponents: Record<string, React.ReactNode> = {
  overview: <ProductOverview />,
  consumer: <ConsumerJourney />,
  producer: <ProducerJourney />,
  architecture: <Architecture />,
  dashboard: <DashboardDemo />,
  calculator: (
    <section className={styles.calculatorSection}>
      <div className={styles.calculatorInner}>
        <SectionHeader
          title="Sizing Calculator"
          subtitle="Estimate your PT reservation requirements"
          description="Select a model, set your expected RPM and token sizes, and get an instant estimate of the recommended tier, GPU count, and monthly cost."
        />
        <SizingCalculator />
      </div>
    </section>
  ),
};

export default function App() {
  const [activeSection, setActiveSection] = useState('overview');

  const currentIndex = sections.findIndex(s => s.id === activeSection);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < sections.length - 1;
  const prevSection = hasPrev ? sections[currentIndex - 1] : null;
  const nextSection = hasNext ? sections[currentIndex + 1] : null;

  const handleNavigate = (id: string) => {
    setActiveSection(id);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  return (
    <div className={styles.app}>
      <Header activeSection={activeSection} onNavigate={handleNavigate} />
      <main className={styles.main}>
        <AnimatePresence mode="wait">
          <motion.div
            key={activeSection}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            {sectionComponents[activeSection]}
          </motion.div>
        </AnimatePresence>
      </main>
      <NavArrow
        onPrev={() => prevSection && handleNavigate(prevSection.id)}
        onNext={() => nextSection && handleNavigate(nextSection.id)}
        hasPrev={hasPrev}
        hasNext={hasNext}
        prevLabel={prevSection?.shortLabel || prevSection?.label}
        nextLabel={nextSection?.shortLabel || nextSection?.label}
      />
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <span className={styles.footerLogo}>InferenceReserve</span>
          <span className={styles.footerText}>Provisioned Throughput for On-Prem GPU Infrastructure</span>
        </div>
      </footer>
    </div>
  );
}
