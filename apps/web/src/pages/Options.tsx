import { useState } from 'react';
import { analyzeChain, parseOptionChain, type ChainImport } from 'portus-core';
import { todayLocal } from '../actions';
import type { Derived } from '../derived';
import { usd } from '../format';
import { t, type MsgKey } from '../i18n';
import { setState, type AppState } from '../store';
import { Card } from '../ui';

/** 交易前检查清单：用户自己写下理由和计划，工具不替你回答 */
const QUESTIONS = Array.from({ length: 16 }, (_, i) => `opt.q${i}` as MsgKey);

export function Options({ s, d }: { s: AppState; d: Derived }) {
  const [open, setOpen] = useState(false);
  const filled = QUESTIONS.filter((_, i) => (s.checklist[`q${i}`] ?? '').trim()).length;
  const missing = ['q10', 'q12', 'q13', 'q0'].filter((k) => !(s.checklist[k] ?? '').trim());

  return (
    <>
      <header className="page-head">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="title">{t('nav.options')}</span>
          <span className="label">{t('opt.sub')}</span>
        </div>
      </header>

      <div className="grid2">
        <ChainCard s={s} d={d} />

        <Card>
          <div className="card-head">
            <h2>{t('opt.checklist')}</h2>
            <span className="label">
              {filled} / {QUESTIONS.length}
            </span>
          </div>
          <p className="body" style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
            {t('opt.checkBody')}
          </p>
          {missing.length && filled ? <div className="banner bad">{t('opt.missing', { list: missing.map((k) => t(QUESTIONS[Number(k.slice(1))]!)).join(t('common.sep')) })}</div> : null}
          {open ? (
            <>
              {QUESTIONS.map((q, i) => (
                <label className="field" key={q}>
                  <span>
                    {i + 1}. {t(q)}
                  </span>
                  <textarea
                    className="input"
                    style={{ minHeight: 56 }}
                    value={s.checklist[`q${i}`] ?? ''}
                    onChange={(e) => setState((st) => ({ checklist: { ...st.checklist, [`q${i}`]: e.target.value } }))}
                  />
                </label>
              ))}
              <div className="row">
                <button className="btn small" onClick={() => setOpen(false)}>
                  {t('common.collapse')}
                </button>
                <button className="btn small" onClick={() => setState({ checklist: {} })}>
                  {t('common.clear')}
                </button>
              </div>
            </>
          ) : (
            <button className="btn" onClick={() => setOpen(true)} style={{ alignSelf: 'flex-start' }}>
              {filled ? t('opt.continue') : t('opt.start')}
            </button>
          )}
        </Card>
      </div>
    </>
  );
}

