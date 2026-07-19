# 个人工作台 PRD

版本：v0.1  
日期：2026-07-14  
定位：个人时间、任务、复盘、睡眠、日记与周统计的一页式工作台

## 1. 产品概述

### 1.1 背景

用户希望拥有一个可长期使用的个人工作台，用于每天快速记录、查看和复盘：

- 每天的时间安排轴
- 最近主要任务 checklist
- 每天的股市复盘
- 睡眠时间记录
- 不同任务类型的累计时长进度，按 100h 理论展示
- 每天睡前日记
- 每周统计
- 任务开启后可计时，并持久化保存

产品目标不是做复杂项目管理系统，而是做一个轻量、直观、可爱的个人仪表盘。核心体验应尽量集中在一个页面内完成，减少跳转。

### 1.2 产品目标

1. 用户每天打开后，能在 1 个页面看到今天的计划、正在进行的任务、任务完成情况、睡眠、复盘与日记入口。
2. 用户能对任务开启计时，系统自动把耗时累计到任务类型中，形成 100h 进度条。
3. 用户能每天记录股市复盘、睡眠和睡前日记，所有数据可按周汇总。
4. 所有数据保存到数据库，支持长期追踪。
5. 界面直观简约，风格清爽、可爱、半透明，主色建议薄荷绿 + 樱花粉。

### 1.3 非目标

MVP 阶段暂不做：

- 多用户协作
- 团队项目管理
- 股票行情实时抓取
- AI 自动总结
- 移动端原生 App
- 复杂权限系统
- 甘特图、看板等重型项目管理功能

后续可扩展，但当前应保持简单。

## 2. 用户画像与使用场景

### 2.1 目标用户

个人用户，习惯每日计划和复盘，希望把生活、任务、交易复盘、睡眠和长期技能投入放在同一个面板中查看。

### 2.2 典型使用路径

早上：

1. 打开工作台。
2. 查看今天时间轴。
3. 添加或调整今天安排。
4. 勾选最近主要任务，选择当前要做的任务。
5. 点击开始计时。

白天：

1. 暂停或结束当前计时。
2. 创建新的任务计时。
3. 查看不同类型任务的累计进度。

收盘后：

1. 填写今日股市复盘。
2. 记录交易、观察、情绪、错误和明日计划。

睡前：

1. 记录睡眠计划或前一晚睡眠。
2. 写睡前日记。
3. 查看今日完成度。

周末：

1. 查看本周统计。
2. 观察任务时长、睡眠、完成率、复盘连续天数。
3. 写周总结。

## 3. 功能范围

### 3.1 MVP 功能清单

| 编号 | 功能 | 优先级 | 说明 |
|---|---|---:|---|
| F1 | 今日时间安排轴 | P0 | 按时间展示当天安排，可新增、编辑、删除 |
| F2 | 最近主要任务 checklist | P0 | 展示近期任务，可勾选完成、排序、设置类型 |
| F3 | 任务计时 | P0 | 对任务开始、暂停、结束计时，自动累计时长 |
| F4 | 类型累计时长条 | P0 | 按任务类型统计累计小时，展示 100h 进度 |
| F5 | 股市复盘 | P0 | 每日记录复盘内容 |
| F6 | 睡眠记录 | P0 | 记录入睡、起床、时长、质量 |
| F7 | 睡前日记 | P0 | 每日一篇日记，可编辑 |
| F8 | 每周统计 | P0 | 展示本周任务、睡眠、复盘、日记统计 |
| F9 | 数据持久化 | P0 | 所有记录写入数据库 |
| F10 | 日期切换 | P1 | 可查看历史日期数据 |
| F11 | 分类管理 | P1 | 管理任务类型、颜色、100h 目标 |
| F12 | 周总结 | P1 | 每周手动写总结 |

### 3.2 模块划分

1. 工作台首页模块
2. 时间安排模块
3. 任务与计时模块
4. 任务类型与 100h 累计模块
5. 股市复盘模块
6. 睡眠记录模块
7. 睡前日记模块
8. 周统计模块
9. 基础配置模块

## 4. 核心页面设计

### 4.1 页面策略

主页面采用一页式 Dashboard，避免多页面跳转。复杂编辑使用弹窗或抽屉，不长期占据页面空间。

推荐路由：

- `/dashboard`：个人工作台主页面
- `/history`：历史记录与搜索，P1
- `/settings`：任务类型、偏好设置，P1

