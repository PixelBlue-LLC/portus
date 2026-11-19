import { useEffect, useState } from 'react';
import { APP_NAME } from './brand';
import { useDerived } from './derived';
import { Ask } from './pages/Ask';
import { Holdings, HoldingsEditor } from './pages/Holdings';
import { Market } from './pages/Market';
import { Calendar } from './pages/Calendar';
import { Options } from './pages/Options';
import { Plans } from './pages/Plans';
import { Risk } from './pages/Risk';
import { Settings } from './pages/Settings';
import { Today } from './pages/Today';
import { resolveLang, setLang, t, type MsgKey } from './i18n';
import { exitSample, getState, useAppState } from './store';
import { TopBar } from './TopBar';
import { autoRefresh } from './actions';
import { shouldAutoRefresh } from 'portus-core';

const TABS: ReadonlyArray<{ path: string; label: MsgKey }> = [
  { path: '/', label: 'nav.today' },
  { path: '/holdings', label: 'nav.holdings' },
  { path: '/risk', label: 'nav.risk' },
  { path: '/market', label: 'nav.market' },
  { path: '/calendar', label: 'nav.calendar' },
  { path: '/plans', label: 'nav.plans' },
  { path: '/options', label: 'nav.options' },
  { path: '/ask', label: 'nav.ask' },
];

/** 上次尝试自动刷新的时间：出错（比如 key 失效）时也不会每 30 秒重试一次 */
let lastAttempt = 0;

/** 盘中按设置的间隔自动刷新；页面在后台时不刷，回到前台时检查一次 */
function useAutoRefresh() {
  useEffect(() => {
    const tick = () => {
      const st = getState();
      const every = st.settings.autoRefreshMin;
      if (!st.settings.finnhubKey || st.loading || every <= 0 || document.visibilityState !== 'visible') return;
      if (Date.now() - lastAttempt < Math.max(1, every) * 60000 * 0.9) return;
      const last = st.market.fetchedAt ? new Date(st.market.fetchedAt) : null;
      if (!shouldAutoRefresh(new Date(), last, every)) return;
      lastAttempt = Date.now();
      void autoRefresh();
    };
    tick();
    const id = setInterval(tick, 30000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);
}

function useRoute(): string {
  const read = () => location.hash.replace(/^#/, '') || '/';
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => {
      setRoute(read());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export function App() {
  const s = useAppState();
  const lang = resolveLang(s.settings.lang);
  setLang(lang);
  const d = useDerived(s);
  const route = useRoute();
  useAutoRefresh();

  useEffect(() => {
    const root = document.documentElement;
    if (s.settings.theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', s.settings.theme);
    root.setAttribute('data-colors', s.settings.colorConvention);
  }, [s.settings.theme, s.settings.colorConvention]);

  const active = (p: string) => (p === '/' ? route === '/' : route.startsWith(p));

  let page;
  if (route === '/holdings/edit') page = <HoldingsEditor s={s} />;
  else if (route.startsWith('/holdings')) page = <Holdings s={s} d={d} />;
  else if (route.startsWith('/market')) page = <Market s={s} d={d} />;
  else if (route.startsWith('/risk')) page = <Risk s={s} d={d} />;
  else if (route.startsWith('/calendar')) page = <Calendar s={s} />;
  else if (route.startsWith('/plans')) page = <Plans s={s} d={d} />;
  else if (route.startsWith('/options')) page = <Options s={s} d={d} />;
  else if (route.startsWith('/ask')) page = <Ask s={s} d={d} />;
  else if (route.startsWith('/settings')) page = <Settings s={s} />;
  else page = <Today s={s} d={d} />;

  return (
    <div className="shell">
      <a className="skip" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>
        {t('a11y.skip')}
      </a>
      <nav className="side" aria-label={t('nav.main')}>
        <span className="brand">{APP_NAME}</span>
        {TABS.map((tab) => (
          <a key={tab.path} href={`#${tab.path}`} className={`navlink ${active(tab.path) ? 'active' : ''}`} aria-current={active(tab.path) ? 'page' : undefined}>
            {t(tab.label)}
          </a>
        ))}
        <a href="#/settings" className={`navlink ${active('/settings') ? 'active' : ''}`}>
          {t('nav.settings')}
        </a>
        <span className="foot">{t('foot.local')}</span>
      </nav>
      <main className="main" id="main" tabIndex={-1}>
        <TopBar s={s} />
        {s.isSample && route !== '/holdings/edit' ? (
          <div className="sample-bar" role="status">
            <span>{t('sample.viewing')}</span>
            <span className="row" style={{ flexWrap: 'nowrap' }}>
              <button
                className="btn small primary"
                onClick={() => {
                  exitSample();
                  location.hash = '#/holdings/edit';
                }}
              >
                {t('sample.enter')}
              </button>
              <button
                className="btn small"
                onClick={() => {
                  exitSample();
                  location.hash = '#/';
                }}
              >
                {t('sample.exit')}
              </button>
            </span>
          </div>
        ) : null}
        {page}
      </main>
      <nav className="tabbar" aria-label={t('nav.main')}>
        {TABS.map((tab) => (
          <a key={tab.path} href={`#${tab.path}`} className={active(tab.path) ? 'active' : ''} aria-current={active(tab.path) ? 'page' : undefined}>
            {t(tab.label)}
          </a>
        ))}
      </nav>
    </div>
  );
}
