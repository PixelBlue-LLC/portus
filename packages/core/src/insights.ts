/**
 * 「今天」页的结论、归因和明日关注。全部由当天数据推出来，不写死，不编造原因。
 * 这些是事实陈述和需要留意的信号，不是买卖建议。
 * 每个函数最后一个参数是语言，默认中文。
 */
import { ruleLabel, type ConcentrationResult } from './concentration';
import { joinList, nameIn, type Lang } from './lang';
import { IV_RICH_GAP, type OptionMetrics } from './options';
import type { NewsItem, PortfolioView, SectorPerf } from './types';

const money = (v: number) => `${v < 0 ? '−' : '+'}$${Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
const pct = (v: number, d = 2) => `${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(d)}%`;
const usd = (v: number) => `$${Math.round(v).toLocaleString('en-US')}`;

export function themePnl(view: PortfolioView): Array<{ theme: string; pnl: number }> {
  const by = new Map<string, number>();
  for (const p of view.positions) if (p.dayPnl != null) by.set(p.theme, (by.get(p.theme) ?? 0) + p.dayPnl);
  return [...by.entries()].map(([theme, pnl]) => ({ theme, pnl })).sort((a, b) => a.pnl - b.pnl);
}

export function dayPct(view: PortfolioView): number | null {
  if (view.dayPnl == null) return null;
  const base = view.totalValue - view.dayPnl;
  return base ? (view.dayPnl / base) * 100 : null;
}

export function sortedSectors(sectors: SectorPerf[]): SectorPerf[] {
  return [...sectors].sort((a, b) => b.changePct - a.changePct);
}

/** 全部板块都跌时不叫「强势」，叫「相对抗跌」 */
export function sectorLabels(sectors: SectorPerf[], lang: Lang = 'zh'): { strong: string; weak: string; allDown: boolean; allUp: boolean } {
  const allDown = sectors.length > 0 && sectors.every((s) => s.changePct < 0);
  const allUp = sectors.length > 0 && sectors.every((s) => s.changePct > 0);
  const zh = lang === 'zh';
  if (allDown) return { strong: zh ? '相对抗跌' : 'Held up best', weak: zh ? '领跌' : 'Led the decline', allDown, allUp };
  if (allUp) return { strong: zh ? '领涨' : 'Led the gains', weak: zh ? '相对落后' : 'Lagged', allDown, allUp };
  return { strong: zh ? '强势' : 'Strongest', weak: zh ? '弱势' : 'Weakest', allDown, allUp };
}

/** 首页那一句话结论 */
export function headline(view: PortfolioView, sectors: SectorPerf[], lang: Lang = 'zh'): string {
  const zh = lang === 'zh';
  const d = dayPct(view);
  if (!view.positions.length) return zh ? '还没有持仓，先录入持仓再看分析。' : 'No holdings yet. Add your holdings to see the analysis.';
  if (d == null)
    return zh
      ? `组合总市值 ${usd(view.totalValue)}，接入行情后可以看当天涨跌。`
      : `Portfolio value ${usd(view.totalValue)}. Connect market data to see today's move.`;
  const s = sortedSectors(sectors);
  const worst = s.at(-1);
  const best = s[0];
  const labels = sectorLabels(sectors);
  let lead = '';
  if (sectors.length && labels.allDown && worst)
    lead = zh ? `${worst.name}领跌全市场，` : `${nameIn(worst.name, lang)} led a broad decline; `;
  else if (sectors.length && labels.allUp && best)
    lead = zh ? `${best.name}领涨全市场，` : `${nameIn(best.name, lang)} led a broad rally; `;
  if (zh) return `${lead}组合今天 ${pct(d, 1)}`;
  return `${lead}${lead ? 'portfolio' : 'Portfolio'} ${pct(d, 1)} today`;
}

/** 首页结论下面的一句补充：亏损/盈利主要来自谁 */
export function subline(view: PortfolioView, lang: Lang = 'zh'): string {
  if (view.dayPnl == null || !view.positions.length) return '';
  const losing = view.dayPnl < 0;
  const movers = view.positions
    .filter((p) => p.dayPnl != null && (losing ? p.dayPnl < 0 : p.dayPnl > 0))
    .sort((a, b) => Math.abs(b.dayPnl!) - Math.abs(a.dayPnl!));
  if (!movers.length) return '';
  let acc = 0;
  const names: string[] = [];
  for (const m of movers) {
    acc += Math.abs(m.dayPnl!);
    names.push(m.symbol);
    if (acc / Math.abs(view.dayPnl) >= 0.7 || names.length >= 3) break;
  }
  const share = Math.round((acc / Math.abs(view.dayPnl)) * 100);
  return lang === 'zh'
    ? `${losing ? '亏损' : '盈利'}的 ${share}% 来自 ${joinList(names, lang)}。`
    : `${share}% of the ${losing ? 'loss' : 'gain'} came from ${joinList(names, lang)}.`;
}

