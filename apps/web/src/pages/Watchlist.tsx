import { useState } from 'react';
import { refreshSymbols } from '../actions';
import type { Derived } from '../derived';
import { t } from '../i18n';
import { setState, type AppState } from '../store';
import { Card } from '../ui';
import { QuoteLink } from './Sectors';

const n2 = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const sign = (v: number, digits = 2, suffix = '') => `${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(digits)}${suffix}`;
const tone = (v: number | null | undefined) => (v == null || v === 0 ? '' : v < 0 ? 'neg' : 'pos');
const TICKER = /^[A-Z][A-Z0-9.\-]{0,9}$/;

/** 观望：没持有、但在看的股票。只显示价格和涨跌，不给任何买卖提示 */
export function WatchlistCard({ s, d }: { s: AppState; d: Derived }) {
  const [sym, setSym] = useState('');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState('');
  const list = s.watchlist ?? [];
  const held = new Set(d.view.positions.map((p) => p.symbol));
  const lang = d.lang;

  const add = () => {
    const x = sym.trim().toUpperCase();
    if (!TICKER.test(x)) return setMsg(t('watch.bad'));
    if (list.some((w) => w.symbol === x)) return setMsg(t('watch.dup', { s: x }));
    const price = s.market.quotes[x]?.price;
    setState({ watchlist: [...list, { symbol: x, addedAt: new Date().toISOString(), ...(price ? { addedPrice: price } : {}), ...(note.trim() ? { note: note.trim() } : {}) }] });
    setSym('');
    setNote('');
    setMsg('');
    if (s.settings.finnhubKey) void refreshSymbols([x]);
  };

  return (
    <Card>
      <div className="card-head">
        <h2>{t('watch.title')}</h2>
        <span className="label">{t('watch.count', { n: list.length })}</span>
      </div>
      {list.length ? (
        <div className="watch-list">
          {list.map((w) => {
            const q = s.market.quotes[w.symbol];
            const chg = q && q.prevClose ? q.price - q.prevClose : null;
            const since = q && w.addedPrice ? ((q.price - w.addedPrice) / w.addedPrice) * 100 : null;
            const added = new Date(w.addedAt).toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', { month: lang === 'zh' ? 'numeric' : 'short', day: 'numeric' });
            return (
              <div key={w.symbol} className="watch-row">
                <span className="w-sym">
                  <QuoteLink s={s} symbol={w.symbol} />
                  {held.has(w.symbol) ? <span className="chip held">{t('sec.held')}</span> : null}
                  {w.note ? <span className="label w-note">{w.note}</span> : null}
                </span>
                <span className="num">
                  <span className="m">{q ? n2(q.price) : '—'}</span>
                  <span className={`s ${tone(q?.changePct)}`}>
                    {q && q.changePct != null ? `${chg != null ? `${sign(chg)} · ` : ''}${sign(q.changePct, 2, '%')}` : ' '}
                  </span>
                </span>
                <span className="num">
                  <span className={`m ${tone(since)}`}>{since != null ? sign(since, 2, '%') : '—'}</span>
                  <span className="s muted">{t('watch.since', { d: added })}</span>
                </span>
                <button className="btn icon small" aria-label={t('watch.remove', { s: w.symbol })} onClick={() => setState({ watchlist: list.filter((x) => x.symbol !== w.symbol) })}>
                  ×
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <span className="label">{t('watch.empty')}</span>
      )}
      <form
        className="watch-add"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input className="input" value={sym} placeholder="AMZN" aria-label={t('watch.symbol')} onChange={(e) => setSym(e.target.value)} />
        <input className="input" value={note} placeholder={t('watch.notePh')} aria-label={t('watch.note')} onChange={(e) => setNote(e.target.value)} />
        <button className="btn small" type="submit" disabled={!sym.trim()}>
          {t('watch.add')}
        </button>
      </form>
      {msg ? <span className="label neg">{msg}</span> : null}
      <span className="label">{t('watch.foot')}</span>
    </Card>
  );
}
