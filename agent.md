SIGNAL HUNT Agent Engineering Contract

本文件是 SIGNAL HUNT 仓库内所有 Coding Agent、自动化开发工具和人工协作者必须遵守的工程契约。

在读取、修改、测试或重构代码之前，必须先阅读本文件。

本文件描述的是当前已存在的 SIGNAL HUNT 项目，不是从零开发需求文档。任何任务都必须以现有源码、数据库结构、测试和实际运行行为为基础，采用渐进式修改，不得脱离当前实现另起炉灶。

1. 项目定位

SIGNAL HUNT 是一套面向展会现场的本地优先抽奖运营系统，由三个主要界面组成：

Display
面向访客的展会大屏

Staff
面向现场工作人员的兑奖与结果控制台

Admin
面向运营人员的活动、奖池、概率、记录、备份和系统管理后台

桌面运行环境为 Electron，前端基于 React、TypeScript 和 Vite，业务数据主要保存在本地 IndexedDB / Dexie 中。

系统必须优先保证：

抽奖结果正确
库存一致
刷新或崩溃后可恢复
离线可运行
跨窗口状态一致
现场长时间运行稳定

本项目不是：

在线 SaaS 抽奖平台

移动端优先应用

赌场或博彩风格游戏

幸运转盘

拉霸机

年会姓名抽取器

单纯的 Canvas 动效 Demo

可以为了改 UI 而重写业务核心的实验项目

2. 当前项目阶段

当前项目已具备真实实现的核心能力，包括但不限于：

安全随机与加权抽奖

原子库存扣减

DrawRecord 持久化

抽奖结果刷新恢复

Staff 兑奖、作废和结束展示

Event 生命周期管理

奖项、库存、概率和发放策略配置

抽奖记录查询

本地备份与恢复

Electron 双窗口

全屏与 Kiosk 基础设施

浏览器跨窗口同步

诊断与结构化日志

单元、组件、Electron、E2E、性能和 Burn-in 测试

但是当前代码库仍处于发布候选和前端重塑准备阶段，不得把它视为已完成的正式生产版本。

3. 当前阶段的最高优先级

所有开发决策必须遵循以下优先级：

1. 已提交抽奖结果不可被改变
2. 库存与记录必须保持事务一致
3. 已提交结果必须可恢复
4. REDEEMED 与 VOIDED 终态必须互斥
5. 活动生命周期必须保持合法
6. 跨窗口同步必须幂等
7. 备份恢复不得丢失业务字段
8. Electron 安全边界不得降低
9. 离线运行能力不得退化
10. 自动化测试与发布验证必须可信
11. 前端交互必须适合现场触控
12. 视觉一致性与品牌表达
13. 开发便利性

当视觉效果和业务正确性发生冲突时，必须选择业务正确性。

4. 当前已知阻塞

在开始大规模前端重塑前，以下问题属于 P0 阻塞：

多条 Display 同步路径可能重复触发 PAUSE，造成非法状态转换和白屏。

备份格式遗漏 participationWindows，恢复可能丢失分时参与窗口。

未显式配置环境变量时，正式构建可能写入演示活动和奖池，而预检结果与真实行为不一致。

公共 Display 页面可以清除当前业务会话，可能导致 Staff 无法处理尚未兑奖或作废的结果。

浏览器 E2E 尚有失败路径，不能以局部测试通过代替完整业务验证。

当前 Electron 发布包未完成最新源码验证。

项目缺少顶层 Error Boundary，React 异常可能直接表现为空白页。

除非任务明确要求，否则不得绕开这些问题直接进行全站重写。

涉及前端重塑时，推荐处理顺序：

P0 阻塞
→ 最小设计系统
→ Staff
→ Display
→ Admin
→ Electron 打包与展台验收

5. 工作方式

每次修改前必须：

检查当前 Git 状态。

阅读 package.json、相关页面、领域代码、Repository 和测试。

