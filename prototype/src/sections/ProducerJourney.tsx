import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import SectionHeader from '../components/SectionHeader';
import CodeBlock from '../components/CodeBlock';
import { producerSteps } from '../data/producerSteps';
import { fleetData } from '../data/mockDashboard';
import styles from './ProducerJourney.module.css';

export default function ProducerJourney() {
  const [activeStep, setActiveStep] = useState(1);
  const [showCode, setShowCode] = useState(false);
  const step = producerSteps.find((s) => s.id === activeStep)!;

  const handleStepChange = (id: number) => {
    setActiveStep(id);
    setShowCode(false);
  };

  return (
    <section id="producer" className={styles.section}>
      <div className={styles.inner}>
        <SectionHeader
          title="Producer Journey"
          subtitle="Platform team workflow for managing PT capacity"
        />

        <div className={styles.stepper}>
          {producerSteps.map((s) => (
            <button
              key={s.id}
              className={`${styles.stepBtn} ${s.id === activeStep ? styles.stepActive : ''} ${s.id < activeStep ? styles.stepDone : ''}`}
              onClick={() => handleStepChange(s.id)}
            >
              <span className={styles.stepNum}>{s.id}</span>
              <span className={styles.stepLabel}>{s.title}</span>
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeStep}
            className={styles.content}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
          >
            <div className={styles.contentGrid}>
              <div className={styles.contentLeft}>
                <div className={styles.stepBadge}>Step {step.id} of 5</div>
                <h3 className={styles.contentTitle}>{step.title}</h3>
                <p className={styles.contentSubtitle}>{step.subtitle}</p>
                <p className={styles.contentDesc}>{step.description}</p>
                <button
                  className={`${styles.codeToggle} ${showCode ? styles.codeToggleActive : ''}`}
                  onClick={() => setShowCode(!showCode)}
                >
                  {showCode ? 'Hide' : 'View'} {step.codeLabel}
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="none" style={{ transform: showCode ? 'rotate(180deg)' : 'none', transition: '0.2s' }}>
                    <path d="M6 8L10 12L14 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>

              <AnimatePresence>
                {showCode && (
                  <motion.div
                    className={styles.contentRight}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ duration: 0.25 }}
                  >
                    <CodeBlock code={step.codeExample} language={step.codeLabel} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {activeStep === 2 && (
              <div className={styles.chartWrapper}>
                <div className={styles.chartTitle}>Fleet GPU Capacity — Committed vs Available</div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={fleetData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E0E4E8" />
                    <XAxis dataKey="gpuType" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="committed" stackId="a" fill="#003B70" name="Committed" />
                    <Bar dataKey="available" stackId="a" fill="#00A3E0" name="Available" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            <div className={styles.stepNav}>
              {activeStep > 1 && (
                <button className={styles.stepNavBtn} onClick={() => handleStepChange(activeStep - 1)}>
                  Previous
                </button>
              )}
              <div style={{ flex: 1 }} />
              {activeStep < 5 && (
                <button className={`${styles.stepNavBtn} ${styles.stepNavNext}`} onClick={() => handleStepChange(activeStep + 1)}>
                  Next Step
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                    <path d="M8 4L14 10L8 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}
