# SIGNAL HUNT

幸运信号捕获。  
这是 Quantum Design 展会现场使用的离线触屏抽奖系统。

访客本人抽取的是“奖项”，不是从名单里抽中奖人。抽奖结果会先写入本机 IndexedDB，再播放信号扫描动画，最后展示中奖结果。

## 项目位置

项目根目录：

```text
D:\Program\snn\vibe-coding\SIGNAL-HUNT
```

主要源码目录：

```text
D:\Program\snn\vibe-coding\SIGNAL-HUNT\src
```

README 文件位置：

```text
D:\Program\snn\vibe-coding\SIGNAL-HUNT\README.md
```

## 当前状态

当前已经完成到 Phase 9：后台控制中心重构与 Smart Prize Pacing 接入。

已经具备：

- 真实抽奖提交
- 安全随机数
- 加权概率抽奖
- 库存扣减
- IndexedDB 本地持久化
- 刷新后恢复同一中奖结果
- 后台奖项管理
- JSON 导入奖项
- 后台控制中心 UI
- Prize Pacing 独立页面
- Fixed Weight / Time Release / Smart Pacing
- 真实抽奖使用 effective weight
- 工作人员确认兑奖
- 重复兑奖拦截
- 作废未兑奖记录
- 防止同一个活动同时产生多个未结束中奖结果
- 状态机错误显式记录

还没有做完整长期现场压测和正式发布打包流程。

## 安装和运行

在项目根目录执行：

```bash
cd /d D:\Program\snn\vibe-coding\SIGNAL-HUNT
npm install
npm run dev
```

当前已验证可用的本机地址是：

```text
http://127.0.0.1:5180
```

不要优先用 `localhost`。这台机器上 `localhost` 可能解析到 IPv6 `::1`，会出现页面打不开或请求超时。  
如果 5180 被占用，终端会显示新的端口，以终端输出为准。

常用页面：

```text
http://127.0.0.1:5180/display
http://127.0.0.1:5180/admin/dashboard
http://127.0.0.1:5180/admin/prizes
http://127.0.0.1:5180/admin/records
http://127.0.0.1:5180/admin/system
http://127.0.0.1:5180/staff
```

## 页面说明

| 页面 | 用途 |
| --- | --- |
| `/display` | 展会大屏 / 触摸屏抽奖页面 |
| `/admin/dashboard` | 展会控制中心首页：活动、库存、中奖节奏、最近记录 |
| `/admin/prizes` | 设置奖项、库存、中奖权重、Probability Mode、Smart Pacing |
| `/admin/pacing` | 查看所有奖项的中奖节奏状态 |
| `/admin/records` | 查看和筛选抽奖记录 |
| `/admin/system` | 系统状态页 |
| `/staff` | 工作人员兑奖、结束展示、作废记录 |

## 后台管理

### Dashboard

访问路径：

```text
http://127.0.0.1:5180/admin/dashboard
```

页面源码绝对路径：

```text
D:\Program\snn\vibe-coding\SIGNAL-HUNT\src\pages\admin\AdminDashboardPage.tsx
```

功能：

- 当前活动状态
- 今日参与 / 已中奖 / 已兑奖 / 剩余库存
- Prize Inventory Overview
- Prize Pacing Overview
- Prize Release Pace 图表
- 最近抽奖记录

### 奖品管理

访问路径：

```text
http://127.0.0.1:5180/admin/prizes
```

页面源码绝对路径：

```text
D:\Program\snn\vibe-coding\SIGNAL-HUNT\src\pages\admin\AdminPrizesPage.tsx
```

功能：

- 新增 / 编辑奖品
- JSON 导入 / 导出
- 库存配置
- Base Weight 配置
- Probability Mode 配置
- Time Release 配置
- Smart Pacing 配置
- Live Preview 预览真实 effective weight

### Prize Pacing

访问路径：

```text
http://127.0.0.1:5180/admin/pacing
```

页面源码绝对路径：

```text
D:\Program\snn\vibe-coding\SIGNAL-HUNT\src\pages\admin\AdminPacingPage.tsx
```

