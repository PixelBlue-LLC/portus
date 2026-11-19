import { alertSymbols, attributionPrompt, askPrompt, TRANSLATE_SYSTEM_PROMPT } from 'portus-core';
import { askClaude } from './data/anthropic';
import { fetchMarket, fetchQuotes } from './data/finnhub';
import { getLang, t } from './i18n';
import { getState, setState } from './store';

/** 要报价的代码：持仓（不含债券、期权等没有代码的行）+ 提醒、计划、相关性候选里的代码 */
function quoteSymbols(s: ReturnType<typeof getState>): { held: string[]; extra: string[] } {
  return {
    held: s.holdings.filter((h) => !h.noQuote).map((h) => h.symbol),
    extra: [...alertSymbols(s.alerts), ...s.plans.filter((p) => !p.archived).map((p) => p.symbol), ...s.candidates],
  };
}

/** 完整刷新：报价、52 周区间、新闻、财报、行业。手动点「刷新」、保存持仓、每小时第一次自动刷新时用 */
export async function refreshMarket(): Promise<void> {
  const s = getState();
  if (!s.settings.finnhubKey || s.loading) return;
  setState({ loading: true });
  try {
    const { held, extra } = quoteSymbols(s);
    const r = await fetchMarket(held, s.settings.finnhubKey, s.market.industries ?? {}, extra);
    const now = new Date().toISOString();
    setState({
      market: {
        quotes: r.quotes,
        sectors: r.sectors,
        news: r.news,
        earnings: r.earnings,
        earningsHour: r.earningsHour,
        industries: { ...s.market.industries, ...r.industries },
        errors: r.errors,
        fetchedAt: now,
        fullAt: now,
      },
      attribution: undefined,
    });
  } catch (e) {
    setState((st) => ({ market: { ...st.market, errors: [e instanceof Error ? e.message : String(e)] } }));
  } finally {
    setState({ loading: false });
  }
}

/** 只更新报价（自动刷新用）。52 周高低沿用上次完整刷新的值 */
export async function refreshQuotes(): Promise<void> {
  const s = getState();
  if (!s.settings.finnhubKey || s.loading) return;
  setState({ loading: true });
  try {
    const { held, extra } = quoteSymbols(s);
    const r = await fetchQuotes([...held, ...extra], s.settings.finnhubKey);
    setState((st) => {
      const quotes = { ...st.market.quotes };
      for (const [sym, q] of Object.entries(r.quotes)) quotes[sym] = { ...q, high52: quotes[sym]?.high52, low52: quotes[sym]?.low52 };
      return {
        // AI 解读不作废：几分钟的价格变化不值得让用户重新花一次 AI 调用，页面上会标出解读的时间
        market: { ...st.market, quotes, sectors: r.sectors.length ? r.sectors : st.market.sectors, errors: r.errors, fetchedAt: new Date().toISOString() },
      };
    });
  } catch (e) {
    setState((st) => ({ market: { ...st.market, errors: [e instanceof Error ? e.message : String(e)] } }));
  } finally {
    setState({ loading: false });
  }
}

