import { useState } from 'react';
import {
  accountName,
  ALERT_TYPES,
  describeAlert,
  nameIn,
  overdueTranches,
  planSummary,
  staleDayOrders,
  type AlertRule,
  type AlertType,
  type Plan,
  type Tranche,
  type TrancheStatus,
} from 'portus-core';
import { todayLocal } from '../actions';
import type { Derived } from '../derived';
import { signedPct, usd } from '../format';
import { getLang, t, type MsgKey } from '../i18n';
import { newId, setState, type AppState } from '../store';
import { Card } from '../ui';

const STATUSES: TrancheStatus[] = ['planned', 'placed', 'filled', 'cancelled'];

/** 有些规则必须填代码，有些可以留空表示「任意持仓」 */
const NEEDS_SYMBOL: Record<AlertType, 'required' | 'optional' | 'none'> = {
  price_below: 'required',
  price_above: 'required',
  day_move: 'optional',
  loss_from_cost: 'optional',
  weight_above: 'required',
  sector_above: 'none',
};

export function Plans({ s, d }: { s: AppState; d: Derived }) {
  return (
    <>
      <header className="page-head">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="title">{t('nav.plans')}</span>
          <span className="label">{t('plans.sub')}</span>
        </div>
      </header>
      <AlertsCard s={s} d={d} />
      <PlansSection s={s} d={d} />
    </>
  );
}

// ---------- 提醒 ----------

