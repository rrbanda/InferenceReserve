import styles from './CodeBlock.module.css';

interface CodeBlockProps {
  code: string;
  language?: string;
}

export default function CodeBlock({ code, language }: CodeBlockProps) {
  return (
    <div className={styles.wrapper}>
      {language && (
        <div className={styles.header}>
          <span className={styles.lang}>{language}</span>
        </div>
      )}
      <pre className={styles.code}>{code}</pre>
    </div>
  );
}
