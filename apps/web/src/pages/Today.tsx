import { useState } from 'react';
import { attributionFallback, riskBandName } from 'portus-core';
import { runAttribution } from '../actions';
import type { Derived } from '../derived';
import { ageMinutes, signedPct, signedUsd, timeLabel, usd } from '../format';
import { getLang, t } from '../i18n';
import { loadSample, setState, type AppState } from '../store';
import { EventLine, upcomingEvents } from './Calendar';
import { overdueTranches, staleDayOrders } from 'portus-core';
import { todayLocal } from '../actions';
import { Card, ConcRow, HeatGrid, Money, Pct, Tile, tone } from '../ui';

export function Today({ s, d }: { s: AppState; d: Derived }) {
  const { view } = d;
  if (!view.positions.length) return <Welcome />;

  const losing = (view.dayPnl ?? 0) < 0;
  const movers = view.positions
    .filter((p) => p.dayPnl != null && (losing ? p.dayPnl < 0 : p.dayPnl > 0))
    .sort((a, b) => Math.abs(b.dayPnl!) - Math.abs(a.dayPnl!));
  const top3 = movers.slice(0, 3);
  const rest = movers.slice(3).reduce((sum, p) => sum + Math.abs(p.dayPnl!), 0);
  const stale = (ageMinutes(s.market.fetchedAt) ?? 0) > 24 * 60;

  return (
    <>
      <header className="page-head">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="title">{t('nav.today')}</span>
          {!s.settings.finnhubKey ? <span className="label">{t('today.manualPrices')}</span> : null}
        </div>
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <a className="btn mobile-only" href="#/settings">
            {t('nav.settings')}
          </a>
        </div>
      </header>

      {stale ? <div className="banner bad">{t('today.stale', { t: timeLabel(s.market.fetchedAt) })}</div> : null}
      {s.market.errors.length ? <div className="banner bad">{s.market.errors.join(t('common.sep'))}</div> : null}

      <NextSteps s={s} />
      <AlertsSummary s={s} d={d} />

      <section className="sec">
        <h1 className="headline">{d.headline}</h1>
        {d.subline ? <p className="lead">{d.subline}</p> : null}
      </section>

      <Card>
        <span className="label">{t('common.totalValue')}</span>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <span className="big">{usd(view.totalValue, 2)}</span>
          <span style={{ fontSize: 15, fontWeight: 600 }}>
            {view.dayPnl != null ? (
              <span className={tone(view.dayPnl)}>
                {t('today.dayLine', { usd: signedUsd(view.dayPnl, 2), pct: signedPct((view.dayPnl / (view.totalValue - view.dayPnl)) * 100) })}
              </span>
            ) : (
              <span className="muted">{t('today.needQuotes')}</span>
            )}
          </span>
        </div>
        {top3.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className="label">{t(losing ? 'today.lossFrom' : 'today.gainFrom')}</span>
            <div className="stack" aria-hidden="true">
              {top3.map((p, i) => (
                <div key={p.symbol} style={{ flex: Math.abs(p.dayPnl!), background: losing ? 'var(--down)' : 'var(--up)', opacity: 1 - i * 0.22 }} />
              ))}
              {rest > 0 ? <div style={{ flex: rest, background: 'var(--track)' }} /> : null}
            </div>
            <div className="legend">
              {top3.map((p) => (
                <span key={p.symbol}>
                  {p.symbol} {signedUsd(p.dayPnl!)}
                </span>
              ))}
              {rest > 0 ? <span>{t('common.other')} {signedUsd(losing ? -rest : rest)}</span> : null}
            </div>
          </div>
        ) : null}
      </Card>

      <div className="tiles">
        <Tile label={t('tile.risk')} value={<>{d.risk.score}<span className="label" style={{ fontWeight: 400 }}> / 100 {riskBandName(d.risk.band, getLang())}</span></>}>
          <div className="bar">
            <i style={{ width: `${d.risk.score}%` }} />
          </div>
        </Tile>
        <Tile label={t('common.cash')} value={`${view.totalValue ? ((view.cash / view.totalValue) * 100).toFixed(1) : '0'}%`} sub={usd(view.cash)} />
        <Tile label={t('tile.totalPnl')} value={<Money v={view.totalPnl} />} sub={t('tile.positions', { n: view.positions.length })} />
        <Tile label={t('tile.over')} value={t('tile.items', { n: d.over.length })} sub={t('tile.rules', { n: d.concentration.length })} />
      </div>

      <UpcomingCard s={s} />

      <div className="grid2">
        <div className="col">
          <Card>
            <div className="card-head">
              <h2>{t('today.riskFirst')}</h2>
              <span className="label" style={{ color: d.over.length ? 'var(--warn-text)' : undefined, fontWeight: 600 }}>
                {d.over.length ? t('today.overN', { n: d.over.length }) : t('today.allWithin')}
              </span>
            </div>
            {(d.over.length ? d.over : d.concentration.slice(0, 3)).map((c) => (
              <ConcRow key={c.type + c.label} c={c} />
            ))}
            <a href="#/holdings" style={{ fontSize: 14 }}>
              {t('today.seeAll')}
            </a>
          </Card>

          <Card>
            <div className="table">
              <div className="tr head">
                <span>{t('th.holding')}</span>
                <span>{t('th.weight')}</span>
                <span>{t('th.day')}</span>
                <span>{t('th.dayUsd')}</span>
              </div>
              {view.positions.map((p) => (
                <div className="tr" key={p.symbol}>
                  <span className="sym">{p.symbol}</span>
                  <span className="body">{p.weight}%</span>
                  <span style={{ fontWeight: 600 }}>
                    <Pct v={p.dayPct} />
                  </span>
                  <span>
                    <Money v={p.dayPnl} />
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="col">
          <Card>
            <h2>{t('today.what')}</h2>
            <Attribution s={s} d={d} />
          </Card>

          <Card>
            <h2>{t('today.watch')}</h2>
            {d.watch.length ? (
              <ol className="list">
                {d.watch.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ol>
            ) : (
              <p className="muted" style={{ margin: 0, fontSize: 14 }}>{t('today.watchEmpty')}</p>
            )}
          </Card>

          <Card>
            <div className="card-head">
              <h2>
                {t('today.sectors')}
                {d.labels.allDown ? t('today.allDown') : d.labels.allUp ? t('today.allUp') : ''}
              </h2>
              <a href="#/market" style={{ fontSize: 13 }}>
                {d.newsHeld.length ? t('today.newsN', { n: d.newsHeld.length }) : t('today.marketLink')}
              </a>
            </div>
            <HeatGrid sectors={d.sectors} />
          </Card>
        </div>
      </div>
    </>
  );
}

function Attribution({ s, d }: { s: AppState; d: Derived }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const fallback = attributionFallback(d.view, d.sectors, d.lang);
  if (!d.hasQuotes) return <p className="muted" style={{ margin: 0, fontSize: 14 }}>{t('attr.needQuotes')}</p>;
  return (
    <>
      {s.attribution ? (
        <p className="body" style={{ margin: 0, fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
          {s.attribution.text}
        </p>
      ) : (
        <ul className="list" style={{ fontSize: 14 }}>
          {fallback.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      )}
      {s.settings.anthropicKey ? (
        <div className="row">
          <button
            className="btn small"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setErr('');
              try {
                await runAttribution(d.facts);
              } catch (e) {
                setErr(e instanceof Error ? e.message : String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? t('attr.busy') : s.attribution ? t('attr.redo') : t('attr.run')}
          </button>
          {s.attribution && !busy ? <span className="label">{t('attr.at', { t: timeLabel(s.attribution.at) })}</span> : null}
          {err ? <span className="neg" style={{ fontSize: 13 }}>{err}</span> : null}
        </div>
      ) : (
        <span className="label">
          {t('attr.needKey1')}
          <a href="#/settings">{t('nav.settings')}</a>
          {t('attr.needKey2')}
        </span>
      )}
    </>
  );
}

function Welcome() {
  return (
    <>
      <section className="sec" style={{ paddingTop: 24 }}>
        <h1 className="headline">{t('welcome.title')}</h1>
        <p className="lead">{t('welcome.lead')}</p>
      </section>
      <ol className="steps">
        <li>
          <strong>{t('welcome.s1')}</strong>
          <span>{t('welcome.s1b')}</span>
          <a className="btn primary small" href="#/holdings/edit">
            {t('welcome.enter')}
          </a>
        </li>
        <li>
          <strong>{t('welcome.s2')}</strong>
          <span>{t('welcome.s2b')}</span>
          <a className="btn small" href="#/settings">
            {t('common.goSettings')}
          </a>
        </li>
        <li>
          <strong>{t('welcome.s3')}</strong>
          <span>{t('welcome.s3b')}</span>
        </li>
      </ol>
      <div className="row" style={{ padding: '0 6px' }}>
        <button className="btn" onClick={loadSample}>
          {t('welcome.sample')}
        </button>
      </div>
      <div className="notice" style={{ margin: '8px 6px 0' }}>
        {t('welcome.notice')}
      </div>
    </>
  );
}

/** 有持仓以后的「下一步」：还没接行情、还没设提醒时提示一次，可以关掉 */
function NextSteps({ s }: { s: AppState }) {
  if (s.welcomeDismissed || s.isSample) return null;
  const todo: Array<{ key: string; text: string; href: string; link: string }> = [];
  if (!s.settings.finnhubKey) todo.push({ key: 'k', text: t('next.key'), href: '#/settings', link: t('common.goSettings') });
  if (!s.alerts.length) todo.push({ key: 'a', text: t('next.alerts'), href: '#/plans', link: t('next.alertsLink') });
  if (!todo.length) return null;
  return (
    <div className="notice next-steps" role="note">
      <div className="card-head">
        <strong style={{ color: 'var(--ink)' }}>{t('next.title')}</strong>
        <button className="linkbtn" onClick={() => setState({ welcomeDismissed: true })}>
          {t('next.dismiss')}
        </button>
      </div>
      <ul className="list">
        {todo.map((x) => (
          <li key={x.key}>
            {x.text} <a href={x.href}>{x.link}</a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 触发了的提醒，以及分批计划里需要核对的批次 */
function AlertsSummary({ s, d }: { s: AppState; d: Derived }) {
  const today = todayLocal();
  const active = s.plans.filter((p) => !p.archived);
  const overdue = active.reduce((n, p) => n + overdueTranches(p, today).length, 0);
  const stale = active.reduce((n, p) => n + staleDayOrders(p, today).length, 0);
  if (!d.alertHits.length && !overdue && !stale) return null;
  return (
    <Card className="alert-card">
      <div className="card-head">
        <h2>{d.alertHits.length ? t('alerts.hitTitle', { n: d.alertHits.length }) : t('alerts.planTitle')}</h2>
        <a href="#/plans" style={{ fontSize: 14 }}>
          {t('alerts.manage')}
        </a>
      </div>
      <ul className="list" style={{ fontSize: 14 }}>
        {d.alertHits.map((h) => (
          <li key={h.id + h.subject}>{h.text}</li>
        ))}
        {overdue ? <li>{t('plan.overdue', { n: overdue })}</li> : null}
        {stale ? <li>{t('plan.staleDay', { n: stale })}</li> : null}
      </ul>
    </Card>
  );
}

/** 未来 7 天的事件 */
function UpcomingCard({ s }: { s: AppState }) {
  const events = upcomingEvents(s, 7).slice(0, 6);
  if (!events.length) return null;
  return (
    <Card>
      <div className="card-head">
        <h2>{t('today.week')}</h2>
        <a href="#/calendar" style={{ fontSize: 14 }}>
          {t('today.weekAll')}
        </a>
      </div>
      <div className="ev-list">
        {events.map((e) => (
          <div key={e.date + e.kind + (e.symbol ?? '')} className="ev-row">
            <span className="label ev-d">{e.date.slice(5)}</span>
            <EventLine e={e} />
          </div>
        ))}
      </div>
    </Card>
  );
}
