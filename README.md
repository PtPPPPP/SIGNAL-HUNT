# SIGNAL HUNT

> 幸运信号捕获 · 线下展会现场使用的离线触屏抽奖系统。

SIGNAL HUNT 是 Quantum Design 为展会现场打造的离线触屏抽奖系统。访客触摸屏幕后，系统会先在本机 IndexedDB 中安全地提交抽奖结果与库存变化，再播放信号扫描动画，最后揭晓中奖结果。

它不是年会抽人名，也不是转盘、老虎机或红包雨。核心目标只有三个：**现场稳定、库存准确、断电或刷新后不重抽**。

---

## 核心能力

**技术栈**

- React + Vite + TypeScript
- Dexie / IndexedDB 本地持久化
- Zod 数据校验
- `crypto.getRandomValues()` 安全随机源

**抽奖与库存**

- 加权抽奖与 Smart Prize Pacing
- 事件可用性门控：按活动时段与状态（未开始 / 已结束 / 未激活 / 暂停）决定是否允许抽奖
- 库存扣减、中奖记录、刷新恢复
- 工作人员兑奖、作废、结束展示

**运营后台**

- 活动、奖项、概率、记录、系统与诊断页面
- 完整备份与恢复

**可靠性**

- 持久化诊断日志（IndexedDB，可导出 JSON，写入前自动脱敏）
- 4K 大屏 Canvas 优化（DPR 封顶、ResizeObserver、后台暂停）
- Playwright E2E 覆盖三端联动（展示 / 工作人员 / 后台）
- GitHub Actions CI（lint / typecheck / test / build / e2e）
- stress / burn-in / preflight 可靠性检查

当前默认演示奖项只有三档：**一等奖 / 二等奖 / 三等奖**，没有「谢谢参与」。

---

## 快速运行

现场管理员和工作人员请先阅读：[SIGNAL HUNT 使用文档](docs/user-guide.md)。

```powershell
cd /d D:\Program\snn\vibe-coding\SIGNAL-HUNT
npm install
npm run dev
```

推荐访问：

```text
http://127.0.0.1:5180
```

请优先使用 `127.0.0.1`，不要优先使用 `localhost`。在部分 Windows 环境中，`localhost` 可能解析到 IPv6 `::1`，导致页面打不开或请求超时。

---

## 常用页面

| 页面 | 用途 |
| --- | --- |
| `/display` | 展会大屏 / 触摸屏抽奖页面 |
| `/staff` | 工作人员兑奖、结束展示、作废记录 |
| `/admin/dashboard` | 展会控制中心首页 |
| `/admin/event` | 活动创建、激活、暂停、结束 |
| `/admin/prizes` | 奖项、库存、权重和高级 pacing 参数 |
| `/admin/pacing` | 概率与发放策略控制台，直接编辑中奖百分比 |
| `/admin/records` | 抽奖记录查询 |
| `/admin/system` | 备份、恢复和系统状态 |
| `/diagnostics` | 现场诊断和运行自检 |

---

## 现场抽奖规则

真实抽奖顺序固定为：

```text
触摸屏幕
  -> 校验活动可用性（时段与状态）
  -> 计算可抽奖池
  -> 安全随机加权选择奖项
  -> 扣减库存
  -> 写入 DrawSession 和 DrawRecord
  -> 播放动画
  -> 展示结果
```

结果一定**先提交，再播放动画**——动画不会决定中奖结果。

奖项进入奖池必须同时满足：

```text
enabled === true
inventoryRemaining > 0
effectiveWeight > 0
```

刷新、崩溃或重新打开页面时，如果已有提交但未结束的中奖结果，系统会恢复同一条记录，**不会重新抽奖**。

---

## 奖项配置

后台路径：

```text
http://127.0.0.1:5180/admin/prizes
```

推荐通过页面配置或导入 JSON，**不要直接改 IndexedDB**。

三档奖项示例：

