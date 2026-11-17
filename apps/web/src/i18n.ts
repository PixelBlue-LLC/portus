/**
 * 界面文字，中英两套放在一起：每条是 [中文, English]，不会漏翻。
 * 语言默认跟随浏览器（中文系统显示中文，其余英文），设置里可以手动切。
 * core 里拼的句子另有 lang 参数，见 portus-core 的 lang.ts。
 */
import type { Lang } from 'portus-core';

export type LangPref = 'auto' | 'zh' | 'en';

const M = {
  // 导航和外框
  'nav.today': ['今天', 'Today'],
  'nav.holdings': ['持仓', 'Holdings'],
  'nav.market': ['市场', 'Market'],
  'nav.options': ['期权', 'Options'],
  'nav.ask': ['问 AI', 'Ask AI'],
  'nav.settings': ['设置', 'Settings'],
  'nav.main': ['主导航', 'Main navigation'],
  'foot.quotesAt': ['行情 {t}', 'Quotes {t}'],
  'foot.noQuotes': ['未接入行情', 'No market data'],
  'foot.local': ['数据只存在这个浏览器里', 'Your data stays in this browser'],
  'foot.switchLang': ['English', '中文'],
  'sample.viewing': ['正在看示例数据（虚构持仓）', 'Viewing sample data (fictional holdings)'],
  'sample.enter': ['录入我的持仓', 'Enter my holdings'],
  'sample.exit': ['退出示例', 'Exit sample'],

  // 通用
  'common.refresh': ['刷新', 'Refresh'],
  'common.refreshing': ['刷新中…', 'Refreshing…'],
  'common.connectData': ['接入行情', 'Connect market data'],
  'common.goSettings': ['去设置', 'Open Settings'],
  'common.other': ['其他', 'Other'],
  'common.cash': ['现金', 'Cash'],
  'common.today': ['今日', 'Today'],
  'common.total': ['累计', 'Total'],
  'common.totalValue': ['总市值', 'Total value'],
  'common.cancel': ['取消', 'Cancel'],
  'common.clear': ['清空', 'Clear'],
  'common.collapse': ['收起', 'Collapse'],
  'common.sep': ['；', '; '],

  // 今天
  'today.quotesUpdated': ['行情 {t} 更新', 'Quotes updated {t}'],
  'today.manualPrices': ['还没有接入行情，价格为手动填写', 'No market data yet; prices are entered by hand'],
  'today.stale': ['行情是 {t} 的，已经超过一天没更新。', 'Quotes are from {t}, more than a day old.'],
  'today.dayLine': ['今日 {usd} · {pct}', 'Today {usd} · {pct}'],
  'today.needQuotes': ['今日涨跌需要行情', "Today's move needs market data"],
  'today.lossFrom': ['今天的亏损来自', "Today's loss came from"],
  'today.gainFrom': ['今天的盈利来自', "Today's gain came from"],
  'tile.risk': ['风险评分', 'Risk score'],
  'tile.totalPnl': ['累计盈亏', 'Total P&L'],
  'tile.positions': ['{n} 只持仓', '{n} holdings'],
  'tile.over': ['集中度超标', 'Over limit'],
  'tile.items': ['{n} 项', '{n}'],
  'tile.rules': ['共 {n} 条规则', 'of {n} rules'],
  'today.riskFirst': ['先看风险', 'Risk first'],
  'today.overN': ['{n} 项超标', '{n} over limit'],
  'today.allWithin': ['全部在阈值内', 'All within limits'],
  'today.seeAll': ['看全部持仓和规则 →', 'All holdings and rules →'],
  'th.holding': ['持仓', 'Holding'],
  'th.weight': ['仓位', 'Weight'],
  'th.day': ['当日', 'Today'],
  'th.dayUsd': ['今日 $', 'Today $'],
  'today.what': ['今天发生了什么', 'What happened today'],
  'today.watch': ['明天看什么', 'What to watch tomorrow'],
  'today.watchEmpty': ['接入行情后，这里会列出需要留意的变化。', 'Connect market data to see what to watch here.'],
  'today.sectors': ['板块', 'Sectors'],
  'today.allDown': [' · 全部下跌', ' · all down'],
  'today.allUp': [' · 全部上涨', ' · all up'],
  'today.newsN': ['新闻 {n} 条 →', '{n} news →'],
  'today.marketLink': ['市场 →', 'Market →'],
  'attr.needQuotes': ['接入行情后，这里会说明今天的涨跌来自哪里。', "Connect market data to see where today's move came from."],
  'attr.busy': ['AI 解读中…', 'AI is reading…'],
  'attr.redo': ['重新解读', 'Explain again'],
  'attr.run': ['用 AI 解读', 'Explain with AI'],
  'attr.needKey1': ['填写 Anthropic key 后可以用 AI 解读（', 'Add an Anthropic key to get an AI explanation ('],
  'attr.needKey2': ['）。只解释数据，不给买卖建议。', '). It explains data only, never buy or sell advice.'],
  'welcome.title': ['先录入你的持仓', 'Start by adding your holdings'],
  'welcome.lead': [
    '数据只存在这个浏览器里，不会上传。录入后可以看到仓位分布、集中度和风险评分；填了行情 key 还能看当天涨跌、板块和新闻。',
    "Your data stays in this browser and is never uploaded. After you add holdings you'll see allocation, concentration and a risk score; with a market data key you also get today's moves, sectors and news.",
  ],
  'welcome.enter': ['录入持仓', 'Add holdings'],
  'welcome.sample': ['用示例数据看看', 'Try sample data'],
  'welcome.notice': [
    '这是研究工具，不是投资建议，不连接券商、不下单。示例数据是虚构的。',
    'This is a research tool, not investment advice. It does not connect to brokers or place orders. Sample data is fictional.',
  ],

  // 组件
  'conc.aria': ['{name} {pct}%，阈值 {limit}%', '{name} {pct}%, limit {limit}%'],
  'heat.empty': ['接入行情后显示板块涨跌。', 'Connect market data to see sector moves.'],

  // 持仓
  'hold.priceImport': ['导入时的价格', 'Price at import'],
  'hold.priceCost': ['暂用成本价', 'Using cost price'],
  'hold.qtyCost': ['数量 · 成本', 'Shares · cost'],
  'hold.sharesAt': ['{q} 股 · ${c}', '{q} sh · ${c}'],
  'hold.rangeAria': ['52 周区间位置 {n}%', 'Position in 52-week range {n}%'],
  'hold.low52': ['52 周低 {v}', '52-wk low {v}'],
  'hold.high52': ['高 {v}', 'high {v}'],
  'hold.count': ['{n} 只', '{n} holdings'],
  'hold.accountsN': [' · {n} 个账户', ' · {n} accounts'],
  'hold.priceSrc': [' · 价格来源：{s}', ' · Prices: {s}'],
  'hold.srcQuotes': ['行情', 'market data'],
  'hold.srcNone': ['未接入行情', 'not connected'],
  'hold.edit': ['编辑', 'Edit'],
  'hold.viewAria': ['账户显示方式', 'Account view'],
  'hold.merged': ['合并账户', 'Combine accounts'],
  'hold.split': ['按账户分开', 'Separate by account'],
  'hold.alloc': ['仓位分布', 'Allocation'],
  'hold.allocAll': ['（所有账户合并）', ' (all accounts combined)'],
  'hold.acctLine': ['{v} · 占总资产 {p}% · 现金 {c}', '{v} · {p}% of total · cash {c}'],
  'hold.ofAccount': ['占该账户', 'of account'],
  'hold.conc': ['集中度', 'Concentration'],
  'hold.concCount': ['{o} 项超标 · {k} 项正常', '{o} over · {k} OK'],
  'hold.concMulti': ['按所有账户合并计算（同一只股票在不同账户算一个仓位）。', 'Calculated across all accounts (one stock held in several accounts counts as one position). '],
  'hold.concNote': ['阈值可以在设置里改。', 'You can change the limits in Settings.'],

  // 录入和导入
  'edit.title': ['录入持仓', 'Edit holdings'],
  'edit.sub': ['只存在这个浏览器里。现价和行业分类会从行情自动获取，不用填。', 'Stored only in this browser. Prices and industries come from market data automatically.'],
  'edit.save': ['保存', 'Save'],
  'edit.acctPrompt': ['账户名（比如 Schwab、IBKR、Fidelity）', 'Account name (e.g. Schwab, IBKR, Fidelity)'],
  'edit.removeConfirm': ['删除「{a}」这个账户里的全部持仓和现金？', 'Delete all holdings and cash in "{a}"?'],
  'edit.noneFound': ['没有识别到持仓', 'No holdings found'],
  'edit.imported': ['已导入 {n} 条到「{a}」{skip}。确认无误后点「保存」。', 'Imported {n} rows into "{a}"{skip}. Check them, then click Save.'],
  'edit.skipped': ['，跳过 {n} 行：{list}', ', skipped {n} rows: {list}'],
  'edit.acctTabs': ['账户', 'Accounts'],
  'edit.addAcct': ['+ 账户', '+ Account'],
  'edit.delAcct': ['删除这个账户', 'Delete this account'],
  'col.symbol': ['代码', 'Symbol'],
  'col.qty': ['数量', 'Shares'],
  'col.cost': ['每股成本', 'Cost/share'],
  'col.total': ['总成本', 'Total cost'],
  'col.mv': ['市值', 'Market value'],
  'edit.delRow': ['删除 {s}', 'Delete {s}'],
  'edit.thisRow': ['这一行', 'this row'],
  'edit.emptyAcct': ['「{a}」还没有持仓。可以手动加，也可以在下面导入。', '"{a}" has no holdings yet. Add rows by hand or import below.'],
  'edit.totals': ['「{a}」合计：总成本 {c} · 市值 {m}', '"{a}" total: cost {c} · market value {m}'],
  'edit.unreal': [' · 浮动盈亏 ', ' · unrealized '],
  'edit.withCash': [' · 加现金共 {v}', ' · {v} with cash'],
  'edit.missing': ['（部分没有价格，接入行情后补上）', ' (some prices missing; they fill in with market data)'],
  'edit.addRow': ['加一行', 'Add row'],
  'edit.cashLabel': ['「{a}」现金 $', '"{a}" cash $'],
  'imp.csvTitle': ['从券商导入 CSV', 'Import a broker CSV'],
  'imp.csvBody': [
    '在券商网站导出持仓（Positions）CSV。会识别代码、数量、成本和现金；导入前会问你放进哪个账户、要不要保留现有持仓。',
    'Export your positions as CSV from your broker. Symbols, shares, cost and cash are read; before importing you choose the account and whether to keep existing holdings.',
  ],
  'imp.choose': ['选择 CSV 文件', 'Choose CSV file'],
  'imp.pasteTitle': ['粘贴文本', 'Paste text'],
  'imp.pasteHint': ['每行：代码 数量 每股成本', 'One per line: symbol shares cost'],
  'imp.parse': ['识别', 'Read'],
  'dlg.aria': ['确认导入', 'Confirm import'],
  'dlg.found': ['识别到 {n} 条持仓{cash}', 'Found {n} holdings{cash}'],
  'dlg.cash': ['，现金 {v}', ', cash {v}'],
  'dlg.sampleGone': ['示例数据会被删掉，换成你导入的持仓。', 'Sample data will be removed and replaced by your import.'],
  'dlg.whichAcct': ['放进哪个账户？', 'Which account?'],
  'dlg.acctPh': ['比如 Schwab、IBKR', 'e.g. Schwab, IBKR'],
  'dlg.detected': ['从文件格式认出是 {b}。', 'Detected {b} from the file format.'],
  'dlg.existing': ['你已经有 {n} 条持仓（{list}），怎么处理？', 'You already have {n} holdings ({list}). What should happen to them?'],
  'dlg.add': ['加进来，保留现有持仓', 'Add, keep existing holdings'],
  'dlg.updCsv': ['「{a}」已经有持仓，这个账户会换成这次导入的内容，其他账户不动', '"{a}" already has holdings; this account is replaced by the import, other accounts stay'],
  'dlg.updPaste': ['「{a}」已经有持仓，同代码以这次的为准，其他账户不动', '"{a}" already has holdings; matching symbols take the new values, other accounts stay'],
  'dlg.newAcct': ['作为新账户「{a}」', 'As a new account "{a}"'],
  'dlg.replace': ['清除现有全部持仓，只留这次导入的', 'Clear all existing holdings, keep only this import'],
  'dlg.viewQ': ['导入后有 {n} 个账户，持仓页怎么显示？', 'You will have {n} accounts. How should Holdings show them?'],
  'dlg.mergedDesc': ['同一只股票合成一条，看整体仓位', 'One row per stock, showing the overall position'],
  'dlg.splitDesc': ['每个券商单独列出（以后在持仓页也能切换）', 'Each broker listed separately (you can switch later on Holdings)'],
  'dlg.riskNote': ['风险和集中度始终按所有账户合并计算。', 'Risk and concentration always combine all accounts.'],
  'dlg.confirm': ['确认导入', 'Import'],

  // 市场
  'mkt.needKey': ['接入行情后可用', 'Available with market data'],
  'mkt.needKeyBody': [
    '板块涨跌和持仓新闻需要一个行情 key。Finnhub 免费档就够用（每分钟 60 次，限个人非商业使用）。',
    'Sector moves and holding news need a market data key. The free Finnhub tier is enough (60 calls a minute, personal non-commercial use).',
  ],
  'mkt.allDown': ['{n} 个板块和指数全部下跌', 'All {n} sectors and indexes fell'],
  'mkt.allUp': ['{n} 个板块和指数全部上涨', 'All {n} sectors and indexes rose'],
  'mkt.mixed': ['{u} 个上涨，{d} 个下跌', '{u} up, {d} down'],
  'mkt.sub': ['板块 ETF 当日涨跌 · {t}', 'Sector ETF moves today · {t}'],
  'mkt.noRefresh': ['还没刷新过行情', 'Not refreshed yet'],
  'mkt.spread': ['最强 {b} {bp}，最弱 {w} {wp}，相差 {g} 个百分点。', 'Strongest {b} {bp}, weakest {w} {wp}, {g} points apart.'],
  'mkt.noSectors': ['点「今天」页的刷新拉取板块数据。', 'Use Refresh on Today to load sector data.'],
  'mkt.news': ['持仓相关新闻', 'News on your holdings'],
  'mkt.newsSub': ['最近 4 天 · 新的在前', 'Last 4 days · newest first'],
  'mkt.noNews': ['最近 4 天没有持仓相关新闻，或者还没刷新过。', 'No news on your holdings in the last 4 days, or not refreshed yet.'],
  'mkt.machine': ['机器翻译', 'Machine translated'],
  'mkt.translating': ['正在翻译新闻…', 'Translating news…'],
  'mkt.translateHint': ['填写 Anthropic key 后，新闻会翻译成中文。', 'Add an Anthropic key to translate news.'],
  'mkt.translateFail': ['新闻翻译失败：{e}', 'News translation failed: {e}'],

  // 期权
  'opt.sub': ['研究用 · 只读 · 不下单', 'Research only · read-only · no orders'],
  'opt.data': ['期权数据', 'Option data'],
  'opt.noChain': ['网页版暂时没有期权链', 'No option chains in the web app yet'],
  'opt.body': [
    '免费、实时、又允许浏览器直接调用的期权数据源目前还没有。量化面板（隐含波动率、预期波动、Max Pain、GEX、Skew）和候选筛选已经写好，等数据源接上就能用：',
    'There is no free, real-time option data source that allows direct browser calls yet. The analytics (implied volatility, expected move, Max Pain, GEX, Skew) and screening are already built and will work once a source is connected:',
  ],
  'opt.li1': ['自部署版：Alpaca（免费）或 Schwab（已有账户）', 'Self-hosted edition: Alpaca (free) or Schwab (existing account)'],
  'opt.li2': ['网页版：正在测试哪些数据源允许浏览器直连', 'Web app: testing which sources allow direct browser access'],
  'opt.dsLink': ['数据源设置 →', 'Data source settings →'],
  'opt.checklist': ['交易前检查清单', 'Pre-trade checklist'],
  'opt.checkBody': [
    '下单前自己逐条写下来。理由、最大亏损、止损和止盈任何一项没写，就还不算一个完整的交易计划。',
    "Write each answer yourself before you trade. Without a thesis, maximum loss, exit-on-loss and exit-on-gain conditions, it isn't a complete trade plan yet.",
  ],
  'opt.missing': ['还没写：{list}', 'Not written yet: {list}'],
  'opt.continue': ['继续填写', 'Continue'],
  'opt.start': ['开始填写', 'Start'],
  'opt.q0': ['看涨还是看跌，理由是什么', 'Bullish or bearish, and why'],
  'opt.q1': ['个股、行业、大盘各自的逻辑', 'The case for the stock, its sector and the market'],
  'opt.q2': ['到期前有没有财报或重大事件', 'Earnings or major events before expiry'],
  'opt.q3': ['是做趋势，还是在赌财报', 'Trading a trend, or betting on earnings'],
  'opt.q4': ['为什么选这个到期日', 'Why this expiry'],
  'opt.q5': ['为什么选这个行权价', 'Why this strike'],
  'opt.q6': ['Delta 是否符合预期', 'Is the delta what you want'],
  'opt.q7': ['IV 是否偏高', 'Is IV high'],
  'opt.q8': ['Theta 每天的损耗能否接受', 'Can you accept the daily theta decay'],
  'opt.q9': ['未平仓量和买卖价差是否足够好', 'Are open interest and the bid-ask spread good enough'],
  'opt.q10': ['最大理论亏损', 'Maximum theoretical loss'],
  'opt.q11': ['自己实际能接受的亏损', 'The loss you can actually accept'],
  'opt.q12': ['止损条件', 'Exit-on-loss condition'],
  'opt.q13': ['止盈条件', 'Exit-on-gain condition'],
  'opt.q14': ['是否使用保证金', 'Using margin or not'],
  'opt.q15': ['会不会加重已有的集中度', 'Does it add to existing concentration'],

  // 设置
  'set.sources': ['数据源', 'Data sources'],
  'set.sourcesBody': [
    'key 只存在这个浏览器里，请求从浏览器直接发给对应服务商。建议给 key 设用量上限。',
    'Keys are stored only in this browser, and requests go straight from your browser to each provider. Set a usage limit on your keys.',
  ],
  'set.finnhub': ['Finnhub key（行情、新闻、财报日历）', 'Finnhub key (quotes, news, earnings calendar)'],
  'set.register': ['免费注册', 'Free sign-up'],
  'set.anthropic': ['Anthropic key（AI 解读、问答和新闻翻译）', 'Anthropic key (AI explanations, Q&A, news translation)'],
  'set.get': ['获取', 'Get one'],
  'set.model': ['AI 模型', 'AI model'],
  'set.test': ['测试并刷新行情', 'Test and refresh'],
  'set.refreshed': ['已刷新行情', 'Market data refreshed'],
  'set.display': ['显示', 'Display'],
  'set.language': ['语言', 'Language'],
  'set.langAuto': ['跟随浏览器', 'Follow browser'],
  'set.theme': ['深浅色', 'Theme'],
  'set.themeSystem': ['跟随系统', 'System'],
  'set.light': ['浅色', 'Light'],
  'set.dark': ['深色', 'Dark'],
  'set.colors': ['涨跌颜色', 'Up and down colors'],
  'set.us': ['绿涨红跌', 'Green up, red down'],
  'set.cn': ['红涨绿跌', 'Red up, green down'],
  'set.rules': ['集中度阈值', 'Concentration limits'],
  'set.reset': ['恢复默认', 'Reset'],
  'set.floor': ['（下限）', ' (minimum)'],
  'set.data': ['数据', 'Data'],
  'set.dataBody': [
    '持仓和设置都在这个浏览器的本地存储里。换浏览器或清理缓存前先导出备份。',
    'Holdings and settings live in this browser’s local storage. Export a backup before switching browsers or clearing site data.',
  ],
  'set.export': ['导出备份（不含 key）', 'Export backup (no keys)'],
  'set.import': ['导入备份', 'Import backup'],
  'set.clearAll': ['清除全部', 'Clear all'],
  'set.clearConfirm': ['清除这个浏览器里的全部持仓、设置和 key？', 'Clear all holdings, settings and keys in this browser?'],
  'set.imported': ['已导入备份', 'Backup imported'],
  'set.importFail': ['导入失败', 'Import failed'],
  'set.notice1': [
    '{app} 是开源的研究工具，不是投资建议，不连接券商、不下单，也不收集你的数据。源代码在 ',
    '{app} is an open-source research tool, not investment advice. It does not connect to brokers, place orders or collect your data. Source code is on ',
  ],
  'set.notice2': ['。', '.'],

  // 问 AI
  'ask.needKey': ['填写 Anthropic key 后可用', 'Available with an Anthropic key'],
  'ask.needKeyBody': [
    'AI 会根据你的持仓和当天数据回答问题。key 只存在这个浏览器里，请求直接发给 Anthropic，不经过其他服务器。AI 只解释数据，不给买卖建议。',
    "The AI answers questions using your holdings and today's data. Your key stays in this browser and requests go straight to Anthropic, not through any other server. It explains data only and never gives buy or sell advice.",
  ],
  'ask.sub': ['基于你的持仓和当天数据 · 只解释，不给买卖建议', "Based on your holdings and today's data · explains only, no buy or sell advice"],
  'ask.thinking': ['思考中…', 'Thinking…'],
  'ask.label': ['问一个关于你的持仓的问题', 'Ask a question about your holdings'],
  'ask.ph': ['问你的持仓、板块、风险…', 'Ask about holdings, sectors, risk…'],
  'ask.send': ['发送', 'Send'],
  'ask.s1': ['今天为什么跌（涨）这么多？', 'Why did the portfolio move so much today?'],
  'ask.s2': ['我的风险主要集中在哪？', 'Where is my risk concentrated?'],
  'ask.s3': ['哪只持仓离 52 周高点最远？', 'Which holding is furthest from its 52-week high?'],

  // 出错
  'err.anthropicNet': ['连不上 Anthropic，检查网络后再试', "Can't reach Anthropic. Check your network and try again."],
  'err.anthropicKey': ['Anthropic key 无效', 'Invalid Anthropic key'],
  'err.model': ['找不到模型 {m}，在设置里换一个模型名', 'Model {m} not found. Change the model name in Settings.'],
  'err.anthropicRate': ['Anthropic 请求太频繁，稍后再试', 'Too many requests to Anthropic. Try again later.'],
  'err.anthropicStatus': ['Anthropic 返回 {s}', 'Anthropic returned {s}'],
  'ai.blocked': [
    '这个回答里出现了买卖建议类的措辞，按产品规则不显示。这个工具只解释数据，不提供买卖建议。',
    'This answer contained buy or sell advice wording, so it is hidden under the product rules. This tool explains data only and does not give buy or sell advice.',
  ],
  'chat.error': ['出错了：{e}', 'Something went wrong: {e}'],
  'err.finnhubNet': ['连不上 Finnhub（网络问题，或浏览器拦截了跨域请求）', "Can't reach Finnhub (network problem, or the browser blocked the request)"],
  'err.finnhubKey': ['Finnhub key 无效，或这个接口不在免费档里', 'Invalid Finnhub key, or this endpoint is not in the free tier'],
  'err.finnhubRate': ['Finnhub 免费额度用完了（每分钟 60 次），稍后再刷新', 'Finnhub free quota used up (60 calls a minute). Refresh again later.'],
  'err.finnhubStatus': ['Finnhub 返回 {s}', 'Finnhub returned {s}'],
  'err.backup': ['不是有效的备份文件', 'Not a valid backup file'],
} as const satisfies Record<string, readonly [string, string]>;

export type MsgKey = keyof typeof M;

let current: Lang = detectLang();

export function detectLang(): Lang {
  if (typeof navigator === 'undefined') return 'en';
  const first = navigator.languages?.[0] ?? navigator.language ?? '';
  return /^zh/i.test(first) ? 'zh' : 'en';
}

export function resolveLang(pref: LangPref | undefined): Lang {
  return pref === 'zh' || pref === 'en' ? pref : detectLang();
}

/** App 每次渲染前调用。整个界面随 store 变化重新渲染，所以模块级变量就够了。 */
export function setLang(lang: Lang): void {
  current = lang;
  if (typeof document !== 'undefined') document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
}

export function getLang(): Lang {
  return current;
}

export function t(key: MsgKey, vars?: Record<string, string | number>): string {
  const s: string = M[key][current === 'zh' ? 0 : 1];
  return vars ? s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? '')) : s;
}

/** 测试用：全部条目 */
export const MESSAGES = M;
