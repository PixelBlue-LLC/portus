import { useMemo, useState } from 'react';
import {
  correlationMatrix,
  ETF_HOLDINGS,
  joinList,
  lookThrough,
  MIN_OVERLAP_DAYS,
  parseEtfTop,
  SECTOR_ETFS,
  topPairs,
  weightedCorrelation,
} from 'portus-core';
import { refreshHistory } from '../actions';
import type { Derived } from '../derived';
import { usd } from '../format';
import { getLang, t } from '../i18n';
import { setState, type AppState } from '../store';
import { Card, Empty } from '../ui';

/** 相关性最多看这么多只持仓（按市值从大到小），再多矩阵看不清，也会把免费额度用光 */
const MAX_CORR_HOLDINGS = 12;

export function Risk({ s, d }: { s: AppState; d: Derived }) {
  if (!d.view.positions.length) {
    return (
      <Empty title={t('risk.emptyTitle')}>
        <a href="#/holdings/edit">{t('welcome.enter')}</a>
      </Empty>
    );
  }
  return (
    <>
      <header className="page-head">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="title">{t('nav.risk')}</span>
          <span className="label">{t('risk.sub')}</span>
        </div>
      </header>
      <LookThroughCard s={s} d={d} />
      <CorrelationCard s={s} d={d} />
    </>
  );
}

function isEtfSymbol(sym: string, s: AppState, d: Derived): boolean {
  if (ETF_HOLDINGS[sym] || SECTOR_ETFS[sym] || s.etfCustom[sym]) return true;
  // Finnhub 查不到公司资料的（记成空串）基本都是 ETF
  if (s.market.industries[sym] === '') return true;
  return d.view.positions.some((p) => p.symbol === sym && p.sector === '宽基指数');
}

