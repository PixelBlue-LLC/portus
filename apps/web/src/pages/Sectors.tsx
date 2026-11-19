import { Fragment, useEffect, useState } from 'react';
import { etfMovers, nameIn, type SectorPerf } from 'portus-core';
import { explainSector, refreshSymbols } from '../actions';
import { QUOTE_SITES, quoteUrl } from '../links';
import type { Derived } from '../derived';
import { signedPct, timeLabel } from '../format';
import { t } from '../i18n';
import type { AppState } from '../store';
import { Card } from '../ui';

/** 股票代码做成链接，新标签页打开公开行情网站（设置里可选 Yahoo / Google / TradingView） */
export function QuoteLink({ s, symbol, className = '' }: { s: AppState; symbol: string; className?: string }) {
  const site = s.settings.quoteSite ?? 'yahoo';
  return (
    <a className={`qlink ${className}`} href={quoteUrl(symbol, site)} target="_blank" rel="noreferrer" title={t('sec.openQuote', { s: symbol, site: QUOTE_SITES[site] })}>
      {symbol}
    </a>
  );
}

/** 百分点：带正负号、两位小数 */
const pp = (v: number) => `${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(2)}`;

/** 大盘指数单独放一组，不和行业混在一起排 */
const INDEXES = ['SPY', 'QQQ', 'IWM'];

/** 以 0 为中线的条：跌的往左、涨的往右，长度按这一组里最大的涨跌幅算 */
function Diverging({ v, max, height = 8 }: { v: number; max: number; height?: number }) {
  const w = max > 0 ? Math.min(50, (Math.abs(v) / max) * 50) : 0;
  return (
    <div className="dbar" style={{ height }} aria-hidden="true">
      <i className={v < 0 ? 'down' : 'up'} style={v < 0 ? { right: '50%', width: `${w}%` } : { left: '50%', width: `${w}%` }} />
    </div>
  );
}