功能：

- 查看每个奖项的 Probability Mode
- 查看 Expected / Actual
- 查看 Effective Weight
- 查看 Next Release
- 查看 ON_PACE / AHEAD / BEHIND / LOCKED / CATCH_UP / DEPLETED 状态

### 调整中奖概率

后台操作路径：

```text
http://127.0.0.1:5180/admin/prizes
```

操作路径：

```text
管理员后台
→ Prize Management
→ 编辑奖项
→ Probability Strategy
→ 选择 Probability Mode
→ 修改 Base Weight 或 Smart Pacing 参数
→ 保存奖品
```

相关源码绝对路径：

```text
D:\Program\snn\vibe-coding\SIGNAL-HUNT\src\pages\admin\AdminPrizesPage.tsx
D:\Program\snn\vibe-coding\SIGNAL-HUNT\src\domain\draw\prizePacing.ts
D:\Program\snn\vibe-coding\SIGNAL-HUNT\src\domain\draw\drawService.ts
D:\Program\snn\vibe-coding\SIGNAL-HUNT\src\domain\draw\prizeValidation.ts
```

### Smart Prize Pacing

当前支持三种模式：

| 模式 | 含义 |
| --- | --- |
| `FIXED` | 固定权重。真实抽奖直接使用 `weight`。 |
| `TIME_RELEASE` | 按释放时间控制累计最多中奖数。未释放时 effective weight 为 0。 |
| `SMART_PACING` | 根据展会进度、实际中奖数、最小间隔、释放节点和追赶模式计算 effective weight。 |

真实中奖仍使用：

```text
secure random
+ active prize pool
+ effective weight
```

不是后台单独显示一套假倍率。

## 怎么设置奖项

推荐用后台页面设置，不要直接改数据库。

打开：

```text
http://127.0.0.1:5180/admin/prizes
```

对应页面源码：

```text
D:\Program\snn\vibe-coding\SIGNAL-HUNT\src\pages\admin\AdminPrizesPage.tsx
```

奖项保存逻辑：

```text
D:\Program\snn\vibe-coding\SIGNAL-HUNT\src\db\adminRepository.ts
```

奖项字段校验：

```text
D:\Program\snn\vibe-coding\SIGNAL-HUNT\src\domain\draw\prizeValidation.ts
```

在后台可以做两种操作：

1. 用“奖品编辑”表单新增或修改单个奖项。
2. 在“奖品 JSON”里一次性导入全部奖项。

后台写入的是浏览器本机 IndexedDB，不是服务器数据库。换电脑、换浏览器、清空浏览器数据后，需要重新导入奖项。

## 奖项 JSON 格式

在 `/admin/prizes` 的 `奖品 JSON` 中粘贴数组：

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

然后点击：

```text
导入 JSON
```

导入会替换当前全部奖项。

## 奖项字段含义

| 字段 | 含义 |
| --- | --- |
| `id` | 奖项唯一编号，不能重复 |
| `name` | 奖项完整名称，会展示给用户 |
| `shortName` | 奖项简称 |
| `level` | 奖项等级，数字越小通常等级越高 |
| `inventoryTotal` | 总库存 |
| `inventoryRemaining` | 剩余库存 |
| `weight` | 中奖权重，用来控制概率 |
| `enabled` | 是否启用该奖项 |
| `probabilityMode` | 可选，`FIXED` / `TIME_RELEASE` / `SMART_PACING` |
| `pacing` | 可选，Time Release / Smart Pacing 参数 |
| `imageUrl` | 可选字段，目前不是必填 |

校验规则：

- `id` 不能为空
- `name` 去掉空格后不能为空
- `shortName` 去掉空格后不能为空
- `level` 必须是大于等于 1 的整数
- `inventoryTotal` 必须是大于等于 0 的整数
- `inventoryRemaining` 必须是大于等于 0 的整数
- `inventoryRemaining` 不能大于 `inventoryTotal`
- `weight` 必须是大于等于 0 的有效数字
- `enabled` 必须是 `true` 或 `false`

