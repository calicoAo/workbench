# Personal Workbench

个人工作台，技术栈：

- React + Vite + TypeScript + Tailwind
- Node.js + Hono + TypeScript
- MySQL 8 + Flyway SQL migrations
- Drizzle ORM

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