function Movers({ s, d, etf, change }: { s: AppState; d: Derived; etf: string; change: number }) {
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [aiErr, setAiErr] = useState('');
  const note = s.sectorNotes?.[etf];
  const data = etfMovers(etf, s.market.quotes, s.etfCustom);
  const syms = data?.rows.map((r) => r.symbol).join(',') ?? '';
  useEffect(() => {
    if (!syms) return;
    let alive = true;
    void refreshSymbols(syms.split(',')).then((e) => alive && setErr(e ?? ''));
    return () => {
      alive = false;
    };
  }, [syms]);
  if (!data) return <div className="movers label">{t('sec.noTable')}</div>;
  const held = new Set(d.view.positions.map((p) => p.symbol));
  const max = Math.max(...data.rows.map((r) => Math.abs(r.contribution ?? 0)), 0.01);
  const pending = data.rows.some((r) => r.changePct == null);
  return (
    <div className="movers">
      <span className="label">
        {t('sec.moversHead', { c: data.coveredPct, d: data.custom ? t('sec.custom') : data.asOf })}
        {data.explained != null ? t('sec.explained', { e: pp(data.explained), x: signedPct(change) }) : ''}
      </span>
      {data.coveredPct < 20 ? <span className="label">{t('sec.lowCoverage')}</span> : null}
      <div className="mv-grid" role="table" aria-label={t('sec.moversAria', { s: etf })}>
        <div className="mv-row head" role="row">
          <span role="columnheader">{t('sec.stock')}</span>
          <span role="columnheader" className="num">{t('sec.weight')}</span>
          <span role="columnheader" className="num">{t('sec.change')}</span>
          <span role="columnheader">{t('sec.contrib')}</span>
        </div>
        {data.rows.map((r) => (
          <div className="mv-row" role="row" key={r.symbol}>
            <span role="cell" className="sym">
              <QuoteLink s={s} symbol={r.symbol} />
              {held.has(r.symbol) ? <span className="chip held">{t('sec.held')}</span> : null}
            </span>
            <span role="cell" className="num muted">{r.weight.toFixed(1)}%</span>
            <span role="cell" className={`num ${r.changePct == null ? 'muted' : r.changePct < 0 ? 'neg' : r.changePct > 0 ? 'pos' : ''}`}>
              {r.changePct == null ? '…' : signedPct(r.changePct)}
            </span>
            <span role="cell" className="mv-contrib">
              {r.contribution != null ? (
                <>
                  <Diverging v={r.contribution} max={max} height={6} />
                  <span className={`num ${r.contribution < 0 ? 'neg' : 'pos'}`}>{pp(r.contribution)}</span>
                </>
              ) : (
                <span className="muted">—</span>
              )}
            </span>
          </div>
        ))}
      </div>
      {pending && !err ? <span className="label">{t('sec.loading')}</span> : null}
      {err ? <span className="label neg">{err}</span> : null}

      <div className="sec-ai">
        {note ? (
          <p className="body" style={{ margin: 0, fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
            {note.text}
          </p>
        ) : null}
        {s.settings.anthropicKey ? (
          <div className="row">
            <button
              className="btn small"
              disabled={busy || pending}
              onClick={async () => {
                setBusy(true);
                setAiErr('');
                try {
                  await explainSector(etf, change);
                } catch (e) {
                  setAiErr(e instanceof Error ? e.message : String(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? t('attr.busy') : note ? t('sec.aiAgain') : t('sec.ai')}
            </button>
            {note && !busy ? <span className="label">{t('attr.at', { t: timeLabel(note.at) })}</span> : null}
            {aiErr ? <span className="label neg">{aiErr}</span> : null}
          </div>
        ) : (
          <span className="label">
            {t('sec.aiNeedKey')} <a href="#/settings">{t('nav.settings')}</a>
          </span>
        )}
      </div>
    </div>
  );
}

function Group({ s, d, title, rows, max, open, onToggle }: { s: AppState; d: Derived; title: string; rows: SectorPerf[]; max: number; open: string; onToggle: (sym: string) => void }) {
  return (
    <div className="sec-group">
      <span className="label sec-title">{title}</span>
      {rows.map((x) => {
        const isOpen = open === x.symbol;
        return (
          <Fragment key={x.symbol}>
            <button className={`sec-row ${isOpen ? 'open' : ''}`} aria-expanded={isOpen} onClick={() => onToggle(x.symbol)}>
              <span className="body name">
                {nameIn(x.name, d.lang)} <span className="muted tk">{x.symbol}</span>
              </span>
              <Diverging v={x.changePct} max={max} />
              <span className={`num v ${x.changePct < 0 ? 'neg' : x.changePct > 0 ? 'pos' : ''}`}>{signedPct(x.changePct)}</span>
              <span className="caret" aria-hidden="true">{isOpen ? '▾' : '▸'}</span>
            </button>
            {isOpen ? <Movers s={s} d={d} etf={x.symbol} change={x.changePct} /> : null}
          </Fragment>
        );
      })}
    </div>
  );
}

/** 市场页的板块图：指数和行业分开，0 为中线；点一行展开看成分股里谁贡献最大 */
export function SectorChart({ s, d, initial }: { s: AppState; d: Derived; initial?: string }) {
  const [open, setOpen] = useState(initial ?? '');
  useEffect(() => {
    if (initial) setOpen(initial);
  }, [initial]);
  const toggle = (sym: string) => setOpen((o) => (o === sym ? '' : sym));
  const idx = d.sectors.filter((x) => INDEXES.includes(x.symbol));
  const sec = d.sectors.filter((x) => !INDEXES.includes(x.symbol));
  // 两组共用一个刻度，条的长短才能互相比
  const max = Math.max(...d.sectors.map((x) => Math.abs(x.changePct)), 0.5);
  return (
    <Card>
      <div className="card-head">
        <h2>{t('sec.title')}</h2>
        <span className="label">{t('sec.hint')}</span>
      </div>
      {!d.sectors.length ? (
        <span className="muted" style={{ fontSize: 14, lineHeight: 1.6 }}>
          {s.market.errors.length ? t('mkt.noSectorsErr', { e: s.market.errors[0]! }) : t('mkt.noSectors')}
        </span>
      ) : null}
      {idx.length ? <Group s={s} d={d} title={t('sec.indexes')} rows={idx} max={max} open={open} onToggle={toggle} /> : null}
      {sec.length ? <Group s={s} d={d} title={t('sec.sectors')} rows={sec} max={max} open={open} onToggle={toggle} /> : null}
    </Card>
  );
}
