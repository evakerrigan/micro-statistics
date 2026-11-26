import { useI18n } from '@/hooks/use-i18n';
import styles from './dashboard.module.scss';

export const AdobeRoute = () => {
  const { t } = useI18n();
  return (
    <div className={styles.dashboard}>
      <h2 className={styles.dashboard__heading}>{t('stock.adobe')}</h2>
      <div className={styles.dashboard__empty}>
        <p>{t('adobe.comingSoon')}</p>
      </div>
    </div>
  );
};