MVP 重点只做 `/dashboard`。

### 4.2 Dashboard 信息架构

桌面端建议三栏布局：

```text
┌──────────────────────────────────────────────────────────────┐
│ 顶部：日期切换 / 今日状态 / 当前计时器 / 快速新增              │
├───────────────┬─────────────────────────┬────────────────────┤
│ 左栏          │ 中栏                    │ 右栏               │
│ 今日时间轴    │ 最近主要任务 checklist   │ 100h 类型进度       │
│ 睡眠小卡      │ 当前任务详情/计时        │ 本周统计摘要        │
│               │                         │ 睡前日记入口        │
├───────────────┴─────────────────────────┴────────────────────┤
│ 底部：股市复盘区，支持折叠/展开                               │
└──────────────────────────────────────────────────────────────┘
```

移动端建议上下布局：

1. 当前计时器
2. 今日任务
3. 今日时间轴
4. 100h 进度
5. 睡眠
6. 股市复盘
7. 睡前日记
8. 本周统计

### 4.3 组件树

页面：个人工作台 `/dashboard`

```text
DashboardPage
├─ DashboardHeader
│  ├─ DateSwitcher
│  ├─ TodayMoodBadge
│  ├─ QuickCreateButton
│  └─ ActiveTimerMiniBar
├─ TodaySchedulePanel
│  ├─ TimeAxis
│  ├─ ScheduleItem
│  └─ ScheduleEditorModal
├─ TaskChecklistPanel
│  ├─ TaskFilterTabs
│  ├─ TaskChecklistItem
│  ├─ TaskTimerButton
│  └─ TaskEditorModal
├─ ActiveTimerPanel
│  ├─ TimerDisplay
│  ├─ TimerControls
│  └─ TimerSessionList
├─ HundredHourProgressPanel
│  ├─ CategoryProgressBar
│  └─ CategoryManagerDrawer
├─ StockReviewPanel
│  ├─ MarketReviewForm
│  └─ TradeReflectionList
├─ SleepRecordCard
│  └─ SleepRecordFormModal
├─ BedtimeJournalPanel
│  └─ JournalEditor
└─ WeeklyStatsPanel
   ├─ WeeklySummaryCards
   ├─ WeeklyDurationChart
   └─ WeeklyHabitStreaks
```

### 4.4 页面状态

每个面板需要支持：

- 加载中：骨架屏或轻量 shimmer
- 空状态：温和提示，引导添加第一条数据
- 成功状态：显示列表或记录
- 错误状态：显示重试按钮
- 保存中：按钮 loading

## 5. 详细功能需求

### 5.1 今日时间安排轴

用户可以按时间段安排今天的计划。

字段：

- 日期
- 开始时间
- 结束时间
- 标题
- 类型
- 备注
- 是否完成

规则：

1. 默认展示 06:00 到 24:00。
2. 时间轴按开始时间升序排列。
3. 允许时间重叠，但 UI 需要轻提示“时间有重叠”。
4. 可从任务创建时间安排。
5. 过期未完成的安排用浅灰或低饱和色展示。

### 5.2 最近主要任务 checklist

用户可维护近期重点任务。

字段：

- 任务标题
- 任务类型
- 优先级
- 截止日期
- 状态
- 预估时长
- 已累计时长
- 是否置顶
- 排序值

任务状态枚举：

| code | 枚举 | 说明 |
|---:|---|---|
| 0 | TODO | 待开始 |
| 1 | IN_PROGRESS | 进行中 |
| 2 | DONE | 已完成 |
| 3 | ARCHIVED | 已归档 |

合法流转：

```text
TODO -> IN_PROGRESS -> DONE -> ARCHIVED
TODO -> DONE
TODO -> ARCHIVED
IN_PROGRESS -> TODO
IN_PROGRESS -> DONE
DONE -> ARCHIVED
```

规则：

1. 首页默认展示未归档任务，按置顶、优先级、排序值、更新时间排序。
2. 勾选任务后状态变为 DONE。
3. 已完成任务仍保留当天可见，第二天默认折叠到“已完成”。
4. 一个时间点只允许一个任务处于计时中。

### 5.3 任务计时

用户可对任务开始计时、暂停、结束。

计时会生成 timer session，每次开始到暂停/结束是一段独立记录。

计时状态枚举：

