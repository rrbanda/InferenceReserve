import { components } from '../data/components';
import styles from './ComponentTable.module.css';

export default function ComponentTable() {
  return (
    <div className={styles.wrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Component</th>
            <th>Upstream Project</th>
            <th>PT Role</th>
          </tr>
        </thead>
        <tbody>
          {components.map((comp) => (
            <tr key={comp.name} className={comp.isCustom ? styles.customRow : styles.row}>
              <td className={styles.nameCell}>{comp.name}</td>
              <td className={styles.cell}>{comp.isCustom ? 'Custom build' : comp.upstream}</td>
              <td className={styles.cell}>{comp.role}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
