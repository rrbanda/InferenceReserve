import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import styles from './RequestFlow.module.css';

const nodes = [
  { id: 'client', label: 'Client' },
  { id: 'gateway', label: 'Gateway' },
  { id: 'auth', label: 'Auth' },
  { id: 'httproute', label: 'HTTPRoute' },
  { id: 'pool', label: 'Pool' },
  { id: 'epp', label: 'EPP' },
  { id: 'vllm', label: 'vLLM' },
  { id: 'gpu', label: 'GPU' },
];

export default function RequestFlow() {
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(true);

  const replay = useCallback(() => {
    setActiveIndex(-1);
    setIsPlaying(true);
  }, []);

  useEffect(() => {
    if (!isPlaying) return;

    const timer = setTimeout(
      () => {
        if (activeIndex < nodes.length - 1) {
          setActiveIndex((prev) => prev + 1);
        } else {
          setIsPlaying(false);
          setTimeout(replay, 2000);
        }
      },
      activeIndex === -1 ? 400 : 800
    );

    return () => clearTimeout(timer);
  }, [activeIndex, isPlaying, replay]);

  return (
    <div className={styles.wrapper}>
      <div className={styles.title}>Request Flow Animation</div>
      <div className={styles.flow}>
        {nodes.map((node, i) => (
          <div key={node.id} style={{ display: 'flex', alignItems: 'center' }}>
            <div className={styles.node}>
              <motion.div
                className={styles.nodeBubble}
                animate={{
                  borderColor: i <= activeIndex ? '#00A3E0' : '#E0E4E8',
                  backgroundColor: i === activeIndex ? '#00A3E0' : i < activeIndex ? 'rgba(0,163,224,0.08)' : '#FFFFFF',
                  color: i === activeIndex ? '#FFFFFF' : i < activeIndex ? '#003B70' : '#5A6A7A',
                }}
                transition={{ duration: 0.3 }}
              >
                {node.label}
              </motion.div>
            </div>
            {i < nodes.length - 1 && (
              <motion.div
                className={styles.arrow}
                animate={{
                  backgroundColor: i < activeIndex ? '#00A3E0' : '#E0E4E8',
                }}
                transition={{ duration: 0.3 }}
              />
            )}
          </div>
        ))}
      </div>
      <div className={styles.controls}>
        <button className={styles.replayBtn} onClick={replay}>
          ↻ Replay
        </button>
      </div>
    </div>
  );
}