| code | 枚举 | 说明 |
|---:|---|---|
| 0 | RUNNING | 计时中 |
| 1 | PAUSED | 已暂停 |
| 2 | FINISHED | 已结束 |
| 3 | CANCELLED | 已取消 |

合法流转：

```text
RUNNING -> PAUSED -> RUNNING
RUNNING -> FINISHED
RUNNING -> CANCELLED
PAUSED -> FINISHED
PAUSED -> CANCELLED
```

规则：

1. 点击开始后，若存在 RUNNING session，前端提示先暂停或结束当前任务。
2. 暂停时写入 end_time，并计算 duration_minutes。
3. 再次开始会创建新的 session，不覆盖旧 session。
4. 任务累计时长 = 该任务所有 FINISHED 或 PAUSED session 的 duration_minutes 之和。
5. 类型累计时长 = 类型下所有任务 session duration_minutes 之和。

### 5.4 任务类型与 100h 进度条

任务类型用于累计时间投入。

字段：

- 类型名称
- 颜色
- 图标
- 目标小时数，默认 100
- 排序
- 是否启用

展示规则：

1. 进度百分比 = 已累计分钟数 / 目标小时数 / 60。
2. 默认目标为 100h。
3. 超过 100h 后，进度条展示 100%+，保留真实小时数。
4. 首页最多展示 6 个类型，更多在“展开”中查看。

示例：

| 类型 | 已累计 | 目标 | 展示 |
|---|---:|---:|---|
| 编程 | 23.5h | 100h | 23.5% |
| 交易复盘 | 12h | 100h | 12% |
| 英语 | 68h | 100h | 68% |

### 5.5 每日股市复盘

用户每天记录股市复盘，不接实时行情，先做手动记录。

字段：

- 交易日期
- 大盘概览
- 今日操作
- 持仓观察
- 做得好的地方
- 做错的地方
- 明日计划
- 情绪评分，1-5
- 纪律评分，1-5
- 标签

规则：

1. 每个日期最多一条股市复盘。
2. 如果当天不是交易日，也允许记录“观察/空仓/学习”。
3. 首页默认显示当天记录；无记录时显示快捷填写区。
4. 周统计中展示本周复盘天数、平均纪律评分、常见标签。

### 5.6 睡眠时间记录

字段：

- 睡眠日期
- 入睡时间
- 起床时间
- 睡眠分钟数
- 睡眠质量，1-5
- 备注

规则：

1. 入睡时间可跨天，例如 2026-07-14 23:30 到 2026-07-15 07:20。
2. 保存时自动计算睡眠分钟数。
3. 同一睡眠日期最多一条记录。
4. 周统计展示平均睡眠时长、最晚入睡、最早起床、睡眠质量趋势。

### 5.7 睡前日记

字段：

- 日期
- 今日开心的事
- 今天完成了什么
- 今天学到了什么
- 明天最重要的事
- 自由文本
- 心情评分，1-5

规则：

1. 每天最多一篇睡前日记。
2. 自动保存草稿可作为 P1，MVP 可手动保存。
3. 首页显示一个舒适的日记编辑区，不需要跳转页面。

### 5.8 每周统计

统计周期默认为周一到周日，按 Asia/Shanghai 时区计算。

统计内容：

- 本周完成任务数
- 本周任务计时总时长
- 各类型累计时长
- 每天计时时长柱状图
- 平均睡眠时长
- 股市复盘天数
- 日记天数
- 任务完成率

可选周总结：

- 本周最重要成果
- 本周最大问题
- 下周调整

## 6. 交互与设计建议

### 6.1 整体风格

关键词：

- 可爱
- 清爽
- 半透明
- 薄荷色
- 樱花粉
- 轻量玻璃感
- 信息密度适中

不建议做成重型后台。它更像一个“个人驾驶舱”，但需要足够安静，不要过度装饰。

### 6.2 推荐色彩 token

```text
mint-50       #F1FFF9
mint-100      #DDF8EE
mint-300      #8FE4C1
mint-500      #35C99A
pink-50       #FFF3F8
pink-100      #FFE1EC
pink-300      #F6A7C6
pink-500      #EA6FA3
cream         #FFFDF8
lavender-50   #F7F4FF
text-main     #263238
text-soft     #6B7A80
border-glass  rgba(255, 255, 255, 0.55)
panel-glass   rgba(255, 255, 255, 0.62)
```

### 6.3 视觉建议