```json
[
  {
    "id": "prize-first",
    "name": "一等奖",
    "shortName": "一等奖",
    "level": 1,
    "inventoryTotal": 1,
    "inventoryRemaining": 1,
    "weight": 5,
    "enabled": true,
    "probabilityMode": "FIXED"
  },
  {
    "id": "prize-second",
    "name": "二等奖",
    "shortName": "二等奖",
    "level": 2,
    "inventoryTotal": 5,
    "inventoryRemaining": 5,
    "weight": 25,
    "enabled": true,
    "probabilityMode": "FIXED"
  },
  {
    "id": "prize-third",
    "name": "三等奖",
    "shortName": "三等奖",
    "level": 3,
    "inventoryTotal": 20,
    "inventoryRemaining": 20,
    "weight": 70,
    "enabled": true,
    "probabilityMode": "FIXED"
  }
]
```

导入会**替换当前奖项表，但不会删除历史抽奖记录**。历史记录里已经产生过的奖项名称会继续保留。

---

## 调整中奖概率

运营人员推荐使用：

```text
http://127.0.0.1:5180/admin/pacing
```

操作顺序：

```text
打开 /admin/pacing
确认预计参与人数
在简单模式中修改各奖项百分比
确认合计概率为 100%
查看预计中奖人数和库存风险
点击「保存并应用」
```

页面显示的是百分比，真实抽奖仍使用内部 `weight` 和 `effectiveWeight`。例如：

```text
一等奖 5%
二等奖 25%
三等奖 70%
```

保存后会转换为：

```text
weight = 5 / 25 / 70
```

如果开启 Time Release 或 Smart Pacing，真实抽奖会先计算 `effectiveWeight`，再进入加权选择。

概率控制台支持：

- **简单模式**：直接编辑百分比
- **智能模式**：配置均匀发放、大奖保护、最小间隔和闭展前追赶
- **高级模式**：查看 Base Weight、Multiplier、Sensitivity 等算法参数
- **自动平衡**：锁定奖项不变，当前编辑奖项不变，其余未锁定奖项按原相对比例重分配
- **库存建议**：根据库存生成建议概率，只预览，不会静默覆盖
- **库存风险**：按预计参与人数计算预计中奖人数，提示奖品是否可能不够

新配置只影响**下一次尚未开始的抽奖**，不会修改已经提交的中奖结果。

---

## 工作人员操作

工作人员页面：

```text
http://127.0.0.1:5180/staff
```

可执行操作：

- 确认兑奖
- 结束当前结果展示
- 作废未兑奖记录
- 使用 `Ctrl + Shift + E` 快捷结束当前展示

注意：

- 确认兑奖**不会**自动结束展示
- 结束展示**不会**自动确认兑奖
- 作废记录**不会**自动恢复库存
- 已兑奖记录**不能**直接作废

---

## 数据与备份

数据存储在当前浏览器的 IndexedDB：

```text
database: signal-hunt
schema:  v4
```

表：

```text
events
prizes
drawSessions
drawRecords
diagnosticLogs   （现场诊断日志，不随备份导出）
```

换电脑、换浏览器或清空浏览器数据后，需要重新导入活动和奖项。展前和收展时都建议在 `/admin/system` 下载完整备份。

---

## 质量检查

常用命令：

```powershell
npm run lint
npm run typecheck
npm test
npm run test:stress
npm run build
```

一键检查：

```powershell
npm run verify:quick
npm run verify:release
npm run verify:onsite
```

含义：

| 命令 | 用途 |
| --- | --- |
| `verify:quick` | lint + typecheck + unit tests + build |
| `verify:release` | `verify:quick` + stress tests |
| `verify:onsite` | `verify:release` + 5 分钟 burn-in + preflight |
| `burnin:smoke` | 20 秒快速 burn-in |
| `burnin:short` | 5 分钟现场前 burn-in |
| `burnin:full` | 8 小时 soak，未真实跑满不要声称通过 |
| `preflight` | 静态发布自检，需先执行 `npm run build` |
| `test:e2e` | Playwright 真实浏览器 E2E（自动启动 dev server） |
| `test:perf` | 仓储查询性能基准（100/1k/10k/50k 记录），仅打印耗时，不设硬门槛 |

可靠性细节见 [`docs/reliability.md`](docs/reliability.md)。

