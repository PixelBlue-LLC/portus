import { useRef, useState } from 'react';
import { DEFAULT_RULES, ruleLabel } from 'portus-core';
import { refreshMarket } from '../actions';
import { APP_NAME, REPO_URL } from '../brand';
import { clearAll, exportBackup, importBackup, updateSettings, type AppState, type ThemePref } from '../store';
import { getLang, t, type LangPref } from '../i18n';
import { Card } from '../ui';

export function Settings({ s }: { s: AppState }) {
  const st = s.settings;
  const [msg, setMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const download = (includeKeys: boolean) => {
    const blob = new Blob([exportBackup(includeKeys)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `portus-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <>
      <header className="page-head">
        <span className="title">{t('nav.settings')}</span>
      </header>

      <div className="grid2">
        <div className="col">
          <Card>
            <h2>{t('set.sources')}</h2>
            <p className="body" style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
              {t('set.sourcesBody')}
            </p>
            <label className="field">
              <span>
                {t('set.finnhub')} ·{' '}
                <a href="https://finnhub.io/register" target="_blank" rel="noreferrer">
                  {t('set.register')}
                </a>
              </span>
              <input className="input" type="password" autoComplete="off" value={st.finnhubKey} onChange={(e) => updateSettings({ finnhubKey: e.target.value.trim() })} />
            </label>
            <label className="field">
              <span>
                {t('set.anthropic')} ·{' '}
                <a href="https://console.anthropic.com/" target="_blank" rel="noreferrer">
                  {t('set.get')}
                </a>
              </span>
              <input className="input" type="password" autoComplete="off" value={st.anthropicKey} onChange={(e) => updateSettings({ anthropicKey: e.target.value.trim() })} />
            </label>
            <label className="field">
              <span>{t('set.model')}</span>
              <input className="input" value={st.aiModel} onChange={(e) => updateSettings({ aiModel: e.target.value.trim() })} />
            </label>
            <button className="btn" disabled={!st.finnhubKey || s.loading} onClick={() => void refreshMarket().then(() => setMsg(t('set.refreshed')))} style={{ alignSelf: 'flex-start' }}>
              {s.loading ? t('common.refreshing') : t('set.test')}
            </button>
            {s.market.errors.length ? <div className="banner bad">{s.market.errors.join(t('common.sep'))}</div> : null}
          </Card>

          <Card>
            <h2>{t('set.display')}</h2>
            <label className="field">
              <span>{t('set.language')}</span>
              <select className="input" value={st.lang} onChange={(e) => updateSettings({ lang: e.target.value as LangPref })}>
                <option value="auto">{t('set.langAuto')}</option>
                <option value="zh">中文</option>
                <option value="en">English</option>
              </select>
            </label>
            <label className="field">
              <span>{t('set.theme')}</span>
              <select className="input" value={st.theme} onChange={(e) => updateSettings({ theme: e.target.value as ThemePref })}>
                <option value="system">{t('set.themeSystem')}</option>
                <option value="light">{t('set.light')}</option>
                <option value="dark">{t('set.dark')}</option>
              </select>
            </label>
            <label className="field">
              <span>{t('set.colors')}</span>
              <select className="input" value={st.colorConvention} onChange={(e) => updateSettings({ colorConvention: e.target.value as 'us' | 'cn' })}>
                <option value="us">{t('set.us')}</option>
                <option value="cn">{t('set.cn')}</option>
              </select>
            </label>
          </Card>
        </div>

        <div className="col">
          <Card>
            <div className="card-head">
              <h2>{t('set.rules')}</h2>
              <button className="linkbtn" onClick={() => updateSettings({ rules: DEFAULT_RULES })}>
                {t('set.reset')}
              </button>
            </div>
            {st.rules.map((r, i) => (
              <label key={r.type + r.label} className="field" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>
                  {ruleLabel(r, getLang())}
                  {r.type === 'cash_min' ? t('set.floor') : ''}
                </span>
                <span className="row" style={{ flexWrap: 'nowrap' }}>
                  <input
                    className="input"
                    style={{ width: 88, textAlign: 'right' }}
                    inputMode="decimal"
                    value={r.limit}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (!Number.isFinite(v)) return;
                      updateSettings({ rules: st.rules.map((x, j) => (j === i ? { ...x, limit: v } : x)) });
                    }}
                  />
                  <span className="muted">%</span>
                </span>
              </label>
            ))}
          </Card>

          <Card>
            <h2>{t('set.data')}</h2>
            <p className="body" style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
              {t('set.dataBody')}
            </p>
            <div className="row">
              <button className="btn small" onClick={() => download(false)}>
                {t('set.export')}
              </button>
              <button className="btn small" onClick={() => fileRef.current?.click()}>
                {t('set.import')}
              </button>
              <button
                className="btn small"
                onClick={() => {
                  if (confirm(t('set.clearConfirm'))) clearAll();
                }}
              >
                {t('set.clearAll')}
              </button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="sr"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  importBackup(await f.text());
                  setMsg(t('set.imported'));
                } catch (err) {
                  setMsg(err instanceof Error ? err.message : t('set.importFail'));
                }
                e.target.value = '';
              }}
            />
            {msg ? <div className="banner">{msg}</div> : null}
          </Card>

          <div className="notice">
            {t('set.notice1', { app: APP_NAME })}
            <a href={REPO_URL} target="_blank" rel="noreferrer">
              GitHub
            </a>
            {t('set.notice2')}
          </div>
        </div>
      </div>
    </>
  );
}
