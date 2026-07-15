# SIGNAL HUNT

一套用于线下展会的 Windows 本地抽奖系统。访客在展示屏完成抽奖，管理员在控制端配置活动、奖品和节奏；核心抽奖数据保存在本机，无需依赖网络。

## 适用场景

- 展会、发布会、门店活动等现场抽奖
- 一台或两台 Windows 电脑的展示屏与控制端部署
- 需要控制奖品库存、抽奖节奏和中奖记录的活动

## 核心特点

- **本地优先**：活动、奖品、抽奖记录和备份均保存在本机 IndexedDB。
- **结果先落库**：中奖结果先写入本地数据，再播放展示动画；刷新或异常退出后不会重复扣减库存。
- **库存准确**：仅在奖品启用、库存大于零且有效权重大于零时参与候选池。
- **可恢复**：未完成的抽奖会话可在重新打开后恢复，不会产生第二次抽奖。
- **现场可控**：管理员可管理活动状态、奖品、发奖节奏、记录与系统诊断。

## 系统入口

| 用途 | 地址 |
| --- | --- |
| 访客展示屏 | `/display` |
| 管理员总览 | `/admin/dashboard` |
| 活动管理 | `/admin/event` |
| 奖品管理 | `/admin/prizes` |
| 节奏控制 | `/admin/pacing` |
| 抽奖记录 | `/admin/records` |
| 系统设置 | `/admin/system` |
| 数据诊断 | `/diagnostics` |

网页开发模式使用浏览器路由；Electron 桌面端使用 Hash 路由，因此可直接从打包程序打开上述页面。

## 快速开始

```powershell
npm install
npm run dev
```

开发服务器固定运行在 `http://127.0.0.1:5180`。打开 `/display` 进入访客展示屏，打开 `/admin/dashboard` 进入管理员控制台。

建议使用项目指定的 Node.js 版本：

```powershell
nvm use 24.15.0
```

项目也支持 Node.js 22.12 及以上的 22.x 版本。

## 现场使用流程

1. 在“活动管理”中创建并启用活动。
2. 在“奖品管理”中设置奖品名称、库存、权重和启用状态。
3. 在“节奏控制”中设置展示节奏，并在“数据诊断”中确认本机状态正常。
4. 在展示屏引导访客抽奖；中奖结果确认后，再开始下一位参与者的抽奖。
5. 活动结束后，从系统设置导出或保留本机备份。

## 数据与抽奖规则

本地数据库当前为 Schema v4，包含以下关键数据：

- `events`：活动配置与状态
- `prizes`：奖品、库存、权重和启用状态
- `drawSessions`：进行中或已完成的抽奖会话
- `drawRecords`：最终抽奖记录

抽奖候选奖品必须同时满足：已启用、剩余库存大于零、有效权重大于零。系统会先生成并提交结果，再播放动画；若应用在动画期间关闭，重开后会恢复已提交的同一结果。

备份会保存活动、奖品、抽奖会话和抽奖记录；诊断日志不包含在备份中。

## 常用验证命令

| 目的 | 命令 |
| --- | --- |
| 基础检查 | `npm run verify:quick` |
| 发布前完整检查 | `npm run verify:release` |
| 现场运行检查 | `npm run verify:onsite` |
| 浏览器端到端测试 | `npm run test:e2e` |
| 压力与性能测试 | `npm run test:stress`、`npm run test:perf` |
| 桌面端打包验证 | `npm run electron:verify` |
| 桌面端冒烟测试 | `npm run electron:smoke` |

## Windows 桌面端打包

```powershell
nvm use 24.15.0
npm run electron:build
npm run electron:smoke
```

首次启动默认打开访客展示屏。按 `Ctrl + Shift + A` 可打开或聚焦管理员控制端；从管理员控制端返回展示屏时，控制窗口会隐藏，便于现场切换。

打包产物位于 `out/make/`：

- 安装包：`out/make/squirrel.windows/x64/`
- 免安装压缩包：`out/make/zip/win32/x64/`

## 项目结构

```text
src/
  app/          路由与应用入口
  domain/       抽奖、库存、恢复与数据规则
  db/           IndexedDB 数据访问与迁移
  pages/        展示屏、管理员页面与诊断页
  components/   通用界面组件
electron/
  main/         桌面窗口、快捷键与打包入口
e2e/            浏览器端到端测试
```

## 许可

MIT