---

## E2E 测试

真实浏览器流程由 Playwright 覆盖，启动方式：

```powershell
npm run test:e2e
```

首次运行前需要安装浏览器内核：

```powershell
npx playwright install chromium
```

`npm run test:e2e` 会自动启动本地 dev server（`http://127.0.0.1:5180`）。每个测试使用独立浏览器上下文，因此拥有独立的 IndexedDB，互不污染。DEV 模式下展示页会自动 seed 一个演示活动，测试从此已知状态出发。

覆盖范围：

| 测试 | 覆盖内容 |
| --- | --- |
| E2E-1 | 触摸抽奖 → 结果揭示 → 刷新恢复同一奖品，且只产生一条 DrawRecord、库存只扣一次 |
| E2E-2 | 工作人员结束展示，展示页回到待机，不重新抽奖、不重复扣库存 |
| E2E-3 | 工作人员确认兑奖，重复兑奖被明确拦截，记录只保留一个兑奖时间戳 |
| E2E-4 | 奖项 JSON 配置导入并刷新后仍然存在（真实持久化） |
| E2E-5 | 单奖品耗尽后退出奖池，再次抽奖进入工作人员协助 ERROR，不会超发 |
| E2E-6 | 合法 JSON 导入成功；非法 JSON 被 Zod 拦截，奖品表不被部分污染 |

E2E-5 通过导入「仅一个启用且有库存的奖项」使抽奖确定化，因此无需修改生产 `crypto` 随机源即可验证耗尽与奖池行为。

> 概率控制台（`/admin/pacing`）的 UI 流程目前不在 E2E 中驱动，其 UI 仍在持续重构；概率持久化与「奖池使用配置」由 E2E-4 / E2E-5 以确定性方式覆盖。

---

## 数据规模与性能

`drawRecords` 自 schema v3 起增加了 `[eventId+prizeId]` 与 `[eventId+status]` 复合索引（schema v4 进一步对历史活动做了时间戳归一化迁移）。提交抽奖（`commitPersistentDraw`）不再读取全表记录，而是按当前活动索引读取，节奏（Pacing）计算也只扫描当前活动的记录。

新增的索引查询接口：

- `getRecordsByEvent(eventId)`：按 `eventId` 索引读取当前活动记录。
- `countWinsByPrize(eventId, prizeId)`：按 `[eventId+prizeId]` 复合索引统计中奖数。
- `countRedeemedByEvent(eventId)`：按 `[eventId+status]` 复合索引统计已兑奖数。
- `getLatestRecord(eventId)`：当前活动最新一条记录。

性能基准（`npm run test:perf`，使用 fake-indexeddb 内存实现，真实 IndexedDB 上索引收益更大）：

| 目标活动记录数 / 总记录数 | 全表扫描（旧） | 按活动索引读取（v3+） |
| --- | --- | --- |
| 100 / 300 | ~0.7 ms | ~0.6 ms |
| 1 000 / 3 000 | ~6.4 ms | ~3.9 ms |
| 10 000 / 30 000 | ~74 ms | ~41 ms |
| 50 000 / 150 000 | ~372 ms | ~220 ms |

事件级读取随活动记录数线性增长，且始终约为全表扫描的 1/3（另外 2/3 属于其它活动，被索引跳过）。基准只打印耗时、检查复杂度，不设脆弱的硬时间门槛。

---

## 诊断日志

诊断日志持久化在 IndexedDB 的 `diagnosticLogs` 表（自 schema v3 引入，当前 schema v4），刷新或崩溃后仍然保留：

```text
database: signal-hunt
table:    diagnosticLogs
保留上限: 500 条（超出自动裁剪最旧）
```

打开 `/diagnostics`：

- 按级别（error / warn / info）与 Code 过滤。
- 「导出诊断日志」下载 `signal-hunt-diagnostics-YYYYMMDD-HHmmss.json`，包含 app 版本、环境摘要与日志。
- 「清空日志」清空持久化日志。

日志在写入前会做隐私脱敏：手机号、参与者 PII、邮箱等敏感字段会被遮蔽或替换为 `[redacted]`，且日志不会随备份导出，也不会上传云端。