确认当前分支、未提交修改和未跟踪文件。

不覆盖、不删除、不格式化与当前任务无关的用户修改。

明确本次任务是否影响业务状态、数据库、跨窗口同步或 Electron。

先确定最小可验证改动，再开始编码。

禁止：

未经要求创建提交

未经要求推送远程

重置或清理用户未提交改动

使用 git checkout -- .、git reset --hard 或等价破坏性命令

为了“代码更整洁”执行无关重构

在未理解测试失败原因时删除、跳过或放宽测试

把历史构建产物当成当前源码的发布证据

6. 技术基线

核心技术栈：

React
TypeScript
Vite
Electron
Dexie / IndexedDB
Zod
Vitest
React Testing Library
Playwright
Canvas 2D

Agent 必须先查看当前 package.json，不得凭本文件假设具体脚本、依赖版本或工具一定存在。

当前项目有 Node 版本约束和 .nvmrc。运行命令前必须确认 Node 版本满足仓库要求。

不得随意：

更换包管理器

删除 lockfile

升级主要框架

引入新的状态管理框架

引入大型 UI 框架

引入必须联网运行的依赖

将 Dexie 替换为远程数据库

将 Electron 架构替换为浏览器 SaaS 架构

新增主要依赖前必须说明：

现有平台能力为什么不够。

现有依赖为什么不能解决。

包体积和离线影响。

长期维护成本。

是否会影响 Electron 打包。

7. 强制架构方向

推荐依赖方向：

Page
→ Feature Hook / Controller
→ Application Service
→ Repository
→ Dexie

各层职责：

Page

只负责：

页面布局

组件组合

触发用户意图

渲染 ViewModel

展示反馈

Page 不应负责：

直接编排数据库事务

实现抽奖算法

维护复杂跨窗口同步

拼接大量业务错误文案

决定终态转换规则

在多个 effect 中复制相同协调逻辑

Feature Hook / Controller

负责：

将页面事件转换为应用操作

管理短生命周期 UI 状态

订阅 Application Service 或查询结果

输出稳定 ViewModel

不得成为包含所有表单、Repository、同步、提示和领域计算的 God Hook。

Application Service

负责：

编排一次完整用例

调用 Repository

应用业务校验

返回结构化结果

协调同步通知

保持幂等边界

Repository

负责：

数据持久化

查询

Dexie 事务

并发与终态保护

数据完整性

Repository 应尽量返回结构化错误码，不应长期承载直接面向用户的展示文案。

Domain

负责：

抽奖算法

活动规则

概率计算

发放节奏

状态类型

纯函数与不变量

Domain 不得依赖 React、Electron 或页面组件。

8. 禁止贸然修改的核心区域

除非任务明确要求并配套测试，否则不得改变以下行为：

抽奖与库存

安全随机源

加权选择规则

零库存排除

抽奖提交顺序

库存原子扣减

DrawRecord 持久化

已提交结果恢复

一次物理交互最多产生一次抽奖

终态

REDEEMED 和 VOIDED 互斥

重复兑奖必须幂等

重复作废必须幂等

已兑奖结果不能作废

已作废结果不能兑奖

结束展示不能修改兑奖终态

Event

活动生命周期合法转换

已结束活动不可重新激活

开始时间、结束时间和分时参与窗口规则

数据库

Dexie 表结构

索引

迁移

事务

备份恢复回滚

写后复核

Electron

contextIsolation

nodeIntegration: false

sandbox

导航限制

新窗口限制

Preload API 最小暴露

单实例锁

IPC 注册生命周期

概率与发放

概率转换

权重计算

智能节奏

库存建议

已提交结果不受后续配置修改影响

9. 抽奖提交规则

真实奖品必须在动画前决定并持久化。

正确顺序：

