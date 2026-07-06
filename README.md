# SIGNAL HUNT

> 幸运信号捕获 · 面向展会触摸屏 / 大屏的互动抽奖平台

访客本人在现场抽取的是**奖项**（`Prize`），而不是从名单里抽取中奖人。整套抽奖使用安全随机数 + 加权选择，数据落 IndexedDB，结果页永久停留供核销。

## 当前进度

已完成到 **Phase 7**。

| 阶段 | 内容 | 状态 |
 | --- | --- | :---: |
| Phase 1 | React + TypeScript + Vite 基础工程 | ✅ |
| Phase 2 | 抽奖领域模型、库存过滤、安全随机数、加权选择、提交纯业务逻辑 | ✅ |
| Phase 3 | Dexie / IndexedDB 持久化、仓储、提交保存、已提交会话恢复 | ✅ |
| Phase 4 | Display 显式状态机、基础触摸交互锁、状态文案展示 | ✅ |
| Phase 5 | Canvas 2D 信号引擎、波形模型、网格 / 扫描线 / 峰值渲染、Display 背景画布挂载 | ✅ |
| Phase 6 | 6 秒展示时间轴、状态自动推进、基础 GSAP 文字层入场 | ✅ |
| Phase 7 | 后台 Dashboard / Prizes / Records / System、奖品表单、JSON 导入导出 | ✅ |
| Phase 8 | Staff 页面（结果手动结束、快捷键已落地；兑奖核销流程待补） | ⏳ |
| Phase 9 | 长期运行与压力加固 | ⏳ |

## 技术栈

React · TypeScript · Vite · React Router · Dexie · Zod · Vitest · Testing Library · ESLint

## 快速开始

```bash
npm install
npm run dev
```

默认入口路由：

| 路由 | 说明 |
| --- | --- |
| `/display` | 展会大屏 / 触摸屏主入口 |
| `/admin/dashboard` | 后台摘要 |
| `/admin/prizes` | 奖项管理 |
| `/admin/records` | 抽奖记录 |
| `/admin/system` | 系统设置 |
| `/staff` | 工作人员操作台 |
| `/diagnostics` | 诊断页 |

## 质量检查

```bash
npm run lint        # ESLint
npm run typecheck   # tsc 类型检查
npm run test        # Vitest
npm run build       # 生产构建
```

## 目录结构

```text
src/
  app/          React 应用入口和路由
  db/           IndexedDB / Dexie 数据库和仓储
  domain/       纯业务规则（抽奖核心）
  features/     业务功能状态和流程
  pages/        页面壳
  styles/       全局样式和设计 token
  visual/       Canvas 2D 信号视觉引擎
```

## 抽奖核心规则

真实抽奖**不使用** `Math.random()`。`src/domain/draw/drawService.ts` 使用 `crypto.getRandomValues()` 生成安全随机值（测试通过注入随机函数验证边界值）。

一次抽奖的提交顺序：

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

奖项进入可抽奖池必须**同时**满足：

- `enabled === true`
- `inventoryRemaining > 0`
- `weight > 0`

非 `ACTIVE` 活动禁止抽奖。`/display` 已接入真实持久化抽奖：触摸后通过 `commitPersistentDraw` 原子扣减库存并写入 `DrawSession` / `DrawRecord`，刷新可恢复未揭示的抽奖（`recoverCommittedDraw`）。结果在动画前已提交，因此一次点击即一次抽奖。

## 中奖概率（加权随机）

SIGNAL HUNT 使用**加权随机**选择奖项，**不是百分比**。某奖项的中奖概率 = `该奖项 weight` ÷ `所有可抽奖项 weight 之和`。

### 默认奖项权重（`createDemoPrizes`）

| 奖项 | weight | 概率（库存充足时） |
| --- | ---: | ---: |
| 一等奖 | 1 | 约 1% |
| 二等奖 | 4 | 约 4% |
| 三等奖 | 9 | 约 9% |
| 谢谢参与 | 86 | 约 86% |

总权重 `1 + 4 + 9 + 86 = 100`。

### 修改概率

**方法一（推荐）：管理员后台**

```text
/admin → /admin/prizes → 编辑奖项或 JSON 导入 → 修改「权重」
```

页面：`/admin/prizes`（`src/pages/admin/AdminPrizesPage.tsx`）。可直接编辑单条奖项的「权重 / 总量 / 剩余 / 启用」，或粘贴一段 JSON 一次性替换全部奖项（导入会清空重写）。

**方法二：查看代码**

- 加权选择：`src/domain/draw/drawService.ts` → `selectWeightedPrize`
- 奖池过滤：`src/domain/draw/drawService.ts` → `getActivePrizePool`
- 原子扣库存 + 写记录：`src/db/drawRepository.ts` → `commitPersistentDraw`
- 后台读写奖项：`src/db/adminRepository.ts`（`savePrize` / `replacePrizes` / `listPrizes`）
- 默认奖项与权重：`src/features/display/displayBootstrap.ts` → `createDemoPrizes`

