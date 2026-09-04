import { useState, useMemo } from 'react';
import { sizingProfiles, calculateSizing } from '../data/sizingProfiles';
import styles from './SizingCalculator.module.css';

export default function SizingCalculator() {
  const [modelIndex, setModelIndex] = useState(0);
  const [rpm, setRpm] = useState(500);
  const [avgInputTokens, setAvgInputTokens] = useState(1200);
  const [avgOutputTokens, setAvgOutputTokens] = useState(400);

  const profile = sizingProfiles[modelIndex];

  const result = useMemo(
    () => calculateSizing(profile, rpm, avgInputTokens, avgOutputTokens),
    [profile, rpm, avgInputTokens, avgOutputTokens]
  );

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

  const formatNumber = (n: number) =>
    new Intl.NumberFormat('en-US').format(n);

  return (
    <div className={styles.wrapper}>
      <div className={styles.form}>
        <div className={styles.fieldGroup}>
          <label className={styles.label}>Model</label>
          <select
            className={styles.select}
            value={modelIndex}
            onChange={(e) => setModelIndex(Number(e.target.value))}
          >
            {sizingProfiles.map((p, i) => (
              <option key={p.model} value={i}>
                {p.displayName} ({p.gpuType})
              </option>
            ))}
          </select>
        </div>

        <div className={styles.fieldGroup}>
          <label className={styles.label}>Requests per Minute (RPM)</label>
          <div className={styles.sliderRow}>
            <input
              type="range"
              className={styles.slider}
              min={10}
              max={2000}
              step={10}
              value={rpm}
              onChange={(e) => setRpm(Number(e.target.value))}
            />
            <span className={styles.sliderValue}>{rpm}</span>
          </div>
        </div>

        <div className={styles.fieldGroup}>
          <label className={styles.label}>Avg Input Tokens</label>
          <div className={styles.sliderRow}>
            <input
              type="range"
              className={styles.slider}
              min={100}
              max={8000}
              step={100}
              value={avgInputTokens}
              onChange={(e) => setAvgInputTokens(Number(e.target.value))}
            />
            <span className={styles.sliderValue}>{formatNumber(avgInputTokens)}</span>
          </div>
        </div>

        <div className={styles.fieldGroup}>
          <label className={styles.label}>Avg Output Tokens</label>
          <div className={styles.sliderRow}>
            <input
              type="range"
              className={styles.slider}
              min={50}
              max={4000}
              step={50}
              value={avgOutputTokens}
              onChange={(e) => setAvgOutputTokens(Number(e.target.value))}
            />
            <span className={styles.sliderValue}>{formatNumber(avgOutputTokens)}</span>
          </div>
        </div>
      </div>

      <div className={styles.results}>
        <div className={styles.resultsTitle}>Sizing Estimate</div>

        <div className={styles.resultRow}>
          <span className={styles.resultLabel}>Recommended Tier</span>
          <span className={styles.tierBadge}>{result.tier}</span>
        </div>

        <div className={styles.resultRow}>
          <span className={styles.resultLabel}>GPU Count</span>
          <span className={styles.resultValue}>
            {result.gpus}× {profile.gpuType}
          </span>
        </div>

        <div className={styles.resultRow}>
          <span className={styles.resultLabel}>Replicas</span>
          <span className={styles.resultValue}>{result.replicas}</span>
        </div>

        <div className={styles.resultRow}>
          <span className={styles.resultLabel}>Committed TPM</span>
          <span className={styles.resultValue}>{formatNumber(result.committedTPM)}</span>
        </div>

        <div className={styles.resultRow}>
          <span className={styles.resultLabel}>Est. Monthly Chargeback</span>
          <span className={styles.costValue}>{formatCurrency(result.monthlyCost)}</span>
        </div>
      </div>
    </div>
  );
}