用户触发
→ 验证活动和参与条件
→ 读取有效奖池
→ 安全随机选择
→ 原子扣减库存
→ 写入 DrawRecord
→ 锁定结果
→ 播放动画
→ 揭晓同一结果

禁止：

先播放动画
→ 在最后一帧随机决定结果

不得使用：

Math.random()

选择真实奖品。

业务随机必须使用安全随机源，例如：

crypto.getRandomValues()

Math.random() 仅可用于与业务无关的装饰性视觉效果，并且必须与业务随机代码完全分离。

10. Display 规则

Display 是公共访客界面，不是工作人员后台。

Display 应只承担：

待机

开始抽奖

抽奖动画

中奖结果

未中奖结果

暂停

活动结束

恢复中

可理解的错误状态

Display 不得公开提供：

清除当前业务会话

兑奖

作废

修改库存

结束活动

恢复备份

管理员配置入口

访客能够改变业务终态的操作

Display 的业务控制应从页面中继续提取，目标结构：

DisplayPage
→ useDisplayController
→ DisplayApplicationService
→ DisplaySyncCoordinator
→ Repository

Display 必须使用显式状态或判别联合，不得通过大量无关布尔值表示生命周期。

推荐 ViewModel：

type DisplayViewModel =
  | { type: 'booting' }
  | { type: 'idle' }
  | { type: 'drawing' }
  | { type: 'winner' }
  | { type: 'no-win' }
  | { type: 'paused' }
  | { type: 'ended' }
  | { type: 'recovering' }
  | { type: 'error'; code: string };

重复快照、重复暂停和重复同步通知必须是幂等的。

任何 Display 异常都不得以空白页结束。必须提供 Error Boundary 或等价故障界面。

未中奖结果不得继续展示中奖文案。

11. Staff 规则

Staff 是现场工作人员的单屏控制台。

主要职责：

查看当前结果

确认兑奖

作废结果

填写作废原因

结束当前展示

返回 Display

识别当前记录终态

Staff 设计原则：

优先一屏完成

大按钮

高对比

触控友好

明确显示当前状态

不依赖 hover

危险操作必须二次确认

终态操作必须锁定

操作完成必须有明确反馈

Staff 当前分层相对清晰，前端重塑应优先从 Staff 开始，以验证新的 Token、Button、Dialog、Status、Feedback 和 PageShell。

重塑 Staff 时不得把业务操作重新塞回 StaffPage.tsx。

12. Admin 规则

Admin 是活动运营工作台，不应被设计成无组织的表单集合。

推荐信息架构：

概览

活动配置
- 活动信息
- 参与窗口
- 生命周期

奖池管理
- 奖项
- 库存
- 素材

发放策略
- 概率
- 定时释放
- 智能节奏

现场运营
- 当前状态
- 抽奖记录
- 兑奖记录

系统
- 备份恢复
- 运行诊断
- 窗口模式

当前占位路由或尚未实现的业务能力，不得仅通过 UI 包装成已完成功能。

特别注意：

Participant 管理尚未形成完整业务闭环时，不得假装已支持。

限抽、重复中奖限制、二维码和兑奖码尚未明确实现时，不得在 Agent 任务中自行扩展。

任何新增业务能力必须先定义领域规则、数据结构、迁移和测试。

需要优先拆分的页面或 Hook：

DisplayPage

AdminSystemPage

AdminDiagnosticsPage

AdminPrizesPage

usePacingConfig

13. 前端重塑策略

禁止一次性全站重写。

推荐阶段：

Phase 0：可靠性阻塞

完成 P0 修复和回归测试。

Phase 1：最小设计系统

优先建立：

Design Tokens
Button
IconButton
Field
NumberInput
Select
Switch
Dialog
Toast / Feedback
StatusBadge
EmptyState
ErrorState
LoadingState
PageShell
SectionCard
DataTable
DangerZone

不要脱离真实页面预先构建庞大组件库。

Phase 2：Staff

使用 Staff 验证：

组件 API

