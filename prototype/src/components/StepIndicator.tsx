import styles from './StepIndicator.module.css';

interface StepIndicatorProps {
  steps: { id: number; title: string }[];
  activeStep: number;
  onStepClick: (id: number) => void;
}

export default function StepIndicator({ steps, activeStep, onStepClick }: StepIndicatorProps) {
  return (
    <div className={styles.wrapper}>
      {steps.map((step, i) => {
        const isActive = step.id === activeStep;
        const isCompleted = step.id < activeStep;

        let circleClass = styles.circle;
        if (isActive) circleClass = styles.circleActive;
        else if (isCompleted) circleClass = styles.circleCompleted;

        return (
          <div key={step.id} className={styles.step}>
            <div className={styles.stepContainer} onClick={() => onStepClick(step.id)}>
              <div className={circleClass}>{step.id}</div>
            </div>
            {i < steps.length - 1 && (
              <div className={isCompleted ? styles.lineCompleted : styles.line} />
            )}
          </div>
        );
      })}
    </div>
  );
}