function LookThroughCard({ s, d }: { s: AppState; d: Derived }) {
  const lang = getLang();
  const lt = useMemo(
    () => lookThrough(d.view.positions, d.view.totalValue, s.etfCustom, (sym) => isEtfSymbol(sym, s, d)),
    [d.view, s.etfCustom, s.market.industries],
  );
  const [editing, setEditing] = useState<string | null>(null);
  const [text, setText] = useState('');
  const top = lt.rows.slice(0, 12);
  const biggest = lt.rows[0];
  const biggestDirect = biggest ? (biggest.direct / (d.view.totalValue || 1)) * 100 : 0;
  const editable = [...new Set([...lt.unknownEtfs, ...lt.etfs.map((e) => e.symbol)])];

  const openEditor = (sym: string) => {
    setEditing(sym);
    const cur = s.etfCustom[sym] ?? [];
    setText(cur.map(([x, w]) => `${x} ${w}`).join('\n'));
  };

  return (
    <Card>
      <div className="card-head">
        <h2>{t('lt.title')}</h2>
        <span className="label">{t('lt.top10')}</span>
      </div>
      {!lt.etfs.length ? (
        <p className="body" style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
          {lt.unknownEtfs.length ? t('lt.onlyUnknown', { list: joinList(lt.unknownEtfs, lang) }) : t('lt.noEtf')}
        </p>
      ) : (
        <>
          {biggest && biggest.viaEtf > 0 ? (
            <p className="lead" style={{ fontSize: 15 }}>
              {t('lt.headline', { sym: biggest.symbol, direct: biggestDirect.toFixed(1), total: biggest.pct })}
            </p>
          ) : null}
          <div className="table" role="table" aria-label={t('lt.title')}>
            <div className="tr head lt-row" role="row">
              <span role="columnheader">{t('lt.col.symbol')}</span>
              <span role="columnheader">{t('lt.col.direct')}</span>
              <span role="columnheader">{t('lt.col.via')}</span>
              <span role="columnheader">{t('lt.col.total')}</span>
            </div>
            {top.map((r) => (
              <div className="tr lt-row" role="row" key={r.symbol}>
                <span className="sym" role="cell">
                  {r.symbol}
                  {Object.keys(r.sources).length ? (
                    <span className="cell-name">{Object.entries(r.sources).map(([e, v]) => `${e} ${usd(v)}`).join(' · ')}</span>
                  ) : null}
                </span>
                <span role="cell">{r.direct ? usd(r.direct) : '—'}</span>
                <span role="cell">{r.viaEtf ? usd(r.viaEtf) : '—'}</span>
                <span role="cell" style={{ fontWeight: 600 }}>
                  {usd(r.total)} <span className="muted" style={{ fontWeight: 400 }}>{r.pct}%</span>
                </span>
              </div>
            ))}
          </div>
          <p className="label" style={{ margin: 0, lineHeight: 1.6 }}>
            {t('lt.other', { usd: usd(lt.otherInEtfs) })}{' '}
            {lt.etfs
              .map((e) => (e.custom ? t('lt.customOf', { sym: e.symbol }) : t('lt.asOf', { sym: e.symbol, d: e.asOf, pct: e.coveredPct })))
              .join(t('common.sep'))}
          </p>
        </>
      )}
      {lt.unknownEtfs.length && lt.etfs.length ? <div className="banner">{t('lt.unknown', { list: joinList(lt.unknownEtfs, lang) })}</div> : null}

      {editable.length ? (
        <div className="row">
          <span className="label">{t('lt.editLabel')}</span>
          {editable.map((sym) => (
            <button key={sym} className={`acct-chip ${editing === sym ? 'on' : ''}`} onClick={() => (editing === sym ? setEditing(null) : openEditor(sym))}>
              {sym}
              {s.etfCustom[sym] ? ' ✎' : ''}
            </button>
          ))}
        </div>
      ) : null}
      {editing ? (
        <div className="col">
          <label className="field">
            <span>{t('lt.editHelp', { sym: editing })}</span>
            <textarea className="input" style={{ minHeight: 120, fontFamily: 'ui-monospace, monospace' }} value={text} onChange={(e) => setText(e.target.value)} placeholder={'NVDA 18.5\nAAPL 15.1\nMSFT 12.0'} />
          </label>
          <div className="row">
            <button
              className="btn small primary"
              onClick={() => {
                const top10 = parseEtfTop(text);
                setState((st) => {
                  const next = { ...st.etfCustom };
                  if (top10.length) next[editing] = top10;
                  else delete next[editing];
                  return { etfCustom: next };
                });
                setEditing(null);
              }}
            >
              {t('common.save')}
            </button>
            {s.etfCustom[editing] ? (
              <button
                className="btn small"
                onClick={() => {
                  setState((st) => {
                    const next = { ...st.etfCustom };
                    delete next[editing];
                    return { etfCustom: next };
                  });
                  setEditing(null);
                }}
              >
                {ETF_HOLDINGS[editing] ? t('lt.useBuiltin') : t('common.delete')}
              </button>
            ) : null}
            <button className="btn small" onClick={() => setEditing(null)}>
              {t('common.cancel')}
            </button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}

/** -1…1 → 颜色：正相关偏蓝，负相关偏橙，越接近 0 越淡 */
function corrColor(v: number | null): { background: string; color: string } {
  if (v == null) return { background: 'transparent', color: 'var(--muted)' };
  const a = Math.round(Math.min(1, Math.abs(v)) * 80);
  const base = v >= 0 ? 'var(--accent)' : 'var(--down)';
  return { background: `color-mix(in srgb, ${base} ${a}%, var(--card))`, color: a > 45 ? '#fff' : 'var(--ink)' };
}

function CorrelationCard({ s, d }: { s: AppState; d: Derived }) {
  const lang = getLang();
  const [progress, setProgress] = useState('');
  const [cand, setCand] = useState('');
  const held = d.view.positions.slice(0, MAX_CORR_HOLDINGS).map((p) => p.symbol);
  const symbols = [...new Set([...held, ...s.candidates])];
  const m = useMemo(() => correlationMatrix(s.history.bars, symbols), [s.history.bars, symbols.join(',')]);
  const pairs = topPairs(m, 3).filter((p) => !s.candidates.includes(p.a) && !s.candidates.includes(p.b));
  const weights = Object.fromEntries(d.view.positions.map((p) => [p.symbol, p.marketValue]));
  const hasData = m.symbols.some((x) => !m.missing.includes(x));
  const batches = Math.ceil(symbols.filter((x) => s.history.fetchedOn[x] == null).length / 8);

  return (
    <Card>
      <div className="card-head">
        <h2>{t('corr.title')}</h2>
        <span className="label">{t('corr.window')}</span>
      </div>
      <p className="body" style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
        {t('corr.body')}
      </p>
      {!s.settings.twelveDataKey ? (
        <div className="notice">
          {t('corr.needKey')} <a href="#/settings">{t('common.goSettings')}</a>
        </div>
      ) : (
        <div className="row">
          <button
            className="btn small"
            disabled={!!s.historyLoading}
            onClick={async () => {
              setProgress('');
              await refreshHistory(symbols, (done, total) => setProgress(t('corr.progress', { done, total })));
              setProgress('');
            }}
          >
            {s.historyLoading ? t('corr.loading') : hasData ? t('corr.refresh') : t('corr.fetch')}
          </button>
          <span className="label">{progress || (batches > 1 ? t('corr.slow', { n: batches - 1 }) : '')}</span>
        </div>
      )}
      {s.history.errors.length ? <div className="banner bad">{s.history.errors.join(t('common.sep'))}</div> : null}

      {hasData ? (
        <>
          {pairs.length ? (
            <ul className="list" style={{ fontSize: 14 }}>
              {pairs.map((p) => (
                <li key={p.a + p.b}>{t('corr.pair', { a: p.a, b: p.b, v: p.value.toFixed(2) })}</li>
              ))}
            </ul>
          ) : null}
          <div className="corr-wrap">
            <div className="corr" style={{ gridTemplateColumns: `56px repeat(${m.symbols.length}, minmax(44px, 1fr))` }} role="table" aria-label={t('corr.title')}>
              <span />
              {m.symbols.map((x) => (
                <span key={x} className="corr-h" role="columnheader">
                  {x}
                </span>
              ))}
              {m.symbols.map((a, i) => (
                <div key={a} style={{ display: 'contents' }} role="row">
                  <span className="corr-h" role="rowheader">
                    {a}
                  </span>
                  {m.symbols.map((b, j) => {
                    const v = m.values[i]![j]!;
                    return (
                      <span key={b} className="corr-c" role="cell" style={corrColor(i === j ? null : v)} title={t('corr.cellTitle', { a, b, n: m.days[i]![j]! })}>
                        {i === j ? '·' : v == null ? '—' : v.toFixed(2)}
                      </span>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          {m.missing.length ? <p className="label" style={{ margin: 0 }}>{t('corr.missing', { list: joinList(m.missing, lang), n: MIN_OVERLAP_DAYS })}</p> : null}
        </>
      ) : null}

      <div className="col" style={{ gap: 8 }}>
        <span className="label" style={{ fontWeight: 600 }}>{t('corr.candTitle')}</span>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            const sym = cand.trim().toUpperCase();
            if (/^[A-Z][A-Z0-9.\-]{0,9}$/.test(sym) && !s.candidates.includes(sym)) setState((st) => ({ candidates: [...st.candidates, sym] }));
            setCand('');
          }}
        >
          <input className="input" style={{ maxWidth: 140 }} value={cand} onChange={(e) => setCand(e.target.value)} placeholder="TSLA" aria-label={t('corr.candTitle')} />
          <button className="btn small" type="submit">
            {t('common.add')}
          </button>
        </form>
        {s.candidates.length ? (
          <ul className="list" style={{ fontSize: 14 }}>
            {s.candidates.map((c) => {
              const w = weightedCorrelation(m, c, weights);
              return (
                <li key={c}>
                  {w == null ? t('corr.candNoData', { sym: c }) : t('corr.cand', { sym: c, v: w.toFixed(2) })}{' '}
                  <button className="linkbtn" onClick={() => setState((st) => ({ candidates: st.candidates.filter((x) => x !== c) }))}>
                    {t('common.remove')}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <span className="label">{t('corr.candHelp')}</span>
        )}
      </div>
      <p className="label" style={{ margin: 0 }}>{t('corr.disclaimer')}</p>
    </Card>
  );
}
