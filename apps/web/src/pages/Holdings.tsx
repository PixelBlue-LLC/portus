import { useMemo, useRef, useState } from 'react';
import {
  accountNames,
  accountOf,
  applyImport,
  accountName,
  DEFAULT_ACCOUNT,
  joinList,
  mergeHoldings,
  nameIn,
  parseHoldingsCsv,
  parseHoldingsText,
  type CashByAccount,
  type Holding,
  type ImportMode,
  type ImportResult,
  type PortfolioView,
  type Position,
} from 'portus-core';
import { refreshMarket } from '../actions';
import type { Derived } from '../derived';
import { num, signedPct, usd } from '../format';
import { getLang, t } from '../i18n';
import { setState, updateSettings, type AppState } from '../store';
import { Card, ConcRow, Money, Pct } from '../ui';

const PALETTE = ['var(--accent)', 'color-mix(in srgb, var(--accent) 65%, var(--card))', 'var(--warn)', 'color-mix(in srgb, var(--muted) 80%, var(--card))', 'color-mix(in srgb, var(--muted) 50%, var(--card))', 'color-mix(in srgb, var(--muted) 30%, var(--card))'];

function allocation(view: PortfolioView) {
  const alloc = [...view.positions.slice(0, 5).map((p) => ({ label: p.noQuote ? (p.name ?? p.symbol).slice(0, 18) : p.symbol, w: p.weight }))];
  const others = view.positions.slice(5).reduce((sum, p) => sum + p.weight, 0);
  if (others > 0) alloc.push({ label: t('common.other'), w: Math.round(others * 10) / 10 });
  if (view.cash > 0) alloc.push({ label: t('common.cash'), w: Math.round((view.cash / view.totalValue) * 1000) / 10 });
  return alloc;
}

function priceNote(p: Position): string {
  if (p.priceSource === 'quote') return '';
  return p.priceSource === 'manual' ? t('hold.priceImport') : t('hold.priceCost');
}

/** 表格里的金额：两位小数、不带 $，和券商的持仓表一样 */
const n2 = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const signed2 = (v: number) => `${v < 0 ? '−' : '+'}${n2(Math.abs(v))}`;
const qtyText = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 4 });
/** 债券、期权等没有代码的行显示券商给的描述 */
const label = (p: Position) => (p.noQuote ? (p.name ?? p.symbol) : p.symbol);

function PnlCell({ v }: { v: number | null }) {
  if (v == null) return <td className="num muted">—</td>;
  return <td className={`num ${v < 0 ? 'neg' : v > 0 ? 'pos' : ''}`}>{signed2(v)}</td>;
}

