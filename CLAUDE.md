# Portus · 开源版

> 进度、卡点、下一步只看 Google Sheets「PixelBlue 排期表」的 Market Compass 页。本文件只写怎么干活。
> 旧的私有版在 `~/PixelBlue-LLC/MarketCompass`（Python + Schwab，自己用），这里是从零重写的开源版。计划见 Claude Docs「Market Compass 开源重写计划」。

## 产品硬约束

- **不给买卖建议或信号。** 只按用户自己设的规则计算和展示；AI 只解释已发生的事实。`packages/core/src/ai.ts` 里的 `violatesAdvicePolicy` 拦截指令性措辞，改 AI 功能时保留这层检查，并在 `insights.test.ts` 里加用例。
- **不碰用户数据。** 持仓、设置、key 只存在浏览器 localStorage；请求从浏览器直接发给用户自己选的服务商。不加任何分析、追踪、cookie。
- **不提供、不转发行情数据。** 用户用自己的 key 自己拉。
- 产品名 Portus（拉丁语「港口」；2026-11-17 由 Loadline 改名，不设中文名）。显示名只在 `apps/web/src/brand.ts` 和 `index.html` 的 `<title>` 里改。npm 上 `portus` 包名已被别人占用，内部包名用 `portus-core` / `portus-web`，且保持 `private: true`，不要发布到 npm。浏览器存储键是 `portus:v1`，`store.ts` 会把旧键 `loadline:v1` 的数据自动搬过来、也接受旧的 `loadline` 备份文件，这段迁移不要删。

- **多账户**（2026-11-06）：持仓带 `account`，现金按账户存（`cashByAccount`）。风险和集中度永远按 `aggregateBySymbol` 跨账户合并后算；持仓页可切「合并账户 / 按账户分开」。导入走 `applyImport`：示例数据直接丢弃；已有持仓时让用户选「加进来 / 清除全部」，同名账户重新导入 CSV = 更新该账户。
- **不用用户填现价和主题**：价格来自行情（没 key 时用导入时的价格或成本价兜底），行业用 Finnhub `profile2` 的 `finnhubIndustry`（中文映射在 `classify.ts`），ETF 退回内置表。
- 测试和示例里只用虚构持仓，不要放真实账户的数字（公开仓库）。

## 结构

- `packages/core`：纯函数（持仓估值、集中度、风险评分、期权指标和筛选、今日结论/归因/明日关注、CSV 导入、AI 提示词和检查）。所有数字都在这里算，带 Vitest 单测。从旧版 Python 移植，测试用例和旧版对照。
- `apps/web`：React + Vite 静态站，hash 路由，`base: './'`，打包到 `apps/web/dist`，CI 在 main 分支自动部署到 GitHub Pages。
- 数据源适配器在 `apps/web/src/data/`（Finnhub、Twelve Data、Anthropic）。三家都已实测允许浏览器直连（返回 `Access-Control-Allow-Origin: *`）。Twelve Data 只用来拉日线（相关性、实际波动率），免费档每分钟 8 次，适配器按 8 只一批、批间等 61 秒；同一天同一只只拉一次（`history.fetchedOn`）。
- **阶段二功能（2026-11-17）**，计算都在 core，各有一个文件和测试（`packages/core/test/features.test.ts`）：
  - `alerts.ts` 规则提醒：用户自己设的条件，触发了只写事实，不给操作建议。新加规则类型要同时加 `describeAlert` 的中英文和 i18n 里的 `alerts.type.*`。
  - `calendar.ts` 事件日历和 .ics 导出：宏观日程是手工维护的官方日程表（美联储、BLS、NYSE），覆盖到 `MACRO_CALENDAR_END`。**每年 11 月前后**等下一年日程公布后补一年，改 `MACRO_CALENDAR_CHECKED`；过了 END 页面会提示「请更新」。
  - `etf.ts` ETF 穿透：内置常见 ETF 的前十大成分（带数据日期），**每季度更新一次**；同一指数的基金共用一张表（`proxy`）。用户可以在页面上给任何 ETF 填自己的成分表（`etfCustom`），优先于内置。
  - `correlation.ts` 相关性：对数收益率、按日期对齐、约半年 126 个交易日、少于 60 个共同交易日不给数字。
  - `plans.ts` 分批计划和挂单记录：只汇总用户录入的数据。
  - `optionImport.ts` 期权链导入：没有找到免费、允许浏览器直连、条款也明确允许这样用的期权数据源，所以让用户贴券商导出的 CSV；列名按别名识别，也认 OCC 合约代码。期权页只显示指标，不显示 `options.ts` 里的策略分类和筛选结果（那些更像建议）。
