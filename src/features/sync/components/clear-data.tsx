import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { useI18n } from '@/hooks/use-i18n';
import { clearAllData, clearStockData } from '@/lib/storage';
import type { StockId } from '@/types/stock';
import styles from './clear-data.module.scss';

type ClearDataProps = {
  /** When set, clears only that stock's stored data; otherwise wipes everything. */
  stock?: StockId;
  onCleared?: () => void;
};

/**
 * Wipes stored extension data for one stock or for the whole extension.
 */
export const ClearData = ({ stock, onCleared }: ClearDataProps) => {
  const { t } = useI18n();
  const [confirming, setConfirming] = useState(false);

  const handleDelete = async () => {
    if (stock) {
      await clearStockData(stock);
      setConfirming(false);
      if (onCleared) onCleared();
      else window.location.reload();
      return;
    }
    await clearAllData();
    window.location.reload();
  };

  return (
    <div className={styles.clearData}>
      <button
        type="button"
        className={styles.clearData__button}
        onClick={() => setConfirming(true)}
      >
        {stock ? t('data.deleteStock') : t('data.deleteAll')}
      </button>
      <Modal
        isOpen={confirming}
        onClose={() => setConfirming(false)}
        title={stock ? t('data.deleteStockTitle') : t('data.deleteTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleDelete}>
              {stock ? t('details.delete') : t('data.delete')}
            </Button>
          </>
        }
      >
        {stock ? t('data.deleteStockBody') : t('data.deleteBody')}
      </Modal>
    </div>
  );
};