1. 背景用极浅的薄荷到粉色柔和渐变，但不要使用大面积高饱和色。
2. 面板使用半透明白色，配 1px 浅色边框和轻微模糊。
3. 卡片圆角建议 8px 到 12px，保持克制。
4. 任务类型用小色点、图标和进度条区分。
5. 当前正在计时的任务需要有明显但温柔的高亮，例如薄荷绿呼吸边框。
6. 股市复盘区域建议用可折叠面板，避免页面过长。
7. 日记区域可以更柔和，使用粉色或薰衣草色轻背景。

### 6.4 组件建议

- 日期切换：左右箭头 + 日期按钮 + 回到今天
- 任务状态：checkbox + 状态 badge
- 计时按钮：开始、暂停、结束使用图标按钮
- 100h 进度：横向进度条，不要做复杂仪表盘
- 周统计：小卡片 + 简单柱状图
- 表单编辑：少字段用 Modal，多字段用 Drawer

### 6.5 一页式布局建议

首屏优先级：

1. 当前计时器
2. 今日主要任务
3. 今日时间轴
4. 100h 进度
5. 睡眠与周统计摘要

股市复盘和睡前日记建议放在首屏下方或右侧折叠区。这样页面不会被长文本挤爆。

## 7. 推荐技术方案

### 7.1 前端

推荐：

- React + TypeScript + Vite
- Tailwind CSS
- TanStack Query
- Zustand 或 React Context
- dayjs
- recharts 或 ECharts，MVP 建议 recharts
- lucide-react 图标

原因：

- Dashboard 交互较多，React 生态适合。
- Tailwind 便于快速做清爽透明风。
- TanStack Query 适合接口缓存和自动刷新。
- Zustand 足够轻量，避免过重状态管理。

### 7.2 后端

推荐：

- Node.js 20+
- TypeScript
- Hono 或 Fastify
- Drizzle ORM
- Zod 参数校验
- JWT 或单用户简化 token

说明：

本项目是个人工作台，核心是 CRUD、计时、统计和少量聚合查询，不需要 Spring Boot、NestJS 这类偏重框架。后端优先选择轻量 Node.js 服务，前后端统一 TypeScript，开发和后续维护成本更低。

推荐后端分层：

```text
src/
├─ routes/        # API 路由
├─ services/      # 业务逻辑
├─ db/            # 数据库连接、schema、迁移
├─ validators/    # Zod 入参校验
├─ utils/         # 日期、响应、错误处理
└─ app.ts         # 应用入口
```

### 7.3 数据库

推荐 MySQL 8。  
时间字段统一存 DATETIME，业务按 Asia/Shanghai 展示。  
所有核心表使用软删除字段 `deleted_at`。

开发和部署建议：

- 开发环境可直接连接本机 MySQL，避免 SQLite 和 MySQL 类型差异。
- 所有表结构变更通过迁移脚本管理。
- 统计类数据优先实时 SQL 聚合，数据量变大后再考虑统计快照表。

### 7.4 部署方案

推荐单服务器部署：

```text
Nginx
├─ /              -> React 静态文件
└─ /api           -> Node.js API 服务

Node.js API       -> PM2 常驻
MySQL 8           -> 本机或内网数据库
```

部署组件：

- 前端：Vite build 后由 Nginx 托管静态文件
- 后端：Node.js 服务用 PM2 启动和守护
- 数据库：MySQL 8
- 反向代理：Nginx
- HTTPS：Let's Encrypt

## 8. API 接口定义

基础约定：

- Base path：`/api/v1`
- 鉴权：MVP 可先单用户，仍保留 `Authorization: Bearer <token>` 结构
- 返回格式：

```json
{
  "code": 0,
  "message": "success",
  "data": {}
}
```

### 8.1 API 清单