function AlertsCard({ s, d }: { s: AppState; d: Derived }) {
  const lang = getLang();
  const [type, setType] = useState<AlertType>('price_below');
  const [symbol, setSymbol] = useState('');
  const [sector, setSector] = useState('');
  const [value, setValue] = useState('');
  const [err, setErr] = useState('');
  const sectors = [...new Set(d.view.positions.map((p) => p.sector))];
  const need = NEEDS_SYMBOL[type];
  const unit = type === 'price_below' || type === 'price_above' ? '$' : '%';
  const hitIds = new Set(d.alertHits.map((h) => h.id));

  const add = () => {
    const v = Number(value);
    const sym = symbol.trim().toUpperCase();
    if (!(v > 0)) return setErr(t('alerts.errValue'));
    if (need === 'required' && !/^[A-Z][A-Z0-9.\-]{0,9}$/.test(sym)) return setErr(t('alerts.errSymbol'));
    const id = newId('a');
    let rule: AlertRule;
    if (type === 'sector_above') rule = { id, type, value: v, ...(sector ? { sector } : {}) };
    else if (type === 'day_move' || type === 'loss_from_cost') rule = { id, type, value: v, ...(sym ? { symbol: sym } : {}) };
    else rule = { id, type, symbol: sym, value: v };
    setState((st) => ({ alerts: [...st.alerts, rule] }));
    setSymbol('');
    setValue('');
    setErr('');
  };

  return (
    <Card>
      <div className="card-head">
        <h2>{t('alerts.title')}</h2>
        <span className="label" style={{ color: d.alertHits.length ? 'var(--warn-text)' : undefined, fontWeight: 600 }}>
          {s.alerts.length ? (d.alertHits.length ? t('alerts.hitN', { n: d.alertHits.length }) : t('alerts.none')) : ''}
        </span>
      </div>
      <p className="body" style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
        {t('alerts.body')}
      </p>
      {d.alertHits.length ? (
        <ul className="list hits" style={{ fontSize: 14 }}>
          {d.alertHits.map((h) => (
            <li key={h.id + h.subject}>{h.text}</li>
          ))}
        </ul>
      ) : null}
      {s.alerts.length ? (
        <div className="rule-list">
          {s.alerts.map((a) => (
            <div key={a.id} className="rule-row">
              <span className={hitIds.has(a.id) ? 'warn-dot' : 'ok-dot'} aria-hidden="true" />
              <span style={{ flex: 1 }}>
                {describeAlert(a, lang)}
                <span className="sr">{hitIds.has(a.id) ? t('alerts.srHit') : t('alerts.srOk')}</span>
              </span>
              <button className="linkbtn" onClick={() => setState((st) => ({ alerts: st.alerts.filter((x) => x.id !== a.id) }))} aria-label={t('alerts.removeAria', { r: describeAlert(a, lang) })}>
                {t('common.remove')}
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <form
        className="alert-form"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <label className="field">
          <span>{t('alerts.when')}</span>
          <select className="input" value={type} onChange={(e) => setType(e.target.value as AlertType)}>
            {ALERT_TYPES.map((x) => (
              <option key={x} value={x}>
                {t(`alerts.type.${x}` as MsgKey)}
              </option>
            ))}
          </select>
        </label>
        {need !== 'none' ? (
          <label className="field">
            <span>{need === 'optional' ? t('alerts.symbolOpt') : t('alerts.symbol')}</span>
            <input className="input" value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="NVDA" autoCapitalize="characters" />
          </label>
        ) : (
          <label className="field">
            <span>{t('alerts.sector')}</span>
            <select className="input" value={sector} onChange={(e) => setSector(e.target.value)}>
              <option value="">{t('alerts.anySector')}</option>
              {sectors.map((x) => (
                <option key={x} value={x}>
                  {nameIn(x, lang)}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="field">
          <span>{t('alerts.value', { unit })}</span>
          <input className="input" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder={unit === '$' ? '150' : '10'} />
        </label>
        <button className="btn" type="submit" style={{ alignSelf: 'end' }}>
          {t('alerts.add')}
        </button>
      </form>
      {err ? <span className="neg" style={{ fontSize: 13 }} role="alert">{err}</span> : null}
      <p className="label" style={{ margin: 0 }}>{t('alerts.note')}</p>
    </Card>
  );
}

// ---------- 分批计划 ----------

function priceOf(sym: string, s: AppState, d: Derived): number | null {
  const q = s.market.quotes[sym];
  if (q?.price) return q.price;
  const p = d.view.positions.find((x) => x.symbol === sym);
  return p && p.priceSource !== 'cost' ? p.price : null;
}

function updatePlan(id: string, fn: (p: Plan) => Plan) {
  setState((st) => ({ plans: st.plans.map((p) => (p.id === id ? fn(p) : p)) }));
}

function PlansSection({ s, d }: { s: AppState; d: Derived }) {
  const lang = getLang();
  const [symbol, setSymbol] = useState('');
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [account, setAccount] = useState('');
  const [note, setNote] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const active = s.plans.filter((p) => !p.archived);
  const archived = s.plans.filter((p) => p.archived);

  return (
    <>
      <section className="sec">
        <h2>{t('plan.title')}</h2>
        <p className="lead" style={{ fontSize: 14 }}>
          {t('plan.body')}
        </p>
      </section>
      {active.map((p) => (
        <PlanCard key={p.id} plan={p} price={priceOf(p.symbol, s, d)} />
      ))}
      <Card>
        <h2>{t('plan.new')}</h2>
        <form
          className="alert-form"
          onSubmit={(e) => {
            e.preventDefault();
            const sym = symbol.trim().toUpperCase();
            if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(sym)) return;
            const plan: Plan = {
              id: newId('p'),
              symbol: sym,
              side,
              account: account || undefined,
              note: note.trim() || undefined,
              createdAt: todayLocal(),
              tranches: [{ id: newId('t'), status: 'planned', date: todayLocal() }],
            };
            setState((st) => ({ plans: [...st.plans, plan] }));
            setSymbol('');
            setNote('');
          }}
        >
          <label className="field">
            <span>{t('alerts.symbol')}</span>
            <input className="input" value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="XLV" autoCapitalize="characters" required />
          </label>
          <label className="field">
            <span>{t('plan.side')}</span>
            <select className="input" value={side} onChange={(e) => setSide(e.target.value as 'buy' | 'sell')}>
              <option value="buy">{t('plan.buy')}</option>
              <option value="sell">{t('plan.sell')}</option>
            </select>
          </label>
          <label className="field">
            <span>{t('plan.account')}</span>
            <select className="input" value={account} onChange={(e) => setAccount(e.target.value)}>
              <option value="">—</option>
              {d.accounts.map((a) => (
                <option key={a} value={a}>
                  {accountName(a, lang)}
                </option>
              ))}
            </select>
          </label>
          <label className="field" style={{ gridColumn: '1 / -1' }}>
            <span>{t('plan.note')}</span>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('plan.notePh')} />
          </label>
          <button className="btn primary" type="submit">
            {t('plan.create')}
          </button>
        </form>
      </Card>
      {archived.length ? (
        <Card>
          <button className="linkbtn" onClick={() => setShowArchived((v) => !v)} aria-expanded={showArchived}>
            {t('plan.archivedN', { n: archived.length })}
          </button>
          {showArchived
            ? archived.map((p) => (
                <div key={p.id} className="rule-row">
                  <span style={{ flex: 1 }}>
                    {p.symbol} · {t(p.side === 'buy' ? 'plan.buy' : 'plan.sell')} · {p.createdAt}
                  </span>
                  <button className="linkbtn" onClick={() => updatePlan(p.id, (x) => ({ ...x, archived: false }))}>
                    {t('plan.restore')}
                  </button>
                  <button className="linkbtn neg" onClick={() => setState((st) => ({ plans: st.plans.filter((x) => x.id !== p.id) }))}>
                    {t('common.delete')}
                  </button>
                </div>
              ))
            : null}
        </Card>
      ) : null}
    </>
  );
}

function PlanCard({ plan, price }: { plan: Plan; price: number | null }) {
  const lang = getLang();
  const sum = planSummary(plan, price);
  const today = todayLocal();
  const overdue = overdueTranches(plan, today);
  const stale = staleDayOrders(plan, today);
  const setTranche = (id: string, patch: Partial<Tranche>) => updatePlan(plan.id, (p) => ({ ...p, tranches: p.tranches.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
  const num = (v: string) => (v.trim() === '' ? undefined : Number(v) > 0 ? Number(v) : undefined);

  return (
    <Card>
      <div className="card-head">
        <h2>
          {plan.symbol} · {t(plan.side === 'buy' ? 'plan.buy' : 'plan.sell')}
          {plan.account ? <span className="label" style={{ fontWeight: 400 }}> · {accountName(plan.account, lang)}</span> : null}
        </h2>
        <span className="label">{price ? t('plan.price', { p: usd(price, 2) }) : t('plan.noPrice')}</span>
      </div>
      {plan.note ? <p className="body" style={{ margin: 0, fontSize: 14 }}>{plan.note}</p> : null}

      <div className="tiles">
        <div className="mini">
          <span className="label">{t('plan.planned')}</span>
          <span className="mid">{usd(sum.plannedAmount)}</span>
        </div>
        <div className="mini">
          <span className="label">{t('plan.filled')}</span>
          <span className="mid">{usd(sum.filledAmount)}</span>
          <span className="label">{t('plan.progress', { pct: sum.progressPct })}</span>
        </div>
        <div className="mini">
          <span className="label">{t('plan.avg')}</span>
          <span className="mid">{sum.avgFill != null ? usd(sum.avgFill, 2) : '—'}</span>
          {sum.vsPricePct != null ? <span className="label">{t('plan.vsPrice', { pct: signedPct(sum.vsPricePct) })}</span> : null}
        </div>
        <div className="mini">
          <span className="label">{t('plan.open')}</span>
          <span className="mid">{sum.openOrders.length}</span>
          {sum.next ? <span className="label">{t('plan.next', { d: sum.next.date ?? '—' })}</span> : null}
        </div>
      </div>
      <div className="bar" role="img" aria-label={t('plan.progress', { pct: sum.progressPct })}>
        <i style={{ width: `${Math.min(100, sum.progressPct)}%`, background: 'var(--ok-bar)' }} />
      </div>

      {sum.openOrders.length ? (
        <ul className="list" style={{ fontSize: 14 }}>
          {sum.openOrders.map((o) => (
            <li key={o.id}>
              {o.distancePct == null
                ? t('plan.orderNoPrice', { limit: usd(o.limit, 2) })
                : t(plan.side === 'buy' ? 'plan.orderBuy' : 'plan.orderSell', { limit: usd(o.limit, 2), pct: Math.abs(o.distancePct).toFixed(1), dir: t(o.distancePct >= 0 ? 'plan.above' : 'plan.below') })}
              {o.tif === 'gtc' ? ` · ${t('plan.gtc')}` : o.tif === 'day' ? ` · ${t('plan.day')}` : ''}
            </li>
          ))}
        </ul>
      ) : null}
      {overdue.length ? <div className="banner">{t('plan.overdue', { n: overdue.length })}</div> : null}
      {stale.length ? <div className="banner">{t('plan.staleDay', { n: stale.length })}</div> : null}

      <div className="tranches" role="table" aria-label={t('plan.tranches')}>
        <div className="tranche head" role="row">
          <span role="columnheader">{t('plan.col.date')}</span>
          <span role="columnheader">{t('plan.col.amount')}</span>
          <span role="columnheader">{t('plan.col.limit')}</span>
          <span role="columnheader">{t('plan.col.status')}</span>
          <span role="columnheader">{t('plan.col.fill')}</span>
          <span />
        </div>
        {plan.tranches.map((tr, i) => (
          <div className="tranche" role="row" key={tr.id}>
            <input className="input" type="date" value={tr.date ?? ''} onChange={(e) => setTranche(tr.id, { date: e.target.value || undefined })} aria-label={t('plan.aria.date', { n: i + 1 })} />
            <input
              className="input"
              inputMode="decimal"
              value={tr.amount ?? ''}
              onChange={(e) => setTranche(tr.id, { amount: num(e.target.value) })}
              placeholder="$"
              aria-label={t('plan.aria.amount', { n: i + 1 })}
            />
            <div className="row" style={{ flexWrap: 'nowrap', gap: 4 }}>
              <input
                className="input"
                inputMode="decimal"
                value={tr.limit ?? ''}
                onChange={(e) => setTranche(tr.id, { limit: num(e.target.value) })}
                placeholder={t('plan.market')}
                aria-label={t('plan.aria.limit', { n: i + 1 })}
              />
              <select className="input" value={tr.tif ?? 'day'} onChange={(e) => setTranche(tr.id, { tif: e.target.value as 'day' | 'gtc' })} aria-label={t('plan.aria.tif', { n: i + 1 })}>
                <option value="day">{t('plan.day')}</option>
                <option value="gtc">GTC</option>
              </select>
            </div>
            <select
              className="input"
              value={tr.status}
              onChange={(e) => {
                const status = e.target.value as TrancheStatus;
                setTranche(tr.id, status === 'filled' && !tr.filledOn ? { status, filledOn: todayLocal() } : { status });
              }}
              aria-label={t('plan.aria.status', { n: i + 1 })}
            >
              {STATUSES.map((st) => (
                <option key={st} value={st}>
                  {t(`plan.status.${st}` as MsgKey)}
                </option>
              ))}
            </select>
            {tr.status === 'filled' ? (
              <div className="row" style={{ flexWrap: 'nowrap', gap: 4 }}>
                <input
                  className="input"
                  inputMode="decimal"
                  value={tr.fillPrice ?? ''}
                  onChange={(e) => setTranche(tr.id, { fillPrice: num(e.target.value) })}
                  placeholder={t('plan.fillPrice')}
                  aria-label={t('plan.aria.fillPrice', { n: i + 1 })}
                />
                <input
                  className="input"
                  inputMode="decimal"
                  value={tr.fillQty ?? ''}
                  onChange={(e) => setTranche(tr.id, { fillQty: num(e.target.value) })}
                  placeholder={t('plan.fillQty')}
                  aria-label={t('plan.aria.fillQty', { n: i + 1 })}
                />
              </div>
            ) : (
              <span className="label">—</span>
            )}
            <button
              className="btn icon small"
              onClick={() => updatePlan(plan.id, (p) => ({ ...p, tranches: p.tranches.filter((x) => x.id !== tr.id) }))}
              aria-label={t('plan.aria.remove', { n: i + 1 })}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="row">
        <button className="btn small" onClick={() => updatePlan(plan.id, (p) => ({ ...p, tranches: [...p.tranches, { id: newId('t'), status: 'planned' }] }))}>
          {t('plan.addTranche')}
        </button>
        <button className="btn small" onClick={() => updatePlan(plan.id, (p) => ({ ...p, archived: true }))}>
          {t('plan.archive')}
        </button>
      </div>
    </Card>
  );
}
