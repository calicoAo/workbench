# Personal Workbench

个人工作台，技术栈：

- React + Vite + TypeScript + Tailwind
- Node.js + Hono + TypeScript
- MySQL 8 + Flyway SQL migrations
- Drizzle ORM

## vNext 产品设计与计划

- [新版 PRD：悬赏板驱动的 Personal OS](docs/PRD_VNEXT.md)
- [功能设计：页面、执行流程、状态与数据规则](docs/FUNCTIONAL_DESIGN_VNEXT.md)
- [开发计划：工作包、依赖、迁移与验收](docs/DEVELOPMENT_PLAN_VNEXT.md)
- [Finance 独立 PRD](docs/PERSONAL_WORKBENCH_FINANCE_PRD.md)
- [当前架构与待实施决策](docs/ARCHITECTURE.md)

以上 vNext 文档为待实施设计；根目录的 `个人工作台PRD.md` 保留为 v0.1 历史资料。

## 开发启动

```bash
npm install
npm run dev
```

前端：http://localhost:5173  
后端：http://localhost:3000/api/health

## 数据库

开发环境推荐直接用 Docker 启动项目专用 MySQL：

```bash
npm run db:up
```

然后执行初始化 SQL：

```bash
npm run db:init
```

正式环境建议用 Flyway：

```bash
flyway -configFiles=db/flyway.conf migrate
```