/** 板块成分股的报价：点开板块时按需拉，5 分钟内拉过的不重复拉 */
const pickedAt = new Map<string, number>();
export async function refreshSymbols(symbols: string[]): Promise<string | null> {
  const s = getState();
  if (!s.settings.finnhubKey) return null;
  const now = Date.now();
  const todo = [...new Set(symbols.map((x) => x.toUpperCase()))].filter((x) => !s.market.quotes[x] || now - (pickedAt.get(x) ?? 0) > 5 * 60000);
  if (!todo.length) return null;
  try {
    const r = await fetchQuotes(todo, s.settings.finnhubKey, false);
    for (const x of todo) pickedAt.set(x, now);
    setState((st) => {
      const quotes = { ...st.market.quotes };
      for (const [sym, q] of Object.entries(r.quotes)) quotes[sym] = { ...q, high52: quotes[sym]?.high52, low52: quotes[sym]?.low52 };
      return { market: { ...st.market, quotes } };
    });
    return r.errors[0] ?? null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/** 自动刷新：距上次完整刷新超过一小时就做完整刷新，否则只拉报价 */
export function autoRefresh(): Promise<void> {
  const fullAt = getState().market.fullAt;
  const old = !fullAt || Date.now() - Date.parse(fullAt) > 60 * 60000;
  return old ? refreshMarket() : refreshQuotes();
}

export async function runAttribution(facts: string): Promise<void> {
  const s = getState();
  const r = await askClaude(s.settings.anthropicKey, s.settings.aiModel, [{ role: 'user', content: attributionPrompt(facts, getLang()) }]);
  setState({ attribution: { text: r.text, at: new Date().toISOString() } });
}

export async function sendChat(question: string, facts: string): Promise<void> {
  const s = getState();
  const history = s.chat.slice(-6);
  const nextChat = [...s.chat, { role: 'user' as const, text: question }];
  setState({ chat: nextChat });
  try {
    const messages = [
      ...history.map((m) => ({ role: m.role, content: m.text })),
      { role: 'user' as const, content: askPrompt(question, facts, getLang()) },
    ];
    const r = await askClaude(s.settings.anthropicKey, s.settings.aiModel, messages);
    setState({ chat: [...nextChat, { role: 'assistant', text: r.text }] });
  } catch (e) {
    setState({ chat: [...nextChat, { role: 'assistant', text: t('chat.error', { e: e instanceof Error ? e.message : String(e) }) }] });
  }
}

/** 最多缓存多少条译文，旧的先丢 */
const MAX_TRANSLATIONS = 400;

/**
 * 把还没翻译的新闻标题翻成中文，用用户自己的 Anthropic key。
 * 翻译结果只存在本地；失败时保留原文，返回错误信息给页面显示。
 */
export async function translateTitles(titles: string[]): Promise<string | null> {
  const s = getState();
  if (!s.settings.anthropicKey || s.translating) return null;
  const done = s.translations ?? {};
  const todo = [...new Set(titles)].filter((x) => x && !done[x]).slice(0, 25);
  if (!todo.length) return null;
  setState({ translating: true });
  try {
    const r = await askClaude(s.settings.anthropicKey, s.settings.aiModel, [{ role: 'user', content: JSON.stringify(todo) }], {
      system: TRANSLATE_SYSTEM_PROMPT,
      maxTokens: 2000,
      // 这里是翻译第三方新闻，不是 AI 的建议；原文里的措辞照实翻译
      checkAdvice: false,
    });
    const json = r.text.slice(r.text.indexOf('['), r.text.lastIndexOf(']') + 1);
    const out = JSON.parse(json) as unknown;
    if (!Array.isArray(out) || out.length !== todo.length) throw new Error('bad translation format');
    const merged = { ...(getState().translations ?? {}) };
    todo.forEach((src, i) => {
      const zh = out[i];
      if (typeof zh === 'string' && zh.trim()) merged[src] = zh.trim();
    });
    const keys = Object.keys(merged);
    for (const k of keys.slice(0, Math.max(0, keys.length - MAX_TRANSLATIONS))) delete merged[k];
    setState({ translations: merged });
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  } finally {
    setState({ translating: false });
  }
}

/** 本地日期 YYYY-MM-DD（按浏览器所在时区） */
export function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * 拉日线：只拉今天还没拉过的代码。没有 Twelve Data key 时什么也不做。
 * onProgress 用来在页面上显示「第几批」。
 */
export async function refreshHistory(symbols: string[], onProgress?: (done: number, total: number) => void): Promise<void> {
  const s = getState();
  const key = s.settings.twelveDataKey;
  if (!key || s.historyLoading) return;
  const today = todayLocal();
  const todo = [...new Set(symbols.map((x) => x.toUpperCase()))].filter((x) => s.history.fetchedOn[x] !== today);
  if (!todo.length) return;
  setState({ historyLoading: true });
  try {
    const { fetchDaily } = await import('./data/twelvedata');
    const r = await fetchDaily(todo, key, onProgress);
    setState((st) => {
      const fetchedOn = { ...st.history.fetchedOn };
      for (const sym of Object.keys(r.bars)) fetchedOn[sym] = today;
      return { history: { bars: { ...st.history.bars, ...r.bars }, fetchedOn, errors: r.errors } };
    });
  } finally {
    setState({ historyLoading: false });
  }
}
