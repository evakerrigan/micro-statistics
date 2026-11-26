import { NavLink, Outlet } from 'react-router-dom';
import { LanguageToggle } from '@/components/ui/language-toggle';
import { ScrollToTop } from '@/components/ui/scroll-to-top';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { useI18n } from '@/hooks/use-i18n';
import { formatDate } from '@/utils/format';
import styles from './app-layout.module.scss';

const TELEGRAM_URL = 'https://t.me/EvaKerrigan';

export const AppLayout = () => {
  const { t } = useI18n();

  const navItems = [
    { to: '/adobe', label: t('stock.adobe') },
    { to: '/shutterstock', label: t('stock.shutterstock') },
    { to: '/istock', label: t('stock.istock') },
    { to: '/all', label: t('nav.all') },
  ];

  return (
    <div className={styles.appLayout}>
      <header className={styles.appLayout__header}>
        <div className={styles.appLayout__headerInner}>
          <h1 className={styles.appLayout__title}>{t('app.title')}</h1>
          <div className={styles.appLayout__controls}>
            <LanguageToggle />
            <ThemeToggle />
          </div>
        </div>
        <nav className={styles.appLayout__nav} aria-label={t('nav.label')}>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `${styles.appLayout__navLink} ${isActive ? styles.appLayout__navLinkActive : ''}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className={styles.appLayout__content}>
        <Outlet />
      </main>
      <footer className={styles.appLayout__footer}>
        <div className={styles.appLayout__footerInner}>
          <div>
            {t('footer.author')}{' '}
            <a href={TELEGRAM_URL} target="_blank" rel="noreferrer">
              Telegram @EvaKerrigan
            </a>
            <div className={styles.appLayout__disclaimer}>
              {t('footer.disclaimer')}
            </div>
          </div>
          <div className={styles.appLayout__version}>
            {t('footer.version', {
              version: __APP_VERSION__,
              date: formatDate(__BUILD_DATE__),
            })}
          </div>
        </div>
      </footer>
      <ScrollToTop />
    </div>
  );
};
