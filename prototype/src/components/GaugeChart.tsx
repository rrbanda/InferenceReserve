import styles from './GaugeChart.module.css';

interface GaugeChartProps {
  percentage: number;
  label: string;
  size?: number;
}

export default function GaugeChart({ percentage, label, size = 140 }: GaugeChartProps) {
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const startAngle = 135;
  const sweepAngle = 270;
  const filledAngle = (percentage / 100) * sweepAngle;

  const describeArc = (startDeg: number, endDeg: number) => {
    const startRad = ((startDeg - 90) * Math.PI) / 180;
    const endRad = ((endDeg - 90) * Math.PI) / 180;
    const cx = size / 2;
    const cy = size / 2;
    const x1 = cx + radius * Math.cos(startRad);
    const y1 = cy + radius * Math.sin(startRad);
    const x2 = cx + radius * Math.cos(endRad);
    const y2 = cy + radius * Math.sin(endRad);
    const largeArc = endDeg - startDeg > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`;
  };

  const bgPath = describeArc(startAngle, startAngle + sweepAngle);
  const fillPath = describeArc(startAngle, startAngle + filledAngle);

  const color =
    percentage >= 80
      ? 'var(--color-success-green)'
      : percentage >= 50
        ? 'var(--color-accent-blue)'
        : 'var(--color-warning-amber)';

  return (
    <div className={styles.wrapper}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <path
          d={bgPath}
          fill="none"
          stroke="#E0E4E8"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {percentage > 0 && (
          <path
            d={fillPath}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
        )}
        <text
          x={size / 2}
          y={size / 2 + 8}
          textAnchor="middle"
          fontSize="28"
          fontWeight="700"
          fill="var(--color-deep-navy)"
          fontFamily="var(--font-family)"
        >
          {Math.round(percentage)}%
        </text>
      </svg>
      <div className={styles.label}>{label}</div>
    </div>
  );
}