| 方法 | 路径 | 说明 | 鉴权 |
|---|---|---|---|
| GET | `/api/v1/dashboard` | 获取工作台聚合数据 | required |
| GET | `/api/v1/schedules` | 查询时间安排 | required |
| POST | `/api/v1/schedules` | 新增时间安排 | required |
| PUT | `/api/v1/schedules/{id}` | 更新时间安排 | required |
| DELETE | `/api/v1/schedules/{id}` | 删除时间安排 | required |
| GET | `/api/v1/tasks` | 查询任务列表 | required |
| POST | `/api/v1/tasks` | 新增任务 | required |
| PUT | `/api/v1/tasks/{id}` | 更新任务 | required |
| PUT | `/api/v1/tasks/{id}/status` | 更新任务状态 | required |
| DELETE | `/api/v1/tasks/{id}` | 删除任务 | required |
| POST | `/api/v1/timer-sessions/start` | 开始计时 | required |
| PUT | `/api/v1/timer-sessions/{id}/pause` | 暂停计时 | required |
| PUT | `/api/v1/timer-sessions/{id}/resume` | 继续计时 | required |
| PUT | `/api/v1/timer-sessions/{id}/finish` | 结束计时 | required |
| GET | `/api/v1/task-categories` | 查询任务类型 | required |
| POST | `/api/v1/task-categories` | 新增任务类型 | required |
| PUT | `/api/v1/task-categories/{id}` | 更新任务类型 | required |
| GET | `/api/v1/stock-reviews` | 查询股市复盘 | required |
| POST | `/api/v1/stock-reviews` | 保存股市复盘 | required |
| GET | `/api/v1/sleep-records` | 查询睡眠记录 | required |
| POST | `/api/v1/sleep-records` | 保存睡眠记录 | required |
| GET | `/api/v1/journals` | 查询日记 | required |
| POST | `/api/v1/journals` | 保存日记 | required |
| GET | `/api/v1/stats/weekly` | 获取周统计 | required |
| POST | `/api/v1/weekly-summaries` | 保存周总结 | required |

### 8.2 OpenAPI 3.0 草案

```yaml
openapi: 3.0.3
info:
  title: Personal Workbench API
  version: 0.1.0
servers:
  - url: /api/v1
security:
  - bearerAuth: []
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
  schemas:
    ApiResponse:
      type: object
      properties:
        code:
          type: integer
          example: 0
        message:
          type: string
          example: success
        data:
          nullable: true
    Task:
      type: object
      properties:
        id: { type: integer, format: int64 }
        title: { type: string }
        categoryId: { type: integer, format: int64 }
        priority: { type: integer }
        status: { type: integer, description: "0 TODO, 1 IN_PROGRESS, 2 DONE, 3 ARCHIVED" }
        estimatedMinutes: { type: integer }
        totalMinutes: { type: integer }
        dueDate: { type: string, format: date, nullable: true }
    Schedule:
      type: object
      properties:
        id: { type: integer, format: int64 }
        scheduleDate: { type: string, format: date }
        startTime: { type: string, example: "09:00" }
        endTime: { type: string, example: "10:30" }
        title: { type: string }
        categoryId: { type: integer, format: int64, nullable: true }
        completed: { type: boolean }
    TimerSession:
      type: object
      properties:
        id: { type: integer, format: int64 }
        taskId: { type: integer, format: int64 }
        startTime: { type: string, format: date-time }
        endTime: { type: string, format: date-time, nullable: true }
        durationMinutes: { type: integer }
        status: { type: integer, description: "0 RUNNING, 1 PAUSED, 2 FINISHED, 3 CANCELLED" }
paths:
  /dashboard:
    get:
      summary: 获取指定日期的工作台聚合数据
      parameters:
        - in: query
          name: date
          schema: { type: string, format: date }
          required: true
      responses:
        "200":
          description: success
  /tasks:
    get:
      summary: 查询任务列表
      parameters:
        - in: query
          name: status
          schema: { type: integer }
        - in: query
          name: categoryId
          schema: { type: integer, format: int64 }
      responses:
        "200": { description: success }
    post:
      summary: 新增任务
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [title]
              properties:
                title: { type: string }
                categoryId: { type: integer, format: int64 }
                priority: { type: integer, default: 2 }
                dueDate: { type: string, format: date }
                estimatedMinutes: { type: integer }
      responses:
        "200": { description: success }
  /tasks/{id}/status:
    put:
      summary: 更新任务状态
      parameters:
        - in: path
          name: id
          required: true
          schema: { type: integer, format: int64 }
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [status]
              properties:
                status: { type: integer }
      responses:
        "200": { description: success }
        "400": { description: invalid status transition }
  /timer-sessions/start:
    post:
      summary: 开始任务计时
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [taskId]
              properties:
                taskId: { type: integer, format: int64 }
      responses:
        "200": { description: success }
        "409": { description: another timer is running }
  /timer-sessions/{id}/pause:
    put:
      summary: 暂停计时
      parameters:
        - in: path
          name: id
          required: true
          schema: { type: integer, format: int64 }
      responses:
        "200": { description: success }
  /timer-sessions/{id}/resume:
    put:
      summary: 继续计时
      parameters:
        - in: path
          name: id
          required: true
          schema: { type: integer, format: int64 }
      responses:
        "200": { description: success }
  /timer-sessions/{id}/finish:
    put:
      summary: 结束计时
      parameters:
        - in: path
          name: id
          required: true
          schema: { type: integer, format: int64 }
      responses:
        "200": { description: success }
  /schedules:
    get:
      summary: 查询时间安排
      parameters:
        - in: query
          name: date
          required: true
          schema: { type: string, format: date }
      responses:
        "200": { description: success }
    post:
      summary: 新增时间安排
      responses:
        "200": { description: success }
  /stock-reviews:
    get:
      summary: 查询股市复盘
      parameters:
        - in: query
          name: date
          required: true
          schema: { type: string, format: date }
      responses:
        "200": { description: success }
    post:
      summary: 保存股市复盘
      responses:
        "200": { description: success }
  /sleep-records:
    get:
      summary: 查询睡眠记录
      responses:
        "200": { description: success }
    post:
      summary: 保存睡眠记录
      responses:
        "200": { description: success }
  /journals:
    get:
      summary: 查询睡前日记
      responses:
        "200": { description: success }
    post:
      summary: 保存睡前日记
      responses:
        "200": { description: success }
  /stats/weekly:
    get:
      summary: 获取周统计
      parameters:
        - in: query
          name: weekStart
          required: true
          schema: { type: string, format: date }
      responses:
        "200": { description: success }
```