诊断页同时展示 Canvas 实时指标：FPS、CSS 尺寸、backing buffer 尺寸、DPR、封顶后 DPR、RAF 是否运行、页面可见性。

---

## 4K 展示尺寸

`SignalCanvas` 针对大屏做了三项优化：

- **DPR 封顶**：backing buffer 不再随 `devicePixelRatio` 无限放大，默认封顶 2（`DEFAULT_MAX_CANVAS_DPR`）。现场可在 kiosk 控制台用 `localStorage['signal-hunt:maxCanvasDpr'] = 2` 调整，无需重新构建。
- **ResizeObserver**：容器尺寸变化由 `ResizeObserver` 捕获并合并到下一帧，渲染循环不再每帧读取布局。
- **后台暂停**：页面 `document.hidden` 时暂停 `requestAnimationFrame`，恢复时继续；kiosk 主屏始终可见，不受影响。

---

## 持续集成

GitHub Actions（`.github/workflows/ci.yml`）在 push / PR 时运行：

```text
build 任务: lint → typecheck → unit tests → build
e2e  任务:  仅在 build 通过后运行 Playwright，失败时上传 trace / 截图 / 视频（保留 7 天）
```

---

## 展前检查

1. 执行 `npm run verify:onsite`。
2. 打开 `/admin/event`，确认目标活动为 `ACTIVE`。
3. 打开 `/admin/pacing`，确认概率合计 100%，库存风险可接受。
4. 打开 `/admin/system`，下载一份展前完整备份。
5. 打开 `/diagnostics`，确认现场自检没有阻塞项。
6. 在 `/admin/system` 选择窗口、全屏或展会锁定模式，再返回 `/display` 核对大屏。

---

## 项目结构

```text
src/app        React 应用入口和路由
src/components 通用 UI 组件
src/db         IndexedDB / Dexie 数据库和仓储
src/domain     抽奖核心业务规则
src/features   业务流程和功能模块
src/pages      页面组件
src/styles     全局样式和设计变量
src/visual     Canvas 信号视觉引擎
src/perf       性能基准
src/stress     压力测试
src/burn-in    burn-in 辅助
scripts        burn-in、preflight 与桌面打包脚本
docs           可靠性、使用与发布文档
e2e            Playwright 端到端测试
electron       桌面版主进程与 preload
```

关键文件：

| 文件 | 作用 |
| --- | --- |
| `src/domain/draw/drawService.ts` | 安全随机、奖池过滤、加权选择、提交抽奖 |
| `src/domain/draw/eventParticipation.ts` | 事件可用性门控（时段 / 状态判定） |
| `src/db/drawRepository.ts` | 持久化提交、恢复、兑奖、作废 |
| `src/domain/draw/prizePacing.ts` | Time Release / Smart Pacing 计算 |
| `src/domain/draw/prizeProbability.ts` | 百分比、自动平衡、库存建议 |
| `src/features/display/displayStateMachine.ts` | 展示页状态机 |
| `src/pages/display/DisplayPage.tsx` | 触屏抽奖主页面 |
| `src/pages/admin/AdminPacingPage.tsx` | 概率与发放策略控制台 |
| `src/pages/staff/StaffPage.tsx` | 工作人员现场操作 |

---

## 当前可优化方向

这些不是当前阻塞项，但建议按优先级逐步推进：

1. **拆分大型后台页面**：`AdminPacingPage`、`AdminDiagnosticsPage`、`AdminPrizesPage` 已经偏大，后续维护成本会升高（部分页面正在重构）。
2. **完善桌面版现场验收**：当前已接入 Electron 打包，后续仍建议在真实 4K 触控屏、展台电脑和断网环境下完整回归。
3. **真实 4K / 触控硬件验证**：DPR 封顶与 Canvas 优化基于代码与单元测试，仍需在真实大屏与触控屏上回归。

---

## Windows 注意事项

PowerShell 直接读取中文文件时可能显示乱码，这通常是控制台编码问题，不代表源文件损坏。建议：

