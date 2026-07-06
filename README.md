# SIGNAL HUNT

幸运信号捕获。

这是一个面向展会触摸屏和大屏的互动抽奖平台。当前访客本人抽取的是奖项 `Prize`，不是从名单里抽取中奖人。

## 当前进度

已完成到 Phase 7。

- Phase 1：React + TypeScript + Vite 基础工程
- Phase 2：抽奖领域模型、库存过滤、安全随机数、加权选择、提交抽奖纯业务逻辑
- Phase 3：Dexie / IndexedDB 持久化、仓储、提交保存、已提交会话恢复
- Phase 4：Display 显式状态机、基础触摸交互锁、状态文案展示
- Phase 5：Canvas 2D 信号引擎、波形模型、网格/扫描线/峰值渲染、Display 背景画布挂载
- Phase 6：6 秒展示时间轴、状态自动推进、基础 GSAP 文字层入场
- Phase 7：后台 Dashboard、Prizes、Records、System，奖品表单、JSON 导入导出

还未完成：

- Phase 8：Staff 页面（结果手动结束、快捷键已落地；兑奖核销流程待补）
- Phase 9：长期运行和压力加固

## 技术栈

- React
- TypeScript
- Vite
- React Router
- Dexie
- Zod
- Vitest
- Testing Library
- ESLint

## 运行

```bash
npm install
npm run dev
```

默认入口：

- `/display`
- `/admin/dashboard`
- `/admin/prizes`
- `/admin/records`
- `/admin/system`
- `/staff`
- `/diagnostics`

## 检查命令

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

## 目录结构

```text
src/
  app/          React 应用入口和路由
  db/           IndexedDB / Dexie 数据库和仓储
  domain/       纯业务规则
  features/     业务功能状态和流程
  pages/        页面壳
  styles/       全局样式和设计 token
  visual/       Canvas 2D 信号视觉引擎
```

## 已落地的核心规则

真实抽奖不能使用 `Math.random()`。

`src/domain/draw/drawService.ts` 使用 `crypto.getRandomValues()` 生成安全随机值。测试中通过注入随机函数来验证边界值。

抽奖提交顺序是：

```text
读取活动
读取奖项
过滤可抽奖池
安全随机加权选择
扣减库存
写入 DrawSession
写入 DrawRecord
返回已提交结果
```

奖项进入可抽奖池必须同时满足：

- `enabled === true`
- `inventoryRemaining > 0`
- `weight > 0`

非 `ACTIVE` 活动禁止抽奖。

## IndexedDB

数据库名：

```text
signal-hunt
```

当前 schema 版本：

```text
1
```

当前表：

- `events`
- `prizes`
- `drawSessions`
- `drawRecords`

当前是首版 schema，没有旧版本迁移逻辑。后续任何持久化结构变更都必须新增版本和迁移说明。

## 测试覆盖

当前测试覆盖：

- 根路由跳转到 `/display`
- Display 状态机完整路径
- Display 重复触摸锁
- Display 非法状态跳转报错
- Display 错误和复位路径
- `/display` 首次触摸进入 `ARMING`
- 6 秒时间轴顺序
- `/display` 点击后推进至结果并永久停留（手动退出，不再自动复位）
- 奖品 JSON 导入校验
- 后台摘要数据
- 后台奖品保存和列表
- `/admin/prizes` JSON 导入写入 IndexedDB
- Canvas 信号模型状态参数
- 波形点边界
- 峰值检测视觉标记
- `/display` Canvas 挂载
- 过滤不可抽奖奖项
- 加权抽奖边界
- 安全随机数归一化
- 提交抽奖只扣一次库存
- 无可用奖项时报错
- 非 ACTIVE 活动禁止抽奖
- IndexedDB 写入活动和奖项
- 持久化提交抽奖
- 恢复已提交未完成的抽奖

## 阶段边界

## 奖品导入

打开：

```text
/admin/prizes
```

在 `Prize JSON` 中填入数组格式：

```json
[
  {
    "id": "prize-1",
    "name": "First Prize",
    "shortName": "First",
    "level": 1,
    "inventoryTotal": 3,
    "inventoryRemaining": 3,
    "weight": 1,
    "enabled": true
  }
]
```

然后点击 `Import JSON`。

导入会校验：

- `id`、`name`、`shortName` 不能为空
- `level >= 1`
- `inventoryTotal >= 0`
- `inventoryRemaining >= 0`
- `inventoryRemaining <= inventoryTotal`
- `weight >= 0`
- `enabled` 必须是布尔值

## 阶段边界

Phase 7 只保证后台能管理奖品、查看摘要和记录，并能把奖品数据写入 IndexedDB。

`/display` 已接入真实持久化抽奖：触摸后通过 `commitPersistentDraw` 原子扣减库存并写入 `DrawSession` / `DrawRecord`，刷新可恢复未揭示的抽奖（`recoverCommittedDraw`）。结果页**永久停留直到手动结束**（不再自动复位）。默认奖品池为一等奖 / 二等奖 / 三等奖 + 谢谢参与兜底（见 `src/features/display/displayBootstrap.ts`）。尚未完成的只有 Staff 兑奖核销流程。

## 品牌主题（Quantum Design 红色科技风）