## 9. 数据库表结构

数据库：MySQL 8  
字符集：utf8mb4  
约定：所有表包含 `id`, `created_at`, `updated_at`, `deleted_at`。

```sql
CREATE TABLE users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  username VARCHAR(64) NOT NULL COMMENT '用户名',
  display_name VARCHAR(64) NOT NULL COMMENT '显示名称',
  password_hash VARCHAR(255) DEFAULT NULL COMMENT '密码哈希，单用户模式可为空',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  deleted_at DATETIME DEFAULT NULL COMMENT '软删除时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_username (username)
) COMMENT='用户表';

CREATE TABLE task_categories (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  user_id BIGINT UNSIGNED NOT NULL COMMENT '用户ID',
  name VARCHAR(64) NOT NULL COMMENT '类型名称',
  color VARCHAR(32) NOT NULL DEFAULT '#35C99A' COMMENT '颜色',
  icon VARCHAR(64) DEFAULT NULL COMMENT '图标名称',
  target_minutes INT NOT NULL DEFAULT 6000 COMMENT '目标分钟数，默认100小时',
  sort_order INT NOT NULL DEFAULT 0 COMMENT '排序值',
  enabled TINYINT NOT NULL DEFAULT 1 COMMENT '是否启用：0否，1是',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  deleted_at DATETIME DEFAULT NULL COMMENT '软删除时间',
  PRIMARY KEY (id),
  KEY idx_user_enabled (user_id, enabled)
) COMMENT='任务类型表';

CREATE TABLE tasks (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  user_id BIGINT UNSIGNED NOT NULL COMMENT '用户ID',
  category_id BIGINT UNSIGNED DEFAULT NULL COMMENT '任务类型ID',
  title VARCHAR(200) NOT NULL COMMENT '任务标题',
  description TEXT DEFAULT NULL COMMENT '任务描述',
  priority TINYINT NOT NULL DEFAULT 2 COMMENT '优先级：1高，2中，3低',
  status TINYINT NOT NULL DEFAULT 0 COMMENT '任务状态：0待开始，1进行中，2已完成，3已归档',
  estimated_minutes INT DEFAULT NULL COMMENT '预估分钟数',
  due_date DATE DEFAULT NULL COMMENT '截止日期',
  pinned TINYINT NOT NULL DEFAULT 0 COMMENT '是否置顶：0否，1是',
  sort_order INT NOT NULL DEFAULT 0 COMMENT '排序值',
  completed_at DATETIME DEFAULT NULL COMMENT '完成时间',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  deleted_at DATETIME DEFAULT NULL COMMENT '软删除时间',
  PRIMARY KEY (id),
  KEY idx_user_status (user_id, status),
  KEY idx_user_category (user_id, category_id),
  KEY idx_due_date (due_date)
) COMMENT='任务表';

CREATE TABLE timer_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  user_id BIGINT UNSIGNED NOT NULL COMMENT '用户ID',
  task_id BIGINT UNSIGNED NOT NULL COMMENT '任务ID',
  category_id BIGINT UNSIGNED DEFAULT NULL COMMENT '任务类型ID，冗余用于统计',
  start_time DATETIME NOT NULL COMMENT '开始时间',
  end_time DATETIME DEFAULT NULL COMMENT '结束时间',
  duration_minutes INT NOT NULL DEFAULT 0 COMMENT '本次计时分钟数',
  status TINYINT NOT NULL DEFAULT 0 COMMENT '计时状态：0计时中，1已暂停，2已结束，3已取消',
  note VARCHAR(500) DEFAULT NULL COMMENT '备注',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  deleted_at DATETIME DEFAULT NULL COMMENT '软删除时间',
  PRIMARY KEY (id),
  KEY idx_user_task (user_id, task_id),
  KEY idx_user_status (user_id, status),
  KEY idx_start_time (start_time),
  KEY idx_category_time (category_id, start_time)
) COMMENT='任务计时记录表';

CREATE TABLE schedules (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  user_id BIGINT UNSIGNED NOT NULL COMMENT '用户ID',
  task_id BIGINT UNSIGNED DEFAULT NULL COMMENT '关联任务ID',
  category_id BIGINT UNSIGNED DEFAULT NULL COMMENT '任务类型ID',
  schedule_date DATE NOT NULL COMMENT '安排日期',
  start_time TIME NOT NULL COMMENT '开始时间',
  end_time TIME NOT NULL COMMENT '结束时间',
  title VARCHAR(200) NOT NULL COMMENT '安排标题',
  note VARCHAR(500) DEFAULT NULL COMMENT '备注',
  completed TINYINT NOT NULL DEFAULT 0 COMMENT '是否完成：0否，1是',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  deleted_at DATETIME DEFAULT NULL COMMENT '软删除时间',
  PRIMARY KEY (id),
  KEY idx_user_date (user_id, schedule_date),
  KEY idx_task (task_id)
) COMMENT='每日时间安排表';

CREATE TABLE stock_reviews (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  user_id BIGINT UNSIGNED NOT NULL COMMENT '用户ID',
  review_date DATE NOT NULL COMMENT '复盘日期',
  market_summary TEXT DEFAULT NULL COMMENT '大盘概览',
  operations TEXT DEFAULT NULL COMMENT '今日操作',
  holdings_review TEXT DEFAULT NULL COMMENT '持仓观察',
  good_points TEXT DEFAULT NULL COMMENT '做得好的地方',
  mistakes TEXT DEFAULT NULL COMMENT '做错的地方',
  tomorrow_plan TEXT DEFAULT NULL COMMENT '明日计划',
  emotion_score TINYINT DEFAULT NULL COMMENT '情绪评分：1-5',
  discipline_score TINYINT DEFAULT NULL COMMENT '纪律评分：1-5',
  tags VARCHAR(255) DEFAULT NULL COMMENT '标签，逗号分隔',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  deleted_at DATETIME DEFAULT NULL COMMENT '软删除时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_user_date (user_id, review_date)
) COMMENT='每日股市复盘表';

CREATE TABLE sleep_records (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  user_id BIGINT UNSIGNED NOT NULL COMMENT '用户ID',
  sleep_date DATE NOT NULL COMMENT '睡眠归属日期',
  sleep_start DATETIME NOT NULL COMMENT '入睡时间',
  wake_time DATETIME NOT NULL COMMENT '起床时间',
  duration_minutes INT NOT NULL COMMENT '睡眠分钟数',
  quality_score TINYINT DEFAULT NULL COMMENT '睡眠质量：1-5',
  note VARCHAR(500) DEFAULT NULL COMMENT '备注',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  deleted_at DATETIME DEFAULT NULL COMMENT '软删除时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_user_sleep_date (user_id, sleep_date)
) COMMENT='睡眠记录表';

CREATE TABLE journals (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  user_id BIGINT UNSIGNED NOT NULL COMMENT '用户ID',
  journal_date DATE NOT NULL COMMENT '日记日期',
  happy_moment TEXT DEFAULT NULL COMMENT '今日开心的事',
  achievement TEXT DEFAULT NULL COMMENT '今天完成了什么',
  learning TEXT DEFAULT NULL COMMENT '今天学到了什么',
  tomorrow_priority VARCHAR(255) DEFAULT NULL COMMENT '明天最重要的事',
  content TEXT DEFAULT NULL COMMENT '自由文本',
  mood_score TINYINT DEFAULT NULL COMMENT '心情评分：1-5',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  deleted_at DATETIME DEFAULT NULL COMMENT '软删除时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_user_journal_date (user_id, journal_date)
) COMMENT='睡前日记表';

CREATE TABLE weekly_summaries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  user_id BIGINT UNSIGNED NOT NULL COMMENT '用户ID',
  week_start DATE NOT NULL COMMENT '周开始日期',
  week_end DATE NOT NULL COMMENT '周结束日期',
  achievements TEXT DEFAULT NULL COMMENT '本周成果',
  problems TEXT DEFAULT NULL COMMENT '本周问题',
  next_week_plan TEXT DEFAULT NULL COMMENT '下周计划',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  deleted_at DATETIME DEFAULT NULL COMMENT '软删除时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_user_week (user_id, week_start)
) COMMENT='周总结表';
```

