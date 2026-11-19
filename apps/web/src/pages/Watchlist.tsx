import { useState } from 'react';
import { watchStatus, type WatchItem } from 'portus-core';
import { refreshSymbols, todayLocal } from '../actions';
import type { Derived } from '../derived';
import { t } from '../i18n';
import { setState, type AppState } from '../store';
import { Card } from '../ui';
import { QuoteLink } from './Sectors';

const n2 = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const sign = (v: number, digits = 2, suffix = '') => `${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(digits)}${suffix}`;
const tone = (v: number | null | undefined) => (v == null || v === 0 ? '' : v < 0 ? 'neg' : 'pos');
const TICKER = /^[A-Z][A-Z0-9.\-]{0,9}$/;
const num = (x: string) => {
  const v = Number(x.replace(/[$,\s]/g, ''));
  return Number.isFinite(v) && v > 0 ? v : undefined;
};

function shortDate(iso: string, lang: 'zh' | 'en'): string {
  // 只有日期（YYYY-MM-DD）的按当天中午算，避免时区把它挪到前一天
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00` : iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', { year: sameYear ? undefined : 'numeric', month: lang === 'zh' ? 'numeric' : 'short', day: 'numeric' });
}

/** 编辑一条：起点日期、起点价、目标价、备注 */
function EditRow({ w, onDone }: { w: WatchItem; onDone: (next: WatchItem | null) => void }) {
  const [date, setDate] = useState(w.addedAt.slice(0, 10));
  const [price, setPrice] = useState(w.addedPrice != null ? String(w.addedPrice) : '');
  const [target, setTarget] = useState(w.target != null ? String(w.target) : '');
  const [note, setNote] = useState(w.note ?? '');
  return (
    <form
      className="watch-edit"
      onSubmit={(e) => {
        e.preventDefault();
        const t2 = num(target);
        onDone({
          ...w,
          addedAt: date || w.addedAt,
          addedPrice: num(price),
          target: t2,
          note: note.trim() || undefined,
          // 目标价改了就重新判断是否到达
          reachedAt: t2 === w.target ? w.reachedAt : undefined,
        });
      }}
    >
      <label className="field">
        <span>{t('watch.startDate')}</span>
        <input className="input" type="date" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value)} />
      </label>
      <label className="field">
        <span>{t('watch.startPrice')}</span>
        <input className="input" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
      </label>
      <label className="field">
        <span>{t('watch.target')}</span>
        <input className="input" inputMode="decimal" value={target} placeholder={t('watch.targetPh')} onChange={(e) => setTarget(e.target.value)} />
      </label>
      <label className="field">
        <span>{t('watch.note')}</span>
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <div className="row" style={{ alignSelf: 'end' }}>
        <button className="btn small primary" type="submit">
          {t('common.save')}
        </button>
        <button className="btn small" type="button" onClick={() => onDone(null)}>
          {t('common.cancel')}
        </button>
      </div>
    </form>
  );
}

/**
 * 观望：没持有、但在看的股票。记下哪天、什么价格开始观望，以及自己设的目标价。
 * 只显示价格变化和离目标价的距离，不给任何买卖提示。
 */
export function WatchlistCard({ s, d }: { s: AppState; d: Derived }) {
  const [sym, setSym] = useState('');
  const [target, setTarget] = useState('');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState('');
  const [editing, setEditing] = useState('');
  const list = s.watchlist ?? [];
  const held = new Set(d.view.positions.map((p) => p.symbol));
  const lang = d.lang;
  const save = (next: WatchItem[]) => setState({ watchlist: next });

  const add = () => {
    const x = sym.trim().toUpperCase();
    if (!TICKER.test(x)) return setMsg(t('watch.bad'));
    if (list.some((w) => w.symbol === x)) return setMsg(t('watch.dup', { s: x }));
    const price = s.market.quotes[x]?.price;
    const tg = num(target);
    save([...list, { symbol: x, addedAt: new Date().toISOString(), ...(price ? { addedPrice: price } : {}), ...(tg ? { target: tg } : {}), ...(note.trim() ? { note: note.trim() } : {}) }]);
    setSym('');
    setTarget('');
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
          <div className="watch-row head">
            <span>{t('watch.colSym')}</span>
            <span className="num">{t('watch.colPrice')}</span>
            <span className="num">{t('watch.colStart')}</span>
            <span className="num">{t('watch.colTarget')}</span>
            <span />
          </div>
          {list.map((w) => {
            const q = s.market.quotes[w.symbol];
            const chg = q && q.prevClose ? q.price - q.prevClose : null;
            const st = watchStatus(w, q?.price);
            if (editing === w.symbol)
              return (
                <EditRow
                  key={w.symbol}
                  w={w}
                  onDone={(next) => {
                    if (next) save(list.map((x) => (x.symbol === w.symbol ? next : x)));
                    setEditing('');
                  }}
                />
              );
            return (
              <div key={w.symbol} className={`watch-row ${st.reached ? 'reached' : ''}`}>
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
                  <span className="m">
                    {shortDate(w.addedAt, lang)}
                    {w.addedPrice ? ` @ ${n2(w.addedPrice)}` : ''}
                  </span>
                  <span className={`s ${tone(st.sincePct)}`}>{st.sincePct != null ? t('watch.sinceVal', { v: sign(st.sincePct, 2, '%') }) : ' '}</span>
                </span>
                <span className="num">
                  {w.target ? (
                    <>
                      <span className="m">{n2(w.target)}</span>
                      <span className={`s ${st.reached ? 'warn-text' : ''}`}>
                        {st.reached
                          ? t('watch.reached', { d: w.reachedAt ? shortDate(w.reachedAt, lang) : t('cal.today') })
                          : st.toTargetPct != null
                            ? t('watch.toGo', { v: sign(st.toTargetPct, 2, '%') })
                            : ' '}
                      </span>
                    </>
                  ) : (
                    <span className="m muted" style={{ fontWeight: 400 }}>
                      {t('watch.noTarget')}
                    </span>
                  )}
                </span>
                <span className="w-act">
                  <button className="btn small" onClick={() => setEditing(w.symbol)}>
                    {t('watch.edit')}
                  </button>
                  <button className="btn icon small" aria-label={t('watch.remove', { s: w.symbol })} onClick={() => save(list.filter((x) => x.symbol !== w.symbol))}>
                    ×
                  </button>
                </span>
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
        <input className="input" value={target} inputMode="decimal" placeholder={t('watch.targetPh')} aria-label={t('watch.target')} onChange={(e) => setTarget(e.target.value)} />
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
