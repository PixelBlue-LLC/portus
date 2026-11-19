import { useEffect, useMemo, useState } from 'react';
import {
  correlationMatrix,
  orderByCorrelation,
  ETF_HOLDINGS,
  joinList,
  lookThrough,
  MIN_OVERLAP_DAYS,
  parseEtfTop,
  SECTOR_ETFS,
  topPairs,
  weightedCorrelation,
} from 'portus-core';
import { refreshHistory, refreshSymbols } from '../actions';
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
      <CorrelationCard s={s} d={d} />
      <LookThroughCard s={s} d={d} />
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
    () => lookThrough(d.view.positions, d.view.totalValue, s.etfCustom, (sym) => isEtfSymbol(sym, s, d), s.market.quotes),
    [d.view, s.etfCustom, s.market.industries, s.market.quotes],
  );
  // 持有的 ETF 的前十大成分也拉一下报价，权重才能按现价算（每只 ETF 10 次请求，5 分钟内不重复）
  const constituents = d.view.positions
    .flatMap((p) => (ETF_HOLDINGS[p.symbol] && !s.etfCustom[p.symbol] ? ETF_HOLDINGS[p.symbol]!.top.map((r) => r[0]) : []))
    .join(',');
  useEffect(() => {
    if (constituents && s.settings.finnhubKey) void refreshSymbols(constituents.split(','));
  }, [constituents, s.settings.finnhubKey]);
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
              .map((e) => (e.custom ? t('lt.customOf', { sym: e.symbol }) : t(e.live ? 'lt.live' : 'lt.asOf', { sym: e.symbol, d: e.asOf, pct: e.coveredPct })))
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
/**
 * 热力图颜色：正相关暖色（橙到红）、负相关冷色（蓝），越接近 ±1 越深。
 * 不用涨跌的红绿，免得和盈亏混在一起。
 */
function corrColor(v: number | null): { background: string; color: string } {
  if (v == null) return { background: 'var(--line2)', color: 'var(--muted)' };
  const a = Math.round(Math.min(1, Math.abs(v)) * 85);
  const base = v >= 0 ? '#e8590c' : '#1c7ed6';
  return { background: `color-mix(in srgb, ${base} ${a}%, var(--card))`, color: a > 50 ? '#fff' : 'var(--ink)' };
}

type CorrOrder = 'weight' | 'cluster';