## 10. 统计口径

### 10.1 今日完成率

```text
今日完成率 = 今日已完成任务数 / 今日相关任务总数
```

今日相关任务包括：

- 截止日期为今天的任务
- 今天创建的任务
- 今天产生过计时的任务

### 10.2 任务类型累计时长

```text
类型累计分钟 = timer_sessions 中该 category_id 的 duration_minutes 总和
```

排除：

- `status = CANCELLED`
- `deleted_at IS NOT NULL`

### 10.3 周统计周期

```text
week_start = 周一 00:00:00
week_end = 周日 23:59:59
timezone = Asia/Shanghai
```

### 10.4 睡眠统计

```text
平均睡眠时长 = 本周 sleep_records.duration_minutes 平均值
```

## 11. MVP 里程碑

### Milestone 1：基础工作台

- Dashboard 页面框架
- 日期切换
- 时间安排 CRUD
- 任务 checklist CRUD
- 基础数据持久化

### Milestone 2：计时与 100h 进度

- 任务开始、暂停、结束计时
- 当前计时器展示
- 任务累计时长
- 类型 100h 进度条

### Milestone 3：每日记录

- 股市复盘
- 睡眠记录
- 睡前日记

### Milestone 4：每周统计

- 周统计接口
- 周统计卡片
- 类型时长柱状图
- 周总结