触控尺寸

状态展示

危险操作

低分辨率布局

反馈模式

Phase 3：Display

先拆控制和同步逻辑，再替换视觉层。

不得在同一个大改中同时：

重写状态机

改数据库

改同步协议

改抽奖算法

重做动画

改页面布局

必须拆成可单独验证的变更。

Phase 4：Admin

推荐迁移顺序：

Dashboard
→ Event
→ Prizes
→ Pacing
→ Records
→ System
→ Diagnostics

Phase 5：发布验证

完成：

全量测试

Electron 打包

打包程序冒烟

双窗口

快捷键

全屏

Kiosk

重启恢复

备份恢复

展台分辨率和缩放验收

14. 设计语言

整体品牌语言：

科学仪器

信号分析

精密测量

稳定

克制

专业

高可信

Display 可采用：

深色舞台

信号扫描

波形

峰值捕获

空间网格

克制的粒子或光效

Staff 应采用：

高对比现场控制台

状态优先

操作优先

一屏完成

Admin 应采用：

清晰的数据工作台

中等信息密度

强层级

统一表单和表格

禁止：

赌场金色

拉霸机

幸运转盘

红包雨

金币爆炸

过度霓虹

黑客终端

军事瞄准 HUD

与品牌无关的通用赛博朋克模板

15. Design Token 与样式规则

现有 Token 可以作为起点，但不得继续无限扩展单个全局 CSS 文件。

推荐目录：

src/styles/
  tokens.css
  reset.css
  typography.css
  utilities.css

src/components/ui/
  Button/
  Dialog/
  Field/
  Select/
  Table/
  Feedback/

src/pages/display/
  display.css

src/pages/staff/
  staff.css

src/pages/admin/
  admin.css

可以使用 CSS Modules，但不得为了迁移样式强制引入新的 CSS-in-JS 框架。

Token 至少覆盖：

背景层级

文本层级

边框

品牌色

成功、警告、危险、信息

字体层级

间距

圆角

阴影

控件高度

表格行高

页面最大宽度

Sidebar 宽度

动画时长

Focus 状态

禁止：

页面随意硬编码重复颜色

为覆盖旧样式不断增加 !important

在 global.css 继续堆叠所有页面组件

相同组件在不同页面复制不同实现

只做视觉修改而不处理错误、加载、空状态和禁用状态

16. 动画规则

React 不得承担高频逐帧动画。

React 负责：

生命周期状态

配置

业务结果

结果组件

页面切换

Canvas 或动画引擎负责：

波形

扫描游标

粒子

噪声

高频视觉计算

不得在每一帧调用 React setState。

每个动画循环必须：

有明确启动条件

有明确停止条件

卸载时清理

页面隐藏时暂停或降频

支持 prefers-reduced-motion

控制 DPR

控制对象数量

避免持续分配大数组

视觉动画不得决定真实奖品。

17. 跨窗口同步规则

数据库是最终事实来源。

BroadcastChannel、localStorage 和 Electron IPC 只应承担：

数据可能已变化，请重新读取

不得把非权威 UI 状态当成最终业务事实。

同步必须满足：

重复通知幂等

通知乱序可恢复

通知丢失后仍可通过首次读取、liveQuery 或刷新恢复

同一数据库变化由多条路径触发时不得重复执行非法状态转换

不依赖闭包中陈旧 React state 判断最终状态

订阅必须清理

Staff 首次打开必须主动读取

Display 必须从数据库恢复已提交结果

揭晓前必须再次确认记录终态

如需修改同步协议，必须先补：

重复通知测试

乱序通知测试

暂停幂等测试

Staff 结束展示测试

刷新恢复测试

当前结果终态保护测试

18. 数据库与迁移规则

关键数据必须保存在 IndexedDB / Dexie，不得只保存在 LocalStorage。

任何持久化结构变化都必须包含：