## 怎么设置中奖概率

固定概率由 `weight` 控制。Time Release / Smart Pacing 会先计算 `effectiveWeight`，真实抽奖使用的是有效权重。

公式：

```text
某奖项中奖概率 = 该奖项 effectiveWeight / 所有可抽奖项 effectiveWeight 之和
```

注意：在 `FIXED` 模式下，`effectiveWeight === weight`。`weight` 不是百分比，但你可以把总权重配成 100，这样更好理解。

例如：

```text
一等奖    weight = 5
二等奖    weight = 25
三等奖    weight = 70
```

总权重：

```text
5 + 25 + 70 = 100
```

库存充足时，概率大约是：

```text
一等奖    5%
二等奖    25%
三等奖    70%
```

如果某个奖项库存变成 0，它会自动退出奖池，剩下的奖项会重新按权重计算概率。

## 修改概率的实际操作路径

后台操作路径：

```text
http://127.0.0.1:5180/admin/prizes
```

操作步骤：

```text
打开 /admin/prizes
找到奖品编辑表单或 Prize JSON
修改 Probability Mode / Base Weight / Smart Pacing 参数
点击 保存奖品 或 导入 JSON
下一次抽奖立即生效
```

对应源码绝对路径：

```text
D:\Program\snn\vibe-coding\SIGNAL-HUNT\src\pages\admin\AdminPrizesPage.tsx
D:\Program\snn\vibe-coding\SIGNAL-HUNT\src\db\adminRepository.ts
D:\Program\snn\vibe-coding\SIGNAL-HUNT\src\domain\draw\prizeValidation.ts
```

抽奖算法绝对路径：

```text
D:\Program\snn\vibe-coding\SIGNAL-HUNT\src\domain\draw\drawService.ts
```

具体函数：

```text
selectWeightedPrize
getActivePrizePool
commitDraw
calculatePrizePacing
```

持久化抽奖提交绝对路径：

```text
D:\Program\snn\vibe-coding\SIGNAL-HUNT\src\db\drawRepository.ts
```

具体函数：

```text
commitPersistentDraw
recoverCommittedDraw
clearActiveDrawSession
redeemDrawRecord
voidActiveDraw
```

默认演示奖项绝对路径：

```text
D:\Program\snn\vibe-coding\SIGNAL-HUNT\src\features\display\displayBootstrap.ts
```

具体函数：

```text
createDemoPrizes
ensureDemoSeed
```

## 默认奖项在哪里

默认奖项只用于没有正式活动和奖项时的演示种子数据。

文件：

```text
D:\Program\snn\vibe-coding\SIGNAL-HUNT\src\features\display\displayBootstrap.ts
```

函数：

```text
createDemoPrizes
```

正式现场更推荐通过：

```text
http://127.0.0.1:5180/admin/prizes
```

导入真实奖项，不建议长期依赖默认演示奖项。

## 抽奖核心规则

真实抽奖不使用 `Math.random()`。

安全随机数代码：

```text
D:\Program\snn\vibe-coding\SIGNAL-HUNT\src\domain\draw\drawService.ts
```

真实随机函数：

```text
createSecureRandom
```

它使用：

```text
crypto.getRandomValues()
```

一次抽奖顺序：

```text
读取活动
检查是否已有未结束中奖结果
读取奖项
过滤可抽奖池
安全随机加权选择
扣减库存
写入 DrawSession
写入 DrawRecord
返回已提交结果
播放动画
展示结果
```

奖项进入奖池必须同时满足：

```text
enabled === true
inventoryRemaining > 0
effectiveWeight > 0
```

## 工作人员兑奖

工作人员页面：

```text
http://127.0.0.1:5180/staff
```

页面源码：

```text
D:\Program\snn\vibe-coding\SIGNAL-HUNT\src\pages\staff\StaffPage.tsx
```

可执行操作：

- 确认兑奖
- 发现重复兑奖时拦截
- 结束当前结果展示
- 作废未兑奖记录

注意：

