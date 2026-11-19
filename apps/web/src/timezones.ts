/**
 * 顶栏时间：主时区 + 副时区。常用城市给中英文名，其余时区用 IANA 名（Asia/Dubai → Dubai）。
 */
import type { Lang } from 'portus-core';

/** [IANA 名, 中文, English] */
export const COMMON_ZONES: ReadonlyArray<readonly [string, string, string]> = [
  ['America/Los_Angeles', '洛杉矶', 'Los Angeles'],
  ['America/Denver', '丹佛', 'Denver'],
  ['America/Chicago', '芝加哥', 'Chicago'],
  ['America/New_York', '纽约', 'New York'],
  ['America/Toronto', '多伦多', 'Toronto'],
  ['Pacific/Honolulu', '檀香山', 'Honolulu'],
  ['Europe/London', '伦敦', 'London'],
  ['Europe/Paris', '巴黎', 'Paris'],
  ['Europe/Berlin', '柏林', 'Berlin'],
  ['Asia/Dubai', '迪拜', 'Dubai'],
  ['Asia/Kolkata', '孟买', 'Mumbai'],
  ['Asia/Singapore', '新加坡', 'Singapore'],
  ['Asia/Shanghai', '北京 / 上海', 'Beijing / Shanghai'],
  ['Asia/Hong_Kong', '香港', 'Hong Kong'],
  ['Asia/Taipei', '台北', 'Taipei'],
  ['Asia/Seoul', '首尔', 'Seoul'],
  ['Asia/Tokyo', '东京', 'Tokyo'],
  ['Australia/Sydney', '悉尼', 'Sydney'],
  ['UTC', 'UTC', 'UTC'],
];

export function browserZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function zoneLabel(tz: string, lang: Lang): string {
  const hit = COMMON_ZONES.find((z) => z[0] === tz);
  if (hit) return lang === 'zh' ? hit[1] : hit[2];
  return (tz.split('/').pop() ?? tz).replace(/_/g, ' ');
}

/** 浏览器支持的全部时区（不支持时只给常用的） */
export function allZones(): string[] {
  const f = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
  try {
    return f ? f('timeZone') : COMMON_ZONES.map((z) => z[0]);
  } catch {
    return COMMON_ZONES.map((z) => z[0]);
  }
}

export function isValidZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function ymd(d: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** 某个时刻在某时区的「时:分」；不是那个时区的今天时前面加上日期 */
export function clockIn(at: Date, tz: string, lang: Lang, now = new Date()): string {
  const zone = isValidZone(tz) ? tz : 'UTC';
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(at);
  if (ymd(at, zone) === ymd(now, zone)) return time;
  const date = new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en-US', { timeZone: zone, month: lang === 'zh' ? 'numeric' : 'short', day: 'numeric' }).format(at);
  return `${date} ${time}`;
}

/** 时区缩写（PST、EST、GMT+8），窄屏顶栏用 */
export function zoneShort(tz: string, at = new Date()): string {
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' }).formatToParts(at).find((p) => p.type === 'timeZoneName');
    return part?.value ?? tz;
  } catch {
    return tz;
  }
}