旧版本
新版本
迁移逻辑
兼容策略
失败行为
回滚或恢复方案
测试

禁止：

直接修改现有数据含义而不升级版本

删除历史字段但不迁移

让 Zod 解析静默丢弃重要业务字段

在 React 页面里直接进行多表写操作

以开发环境空数据库为理由忽略旧数据兼容

备份格式必须完整覆盖需要恢复的业务字段，包括活动参与窗口。

备份恢复必须保持：

单事务

写后复核

失败回滚

版本校验

结构校验

已结束活动保护

不覆盖不可逆终态

19. 错误处理

公共 Display 不得显示：

JavaScript stack

Dexie 内部异常

Electron 路径

本地文件路径

原始数据库内容

Display 应显示：

系统暂时不可用
请联系现场工作人员
错误编号：DISPLAY_XXX

Staff 和 Admin 应区分：

加载失败

保存失败

状态冲突

终态冲突

文件格式错误

备份版本不兼容

Electron API 不可用

数据库异常

同步异常

技术细节写入结构化日志和 /diagnostics。

顶层路由和核心页面必须有明确 Error Boundary 或等价故障兜底。

20. 日志规则

关键操作使用结构化日志，例如：

DRAW_REQUESTED
DRAW_COMMITTED
DRAW_RECOVERED
DRAW_REVEALED
DRAW_REDEEMED
DRAW_VOIDED
DISPLAY_SESSION_ENDED
EVENT_ACTIVATED
EVENT_PAUSED
EVENT_ENDED
INVENTORY_RESERVED
BACKUP_EXPORTED
RESTORE_STARTED
RESTORE_COMPLETED
RESTORE_ROLLED_BACK
SYNC_RECONCILED
DATABASE_ERROR
DISPLAY_ERROR

日志必须包含足够的技术上下文，但不得记录不必要的个人信息。

21. 本地优先和离线规则

核心业务必须在无网络情况下运行。

不得让以下功能依赖互联网：

抽奖

库存

记录

兑奖

作废

暂停

活动结束

结果恢复

备份恢复

核心品牌素材

核心奖品素材

Kiosk 运行

外部图片 URL 必须有离线策略或本地导入策略，不能假设展会网络稳定。

不得在运行时依赖 CDN 加载核心 JS、CSS、字体或品牌资源。

22. 触控与响应式规则

Display 主要面向：

1920 × 1080
1600 × 900
1440 × 900
1366 × 768
1280 × 800

更高分辨率应合理缩放，但不得以移动端作为 Display 的主要设计目标。

Staff 和 Admin 需要支持常见展台控制电脑、笔记本和触控屏尺寸。

交互规则：

主要按钮有足够点击区域

不依赖 hover

不使用过小图标按钮

Focus 状态可见

禁止意外文本选择

禁止图片拖拽

快速重复点击不得产生重复业务操作

高风险操作必须二次确认

不只依赖颜色表达状态

必须尊重：

prefers-reduced-motion

23. 性能与长时间运行

假设应用会连续运行 8–12 小时。

必须注意：

内存增长

RAF 泄漏

定时器泄漏

事件监听器泄漏

BroadcastChannel 清理

liveQuery 订阅清理

Canvas resize

页面 visibility

Electron 窗口隐藏与恢复

大量记录查询

表格分页

全表读取

图片资源释放

不得以短时手动测试代替长时间稳定性验证。

性能代码变更应考虑现有压力、性能和 Burn-in 测试。

24. 测试要求

任何修改必须运行与改动相关的最小测试集。

涉及以下内容时必须补测试：

抽奖

加权选择

零库存排除

安全随机边界

一次交互一次提交

事务扣库存

结果持久化

刷新恢复

Staff

首次读取当前结果

兑奖

重复兑奖

作废

作废原因

终态互斥

结束展示

返回大屏

Display

待机

抽奖

揭晓

未中奖文案

暂停

重复暂停