- “确认兑奖”和“结束展示”是两个独立动作。
- 确认兑奖不会自动回到待机。
- 作废记录不会自动恢复库存。
- 已兑奖记录不能直接作废。

## 结果页生命周期

展示页：

```text
http://127.0.0.1:5180/display
```

页面源码：

```text
D:\Program\snn\vibe-coding\SIGNAL-HUNT\src\pages\display\DisplayPage.tsx
```

抽奖完成后，结果页会一直停留，不会自动回首页。

结束当前结果的方式：

1. 在 `/display` 点击“下一位参与者”，再确认返回。
2. 在 `/staff` 点击“结束当前结果并返回待机”。
3. 在 `/staff` 使用快捷键 `Ctrl + Shift + E`。

刷新或崩溃后，系统会恢复已提交但未结束的同一个中奖结果，不会重新抽奖。

## 数据持久化

浏览器本机 IndexedDB：

```text
数据库名: signal-hunt
schema 版本: 2
```

数据库定义文件：

```text
D:\Program\snn\vibe-coding\SIGNAL-HUNT\src\db\database.ts
```

当前表：

```text
events
prizes
drawSessions
drawRecords
```

重要说明：

- IndexedDB 存在于当前浏览器里。
- 换浏览器或清空浏览器数据会丢失奖项和记录。
- 现场使用前必须确认奖项已经导入。

## 代码结构

```text
D:\Program\snn\vibe-coding\SIGNAL-HUNT\src\app
D:\Program\snn\vibe-coding\SIGNAL-HUNT\src\db
D:\Program\snn\vibe-coding\SIGNAL-HUNT\src\domain
D:\Program\snn\vibe-coding\SIGNAL-HUNT\src\features
D:\Program\snn\vibe-coding\SIGNAL-HUNT\src\pages
D:\Program\snn\vibe-coding\SIGNAL-HUNT\src\styles
D:\Program\snn\vibe-coding\SIGNAL-HUNT\src\visual
```

含义：

| 绝对路径 | 用途 |
| --- | --- |
| `D:\Program\snn\vibe-coding\SIGNAL-HUNT\src\app` | React 应用入口和路由 |
| `D:\Program\snn\vibe-coding\SIGNAL-HUNT\src\db` | IndexedDB / Dexie 数据库和仓储 |
| `D:\Program\snn\vibe-coding\SIGNAL-HUNT\src\domain` | 抽奖核心业务规则 |
| `D:\Program\snn\vibe-coding\SIGNAL-HUNT\src\features` | 业务功能状态和流程 |
| `D:\Program\snn\vibe-coding\SIGNAL-HUNT\src\pages` | 页面组件 |
| `D:\Program\snn\vibe-coding\SIGNAL-HUNT\src\styles` | 全局样式和设计变量 |
| `D:\Program\snn\vibe-coding\SIGNAL-HUNT\src\visual` | Canvas 信号视觉引擎 |

## Logo 配置

Logo 文件应放在：

```text
D:\Program\snn\vibe-coding\SIGNAL-HUNT\public\brand\quantum-design-logo.png
```

Logo 路径常量：

```text
D:\Program\snn\vibe-coding\SIGNAL-HUNT\src\features\brand\brandAssets.ts
```

Logo 组件：

```text
D:\Program\snn\vibe-coding\SIGNAL-HUNT\src\features\brand\BrandMark.tsx
```

不要在页面组件里到处硬编码 Logo 路径。

## 质量检查

在项目根目录执行：

```bash
cd /d D:\Program\snn\vibe-coding\SIGNAL-HUNT
npm run lint
npm run typecheck
npm run test
npm run build
```

当前没有配置 `npm run test:e2e`。

Phase 8B 新增可靠性命令：

```bash
npm run test:stress        # 压力与对抗性测试
npm run burnin:short       # Burn-in 短模式（默认 5 分钟，可用 BURNIN_SECONDS 覆盖）
```

## Phase 8B：活动生命周期

活动生命周期在 `/admin/event` 管理。状态：`DRAFT` / `ACTIVE` / `PAUSED` / `ENDED`。