function CorrelationCard({ s, d }: { s: AppState; d: Derived }) {
  const lang = getLang();
  const [progress, setProgress] = useState('');
  const [cand, setCand] = useState('');
  const [order, setOrder] = useState<CorrOrder>('cluster');
  const [hover, setHover] = useState<[number, number] | null>(null);
  const off = new Set(s.corrOff ?? []);
  // 三个来源：持仓（仓位最大的 12 只）、观望列表、手动加的；持仓和观望可以逐个点掉
  const heldAll = d.view.positions.filter((p) => !p.noQuote).slice(0, MAX_CORR_HOLDINGS).map((p) => p.symbol);
  const watchAll = (s.watchlist ?? []).map((w) => w.symbol).filter((x) => !heldAll.includes(x));
  const manual = s.candidates.filter((x) => !heldAll.includes(x) && !watchAll.includes(x));
  const held = heldAll.filter((x) => !off.has(x));
  const extra = [...watchAll.filter((x) => !off.has(x)), ...manual];
  const symbols = [...new Set([...held, ...extra])];
  const toggle = (x: string) => setState((st) => ({ corrOff: off.has(x) ? (st.corrOff ?? []).filter((y) => y !== x) : [...(st.corrOff ?? []), x] }));
  const addManual = () => {
    const sym = cand.trim().toUpperCase();
    setCand('');
    if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(sym) || symbols.includes(sym)) return;
    if (off.has(sym)) return toggle(sym);
    setState((st) => ({ candidates: [...st.candidates, sym] }));
    // 有 Twelve Data key 就顺手把这一只的日线拉下来（1 次请求）
    if (s.settings.twelveDataKey && !s.history.fetchedOn[sym]) void refreshHistory([sym]);
  };
  const m = useMemo(() => correlationMatrix(s.history.bars, symbols), [s.history.bars, symbols.join(',')]);
  const pairs = topPairs(m, 3).filter((p) => held.includes(p.a) && held.includes(p.b));
  const weights = Object.fromEntries(d.view.positions.map((p) => [p.symbol, p.marketValue]));
  const hasData = m.symbols.some((x) => !m.missing.includes(x));
  const batches = Math.ceil(symbols.filter((x) => s.history.fetchedOn[x] == null).length / 8);

  // 排列：按仓位（持仓在前、候选在后）或把走势相近的排在一起
  const names = order === 'cluster' && hasData ? orderByCorrelation(m) : m.symbols;
  const idx = names.map((x) => m.symbols.indexOf(x));
  const val = (i: number, j: number) => m.values[idx[i]!]![idx[j]!]!;
  const n = names.length;
  const hv = hover ? { a: names[hover[0]]!, b: names[hover[1]]!, v: val(hover[0], hover[1]), days: m.days[idx[hover[0]]!]?.[idx[hover[1]]!] ?? 0 } : null;

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

      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="seg" role="group" aria-label={t('corr.orderAria')}>
          {(['cluster', 'weight'] as CorrOrder[]).map((o) => (
            <button key={o} className={order === o ? 'on' : ''} aria-pressed={order === o} onClick={() => setOrder(o)}>
              {t(o === 'cluster' ? 'corr.orderCluster' : 'corr.orderWeight')}
            </button>
          ))}
        </div>
      </div>

      {/* 比较哪些股票：持仓、观望可以点掉，也可以手动加别的代码 */}
      <div className="corr-pick">
        <div className="pick-row">
          <span className="label pick-label">{t('corr.pickHeld')}</span>
          {heldAll.map((x) => (
            <button key={x} className={`acct-chip ${off.has(x) ? '' : 'on'}`} aria-pressed={!off.has(x)} onClick={() => toggle(x)}>
              {x}
            </button>
          ))}
        </div>
        {watchAll.length ? (
          <div className="pick-row">
            <span className="label pick-label">{t('corr.pickWatch')}</span>
            {watchAll.map((x) => (
              <button key={x} className={`acct-chip ${off.has(x) ? '' : 'on'}`} aria-pressed={!off.has(x)} onClick={() => toggle(x)}>
                {x}
              </button>
            ))}
          </div>
        ) : null}
        <div className="pick-row">
          <span className="label pick-label">{t('corr.pickManual')}</span>
          {manual.map((x) => (
            <span key={x} className="acct-chip on" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              {x}
              <button className="linkbtn" aria-label={t('corr.removeSym', { s: x })} onClick={() => setState((st) => ({ candidates: st.candidates.filter((y) => y !== x) }))}>
                ×
              </button>
            </span>
          ))}
          <form
            className="row"
            style={{ gap: 6 }}
            onSubmit={(e) => {
              e.preventDefault();
              addManual();
            }}
          >
            <input className="input" style={{ width: 110, minHeight: 34, fontSize: 14 }} value={cand} onChange={(e) => setCand(e.target.value)} placeholder="TSLA" aria-label={t('corr.candTitle')} />
            <button className="btn small" type="submit" disabled={!cand.trim()}>
              {t('common.add')}
            </button>
          </form>
        </div>
        <span className="label">{t('corr.pickHelp', { n: MAX_CORR_HOLDINGS })}</span>
      </div>

      {/* 横纵热力图：没有数据时也画出格子，让人知道会看到什么 */}
      <div className="heat-wrap" onMouseLeave={() => setHover(null)}>
        <div className="heatmap" style={{ gridTemplateColumns: `auto repeat(${n}, minmax(34px, 56px))` }} role="table" aria-label={t('corr.title')}>
          <span />
          {names.map((x, j) => (
            <span key={x} className={`hm-col ${hover && hover[1] === j ? 'on' : ''} ${held.includes(x) ? '' : 'extra'}`} role="columnheader">
              {x}
            </span>
          ))}
          {names.map((a, i) => (
            <div key={a} style={{ display: 'contents' }} role="row">
              <span className={`hm-row ${hover && hover[0] === i ? 'on' : ''} ${held.includes(a) ? '' : 'extra'}`} role="rowheader">
                {a}
              </span>
              {names.map((b, j) => {
                const v = i === j ? null : val(i, j);
                const style = i === j ? { background: 'var(--ink)', color: 'var(--card)' } : corrColor(v);
                return (
                  <span
                    key={b}
                    role="cell"
                    className={`hm-c ${hover && (hover[0] === i || hover[1] === j) ? 'line' : ''}`}
                    style={style}
                    onMouseEnter={() => setHover([i, j])}
                    onFocus={() => setHover([i, j])}
                    tabIndex={i === j ? -1 : 0}
                    aria-label={v == null ? `${a} / ${b}` : `${a} / ${b} ${v.toFixed(2)}`}
                  >
                    {i === j ? '' : v == null ? '' : n > 10 ? v.toFixed(2).replace(/^(-?)0\./, '$1.') : v.toFixed(2)}
                  </span>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="hm-legend" aria-hidden="true">
        <span>−1</span>
        <i />
        <span>0</span>
        <i className="pos" />
        <span>+1</span>
      </div>
      <span className="label" style={{ minHeight: 18 }}>
        {hv && hv.v != null
          ? t('corr.hover', { a: hv.a, b: hv.b, v: hv.v.toFixed(2), n: hv.days })
          : !hasData
            ? t('corr.emptyGrid')
            : t('corr.hoverHint')}
      </span>

      {hasData && pairs.length ? (
        <ul className="list" style={{ fontSize: 14 }}>
          {pairs.map((p) => (
            <li key={p.a + p.b}>{t('corr.pair', { a: p.a, b: p.b, v: p.value.toFixed(2) })}</li>
          ))}
        </ul>
      ) : null}
      {hasData && m.missing.length ? <p className="label" style={{ margin: 0 }}>{t('corr.missing', { list: joinList(m.missing, lang), n: MIN_OVERLAP_DAYS })}</p> : null}

      <div className="col" style={{ gap: 8 }}>
        <span className="label" style={{ fontWeight: 600 }}>{t('corr.candTitle')}</span>
        {extra.length ? (
          <ul className="list" style={{ fontSize: 14 }}>
            {extra.map((c) => {
              const w = weightedCorrelation(m, c, weights);
              return (
                <li key={c}>
                  {w == null ? t('corr.candNoData', { sym: c }) : t('corr.cand', { sym: c, v: w.toFixed(2) })}{' '}
                  {watchAll.includes(c) ? <span className="label">{t('corr.fromWatch')}</span> : null}
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