活动结束

恢复

错误兜底

多分辨率布局

备份恢复

完整字段往返

participationWindows

版本兼容

校验失败

写入失败回滚

写后复核失败回滚

已结束活动保护

同步

重复通知

多通道同时通知

乱序通知

通知丢失后的主动恢复

过期闭包状态

揭晓前终态复核

Electron

双窗口

快捷键

控制窗口复用

全屏

Kiosk

导航限制

Preload API

IPC

单实例

打包程序启动

不得通过以下方式让测试“变绿”：

删除断言

增加无意义 sleep

增加重试掩盖时序问题

test.skip

test.only

放宽关键业务预期

mock 掉需要真实验证的 Repository 事务

将 E2E 失败归类为“偶发”但不保留证据

优先使用状态条件、虚拟时钟和确定性测试替代固定等待。

25. 基础验证命令

先检查 package.json，再运行实际存在的脚本。

常见验证顺序：

npm run lint
npm run typecheck
npm test
npm run test:electron
npm run test:e2e
npm run test:stress
npm run test:performance
npm run burnin:smoke
npm run build
npm run preflight

涉及发布时继续运行仓库现有的 Electron package、make、smoke 和 checksum 流程。

如果某命令因网络、环境或工具链失败，必须明确区分：

源码失败
测试失败
环境失败
网络失败
打包工具失败

不得把环境失败描述为源码已经通过发布验证。

26. 完成标准

只有满足以下条件，才能声明任务完成：

已检查 Git 状态并保留原有未提交修改

修改范围与任务一致

没有引入无关重构

TypeScript 通过

Lint 通过

相关单元和组件测试通过

相关 E2E 通过

构建通过

抽奖结果语义未改变

库存事务未破坏

刷新恢复未破坏

终态互斥未破坏

同步重复通知不会产生非法状态

备份未丢失业务字段

离线路径仍可用

Electron 安全设置未降低

触控交互仍可用

错误状态不会白屏

报告了所有未验证项

如未运行某项验证，必须写明：

未运行
原因
风险
下一步所需环境

不得使用“应该没问题”“理论上通过”代替验证结果。

27. Agent 输出格式

完成开发任务后，报告至少包含：

变更摘要
修改文件
业务影响
数据库影响
Electron 影响
新增或更新测试
实际运行命令
测试结果
构建结果
未验证事项
Git 状态
是否提交
是否推送

建议使用明确布尔摘要：

source_files_modified=true
database_schema_changed=false
business_data_modified=false
electron_security_changed=false
tests_passed=true
build_passed=true
package_verified=false
git_commit_created=false
git_push_performed=false

这些值必须来自真实操作，不得猜测。

28. 非当前目标

除非任务明确要求，不要主动实现：

在线账号系统

云端数据库

多租户 SaaS

手机端访客抽奖

参与者实名体系

手机号验证

二维码兑奖

兑奖码

用户限抽

重复中奖限制

远程运营后台

在线分析平台

广告追踪

第三方登录

与现有业务无关的社交分享

这些能力如需加入，必须先形成：

产品规则
领域模型
数据结构
迁移方案
隐私方案
测试方案
离线降级方案

不得只添加 UI 占位并声称功能完成。

29. 文档优先级

发生冲突时，使用以下优先级：

1. 当前源码和数据库真实行为
2. 当前自动化测试
3. 本文件
4. 当前 README 和工程文档
5. 历史审计和旧发布记录
6. 旧构建产物

如果源码与本文件出现明显冲突，不要静默选择一方。必须在任务报告中指出冲突，并根据用户目标做最小、安全、可验证的处理。

30. 最终原则

SIGNAL HUNT 是现场生产工具，不是视觉实验。

任何时候都必须坚持：

稳定优先于炫技
正确优先于方便
恢复优先于动画
幂等优先于重复触发
渐进式重塑优先于全站重写
真实验证优先于主观判断