## 12. 验收标准

1. 用户能在 Dashboard 查看指定日期的全部核心数据。
2. 用户能新增、编辑、删除时间安排。
3. 用户能新增任务、勾选完成任务。
4. 用户能对任务开始计时、暂停、结束，刷新页面后计时数据不丢失。
5. 任务类型进度能根据计时记录自动累计。
6. 用户能保存每日股市复盘、睡眠记录、睡前日记。
7. 用户能查看本周统计。
8. 所有核心数据写入数据库，不依赖浏览器本地存储作为唯一存储。
9. 页面在 1440px 桌面宽度下核心模块尽量一屏展示；在移动端不出现文字重叠。

## 13. 后续优化建议

1. 自动生成每日总结和周总结。
2. 股市复盘支持截图或图片附件。
3. 支持番茄钟模式。
4. 支持导出 Markdown 或 CSV。
5. 支持月度统计。
6. 支持快捷键开始/暂停计时。
7. 支持提醒和桌面通知。
8. 支持 PWA，作为桌面小应用使用。

## 14. 设计草案建议

推荐页面氛围：

```text
背景：奶白 + 极浅薄荷粉渐变
面板：半透明白色，细边框，轻阴影
主按钮：薄荷绿
强调色：樱花粉
警示色：柔和珊瑚色
图标：lucide 线性图标
字体：系统默认 sans，数字计时器可用等宽字体
```

推荐模块视觉：

- 当前计时器：像一个小小的桌面计时器，数字清楚，按钮少。
- 时间轴：左侧竖线，时间点用薄荷色圆点。
- checklist：checkbox + 标题 + 类型胶囊 + 小计时按钮。
- 100h 进度：柔和横条，条尾显示 `23.5h / 100h`。
- 股市复盘：更偏文本编辑区，默认折叠到摘要。
- 睡前日记：粉色轻背景，减少边框感。

一句设计原则：

> 这个工作台应该像“每天愿意打开的小桌面”，不是“需要忍受的后台系统”。