/** 宽屏的持仓表：列和券商（IBKR 的 Your Holdings）对齐 */
function HoldingsTable({ positions, cash, showAccounts }: { positions: Position[]; cash: number; showAccounts: boolean }) {
  const lang = getLang();
  const sum = (f: (p: Position) => number) => positions.reduce((a, p) => a + f(p), 0);
  const quoted = positions.filter((p) => !p.noQuote);
  const dayTotal = quoted.length && quoted.every((p) => p.dayPnl != null) ? sum((p) => p.dayPnl ?? 0) : null;
  const total = sum((p) => p.marketValue) + cash;
  return (
    <div className="htable-wrap">
      <table className="htable">
        <thead>
          <tr>
            <th scope="col">{t('ht.instrument')}</th>
            <th scope="col" className="num">{t('ht.position')}</th>
            <th scope="col" className="num">{t('ht.last')}</th>
            <th scope="col" className="num">{t('ht.change')}</th>
            <th scope="col" className="num">{t('ht.costBasis')}</th>
            <th scope="col" className="num">{t('ht.mv')}</th>
            <th scope="col" className="num">{t('ht.avg')}</th>
            <th scope="col" className="num">{t('ht.daily')}</th>
            <th scope="col" className="num">{t('ht.unrealized')}</th>
            <th scope="col" className="num">{t('th.weight')}</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((p) => {
            const sub = p.noQuote
              ? t('ht.noQuote')
              : [nameIn(p.theme, lang), p.priceSource !== 'quote' ? priceNote(p) : '', showAccounts && p.accounts?.length ? p.accounts.map((a) => accountName(a, lang)).join(' + ') : '']
                  .filter(Boolean)
                  .join(' · ');
            return (
              <tr key={p.symbol}>
                <th scope="row">
                  <span className="sym" title={p.noQuote ? label(p) : p.name}>{label(p)}</span>
                  <span className="sub">{sub}</span>
                </th>
                <td className="num">{qtyText(p.qty)}</td>
                <td className="num">{n2(p.price)}</td>
                {p.dayPct != null ? <td className={`num ${p.dayPct < 0 ? 'neg' : p.dayPct > 0 ? 'pos' : ''}`}>{signedPct(p.dayPct)}</td> : <td className="num muted">—</td>}
                <td className="num">{n2(p.cost)}</td>
                <td className="num">{n2(p.marketValue)}</td>
                <td className="num">{n2(p.costBasis)}</td>
                <PnlCell v={p.dayPnl} />
                <PnlCell v={p.totalPnl} />
                <td className="num">{p.weight}%</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          {cash > 0 ? (
            <tr>
              <th scope="row">{t('common.cash')}</th>
              <td colSpan={4} />
              <td className="num">{n2(cash)}</td>
              <td colSpan={3} />
              <td className="num">{total ? ((cash / total) * 100).toFixed(1) : '0'}%</td>
            </tr>
          ) : null}
          <tr className="total">
            <th scope="row">{t('ht.total')}</th>
            <td colSpan={3} />
            <td className="num">{n2(sum((p) => p.cost))}</td>
            <td className="num">{n2(total)}</td>
            <td />
            <PnlCell v={dayTotal} />
            <PnlCell v={sum((p) => p.totalPnl)} />
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function PositionCard({ p, weightLabel, showAccounts }: { p: Position; weightLabel: string; showAccounts: boolean }) {
  const range = p.high52 && p.low52 && p.high52 > p.low52 ? ((p.price - p.low52) / (p.high52 - p.low52)) * 100 : null;
  return (
    <Card>
      <div className="card-head" style={{ alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 17, fontWeight: 700, overflowWrap: 'anywhere' }}>{label(p)}</span>
          <span className="label">
            {nameIn(p.theme, getLang())} · {weightLabel} {p.weight}%
            {showAccounts && p.accounts?.length ? ` · ${p.accounts.map((a) => accountName(a, getLang())).join(' + ')}` : ''}
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end' }}>
          <span style={{ fontSize: 17, fontWeight: 700 }}>${num(p.price)}</span>
          <span style={{ fontSize: 13, fontWeight: 600 }}>
            {p.dayPct != null ? (
              <>
                {t('common.today')} <Pct v={p.dayPct} /> · <Money v={p.dayPnl} digits={2} />
              </>
            ) : (
              <span className="muted">{p.noQuote ? t('ht.noQuote') : priceNote(p)}</span>
            )}
          </span>
        </div>
      </div>
      <div className="tiles" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', fontSize: 13 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="label">{t('hold.qtyCost')}</span>
          <span>{t('hold.sharesAt', { q: qtyText(p.qty), c: n2(p.costBasis) })}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="label">{t('col.mv')}</span>
          <span>{usd(p.marketValue, 2)}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="label">{t('ht.unrealized')}</span>
          <span style={{ fontWeight: 600 }}>
            <Money v={p.totalPnl} digits={2} />
            {p.totalPct != null ? <span className={p.totalPnl < 0 ? 'neg' : 'pos'}> · {signedPct(p.totalPct, 1)}</span> : null}
          </span>
        </div>
      </div>
      {range != null ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div className="bar" style={{ height: 4 }} role="img" aria-label={t('hold.rangeAria', { n: Math.round(range) })}>
            <b style={{ left: `calc(${Math.max(0, Math.min(100, range))}% - 6px)`, top: -4, width: 12, height: 12, borderRadius: 6 }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }} className="muted">
            <span>{t('hold.low52', { v: num(p.low52!) })}</span>
            <span>{t('hold.high52', { v: num(p.high52!) })}</span>
          </div>
        </div>
      ) : null}
    </Card>
  );
}

export function Holdings({ s, d }: { s: AppState; d: Derived }) {
  const { view } = d;
  if (!view.positions.length && !view.cash) return <HoldingsEditor s={s} />;
  const alloc = allocation(view);
  const overN = d.over.length;
  const multi = d.accounts.length > 1;
  const split = multi && s.settings.accountView === 'split';

  return (
    <>
      <header className="page-head">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="title">{t('nav.holdings')}</span>
          <span className="label">
            {t('hold.count', { n: view.positions.length })}
            {multi ? t('hold.accountsN', { n: d.accounts.length }) : ''}
            {t('hold.priceSrc', { s: d.hasQuotes ? t('hold.srcQuotes') : t('hold.srcNone') })}
          </span>
        </div>
        <a className="btn" href="#/holdings/edit">
          {t('hold.edit')}
        </a>
      </header>

      {multi ? (
        <div className="seg" role="group" aria-label={t('hold.viewAria')} style={{ margin: '0 6px' }}>
          <button className={!split ? 'on' : ''} aria-pressed={!split} onClick={() => updateSettings({ accountView: 'merged' })}>
            {t('hold.merged')}
          </button>
          <button className={split ? 'on' : ''} aria-pressed={split} onClick={() => updateSettings({ accountView: 'split' })}>
            {t('hold.split')}
          </button>
        </div>
      ) : null}

      <Card>
        <div className="tiles" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span className="label">{t('common.totalValue')}</span>
            <span className="mid" style={{ fontSize: 19 }}>{usd(view.totalValue, 2)}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span className="label">{t('ht.daily')}</span>
            <span className="mid" style={{ fontSize: 19 }}><Money v={view.dayPnl} digits={2} /></span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span className="label">{t('ht.unrealized')}</span>
            <span className="mid" style={{ fontSize: 19 }}><Money v={view.totalPnl} digits={2} /></span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className="label">
            {t('hold.alloc')}
            {multi ? t('hold.allocAll') : ''}
          </span>
          <div className="stack" style={{ height: 12 }} aria-hidden="true">
            {alloc.map((a, i) => (
              <div key={a.label} style={{ flex: a.w, background: PALETTE[i % PALETTE.length] }} />
            ))}
          </div>
          <div className="legend">
            {alloc.map((a, i) => (
              <span key={a.label}>
                <i style={{ background: PALETTE[i % PALETTE.length] }} />
                {a.label} {a.w}%
              </span>
            ))}
          </div>
        </div>
      </Card>

      <div className="desktop-only col">
        {split ? (
          d.byAccount.map(({ name, view: av }) => (
            <Card key={name}>
              <div className="acct-head">
                <span style={{ fontWeight: 700 }}>{accountName(name, getLang())}</span>
                <span className="label">
                  {t('hold.acctLine', {
                    v: usd(av.totalValue, 2),
                    p: view.totalValue ? ((av.totalValue / view.totalValue) * 100).toFixed(1) : '0',
                    c: usd(av.cash, 2),
                  })}
                </span>
              </div>
              <HoldingsTable positions={av.positions} cash={av.cash} showAccounts={false} />
            </Card>
          ))
        ) : (
          <Card>
            <HoldingsTable positions={view.positions} cash={view.cash} showAccounts={multi} />
          </Card>
        )}
      </div>

      <div className="grid2">
        <div className="col mobile-only">
          {split
            ? d.byAccount.map(({ name, view: av }) => (
                <div key={name} className="col">
                  <div className="acct-head">
                    <span style={{ fontWeight: 700 }}>{accountName(name, getLang())}</span>
                    <span className="label">
                      {t('hold.acctLine', {
                        v: usd(av.totalValue),
                        p: view.totalValue ? ((av.totalValue / view.totalValue) * 100).toFixed(1) : '0',
                        c: usd(av.cash),
                      })}
                    </span>
                  </div>
                  {av.positions.map((p) => (
                    <PositionCard key={name + p.symbol} p={p} weightLabel={t('hold.ofAccount')} showAccounts={false} />
                  ))}
                </div>
              ))
            : view.positions.map((p) => <PositionCard key={p.symbol} p={p} weightLabel={t('th.weight')} showAccounts={multi} />)}
        </div>
        <div className="col">
          <Card>
            <div className="card-head">
              <h2>{t('hold.conc')}</h2>
              <span className="label" style={{ color: overN ? 'var(--warn-text)' : undefined, fontWeight: 600 }}>
                {t('hold.concCount', { o: overN, k: d.concentration.length - overN })}
              </span>
            </div>
            {d.concentration.map((c) => (
              <ConcRow key={c.type + c.label} c={c} />
            ))}
            <span className="label">
              {multi ? t('hold.concMulti') : ''}
              {t('hold.concNote')}
            </span>
          </Card>
          <div className="notice">
            {t('ht.note')}
            {view.positions.some((p) => p.noQuote) ? <> {t('ht.noteNoQuote')}</> : null}
          </div>
        </div>
      </div>
    </>
  );
}

// ---------------- 录入 / 导入 ----------------

/**
 * 一行持仓。成本可以按每股填，也可以按总成本填（券商导出的 Cost Basis 一般是总成本）；
 * basis 记住用户最后改的是哪一个，保存时以它为准，避免来回换算丢精度。
 */
type Row = { symbol: string; qty: string; cost: string; total: string; basis: 'cost' | 'total'; account: string; manualPrice?: number; name?: string; noQuote?: boolean };
const fmt2 = (v: number) => (Number.isFinite(v) && v ? String(Math.round(v * 100) / 100) : '');
const toRow = (h: Holding): Row => ({
  symbol: h.symbol,
  qty: String(h.qty),
  cost: fmt2(h.costBasis),
  total: fmt2(h.costBasis * h.qty),
  basis: 'total',
  account: accountOf(h),
  ...(h.manualPrice ? { manualPrice: h.manualPrice } : {}),
  ...(h.name ? { name: h.name } : {}),
  ...(h.noQuote ? { noQuote: true } : {}),
});
const blank = (account: string): Row => ({ symbol: '', qty: '', cost: '', total: '', basis: 'cost', account });

function rowCostPerShare(r: Row): number {
  const qty = Number(r.qty);
  if (r.basis === 'total') return qty > 0 ? (Number(r.total) || 0) / qty : 0;
  return Number(r.cost) || 0;
}

function rowsToHoldings(rs: Row[]): Holding[] {
  return rs
    .filter((r) => r.symbol.trim() && Number(r.qty) > 0)
    .map((r) => ({
      symbol: r.noQuote ? r.symbol.trim() : r.symbol.trim().toUpperCase(),
      qty: Number(r.qty),
      costBasis: rowCostPerShare(r),
      account: r.account,
      ...(r.manualPrice ? { manualPrice: r.manualPrice } : {}),
      ...(r.name ? { name: r.name } : {}),
      ...(r.noQuote ? { noQuote: true } : {}),
    }));
}

type Pending = ImportResult & { source: 'csv' | 'paste' };

export function HoldingsEditor({ s }: { s: AppState }) {
  // 示例数据不带进录入页：用户录的是自己的持仓
  const startHoldings = s.isSample ? [] : s.holdings;
  const startCash = s.isSample ? {} : s.cashByAccount;
  const startAccounts = accountNames(startHoldings, startCash);
  const [rows, setRows] = useState<Row[]>(() => startHoldings.map(toRow));
  const [cash, setCash] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(startCash).map(([a, v]) => [a, String(v)])));
  const [extraAccounts, setExtraAccounts] = useState<string[]>([]);
  const [acct, setAcct] = useState(startAccounts[0] ?? DEFAULT_ACCOUNT);
  const [paste, setPaste] = useState('');
  const [msg, setMsg] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);
  const [wasSample, setWasSample] = useState(!!s.isSample);
  const fileRef = useRef<HTMLInputElement>(null);

  const workingHoldings = rowsToHoldings(rows);
  const workingCash: CashByAccount = Object.fromEntries(Object.entries(cash).filter(([, v]) => Number(v) > 0).map(([a, v]) => [a, Number(v)]));
  const accounts = useMemo(() => {
    const names = accountNames(workingHoldings, workingCash);
    for (const a of [...extraAccounts, acct]) if (!names.includes(a)) names.push(a);
    return names;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, cash, extraAccounts, acct]);

  const visible = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.account === acct);
  const setCell = (i: number, k: 'symbol' | 'qty' | 'cost' | 'total', v: string) =>
    setRows((rs) =>
      rs.map((r, j) => {
        if (j !== i) return r;
        const next = { ...r, [k]: v };
        const qty = Number(next.qty);
        // 改每股就算总成本，改总成本就算每股；改数量时保持用户上次填的那一个不变
        if (k === 'cost') return { ...next, basis: 'cost', total: qty > 0 ? fmt2(Number(v) * qty) : next.total };
        if (k === 'total') return { ...next, basis: 'total', cost: qty > 0 ? fmt2(Number(v) / qty) : next.cost };
        if (k === 'qty') return next.basis === 'total' ? { ...next, cost: qty > 0 ? fmt2(Number(next.total) / qty) : next.cost } : { ...next, total: fmt2(Number(next.cost) * qty) };
        return next;
      }),
    );
  const priceOf = (r: Row) => s.market.quotes[r.symbol.trim().toUpperCase()]?.price ?? r.manualPrice;
  const acctTotals = visible.reduce(
    (t, { r }) => {
      const qty = Number(r.qty) || 0;
      const p = priceOf(r);
      return { cost: t.cost + rowCostPerShare(r) * qty, mv: t.mv + (p ? p * qty : 0), missing: t.missing || (!p && qty > 0) };
    },
    { cost: 0, mv: 0, missing: false },
  );

  const addAccount = () => {
    const name = prompt(t('edit.acctPrompt'))?.trim();
    if (!name) return;
    if (!accounts.includes(name)) setExtraAccounts((xs) => [...xs, name]);
    setAcct(name);
  };
  const removeAccount = () => {
    if (!confirm(t('edit.removeConfirm', { a: accountName(acct, getLang()) }))) return;
    setRows((rs) => rs.filter((r) => r.account !== acct));
    setCash((c) => {
      const { [acct]: _gone, ...rest } = c;
      return rest;
    });
    setExtraAccounts((xs) => xs.filter((x) => x !== acct));
    const left = accounts.filter((a) => a !== acct);
    setAcct(left[0] ?? DEFAULT_ACCOUNT);
  };

  const startImport = (r: ImportResult, source: Pending['source']) => {
    if (!r.holdings.length) {
      setMsg(r.skipped[0] ?? t('edit.noneFound'));
      return;
    }
    setMsg('');
    setPending({ ...r, source });
  };

  const save = () => {
    setState({ holdings: workingHoldings, cashByAccount: workingCash, attribution: undefined, isSample: false });
    location.hash = '#/';
    if (s.settings.finnhubKey) void refreshMarket();
  };

  return (
    <>
      <header className="page-head">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="title">{t('edit.title')}</span>
          <span className="label">{t('edit.sub')}</span>
        </div>
        <button className="btn primary" onClick={save}>
          {t('edit.save')}
        </button>
      </header>

      {pending ? (
        <ImportDialog
          pending={pending}
          current={{ holdings: workingHoldings, cash: workingCash }}
          wasSample={wasSample}
          defaultAccount={pending.broker ?? (pending.source === 'paste' ? acct : accounts.length === 1 && !workingHoldings.length ? accounts[0]! : '')}
          accountView={s.settings.accountView}
          onCancel={() => setPending(null)}
          onConfirm={(applied, account, view) => {
            setRows(applied.holdings.map(toRow));
            setCash(Object.fromEntries(Object.entries(applied.cash).map(([a, v]) => [a, String(v)])));
            setExtraAccounts([]);
            setAcct(account);
            setWasSample(false);
            if (view) updateSettings({ accountView: view });
            const sk = pending.skipped;
            const skip = sk.length ? t('edit.skipped', { n: sk.length, list: joinList(sk.slice(0, 3), getLang()) + (sk.length > 3 ? '…' : '') }) : '';
            setMsg(t('edit.imported', { n: pending.holdings.length, a: accountName(account, getLang()), skip }));
            setPending(null);
          }}
        />
      ) : null}

      <Card>
        <div className="card-head">
          <div className="chips-row" role="tablist" aria-label={t('edit.acctTabs')}>
            {accounts.map((a) => (
              <button key={a} role="tab" aria-selected={a === acct} className={`acct-chip ${a === acct ? 'on' : ''}`} onClick={() => setAcct(a)}>
                {accountName(a, getLang())}
              </button>
            ))}
            <button className="acct-chip add" onClick={addAccount}>
              {t('edit.addAcct')}
            </button>
          </div>
          {accounts.length > 1 ? (
            <button className="btn small" onClick={removeAccount}>
              {t('edit.delAcct')}
            </button>
          ) : null}
        </div>
        <div className="edit-list">
          <div className="edit-row edit-head">
            <span>{t('col.symbol')}</span>
            <span>{t('col.qty')}</span>
            <span>{t('col.cost')}</span>
            <span>{t('col.total')}</span>
            <span>{t('col.mv')}</span>
            <span />
          </div>
          {visible.map(({ r, i }) => (
            <div className="edit-row" key={i}>
              <label className="cell"><span className="cell-label">{t('col.symbol')}</span><input className="input" value={r.symbol} placeholder="AAPL" onChange={(e) => setCell(i, 'symbol', e.target.value)} /></label>
              <label className="cell"><span className="cell-label">{t('col.qty')}</span><input className="input" inputMode="decimal" value={r.qty} placeholder="10" onChange={(e) => setCell(i, 'qty', e.target.value)} /></label>
              <label className="cell"><span className="cell-label">{t('col.cost')}</span><input className="input" inputMode="decimal" value={r.cost} placeholder="150" onChange={(e) => setCell(i, 'cost', e.target.value)} /></label>
              <label className="cell"><span className="cell-label">{t('col.total')}</span><input className="input" inputMode="decimal" value={r.total} placeholder="1500" onChange={(e) => setCell(i, 'total', e.target.value)} /></label>
              <span className="cell mv" title={r.name}>
                <span className="cell-label">{t('col.mv')}</span>
                <span>{priceOf(r) && Number(r.qty) > 0 ? usd(priceOf(r)! * Number(r.qty), 2) : '—'}</span>
                {r.name ? <span className="cell-name">{r.name}</span> : null}
              </span>
              <button className="btn icon small del" aria-label={t('edit.delRow', { s: r.symbol || t('edit.thisRow') })} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>
                ×
              </button>
            </div>
          ))}
          {!visible.length ? <span className="label">{t('edit.emptyAcct', { a: accountName(acct, getLang()) })}</span> : null}
          {visible.length ? (
            <div className="edit-total">
              {t('edit.totals', { a: accountName(acct, getLang()), c: usd(acctTotals.cost, 2), m: acctTotals.mv ? usd(acctTotals.mv, 2) : '—' })}
              {acctTotals.mv ? (
                <>
                  {t('edit.unreal')}
                  <Money v={acctTotals.mv - acctTotals.cost} digits={2} />
                </>
              ) : null}
              {Number(cash[acct]) > 0 ? t('edit.withCash', { v: usd(acctTotals.mv + Number(cash[acct]), 2) }) : null}
              {acctTotals.missing ? <span className="label">{t('edit.missing')}</span> : null}
            </div>
          ) : null}
        </div>
        <div className="row">
          <button className="btn small" onClick={() => setRows((rs) => [...rs, blank(acct)])}>
            {t('edit.addRow')}
          </button>
          <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <span>{t('edit.cashLabel', { a: accountName(acct, getLang()) })}</span>
            <input className="input" style={{ width: 140 }} inputMode="decimal" value={cash[acct] ?? ''} placeholder="0" onChange={(e) => setCash((c) => ({ ...c, [acct]: e.target.value }))} />
          </label>
        </div>
      </Card>

      <div className="grid2">
        <Card>
          <h2>{t('imp.csvTitle')}</h2>
          <p className="body" style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
            {t('imp.csvBody')}
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv,text/plain"
            className="sr"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              startImport(parseHoldingsCsv(await f.text(), getLang()), 'csv');
              e.target.value = '';
            }}
          />
          <button className="btn" onClick={() => fileRef.current?.click()}>
            {t('imp.choose')}
          </button>
        </Card>
        <Card>
          <h2>{t('imp.pasteTitle')}</h2>
          <label className="field">
            <span>{t('imp.pasteHint')}</span>
            <textarea className="input" value={paste} placeholder={'NVDA 30 92\nAAPL 20 150'} onChange={(e) => setPaste(e.target.value)} />
          </label>
          <button
            className="btn"
            disabled={!paste.trim()}
            onClick={() => {
              startImport(parseHoldingsText(paste), 'paste');
              setPaste('');
            }}
          >
            {t('imp.parse')}
          </button>
        </Card>
      </div>
      {msg ? <div className="banner">{msg}</div> : null}
    </>
  );
}