> 本项目当前是纯 Vite + React Web 应用，**尚未引入 Electron**，因此不存在 `electron/main/services/draw.service.ts` 之类的桌面端路径。

### 库存与生效规则

- 某奖项 `inventoryRemaining <= 0`（或 `enabled = false`、`weight = 0`）会自动退出有效奖池，剩余奖项**按权重重新归一化**——即便权重设得再高，库存发完后也不会被抽中。
- 后台「保存奖品 / 导入 JSON」直接写 IndexedDB（`db.prizes.put` / `bulkPut`），**立即生效，无需重启**。
- **只对下一次抽奖生效**：正在进行的抽奖不受影响。
- `DrawRecord` 不可篡改，调整权重不影响历史记录。
- 清空浏览器数据 / 换设备时，奖项会回到 `createDemoPrizes` 默认值，需重新导入。

## 奖品导入

进入 `/admin/prizes`，在 `Prize JSON` 中填入数组格式：

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

点击 `Import JSON`。导入校验：

- `id` / `name` / `shortName` 不能为空
- `level >= 1`
- `inventoryTotal >= 0`、`inventoryRemaining >= 0`，且 `inventoryRemaining <= inventoryTotal`
- `weight >= 0`
- `enabled` 必须是布尔值

## 结果页生命周期

`/display` 抽奖完成后**不会自动返回首页**，永久停留供工作人员核销与领奖。

结束当前结果、回到待机 `ATTRACT` 的方式：

1. 结果卡片上的「**下一位参与者**」按钮（默认开启二次确认：点击后出现「确认结束当前中奖结果？/ 取消 / 确认并返回」）。
2. 工作人员页 `/staff` 的「**结束当前结果并返回待机**」按钮。
3. 快捷键 **`Ctrl + Shift + E`**（仅在 `/staff` 页面生效；刻意避开浏览器 `Ctrl + Shift + R` 硬刷新）。

刷新 / 崩溃恢复：进入 `RESULT` 后若软件意外刷新，会读取已提交的 `DrawSession` 并**恢复相同结果继续停留**（`recoverCommittedDraw`），不会重新抽奖，也不会回到首页。

## 数据持久化（IndexedDB）

```text
数据库名:      signal-hunt
schema 版本:   1
```

当前表：`events`、`prizes`、`drawSessions`、`drawRecords`。

首版 schema，无旧版本迁移逻辑。后续任何持久化结构变更都必须新增版本和迁移说明。

## 品牌主题（Quantum Design 红色科技风）

颜色集中在 `src/styles/tokens.css`。**红色是强调色**（CTA / 峰值 / 锁定 / Active / 奖项结果），不是整页底色；基础层为中性浅灰白 + 白色表面。换品牌色只需改 `--color-brand-red` 一组变量。

Canvas 信号颜色由 CSS 变量驱动（`src/visual/signal-engine/SignalCanvas.ts` 的 `readSignalColors`），不要在渲染器里散落硬编码红色。

### 配置 Logo

Logo **不随仓库分发**，由运营手动放入：

```text
public/brand/logo.png
```

- 推荐 PNG / WebP，透明背景或原始白底。
- 路径由统一常量管理：`src/features/brand/brandAssets.ts` 的 `BRAND_ASSETS.logo`。所有页面通过 `<BrandMark />`（`src/features/brand/BrandMark.tsx`）引用，**不要硬编码路径**。
- 改了文件名要同步修改 `BRAND_ASSETS.logo`。
- 保持原始宽高比（CSS `object-fit: contain`），不拉伸、不裁切、不改色。
- Logo 缺失时显示中性占位框「BRAND LOGO」（仅开发 / 资源缺失提示，**不是真实 Logo**）；放入文件后正常显示。
- `npm run build` 会一并打包该资源。

Logo 出现位置：`/display` 左上角、`/admin` 侧栏顶部、`/staff` 与各占位页顶部、结果页顶部品牌栏。

## 测试覆盖

- 根路由跳转到 `/display`
- Display 状态机完整路径、重复触摸锁、非法状态跳转报错、错误和复位路径
- `/display` 首次触摸进入 `ARMING`
- 6 秒时间轴顺序
- `/display` 点击后推进至结果并永久停留（手动退出，不再自动复位）
- 奖品 JSON 导入校验
- 后台摘要数据、奖品保存和列表
- `/admin/prizes` JSON 导入写入 IndexedDB
- Canvas 信号模型状态参数、波形点边界、峰值检测视觉标记
- `/display` Canvas 挂载
- 过滤不可抽奖奖项、加权抽奖边界、安全随机数归一化
- 提交抽奖只扣一次库存、无可用奖项时报错、非 ACTIVE 活动禁止抽奖
- IndexedDB 写入活动和奖项
- 持久化提交抽奖、恢复已提交未完成的抽奖

## License

[MIT](./LICENSE)