- 创建活动默认进入「草稿」，字段：名称、代码、可选开始/结束时间。
- 激活时同一终端只允许一个 `ACTIVE` 活动；若已有激活活动，会要求确认后暂停旧活动（不会静默覆盖）。
- `PAUSED` 时展示页进入暂停态，不能开始新抽奖，但已提交的中奖会话仍可恢复。
- `ENDED` 后禁止新抽奖，历史记录、库存快照、统计全部保留，不删除任何数据。
- 相关代码：`src/db/eventRepository.ts`、`src/domain/draw/eventValidation.ts`、`src/pages/admin/AdminEventPage.tsx`。

## Phase 8B：Demo Seed 隔离

`ensureDemoSeed` 在没有活动时自动创建演示活动与默认奖品，开发方便，但对正式展会危险。现在通过环境变量 `VITE_ENABLE_DEMO_SEED` 控制：

| 取值 | 行为 |
| --- | --- |
| `true` | 允许自动生成演示数据（即使生产构建） |
| `false` | 禁止自动生成（即使开发/测试），用于演练空库路径 |
| 未设置 | 开发/测试自动生成；生产构建不生成 |

生产构建（`npm run build` / `npm run preview`）默认**不会**因为空库自动生成假奖品，展示页会显示「尚未配置活动，请进入管理员后台创建活动」。开发服务器（`npm run dev`）默认仍会生成，便于本地体验。

显式切换示例（PowerShell）：`$env:VITE_ENABLE_DEMO_SEED='false'; npm run dev`。

## Phase 8B：完整备份与恢复

在 `/admin/system` 操作完整备份（包含活动、奖项、抽奖记录、抽奖会话）。

- **导出**：点击「下载完整备份」生成 `signal-hunt-backup-YYYYMMDD-HHmm.json`。
- **恢复**：粘贴备份 JSON →「解析并预览」展示版本与各表数量 →「恢复备份」（二次确认）。
- **原子性**：恢复在单个 Dexie 事务内清空并重写四张表；中途失败 IndexedDB 自动回滚，不会留下半套数据。
- **恢复前快照**：每次恢复前自动生成一次回滚快照，可用「回滚到恢复前」还原。
- 备份格式：`signal-hunt-backup` v1。代码：`src/features/admin/backupRestore.ts`。

## Phase 8B：诊断页

`/diagnostics` 仅供工作人员，展示：App 版本 / 构建模式 / 当前路由、视口 / DPR / 在线状态 / User-Agent / 内存、数据库状态与各表计数、当前活动与未结束会话、FPS / Canvas / WebGL / 减弱动效、存储用量配额、近期结构化事件（内存，最多 100 条）。错误日志代码：`src/features/diagnostics/errorLog.ts`。

## Phase 8B：压力测试

```bash
npm run test:stress
```

覆盖：500 次连续抽奖（无重复活跃会话、库存不为负、记录数精确）、10 次并发点击（仅一次抽奖、库存只扣一次）、刷新恢复（SCANNING/SEARCHING/RESULT 三阶段恢复同一结果且不重抽）、离线（`navigator.onLine=false` 下抽奖与恢复正常）、库存耗尽（奖池空时报错且记录保留）。代码：`src/stress/drawStress.test.ts`。

## Phase 8B：Burn-in 稳定性

```bash
npm run burnin:short                          # 默认短模式 5 分钟
BURNIN_SECONDS=20 npm run burnin:short        # 快速冒烟
BURNIN_SECONDS=28800 npm run burnin:short     # 8 小时 soak（请真实运行后再声称通过）
```

Burn-in 驱动真实 `commitPersistentDraw` + `clearActiveDrawSession` 循环，断言零错误、每次抽奖精确扣减一格库存、记录数与抽奖数一致。已**真实运行 15 秒冒烟**（约 8900 次抽奖，0 错误，库存账目精确）；**未**真实运行 5 分钟或 8 小时。

