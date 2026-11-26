import { useI18n } from '@/hooks/use-i18n';
import styles from './dashboard.module.scss';

export const IstockRoute = () => {
  const { t } = useI18n();
  return (
    <div className={styles.dashboard}>
      <h2 className={styles.dashboard__heading}>{t('stock.istock')}</h2>
      <div className={styles.dashboard__empty}>
        <p>{t('istock.comingSoon')}</p>
      </div>
    </div>
  );
};
