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

当前已经完成到 Phase 8A：现场核心可靠性加固。

已经具备：

- 真实抽奖提交
- 安全随机数
- 加权概率抽奖
- 库存扣减
- IndexedDB 本地持久化
- 刷新后恢复同一中奖结果
- 后台奖项管理
- JSON 导入奖项
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
| `/admin/dashboard` | 后台数据摘要 |
| `/admin/prizes` | 设置奖项、库存、中奖权重 |
| `/admin/records` | 查看抽奖记录 |
| `/admin/system` | 系统状态页 |
| `/staff` | 工作人员兑奖、结束展示、作废记录 |

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
    "enabled": true
  },
  {
    "id": "prize-second",
    "name": "二等奖",
    "shortName": "二等奖",
    "level": 2,
    "inventoryTotal": 5,
    "inventoryRemaining": 5,
    "weight": 25,
    "enabled": true
  },
  {
    "id": "prize-third",
    "name": "三等奖",
    "shortName": "三等奖",
    "level": 3,
    "inventoryTotal": 20,
    "inventoryRemaining": 20,
    "weight": 70,
    "enabled": true
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

中奖概率由 `weight` 控制。

公式：

```text
某奖项中奖概率 = 该奖项 weight / 所有可抽奖项 weight 之和
```

注意：`weight` 不是百分比，但你可以把总权重配成 100，这样更好理解。

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
修改 weight
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
weight > 0
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
D:\Program\snn\vibe-coding\SIGNAL-HUNT\public\brand\logo.png
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

## License

MIT