> 内存说明：Burn-in 在合成速率（约 600 抽/秒）下进程堆会增长，主要来自**持久化 DrawRecord 的累积**（设计如此，并非泄漏）。真实展会节奏约每 10–30 秒一次抽奖，8 小时约数千条记录，远在容量内。长时间 soak 请同时监控内存与磁盘。

代码：`src/burn-in/burnInRunner.ts`、`src/burn-in/burnIn.test.ts`（默认排除出 `npm test`，避免拖慢单元测试）。

## 展会现场运行

### 展前检查

- 在 `/admin/event` 确认目标活动为 `ACTIVE`（或先创建再激活）。
- 在 `/admin/prizes` 确认奖项、库存、权重正确（权重非百分比，是相对比例）。
- 把 Logo 放到 `public/brand/quantum-design-logo.png`。
- 确认展示机分辨率（主目标 1920×1080，支持 2560×1440 / 3840×2160）。
- 在 `/admin/system` 点击「下载完整备份」做一份展前基准备份。
- 确认 `VITE_ENABLE_DEMO_SEED` 在生产构建中未设为 `true`（默认即可）。

### 开展

1. 启动应用（`npm run build` 后托管，或现场指定的 kiosk 启动方式）。
2. 打开 `/admin/event` 激活活动。
3. 打开展示页 `/display`，进入全屏 Kiosk 模式。
4. 在 `/diagnostics` 快速核对 FPS、数据库计数、当前活动。

### 中途异常

- **展示页异常 / 结果错乱**：工作人员在 `/staff` 点「结束当前结果并返回待机」，或快捷键 `Ctrl+Shift+E`。
- **怀疑数据异常**：打开 `/diagnostics` 查看数据库状态与近期结构化事件。
- **需要临时停抽**：在 `/admin/event` 把活动切到 `PAUSED`；展示页下次获得焦点或刷新后进入暂停态。恢复需重新激活并刷新展示页。
- **崩溃 / 断电**：直接重启打开 `/display`，系统会恢复已提交但未结束的同一中奖结果，不会重抽。

### 收展

1. 在 `/admin/event` 把活动切到 `ENDED`（历史记录与库存快照保留）。
2. 在 `/admin/records` 核对抽奖记录。
3. 在 `/admin/system` 点击「下载完整备份」导出当日完整数据存档。

## 现场恢复审计矩阵

| 故障 | 当前行为 | 覆盖测试 / 诊断 |
| --- | --- | --- |
| 抽奖 commit 后浏览器崩溃 | `DrawRecord`/`DrawSession` 已在提交事务内持久化；重启 `recoverCommittedDraw` 恢复同一结果 | `drawRepository.test`、`DisplayPage.lifecycle` |
| RESULT 页面机器重启 | 启动读取已提交会话进入 `RESULT`，永久停留，不重抽 | `DisplayPage.test`（boot 恢复） |
| 数据库为空（生产） | 不自动生成演示数据；展示页显示「尚未配置活动」 | `displayBootstrap.gating`、`DisplayPage.lifecycle` |
| 活动 PAUSED | 展示页进入暂停态、禁止新抽奖；已提交会话保留可恢复 | `DisplayPage.lifecycle`、`eventRepository.test` |
| 库存全部耗尽 | 奖池为空，提交抛「No active prize」，展示页进入 ERROR | `drawStress`（exhausts inventory） |
| Backup restore 失败 | 写入前 Zod 校验；单事务原子回滚；恢复前自动快照可回滚 | `backupRestore.test`（atomic / rollback） |
| Canvas 初始化失败 | `SignalCanvas` 在 `getContext` 为 null 时降级；展示页仍可抽奖（视觉降级） | `DisplayPage.canvas.test` |
| 网络断开 | 抽奖仅依赖 IndexedDB + `crypto.getRandomValues`，不触网 | `drawStress`（offline） |

> 本项目当前为纯浏览器原型，**尚未引入 Electron**。因此「App 重启」等于浏览器/标签页重载，由启动恢复覆盖；桌面级进程重启（含独立存储）尚未验证。

## License

MIT
