import { useEffect, useRef, useState } from 'react';
import { usMarketSession } from 'portus-core';
import { refreshMarket } from './actions';
import { getLang, t, type MsgKey } from './i18n';
import { updateSettings, type AppState } from './store';
import { allZones, browserZone, clockIn, COMMON_ZONES, zoneLabel, zoneShort } from './timezones';

const INTERVALS = [0, 1, 2, 5, 15, 30];

/** 每 30 秒重绘一次，让「盘中 / 休市」和跨天的日期跟着变 */
function useNow(ms = 30000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

function ZoneSelect({ value, onChange, allowNone, autoLabel }: { value: string; onChange: (v: string) => void; allowNone?: boolean; autoLabel?: string }) {
  const lang = getLang();
  const common = new Set(COMMON_ZONES.map((z) => z[0]));
  const rest = allZones().filter((z) => !common.has(z));
  // 用户之前选的时区不在列表里（浏览器版本不同）时也要能显示出来
  const known = value === '' || common.has(value) || rest.includes(value);
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      {allowNone ? <option value="">{t('top.tzNone')}</option> : null}
      {autoLabel ? <option value="">{autoLabel}</option> : null}
      {!known ? <option value={value}>{zoneLabel(value, lang)}</option> : null}
      <optgroup label={t('top.tzCommon')}>
        {COMMON_ZONES.map(([tz]) => (
          <option key={tz} value={tz}>
            {zoneLabel(tz, lang)}
          </option>
        ))}
      </optgroup>
      <optgroup label={t('top.tzAll')}>
        {rest.map((tz) => (
          <option key={tz} value={tz}>
            {tz.replace(/_/g, ' ')}
          </option>
        ))}
      </optgroup>
    </select>
  );
}

/** 顶栏右上角：交易时段、行情更新时间（主 / 副时区）、刷新、语言 */
export function TopBar({ s }: { s: AppState }) {
  const lang = getLang();
  const now = useNow();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const st = s.settings;
  const session = usMarketSession(now);
  const primary = st.tzPrimary || browserZone();
  const secondary = st.tzSecondary && st.tzSecondary !== primary ? st.tzSecondary : '';
  const fetched = s.market.fetchedAt ? new Date(s.market.fetchedAt) : null;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  // 宽屏写城市名，窄屏写时区缩写（PST、GMT+8）省地方
  const zone = (tz: string) => (
    <>
      <span className="zl">{zoneLabel(tz, lang)}</span>
      <span className="zs">{zoneShort(tz, now)}</span>
    </>
  );
  const times = (at: Date) => (
    <>
      <b>{clockIn(at, primary, lang, now)}</b> {zone(primary)}
      {secondary ? (
        <>
          <span className="sep"> · </span>
          <b>{clockIn(at, secondary, lang, now)}</b> {zone(secondary)}
        </>
      ) : null}
    </>
  );

  return (
    <div className="topbar" ref={panelRef}>
      <span className={`mkt-state ${session.state}`} title={t(`top.state.${session.state}` as MsgKey)}>
        <i aria-hidden="true" />
        <span className="wide">{t(`top.state.${session.state}` as MsgKey)}</span>
      </span>
      <button className="topbar-time" aria-expanded={open} title={t('top.timeAria')} onClick={() => setOpen((o) => !o)}>
        {!st.finnhubKey ? (
          t('top.noKey')
        ) : fetched ? (
          <>
            <span className="wide">{t('top.updated')} </span>
            {times(fetched)}
          </>
        ) : (
          t('top.never')
        )}
        <span aria-hidden="true" className="caret">▾</span>
      </button>
      {st.finnhubKey ? (
        <button className="btn small" onClick={() => void refreshMarket()} disabled={s.loading} aria-label={t('common.refresh')}>
          <span className="wide">{s.loading ? t('common.refreshing') : t('common.refresh')}</span>
          <span className="narrow" aria-hidden="true">{s.loading ? '…' : '↻'}</span>
        </button>
      ) : (
        <a className="btn small" href="#/settings">
          {t('common.connectData')}
        </a>
      )}
      <button className="btn small" lang={lang === 'zh' ? 'en' : 'zh-CN'} aria-label={t('foot.switchLang')} onClick={() => updateSettings({ lang: lang === 'zh' ? 'en' : 'zh' })}>
        <span className="wide">{t('foot.switchLang')}</span>
        <span className="narrow" aria-hidden="true">{lang === 'zh' ? 'EN' : '中'}</span>
      </button>

      {open ? (
        <div className="top-panel" role="dialog" aria-label={t('top.panel')}>
          <div className="label">
            {t('top.now')} {times(now)}
          </div>
          <label className="field">
            <span>{t('top.tzPrimary')}</span>
            <ZoneSelect value={st.tzPrimary} onChange={(v) => updateSettings({ tzPrimary: v })} autoLabel={t('top.tzAuto', { z: zoneLabel(browserZone(), lang) })} />
          </label>
          <label className="field">
            <span>{t('top.tzSecondary')}</span>
            <ZoneSelect value={st.tzSecondary} onChange={(v) => updateSettings({ tzSecondary: v })} allowNone />
          </label>
          <label className="field">
            <span>{t('top.auto')}</span>
            <select className="input" value={st.autoRefreshMin} onChange={(e) => updateSettings({ autoRefreshMin: Number(e.target.value) })}>
              {INTERVALS.map((n) => (
                <option key={n} value={n}>
                  {n === 0 ? t('top.autoOff') : t('top.autoEvery', { n })}
                </option>
              ))}
            </select>
          </label>
          <span className="label">{t('top.autoNote')}</span>
          <button className="btn small" onClick={() => setOpen(false)} style={{ alignSelf: 'flex-end' }}>
            {t('top.close')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