/** 期权链导入和指标：数据由用户从券商导出后贴进来 */
function ChainCard({ s, d }: { s: AppState; d: Derived }) {
  const held = d.view.positions.map((p) => p.symbol);
  const stored = Object.keys(s.chains);
  const [symbol, setSymbol] = useState(stored[0] ?? held[0] ?? '');
  const [text, setText] = useState('');
  const [spotInput, setSpotInput] = useState('');
  const [result, setResult] = useState<ChainImport | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const sym = symbol.trim().toUpperCase();
  const chain = s.chains[sym];
  const quote = s.market.quotes[sym]?.price;
  const pos = d.view.positions.find((p) => p.symbol === sym);
  const spot = quote ?? (pos && pos.priceSource !== 'cost' ? pos.price : undefined) ?? chain?.spot;
  const closes = (s.history.bars[sym] ?? []).map((b) => b.close);
  const m = chain && spot ? analyzeChain(sym, chain.contracts, spot, closes) : null;
  const expiries = chain ? [...new Set(chain.contracts.map((c) => c.expiry))].sort() : [];

  const doImport = (raw: string) => {
    const r = parseOptionChain(raw, todayLocal(), sym || undefined);
    setResult(r);
    const under = (r.underlying || sym).toUpperCase();
    if (!r.contracts.length || !under) return;
    const manual = Number(spotInput) > 0 ? Number(spotInput) : undefined;
    setState((st) => {
      // 最多留 3 个标的，期权链很占空间
      const keep = Object.entries(st.chains).filter(([k]) => k !== under).sort((a, b) => b[1].importedAt.localeCompare(a[1].importedAt)).slice(0, 2);
      return { chains: { ...Object.fromEntries(keep), [under]: { contracts: r.contracts, importedAt: new Date().toISOString(), spot: manual } } };
    });
    setSymbol(under);
    setText('');
  };

  return (
    <Card>
      <span className="label" style={{ fontWeight: 600 }}>{t('opt.data')}</span>
      <h2 style={{ fontSize: 18, lineHeight: 1.35 }}>{t('chain.title')}</h2>
      <p className="body" style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
        {t('chain.body')}
      </p>
      <div className="row">
        <label className="field" style={{ flex: '1 1 120px' }}>
          <span>{t('chain.symbol')}</span>
          <input className="input" value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="NVDA" list="chain-syms" autoCapitalize="characters" />
          <datalist id="chain-syms">
            {[...new Set([...stored, ...held])].map((x) => (
              <option key={x} value={x} />
            ))}
          </datalist>
        </label>
        <label className="field" style={{ flex: '1 1 120px' }}>
          <span>{t('chain.spot')}</span>
          <input className="input" inputMode="decimal" value={spotInput} onChange={(e) => setSpotInput(e.target.value)} placeholder={spot ? spot.toFixed(2) : '—'} />
        </label>
      </div>
      <label className="field">
        <span>{t('chain.paste')}</span>
        <textarea className="input" style={{ minHeight: 110, fontFamily: 'ui-monospace, monospace', fontSize: 12 }} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Expiration,Strike,Type,Bid,Ask,Volume,Open Int,IV,Delta,Gamma'} />
      </label>
      <div className="row">
        <button className="btn small primary" disabled={!text.trim()} onClick={() => doImport(text)}>
          {t('chain.import')}
        </button>
        <label className="btn small" style={{ cursor: 'pointer' }}>
          {t('chain.file')}
          <input
            type="file"
            accept=".csv,.txt,.tsv,text/csv,text/plain"
            className="sr"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) doImport(await f.text());
              e.target.value = '';
            }}
          />
        </label>
        <button className="linkbtn" onClick={() => setShowHelp((v) => !v)} aria-expanded={showHelp}>
          {t('chain.formatLink')}
        </button>
      </div>
      {showHelp ? <div className="notice">{t('chain.formatHelp')}</div> : null}
      {result?.error ? <div className="banner bad">{t(`chain.err.${result.error}` as MsgKey)}</div> : null}
      {result && !result.error ? <div className="banner">{t('chain.imported', { n: result.contracts.length, skipped: result.skipped })}</div> : null}

      {chain ? (
        m ? (
          <>
            <div className="metrics">
              <Metric label={t('chain.m.iv')} value={m.atmIv != null ? `${m.atmIv}%` : '—'} sub={m.ivDte != null ? t('chain.m.ivSub', { n: m.ivDte }) : ''} />
              <Metric
                label={t('chain.m.em')}
                value={m.expectedMove != null ? `±${usd(m.expectedMove, 2)}` : '—'}
                sub={m.expectedMove != null ? t('chain.m.emSub', { pct: ((m.expectedMove / m.spot) * 100).toFixed(1), n: m.ivDte ?? 0 }) : ''}
              />
              <Metric label={t('chain.m.rv')} value={m.rv30 != null ? `${m.rv30}%` : '—'} sub={m.rv30 == null ? t('chain.m.rvNeed') : t('chain.m.rvSub')} />
              <Metric label={t('chain.m.pc')} value={m.putCallOi != null ? m.putCallOi.toFixed(2) : '—'} sub={t('chain.m.pcSub')} />
              <Metric label={t('chain.m.pain')} value={m.maxPain != null ? usd(m.maxPain, 2) : '—'} sub={t('chain.m.painSub')} />
              <Metric label={t('chain.m.skew')} value={m.volSkew != null ? `${m.volSkew > 0 ? '+' : ''}${m.volSkew}` : '—'} sub={t('chain.m.skewSub')} />
              <Metric label={t('chain.m.gex')} value={m.gex != null ? usd(m.gex) : '—'} sub={m.gex == null ? t('chain.m.gexNone') : t('chain.m.gexSub')} />
            </div>
            <p className="label" style={{ margin: 0, lineHeight: 1.6 }}>
              {t('chain.summary', { n: chain.contracts.length, e: expiries.length, first: expiries[0] ?? '—', last: expiries[expiries.length - 1] ?? '—', spot: usd(m.spot, 2), at: new Date(chain.importedAt).toLocaleDateString() })}
            </p>
            <div className="row">
              <button
                className="btn small"
                onClick={() =>
                  setState((st) => {
                    const next = { ...st.chains };
                    delete next[sym];
                    return { chains: next };
                  })
                }
              >
                {t('chain.clear')}
              </button>
            </div>
          </>
        ) : (
          <div className="notice">{t('chain.needSpot')}</div>
        )
      ) : null}
      <p className="label" style={{ margin: 0 }}>{t('chain.disclaimer')}</p>
    </Card>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="mini">
      <span className="label">{label}</span>
      <span className="mid">{value}</span>
      {sub ? <span className="label">{sub}</span> : null}
    </div>
  );
}