- **顶栏和行情刷新（2026-11-18）**：每页右上角是 `TopBar.tsx`：美股时段（盘前/盘中/盘后/休市）、行情更新时间（主时区 + 副时区，`settings.tzPrimary` 空 = 跟随浏览器，`tzSecondary` 空 = 不显示）、刷新、语言切换。自动刷新只在常规交易时段按 `autoRefreshMin`（默认 5 分钟）拉报价（`refreshQuotes`，每只 1 次请求），超过一小时才做一次完整刷新（含新闻、财报）；收盘后如果上次刷新之后有过交易，再拉一次收盘价。时段判断在 core 的 `market.ts`（用 `calendar.ts` 的休市表），测试用固定时刻。
- **持仓表对齐券商（2026-11-18）**：宽屏是表格，列和 IBKR「Your Holdings」一样（数量、现价、涨跌幅、总成本、市值、均价、当日盈亏、未实现盈亏），两位小数；窄屏是卡片。券商导出里没有股票代码的行（债券、期权合约）导入成 `noQuote`：不拉行情，价格 = 市值 ÷ 数量、成本 = 总成本 ÷ 数量（债券报价按每 100 面值，直接用价格会差 10 倍），不计入当日盈亏合计。当日盈亏按昨收算，今天新买的仓位券商按成交价算，会对不上，页面上有说明。
- **持仓列、粘贴导入、板块下钻（2026-11-18 第二轮）**：持仓表相关数字合在一列上下两行（现价 + 涨跌 $ · %，市值 + 当日盈亏，总成本 + 均价，未实现盈亏 $ + %），涨跌一律上色；每股涨跌是 core 的 `Position.dayChange`（有昨收用昨收）。粘贴导入走 `parsePastedHoldings`：带表头的表格、一格一行的网页复制、没表头的 IBKR 网页行、「代码 数量 成本」依次试；CSV 也认 IBKR 活动报表的分段格式（只读 Open Positions 段的 Summary 行）。录入页里代码不像股票代码（有空格）的行当作没有行情的持仓，市值手填。这类持仓带 `valuedAt`（市值登记时间：导入、或在录入页改市值时记下），持仓页显示「市值登记于 …」，超过 30 天标黄；跨账户合并取最旧的日期。债券行情没法自动拉（2026-11-18 验证过）：财政部 FedInvest 每天公布国债收盘价，但要带校验码提交表单、没有跨域许可，而且注明只适用于联邦账户专用国债；Finnhub 的债券数据是单独付费的。能从浏览器直接读的只有 Fiscal Data 接口里 TIPS 的通胀调整系数（`tips_cpi_data_detail`，IBKR 的 TIPS 市值 = 报价 ÷ 100 × 面值 × 系数）。市场页板块图以 0 为中线，指数和行业分两组，点一行用 `etfMovers` 看前十大成分股谁贡献最大（报价按需拉，`refreshSymbols`）；`etf.ts` 里因此补了全部 13 只板块 ETF 的前十大，同样每季度更新（XLY 的数据日期是 2025-09，SOXX 是 2026-02，下次更新优先换掉）。
- **第三轮（2026-11-18）**：
  - Finnhub 请求在 `data/finnhub.ts` 里排队（60 秒内最多 55 次，429 时等 15 秒重试一次）；刷新失败时保留上次的报价、板块和新闻，不让页面变空。
  - 市场页新闻按持仓分组、仓位大的在前，每只最近 15 天、最多 10 条（默认先显示 3 条）；中文界面标题和摘要都用用户自己的 Anthropic key 翻译，只翻译正在显示的。
  - 板块展开后可以「用 AI 解读这个板块」：core 的 `sectorPrompt`（数字 + 贡献最大几只的近两天新闻标题），结果存在 `sectorNotes`。股票代码都是链接（`links.ts`，设置里选 Yahoo / Google / TradingView），只是链接，不从这些网站拿数据。
  - 日历：时间按顶栏的主时区写成「6:30 PST」（副时区灰字），日期也按主时区排；同一天内全天事件在前，财报按盘前/盘中/盘后排（core 的 `eventSortTime`）；按天 / 按周 / 按月三种看法，周从周一（中文）或周日（英文）开始。
  - 持仓页集中度下面是「观望」列表（core 的 `watch.ts`：开始观望的日期和价格、用户自己设的目标价、备注；`watchStatus` 算至今涨跌、离目标价还差多少、是否到达，第一次到达记 `reachedAt`，「今天」页的提醒卡片会列出来），只显示价格变化，进备份。
