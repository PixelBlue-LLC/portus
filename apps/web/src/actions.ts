import { attributionPrompt, askPrompt, TRANSLATE_SYSTEM_PROMPT } from 'portus-core';
import { askClaude } from './data/anthropic';
import { fetchMarket } from './data/finnhub';
import { getLang, t } from './i18n';
import { getState, setState } from './store';

export async function refreshMarket(): Promise<void> {
  const s = getState();
  if (!s.settings.finnhubKey || s.loading) return;
  setState({ loading: true });
  try {
    const r = await fetchMarket(s.holdings.map((h) => h.symbol), s.settings.finnhubKey, s.market.industries ?? {});
    setState({
      market: { quotes: r.quotes, sectors: r.sectors, news: r.news, earnings: r.earnings, industries: { ...s.market.industries, ...r.industries }, errors: r.errors, fetchedAt: new Date().toISOString() },
      attribution: undefined,
    });
  } catch (e) {
    setState((st) => ({ market: { ...st.market, errors: [e instanceof Error ? e.message : String(e)] } }));
  } finally {
    setState({ loading: false });
  }
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