- 搜索中文内容用 `rg`
- Node 读文件时显式使用 `utf8`
- 不要因为 PowerShell 输出乱码就批量重编码源文件
- PowerShell 设置环境变量使用 `$env:NAME='value'; npm run ...`

---

## Windows 桌面版打包

桌面版用于现场离线运行，入口是 Electron。React 页面仍由 Vite 构建，打包后通过本地 `file://` 加载，不依赖现场网络。

常用命令：

```powershell
nvm use 24.15.0
npm run electron:compile
npm run electron:package
npm run electron:build
npm run electron:make
```

桌面打包固定使用 `.nvmrc` 中的 Node 24.15.0，也支持 Node 22 LTS。**不要使用 Node 24.16 及以上版本执行 Forge 7 打包**；上游已知问题会让打包停在 Finalizing 且不生成 `out/`。

如果 `%TEMP%` 中存在与当前 Electron 版本完全匹配的 `electron-v版本-win32-x64.zip`，构建会自动复用；也可以设置 `ELECTRON_ZIP_DIR` 指向该 ZIP 所在目录。只有文件真实存在时才启用本地 ZIP，否则 Forge 使用标准 Electron 下载缓存。

命令含义：

| 命令 | 用途 |
| --- | --- |
| `electron:compile` | 编译 Electron 主进程和 preload |
| `electron:package` | 构建前端并生成 unpacked Windows app |
| `electron:make` | 生成 Windows 安装包和 zip 包 |
| `electron:build` | 完整 Beta 发布构建，等同于 `electron:make` 并验证全部产物 |
| `electron:verify -- package\|make` | 单独复核已有桌面产物 |
| `electron:smoke` | 启动 packaged exe，验证三种显示模式、首次后台窗口、返回大屏及后台/工作人员快捷键 |
| `verify:desktop` | lint、typecheck、Electron 测试、前端构建、桌面打包 |

桌面版行为：

- 默认打开 `/display`
- 首次打包运行默认使用全屏模式，开发运行默认使用窗口模式
- 管理员可在系统设置中切换窗口、全屏和展会锁定（Kiosk）模式；选择保存在 Electron 用户数据目录，下次启动继续使用
- 显示模式只作用于 Display Window，后台与工作人员共用的 Control Window 始终保持普通窗口
- `Ctrl + Shift + A` 打开或聚焦后台控制窗口
- `Ctrl + Shift + S` 打开或聚焦工作人员窗口
- 后台和工作人员端顶部始终提供「返回展会大屏」按钮；有未保存修改时必须确认后才能离开
- 「返回展会大屏」只隐藏 Control Window，不关闭进程、不销毁窗口、不重载当前控制端页面；可用上述快捷键立即恢复
- 正式版首次没有活动时自动打开后台，配置并激活活动后大屏自动进入待机
- Display 与 Control 使用同一 IndexedDB；Dexie liveQuery 负责数据库观察，统一同步通知负责在活动、奖品、概率和备份恢复成功后立即触发重新读取
- Quantum Design Logo 使用 Vite `BASE_URL` 解析，浏览器和 packaged Electron 都从本地 `public/brand/quantum-design-logo.png` 加载
- 使用单实例启动，重复打开会聚焦已有窗口
- 主窗口关闭外链跳转和新窗口
- preload 只暴露 `window.signalHuntDesktop`，用于 Display Window 模式设置和 JSON/CSV 文件导出
- 抽奖数据仍保存在本机 IndexedDB，不会改动现有抽奖算法和库存提交语义

桌面版现场检查：

1. 执行 `npm run verify:desktop`。
2. 打开生成的 Windows app，确认首屏进入 `/display`。
3. 断网后重启 app，确认页面、动画、后台和工作人员页面可用。
4. 完成一次抽奖、兑换、结束展示，再刷新或重启 app，确认记录和库存不重复提交。
5. 在 `/admin/system` 下载备份，在 `/diagnostics` 导出诊断日志。
6. 依次检查窗口、全屏和展会锁定模式，再在真实触控屏上确认触摸、Canvas 尺寸和 4K 性能。

---

## License

MIT