- **ETF 成分表自动更新（2026-11-18）**：`scripts/update_etf_holdings.py`（只用标准库）从 State Street 的公开文件（`holdings-daily-us-en-<代码>.xlsx` + `navhist-us-en-<代码>.xlsx`）生成 `packages/core/src/etfData.ts`：SPY 和 9 只 XL* 板块基金的前十大、权重、每份 ETF 含多少股（持股数 ÷ 基金流通份额）。页面上 `etfTop` 用「每份股数 × 成分股现价 ÷ ETF 现价」重算权重（ETF 和前十大都有报价才算，否则用数据日期的权重），所以权重每天跟着价格变，名单只在跑脚本时更新。QQQ、SMH、SOXX、IWM 仍是手工静态表（iShares 的文件下载地址每只基金不同，没接）。**不要放进 GitHub Actions 自动跑**（2026-11-18 查过）：State Street 的网站条款写着网站信息只能为自己使用，不能复制、传播或再发布，数据库内容也不能为自己以外的人转发。内置表本来就是摘录（以前从 stockanalysis.com 抄的也一样）。**2026-11-18 决定**：开源免费阶段保留内置表（用户打开就能用）；**开始收费前必须处理**：请律师看，或者向 State Street 书面申请许可，否则改成用户自己提供（脚本在用户自己电脑上跑、生成文件导入）。
- **穿透页**：相关性在上、ETF 穿透在下。相关性是横纵热力图（正相关橙红、负相关蓝，不用涨跌的红绿），可以「走势相近的排一起」（core 的 `orderByCorrelation`）或按仓位排，热力图上方选比较哪些股票：持仓（仓位最大的 12 只）和观望可以逐个点掉（`corrOff`），也可以手动加任意代码（存在 `candidates`，只用来比较，不进持仓或观望；有 Twelve Data key 时自动拉这一只的日线）；没有日线数据时也画空格子。
- 页面：「穿透」`pages/Risk.tsx`（ETF 穿透 + 相关性），「日历」`pages/Calendar.tsx`，「计划」`pages/Plans.tsx`（提醒 + 分批计划），期权页的导入卡片在 `pages/Options.tsx`。示例数据带两条示例提醒和一个示例计划（id 以 `sample-` 开头），退出示例时只清这些。布局还没重做（等阶段二全部测完再改）。

## 常用命令

```bash
npm install
npm run dev
npm test
npm run typecheck
npm run build
```

## 规则

- 改了 `core` 的函数要同步测试。测试里别用真实「今天」，固定日期。
- 界面跟随系统深浅色（CSS 变量在 `styles.css`），涨跌颜色可切换（`.pos` / `.neg`）。
- 界面中英双语（2026-11-17）：默认跟随浏览器，设置页和侧栏可切。页面文字全部写在 `apps/web/src/i18n.ts`，每条是 `[中文, English]`，新加文字必须两种都写（`apps/web/test/i18n.test.ts` 会查）。core 里拼句子的函数最后一个参数是 `lang`；主题、行业、规则名在数据里仍用中文做键，显示时用 `nameIn` / `ruleLabel` 翻译。中文界面下新闻标题用用户自己的 Anthropic key 翻译，只缓存在本地，标「机器翻译」。README 中英双语。
- 提交作者：`Jianxiao Cai <93627186+ShawnCai223@users.noreply.github.com>`（以后是公开仓库）。
- 条款和隐私是模板草稿（`docs/TERMS.md`、`docs/PRIVACY.md`），开始收费前请律师看一遍。
