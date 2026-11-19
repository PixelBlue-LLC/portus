import { useEffect, useState } from 'react';
import { nameIn } from 'portus-core';
import { translateTitles } from '../actions';
import type { Derived } from '../derived';
import { signedPct, timeLabel } from '../format';
import { t } from '../i18n';
import type { AppState } from '../store';
import { Empty } from '../ui';
import { QuoteLink, SectorChart } from './Sectors';

/** 每只持仓默认先显示几条，点开看全部（最多 10 条） */
const NEWS_FIRST = 3;
/** 摘要太长的截一下再翻译、显示 */
const clip = (x?: string) => (x ? (x.length > 280 ? `${x.slice(0, 280).trimEnd()}…` : x) : '');

/** 中文界面下，把正在显示的新闻标题和摘要交给 AI 翻译（用户自己的 key）。有新的才调用。 */
function useNewsTranslation(s: AppState, texts: string[], want: boolean): string {
  const [err, setErr] = useState('');
  const missing = want ? texts.filter((x) => x && !s.translations?.[x]) : [];
  const key = missing.join('\n\u0000');
  useEffect(() => {
    if (!key) return;
    let alive = true;
    void translateTitles(key.split('\n\u0000')).then((e) => {
      if (alive) setErr(e ?? '');
    });
    return () => {
      alive = false;
    };
  }, [key]);
  return err;
}

export function Market({ s, d }: { s: AppState; d: Derived }) {
  const [openNews, setOpenNews] = useState<Record<string, boolean>>({});
  const zhNews = d.lang === 'zh';
  // 新闻按持仓分组，仓位大的在前；没有行情的（债券等）没有新闻
  const groups = d.view.positions
    .filter((p) => !p.noQuote)
    .map((p) => ({ p, items: d.newsHeld.filter((n) => n.symbol === p.symbol) }))
    .filter((g) => g.items.length);
  const shown = groups.flatMap((g) => (openNews[g.p.symbol] ? g.items : g.items.slice(0, NEWS_FIRST)));
  const translateErr = useNewsTranslation(s, shown.flatMap((n) => [n.title, clip(n.summary)]), zhNews && !!s.settings.anthropicKey);

  if (!s.settings.finnhubKey)
    return (
      <>
        <header className="page-head">
          <span className="title">{t('nav.market')}</span>
        </header>
        <Empty title={t('mkt.needKey')}>
          <p className="body" style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
            {t('mkt.needKeyBody')}
          </p>
          <a className="btn" href="#/settings" style={{ alignSelf: 'flex-start' }}>
            {t('common.goSettings')}
          </a>
        </Empty>
      </>
    );

  const sectors = d.sectors;
  // 从「今天」页点板块色块进来时是 #/market/XLE，直接展开那一个
  const initialSector = /^#\/market\/([A-Z.]+)/.exec(location.hash)?.[1];
  const best = sectors[0];
  const worst = sectors.at(-1);
  const summary = d.labels.allDown
    ? t('mkt.allDown', { n: sectors.length })
    : d.labels.allUp
      ? t('mkt.allUp', { n: sectors.length })
      : t('mkt.mixed', { u: sectors.filter((x) => x.changePct > 0).length, d: sectors.filter((x) => x.changePct < 0).length });

  return (
    <>
      <header className="page-head">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="title">{t('nav.market')}</span>
          <span className="label">{s.market.fetchedAt ? t('mkt.sub', { t: timeLabel(s.market.fetchedAt) }) : t('mkt.noRefresh')}</span>
        </div>
      </header>

      {sectors.length && best && worst ? (
        <section className="sec">
          <h1 className="headline" style={{ fontSize: 22 }}>{summary}</h1>
          <p className="lead" style={{ fontSize: 14 }}>
            {t('mkt.spread', {
              b: nameIn(best.name, d.lang),
              bp: signedPct(best.changePct),
              w: nameIn(worst.name, d.lang),
              wp: signedPct(worst.changePct),
              g: (best.changePct - worst.changePct).toFixed(1),
            })}
          </p>
        </section>
      ) : null}

      <div className="grid2">
        <SectorChart s={s} d={d} initial={initialSector} />

        <div className="col">
          <div className="card-head" style={{ padding: '0 6px' }}>
            <h2 style={{ margin: 0, fontSize: 15 }}>{t('mkt.news')}</h2>
            <span className="label">{t('mkt.newsSub')}</span>
          </div>
          {zhNews && groups.length ? (
            s.translating ? (
              <span className="label" style={{ padding: '0 6px' }}>{t('mkt.translating')}</span>
            ) : translateErr ? (
              <span className="label neg" style={{ padding: '0 6px' }}>{t('mkt.translateFail', { e: translateErr })}</span>
            ) : !s.settings.anthropicKey ? (
              <span className="label" style={{ padding: '0 6px' }}>{t('mkt.translateHint')}</span>
            ) : null
          ) : null}
          {groups.length ? (
            groups.map(({ p, items }) => {
              const open = !!openNews[p.symbol];
              const list = open ? items : items.slice(0, NEWS_FIRST);
              return (
                <section key={p.symbol} className="card news-group">
                  <div className="card-head">
                    <span className="row" style={{ gap: 8 }}>
                      <QuoteLink s={s} symbol={p.symbol} className="chip sym-chip" />
                      <span className="label">{t('mkt.groupLine', { w: p.weight, n: items.length })}</span>
                    </span>
                    {p.dayPct != null ? <span className={p.dayPct < 0 ? 'neg' : 'pos'} style={{ fontSize: 12, fontWeight: 600 }}>{signedPct(p.dayPct)}</span> : null}
                  </div>
                  {list.map((n) => {
                    const zh = zhNews ? s.translations?.[n.title] : undefined;
                    const sum = clip(n.summary);
                    const zhSum = zhNews && sum ? s.translations?.[sum] : undefined;
                    return (
                      <a key={n.url + n.symbol} href={n.url} target="_blank" rel="noreferrer" className="news-item" title={zh ? n.title : undefined}>
                        <span className="muted" style={{ fontSize: 11 }}>
                          {n.source} · {timeLabel(n.publishedAt)}
                          {zh ? ` · ${t('mkt.machine')}` : ''}
                        </span>
                        <span lang={zh ? 'zh-CN' : 'en'} className="news-title">{zh ?? n.title}</span>
                        {sum ? (
                          <span lang={zhSum ? 'zh-CN' : 'en'} className="muted news-sum">
                            {zhNews ? (zhSum ?? (s.settings.anthropicKey ? '' : sum)) : sum}
                          </span>
                        ) : null}
                      </a>
                    );
                  })}
                  {items.length > NEWS_FIRST ? (
                    <button className="linkbtn" style={{ fontSize: 13 }} onClick={() => setOpenNews((o) => ({ ...o, [p.symbol]: !open }))}>
                      {open ? t('common.collapse') : t('mkt.moreNews', { n: items.length - NEWS_FIRST })}
                    </button>
                  ) : null}
                </section>
              );
            })
          ) : (
            <div className="notice">{t('mkt.noNews')}</div>
          )}
        </div>
      </div>
    </>
  );
}