/** 喂给 AI 的事实清单 */
export function attributionFacts(view: PortfolioView, sectors: SectorPerf[], news: NewsItem[] = [], lang: Lang = 'zh'): string {
  const zh = lang === 'zh';
  const sep = zh ? '；' : '; ';
  const lines: string[] = [];
  const d = dayPct(view);
  if (view.dayPnl != null && d != null)
    lines.push(
      zh
        ? `账户当日 ${money(view.dayPnl)}（${pct(d)}），总市值 ${usd(view.totalValue)}`
        : `Portfolio today ${money(view.dayPnl)} (${pct(d)}), total value ${usd(view.totalValue)}`,
    );
  lines.push(
    (zh ? '持仓当日：' : 'Holdings today: ') +
      view.positions
        .map((p) => {
          const move = p.dayPct != null ? ' ' + pct(p.dayPct) : '';
          const pnl = p.dayPnl != null ? money(p.dayPnl) : zh ? '无当日数据' : 'no data today';
          return zh
            ? `${p.symbol}${move}（${pnl}，仓位 ${p.weight}%，主题 ${p.theme}）`
            : `${p.symbol}${move} (${pnl}, weight ${p.weight}%, theme ${nameIn(p.theme, lang)})`;
        })
        .join(sep),
  );
  const tp = themePnl(view);
  if (tp.length) lines.push((zh ? '按主题合计：' : 'By theme: ') + tp.map((t) => `${nameIn(t.theme, lang)} ${money(t.pnl)}`).join(sep));
  if (sectors.length)
    lines.push(
      (zh ? '板块 ETF 当日：' : 'Sector ETFs today: ') +
        joinList(
          sortedSectors(sectors).map((s) => `${nameIn(s.name, lang)} ${s.symbol} ${pct(s.changePct)}`),
          lang,
        ),
    );
  const held = new Set(view.positions.map((p) => p.symbol));
  const heads = news.filter((n) => held.has(n.symbol)).slice(0, 6);
  if (heads.length) lines.push((zh ? '持仓相关新闻标题：' : 'News headlines for holdings: ') + heads.map((n) => `${n.symbol}: ${n.title}`).join(sep));
  return lines.join('\n');
}

/** 没有 AI 时的归因：只陈述数据 */
export function attributionFallback(view: PortfolioView, sectors: SectorPerf[], lang: Lang = 'zh'): string[] {
  const zh = lang === 'zh';
  const rows = view.positions.filter((p) => p.dayPnl != null).sort((a, b) => a.dayPnl! - b.dayPnl!);
  if (!rows.length) return [];
  const fmt = (p: (typeof rows)[number]) => (zh ? `${p.symbol} ${pct(p.dayPct!)}（${money(p.dayPnl!)}）` : `${p.symbol} ${pct(p.dayPct!)} (${money(p.dayPnl!)})`);
  const losers = rows.filter((p) => p.dayPnl! < 0).slice(0, 3);
  const winners = rows.filter((p) => p.dayPnl! > 0).reverse().slice(0, 3);
  const out: string[] = [];
  if (losers.length) out.push((zh ? '主要拖累：' : 'Biggest drags: ') + joinList(losers.map(fmt), lang));
  if (winners.length) out.push((zh ? '主要贡献：' : 'Biggest contributors: ') + joinList(winners.map(fmt), lang));
  const tp = themePnl(view);
  if (tp.length && view.dayPnl) {
    const t = view.dayPnl < 0 ? tp[0]! : tp.at(-1)!;
    const share = Math.round(Math.abs(t.pnl / view.dayPnl) * 100);
    out.push(
      zh
        ? `${t.theme} 主题合计 ${money(t.pnl)}，占当日盈亏的 ${share}%`
        : `${nameIn(t.theme, lang)} theme total ${money(t.pnl)}, ${share}% of today's P&L`,
    );
  }
  const s = sortedSectors(sectors);
  if (s.length >= 2) {
    const lo = s.at(-1)!;
    const hi = s[0]!;
    out.push(
      zh
        ? `板块里 ${lo.name} ${pct(lo.changePct)} 最弱，${hi.name} ${pct(hi.changePct)} 最强`
        : `Among sectors, ${nameIn(lo.name, lang)} ${pct(lo.changePct)} was weakest and ${nameIn(hi.name, lang)} ${pct(hi.changePct)} strongest`,
    );
  }
  return out;
}

