/**
 * AI 提示词和输出检查。AI 只解释已经发生的事实，不给买卖建议或信号；
 * 输出里出现指令性措辞就丢弃，改用不含 AI 的事实版。中英文都要拦。
 */
import type { Lang } from './lang';

const SYSTEM_ZH = [
  '你是一个投资组合研究工具里的解释助手。',
  '只根据用户提供的数据解释已经发生的事实，比如涨跌来自哪里、哪些指标超过了用户自己设的阈值。',
  '不要给任何买入、卖出、加仓、减仓、止盈止损、目标价之类的建议或信号，也不要预测价格。',
  '用户问「要不要买/卖」时，说明你只能解释数据，并列出与这个问题相关的事实。',
  '不要编造数据里没有的数字、事件或原因；原因不明就直接说新闻里没有明确原因。',
  '用简体中文回答，股票代码和期权术语保留英文，分成【事实】【推断】两层，简洁。',
].join('\n');

const SYSTEM_EN = [
  'You are the explanation assistant inside a portfolio research tool.',
  "Explain only facts that already happened, using only the data the user provides: where gains and losses came from, which measures crossed the user's own limits.",
  'Never give buy, sell, add, trim, stop-loss, take-profit or price-target suggestions or signals, and do not predict prices.',
  'If the user asks whether to buy or sell, say you can only explain the data, then list the facts relevant to the question.',
  'Do not invent numbers, events or reasons that are not in the data; if the cause is unclear, say the news gives no clear reason.',
  'Answer in English, split into [Facts] and [Inference], and keep it short.',
].join('\n');

/** 兼容旧调用：中文系统提示词 */
export const AI_SYSTEM_PROMPT = SYSTEM_ZH;

export function aiSystemPrompt(lang: Lang = 'zh'): string {
  return lang === 'zh' ? SYSTEM_ZH : SYSTEM_EN;
}

/** 指令性措辞：命中就判为不合规 */
const FORBIDDEN = new RegExp(
  [
    '建议(买入|卖出|加仓|减仓|清仓|持有|止损|止盈)',
    '(买入|卖出)(信号|时机|点位)',
    '(应该|可以考虑|不妨|最好)(买|卖|加仓|减仓|清仓|止损)',
    '目标价',
    '满仓|全仓|梭哈|all\\s*in',
    '\\b(strong\\s+)?(buy|sell)\\s+(signal|rating)\\b',
    "\\b(you\\s+)?(should|could|might\\s+want\\s+to|may\\s+want\\s+to|consider)\\s+(buy(ing)?|sell(ing)?|add(ing)?\\s+to|trim(ming)?|exit(ing)?|short(ing)?)\\b",
    '\\bi\\s+(would\\s+)?(recommend|suggest)\\s+(buying|selling|adding|trimming|holding|exiting)\\b',
    '\\b(buy|sell)\\s+(now|the\\s+dip|more)\\b',
    '\\b(price\\s+target|target\\s+price)\\b',
    '\\b(set\\s+a\\s+)?stop[-\\s]?loss\\s+at\\b',
  ].join('|'),
  'i',
);

export function violatesAdvicePolicy(text: string): boolean {
  return FORBIDDEN.test(text);
}

export function attributionPrompt(facts: string, lang: Lang = 'zh'): string {
  if (lang === 'en')
    return [
      "Using today's real data below, explain where the portfolio's moves came from, split into [Facts] and [Inference], under 120 words.",
      'Use only the numbers and news given below. If a cause is unclear, say "the news gives no clear reason"; do not ask the user for more data.',
      '',
      facts,
    ].join('\n');
  return [
    '根据下面今天的真实数据，写持仓涨跌归因，分【事实】【推断】两层，150 字内。',
    '只能使用下面给出的数字和新闻。原因不明的就说「新闻里没有明确原因」，不要让用户补充数据。',
    '',
    facts,
  ].join('\n');
}

export function askPrompt(question: string, facts: string, lang: Lang = 'zh'): string {
  return lang === 'en'
    ? ["Today's data:", facts, '', `Question: ${question}`].join('\n')
    : ['今天的数据：', facts, '', `问题：${question}`].join('\n');
}

/** 新闻翻译：只翻译，不加评论。输入输出都是 JSON 数组，顺序不变。 */
export const TRANSLATE_SYSTEM_PROMPT = [
  'You translate financial news headlines and summaries from English into Simplified Chinese.',
  'Translate faithfully. Do not add opinions, explanations or advice. Keep tickers, company names in their usual form, and numbers unchanged.',
  'Input is a JSON array of strings. Reply with only a JSON array of the translated strings, same length and order.',
].join('\n');
