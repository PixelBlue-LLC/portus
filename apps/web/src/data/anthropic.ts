/**
 * Anthropic 适配器：用用户自己的 key 从浏览器直接调用。
 * 需要 anthropic-dangerous-direct-browser-access 请求头；key 只发给 Anthropic，不经过任何其他服务器。
 */
import { aiSystemPrompt, violatesAdvicePolicy } from 'portus-core';
import { getLang, t } from '../i18n';

export interface AiResult {
  text: string;
  /** 输出含买卖建议类措辞，被拦下了 */
  blocked: boolean;
}

export async function askClaude(
  key: string,
  model: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  opts: { system?: string; maxTokens?: number; checkAdvice?: boolean } = {},
): Promise<AiResult> {
  let res: Response;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({ model, max_tokens: opts.maxTokens ?? 800, system: opts.system ?? aiSystemPrompt(getLang()), messages }),
    });
  } catch {
    throw new Error(t('err.anthropicNet'));
  }
  if (res.status === 401) throw new Error(t('err.anthropicKey'));
  if (res.status === 404) throw new Error(t('err.model', { m: model }));
  if (res.status === 429) throw new Error(t('err.anthropicRate'));
  if (!res.ok) throw new Error(t('err.anthropicStatus', { s: res.status }));
  const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  const text = (data.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('').trim();
  if (opts.checkAdvice !== false && violatesAdvicePolicy(text)) {
    return { text: t('ai.blocked'), blocked: true };
  }
  return { text, blocked: false };
}