/** 明日关注：只由当天数据派生，没有就少写 */
export function tomorrowWatch(input: {
  view: PortfolioView;
  sectors: SectorPerf[];
  concentration: ConcentrationResult[];
  earnings?: Record<string, string>;
  options?: OptionMetrics[];
  today?: Date;
  limit?: number;
  lang?: Lang;
}): string[] {
  const { view, sectors, concentration, earnings = {}, options = [], limit = 5, lang = 'zh' } = input;
  const zh = lang === 'zh';
  const today = input.today ?? new Date();
  const out: string[] = [];

  const moved = view.positions.filter((p) => p.dayPct != null);
  if (moved.length) {
    const big = moved.reduce((b, p) => (Math.abs(p.dayPct!) > Math.abs(b.dayPct!) ? p : b), moved[0]!);
    if (Math.abs(big.dayPct!) >= 3) {
      const down = big.dayPct! < 0;
      out.push(
        zh
          ? `${big.symbol} 今天${down ? '大跌' : '大涨'} ${pct(big.dayPct!)}（仓位 ${big.weight}%），看明天是延续还是反转`
          : `${big.symbol} ${down ? 'fell' : 'rose'} ${pct(big.dayPct!)} today (weight ${big.weight}%): watch whether it continues or reverses`,
      );
    }
  }

  const s = sortedSectors(sectors);
  if (s.length >= 2) {
    const top = s[0]!;
    const bot = s.at(-1)!;
    const gap = (top.changePct - bot.changePct).toFixed(1);
    out.push(
      zh
        ? `板块分化 ${gap} 个百分点：${bot.name} ${pct(bot.changePct)} 能否企稳`
        : `Sectors ${gap} points apart: whether ${nameIn(bot.name, lang)} ${pct(bot.changePct)} stabilizes`,
    );
  }

  const held = new Set(view.positions.map((p) => p.symbol));
  const day0 = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const soon = Object.entries(earnings)
    .filter(([sym]) => held.has(sym))
    .map(([sym, d]) => ({ sym, d, days: Math.round((Date.parse(d) - day0) / 864e5) }))
    .filter((e) => e.days >= 0 && e.days <= 14)
    .sort((a, b) => a.days - b.days);
  for (const e of soon.slice(0, 2))
    out.push(
      zh
        ? `${e.sym} 财报 ${e.d.slice(5)}（${e.days} 天后），跨过财报的期权会受 IV 回落影响`
        : `${e.sym} reports earnings ${e.d.slice(5)} (in ${e.days} days); options spanning the report are exposed to an IV drop`,
    );

  const over = concentration.filter((c) => c.over && c.direction === 'above');
  if (over.length) {
    const w = over.reduce((b, c) => (c.pct - c.limit > b.pct - b.limit ? c : b), over[0]!);
    const label = ruleLabel(w, lang);
    const subject = w.subject ? nameIn(w.subject, lang) : '';
    out.push(
      zh
        ? `${label}${subject ? `（${subject}）` : ''} ${w.pct}%，超过阈值 ${w.limit}%`
        : `${label}${subject ? ` (${subject})` : ''} ${w.pct}%, above the ${w.limit}% limit`,
    );
  }

  const rich = options.filter((m) => held.has(m.symbol) && m.atmIv != null && m.rv30 != null && m.atmIv - m.rv30 >= IV_RICH_GAP);
  if (rich.length) {
    const m = rich.reduce((b, x) => (x.atmIv! - x.rv30! > b.atmIv! - b.rv30! ? x : b), rich[0]!);
    const gap = Math.round(m.atmIv! - m.rv30!);
    out.push(
      zh
        ? `${m.symbol} 隐含波动率 ${m.atmIv}% 比 30 日实际波动 ${m.rv30}% 高 ${gap} 个百分点，期权偏贵`
        : `${m.symbol} implied volatility ${m.atmIv}% is ${gap} points above 30-day realized ${m.rv30}%; options are priced rich`,
    );
  }

  const spy = options.find((m) => m.symbol === 'SPY');
  if (spy?.expectedMove && spy.spot) {
    const mv = ((spy.expectedMove / spy.spot) * 100).toFixed(1);
    out.push(zh ? `SPY 期权隐含约 ${spy.ivDte} 天内波动 ±${mv}%` : `SPY options imply about ±${mv}% over ${spy.ivDte} days`);
  }

  return out.slice(0, limit);
}