所有颜色集中在 `src/styles/tokens.css`。红色是**强调色**（CTA / 峰值 / 锁定 / Active / 奖项结果），不是整页底色；基础层为中性浅灰白 + 白色表面。换品牌色只需改 `--color-brand-red` 一组变量。Canvas 信号颜色由 CSS 变量驱动（见 `src/visual/signal-engine/SignalCanvas.ts` 的 `readSignalColors`），不要在渲染器里散落硬编码红色。

## 配置 Quantum Design Logo

Logo **不会随代码仓库分发**，由运营人员手动放入。请把文件放到：

```text
public/brand/logo.png
```

目录结构：

```text
project-root/
├── public/
│   └── brand/
│       └── logo.png   ← 把 Logo 放这里
```

- 推荐 PNG 或 WebP，透明背景或原始白底。
- 路径由统一常量管理：`src/features/brand/brandAssets.ts` 的 `BRAND_ASSETS.logo`。所有页面通过 `<BrandMark />`（`src/features/brand/BrandMark.tsx`）引用，**不要在组件里硬编码路径**。
- 若改了文件名，同步修改 `BRAND_ASSETS.logo`。
- 保持原始宽高比（CSS `object-fit: contain`），不拉伸、不裁切、不改色。
- Logo 缺失时显示中性占位框「BRAND LOGO」（仅开发 / 资源缺失提示，**不是真实 Logo**）；放入文件后即正常显示。
- `npm run build` 后该资源会一并打包。

Logo 出现位置：`/display` 左上角、`/admin` 侧栏顶部、`/staff` 与各占位页顶部、结果页顶部品牌栏。

## 调整中奖概率

SIGNAL HUNT 使用**加权随机**选择奖项，不是百分比。

### 方法一：通过管理员后台修改（推荐）

操作路径：

```text
管理员后台 (/admin)
→ 奖项 (/admin/prizes)
→ 奖品编辑 或 JSON 导入
→ 修改「权重」(Weight)
→ 保存奖品 / 导入 JSON
```

对应页面：`/admin/prizes`（组件 `src/pages/admin/AdminPrizesPage.tsx`）。可直接编辑单条奖项的「权重 / 总量 / 剩余 / 启用」，或粘贴一段 JSON 一次性替换全部奖项（`导入 JSON` 会清空重写）。

### 方法二：查看抽奖逻辑代码

中奖概率相关实现位于（真实路径）：

- 加权选择算法：`src/domain/draw/drawService.ts` 的 `selectWeightedPrize`
- 奖池过滤（库存 / 启用 / 权重过滤）：`src/domain/draw/drawService.ts` 的 `getActivePrizePool`
- 抽奖提交（原子扣库存 + 写 DrawSession / DrawRecord）：`src/db/drawRepository.ts` 的 `commitPersistentDraw`
- 后台读写奖项：`src/db/adminRepository.ts`（`savePrize` / `replacePrizes` / `listPrizes`）
- 开箱默认奖项与权重：`src/features/display/displayBootstrap.ts` 的 `createDemoPrizes`

> 说明：本项目当前是纯 Vite + React Web 应用，**尚未引入 Electron**，因此不存在 `electron/main/services/draw.service.ts` 之类的桌面端路径。上面是真实代码位置。

### 权重（Weight）的含义

权重是相对比例，不要求加起来等于 100。某奖项的中奖概率 = `该奖项 weight` ÷ `所有可抽奖项 weight 之和`。

例如默认奖项（`createDemoPrizes`，一 / 二 / 三等奖 + 谢谢参与兜底）：

```text
一等奖    weight = 1
二等奖    weight = 4
三等奖    weight = 9
谢谢参与  weight = 86
```

总权重 `1 + 4 + 9 + 86 = 100`，因此在所有奖项库存充足时：

```text
一等奖   约 1%
二等奖   约 4%
三等奖   约 9%
谢谢参与 约 86%
```

### 库存规则

某奖项 `inventoryRemaining <= 0`（或 `enabled = false`、`weight = 0`）会自动退出当前有效奖池，剩余奖项的概率会**按权重重新归一化**。所以即便权重设得很高，库存发完后该奖项也不会再被抽中。

### 修改后如何生效

- 后台「保存奖品」/「导入 JSON」直接写入 IndexedDB（`db.prizes.put` / `bulkPut`），**立即生效**，无需重启。
- **只对下一次抽奖生效**：正在进行的抽奖不受影响（一次点击一次抽奖，结果在动画前已提交）。
- 抽奖记录 `DrawRecord` 不可篡改，调整权重不会影响历史记录。
- 若清空浏览器数据 / 换设备，奖项会回到 `createDemoPrizes` 的默认值，需重新导入。

## 结束中奖结果页

抽奖完成后，结果页 `/display` **不会自动返回首页**，会永久停留，供工作人员核销与领奖。

只有以下操作会结束当前结果并回到待机 `ATTRACT`：

1. 展示页结果卡片上的「**下一位参与者**」按钮（默认开启二次确认：点击后会出现「确认结束当前中奖结果？/ 取消 / 确认并返回」）。
2. 工作人员页 `/staff` 的「**结束当前结果并返回待机**」按钮。
3. 快捷键 **`Ctrl + Shift + E`**（仅在 `/staff` 页面生效；刻意避开浏览器 `Ctrl + Shift + R` 硬刷新）。

刷新 / 崩溃恢复：进入 `RESULT` 后若软件意外刷新，会读取已提交的 `DrawSession` 并**恢复相同结果继续停留**（见 `recoverCommittedDraw`），不会重新抽奖、也不会回到首页。