function ImportDialog({
  pending,
  current,
  wasSample,
  defaultAccount,
  accountView,
  onCancel,
  onConfirm,
}: {
  pending: Pending;
  current: { holdings: Holding[]; cash: CashByAccount };
  wasSample: boolean;
  defaultAccount: string;
  accountView: 'merged' | 'split';
  onCancel: () => void;
  onConfirm: (applied: { holdings: Holding[]; cash: CashByAccount }, account: string, view?: 'merged' | 'split') => void;
}) {
  const existing = accountNames(current.holdings, current.cash);
  const hasReal = !wasSample && current.holdings.length > 0;
  const [mode, setMode] = useState<ImportMode>('add');
  const [account, setAccount] = useState(defaultAccount);
  const [view, setView] = useState(accountView);
  const name = account.trim();

  const preview = name ? applyImport(current, pending, { mode, account: name, wasSample }) : null;
  const resultAccounts = preview ? accountNames(preview.holdings, preview.cash) : [];
  const updatesExisting = hasReal && mode === 'add' && existing.includes(name) && current.holdings.some((h) => accountOf(h) === name);
  // 只有粘贴进当前账户时才按代码合并；CSV 是整个账户的快照，直接替换这个账户
  const applied = preview && pending.source === 'paste' && hasReal && mode === 'add' && updatesExisting
    ? { holdings: mergeHoldings(current.holdings, pending.holdings.map((h) => ({ ...h, account: name }))), cash: preview.cash }
    : preview;

  return (
    <div className="card import-dialog" role="dialog" aria-label={t('dlg.aria')}>
      <h2>{t('dlg.found', { n: pending.holdings.length, cash: pending.cash != null ? t('dlg.cash', { v: usd(pending.cash) }) : '' })}</h2>
      {wasSample ? <span className="label">{t('dlg.sampleGone')}</span> : null}

      <label className="field">
        <span>{t('dlg.whichAcct')}</span>
        <input className="input" list="acct-list" value={account} placeholder={t('dlg.acctPh')} onChange={(e) => setAccount(e.target.value)} />
        <datalist id="acct-list">
          {existing.map((a) => (
            <option key={a} value={a} />
          ))}
        </datalist>
        {pending.broker && pending.broker === name ? <span className="label">{t('dlg.detected', { b: pending.broker })}</span> : null}
      </label>

      {hasReal ? (
        <fieldset className="choice">
          <legend>{t('dlg.existing', { n: current.holdings.length, list: joinList(existing.map((a) => accountName(a, getLang())), getLang()) })}</legend>
          <label>
            <input type="radio" name="mode" checked={mode === 'add'} onChange={() => setMode('add')} />
            <span>
              {t('dlg.add')}
              {updatesExisting ? (
                <em>{t(pending.source === 'csv' ? 'dlg.updCsv' : 'dlg.updPaste', { a: accountName(name, getLang()) })}</em>
              ) : (
                <em>{t('dlg.newAcct', { a: name || '…' })}</em>
              )}
            </span>
          </label>
          <label>
            <input type="radio" name="mode" checked={mode === 'replace'} onChange={() => setMode('replace')} />
            <span>
              {t('dlg.replace')}
            </span>
          </label>
        </fieldset>
      ) : null}

      {resultAccounts.length > 1 ? (
        <fieldset className="choice">
          <legend>{t('dlg.viewQ', { n: resultAccounts.length })}</legend>
          <label>
            <input type="radio" name="view" checked={view === 'merged'} onChange={() => setView('merged')} />
            <span>
              {t('hold.merged')}
              <em>{t('dlg.mergedDesc')}</em>
            </span>
          </label>
          <label>
            <input type="radio" name="view" checked={view === 'split'} onChange={() => setView('split')} />
            <span>
              {t('hold.split')}
              <em>{t('dlg.splitDesc')}</em>
            </span>
          </label>
          <span className="label">{t('dlg.riskNote')}</span>
        </fieldset>
      ) : null}

      <div className="row">
        <button className="btn primary" disabled={!applied} onClick={() => applied && onConfirm(applied, name, resultAccounts.length > 1 ? view : undefined)}>
          {t('dlg.confirm')}
        </button>
        <button className="btn" onClick={onCancel}>
          {t('common.cancel')}
        </button>
      </div>
    </div>
  );
}
