# SIGNAL HUNT

幸运信号捕获。

SIGNAL HUNT 是 Quantum Design 展会现场使用的离线触屏抽奖系统。访客触摸屏幕后，系统会先在本机 IndexedDB 中安全提交抽奖结果和库存变化，再播放信号扫描动画，最后展示中奖结果。

这个项目不是年会抽人名，也不是转盘、老虎机或红包雨。它的核心目标是：现场稳定、库存准确、断电或刷新后不重抽。

## 当前能力

- React + Vite + TypeScript
- Dexie / IndexedDB 本地持久化
- Zod 数据校验
- `crypto.getRandomValues()` 安全随机
- 加权抽奖和 Smart Prize Pacing
- 库存扣减、中奖记录、刷新恢复
- 工作人员兑奖、作废、结束展示
- 后台活动、奖项、概率、记录、系统和诊断页面
- 完整备份与恢复
- stress / burn-in / preflight 可靠性检查

当前默认演示奖项只有三档：

- 一等奖
- 二等奖
- 三等奖

没有“谢谢参与”。

## 快速运行

```powershell
cd /d D:\Program\snn\vibe-coding\SIGNAL-HUNT
npm install
npm run dev
```

推荐访问：

```text
http://127.0.0.1:5180
```

不要优先使用 `localhost`。在部分 Windows 环境中，`localhost` 可能解析到 IPv6 `::1`，导致页面打不开或请求超时。

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

## 现场抽奖规则

真实抽奖顺序固定为：

```text
触摸屏幕
-> 校验活动状态
-> 计算可抽奖池
-> 安全随机加权选择奖项
-> 扣减库存
-> 写入 DrawSession 和 DrawRecord
-> 播放动画
-> 展示结果
```

结果一定先提交，再播放动画。动画不会决定中奖结果。

奖项进入奖池必须同时满足：

```text
enabled === true
inventoryRemaining > 0
effectiveWeight > 0
```

刷新、崩溃或重新打开页面时，如果已有提交但未结束的中奖结果，系统会恢复同一条记录，不会重新抽奖。

## 奖项配置

后台路径：

```text
http://127.0.0.1:5180/admin/prizes
```

推荐通过页面配置或导入 JSON，不要直接改 IndexedDB。

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

导入会替换当前奖项表，但不会删除历史抽奖记录。历史记录里已经产生过的奖项名称会继续保留。

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
点击“保存并应用”
```

页面显示的是百分比，真实抽奖仍使用内部 `weight` 和 `effectiveWeight`。

例如：

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

- 简单模式：直接编辑百分比
- 智能模式：配置均匀发放、大奖保护、最小间隔和闭展前追赶
- 高级模式：查看 Base Weight、Multiplier、Sensitivity 等算法参数
- 自动平衡：锁定奖项不变，当前编辑奖项不变，其余未锁定奖项按原相对比例重分配
- 库存建议：根据库存生成建议概率，只预览，不会静默覆盖
- 库存风险：按预计参与人数计算预计中奖人数，提示奖品是否可能不够

新配置只影响下一次尚未开始的抽奖，不会修改已经提交的中奖结果。

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

- 确认兑奖不会自动结束展示
- 结束展示不会自动确认兑奖
- 作废记录不会自动恢复库存
- 已兑奖记录不能直接作废

## 数据与备份

数据存储在当前浏览器的 IndexedDB：

```text
database: signal-hunt
schema: v2
```

表：

```text
events
prizes
drawSessions
drawRecords
```

换电脑、换浏览器或清空浏览器数据后，需要重新导入活动和奖项。展前和收展时都建议在 `/admin/system` 下载完整备份。

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

可靠性细节见：

```text
docs/reliability.md
```

## 展前检查

1. 执行 `npm run verify:onsite`。
2. 打开 `/admin/event`，确认目标活动为 `ACTIVE`。
3. 打开 `/admin/pacing`，确认概率合计 100%，库存风险可接受。
4. 打开 `/admin/system`，下载一份展前完整备份。
5. 打开 `/diagnostics`，确认现场自检没有阻塞项。
6. 打开 `/display`，进入全屏 kiosk 模式。

## 项目结构

```text
src/app        React 应用入口和路由
src/db         IndexedDB / Dexie 数据库和仓储
src/domain     抽奖核心业务规则
src/features   业务流程和功能模块
src/pages      页面组件
src/styles     全局样式和设计变量
src/visual     Canvas 信号视觉引擎
scripts        burn-in 和 preflight 脚本
docs           可靠性和发布文档
```

关键文件：

| 文件 | 作用 |
| --- | --- |
| `src/domain/draw/drawService.ts` | 安全随机、奖池过滤、加权选择、提交抽奖 |
| `src/db/drawRepository.ts` | 持久化提交、恢复、兑奖、作废 |
| `src/domain/draw/prizePacing.ts` | Time Release / Smart Pacing 计算 |
| `src/domain/draw/prizeProbability.ts` | 百分比、自动平衡、库存建议 |
| `src/features/display/displayStateMachine.ts` | 展示页状态机 |
| `src/pages/display/DisplayPage.tsx` | 触屏抽奖主页面 |
| `src/pages/admin/AdminPacingPage.tsx` | 概率与发放策略控制台 |
| `src/pages/staff/StaffPage.tsx` | 工作人员现场操作 |

## 当前可优化方向

这些不是当前阻塞项，但建议按优先级逐步做：

1. 补真实浏览器 E2E：覆盖触摸抽奖、刷新恢复、工作人员结束展示、4K 展示尺寸。
2. 拆分大型后台页面：`AdminPacingPage`、`AdminDiagnosticsPage`、`AdminPrizesPage` 已经偏大，后续维护成本会升高。
3. 优化记录读取：Smart Pacing 当前会读取记录计算节奏，记录量很大时可增加按活动/奖项聚合统计。
4. 强化现场日志：当前结构化日志主要在内存中，崩溃后不一定保留，可增加导出或持久化。
5. 规范 UI 文案和后台组件：后台已有可用控件，但可以进一步抽出表单、状态徽章、风险提示和概率输入组件。
6. 增加正式 kiosk 打包方案：当前是浏览器原型，没有 Electron 或固定启动器，现场部署仍依赖人工打开浏览器。

## Windows 注意事项

PowerShell 直接读取中文文件时可能显示乱码。这通常是控制台编码问题，不代表源文件损坏。

建议：

- 搜索中文内容用 `rg`
- Node 读文件时显式使用 `utf8`
- 不要因为 PowerShell 输出乱码就批量重编码源文件
- PowerShell 设置环境变量使用 `$env:NAME='value'; npm run ...`

## License

MIT
