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

## GitHub Actions CI

`.github/workflows/ci.yml` 在 push、pull request 和手动触发时执行单个 Ubuntu / Node 22 job，不部署应用。

1. 启动独立 `mysql:8.0` service，创建空库 `personal_workbench_test`；3306 映射到 runner 的动态端口。
2. `npm ci` 安装 lockfile 中的依赖。
3. 使用 `flyway/flyway:10-alpine` 执行 `migrate validate`，复用 `db/flyway.conf` 和 `db/migration`，显式覆盖测试连接、migration 路径及 `baselineOnMigrate=false`，启用 migration 命名校验。包括 `V2_1` 在内的版本顺序由 Flyway 处理。
4. `npm run test:workflows:ci` 调用 API workspace 的同名 script，先验证 no-skip reporter，再编译测试并运行 `workflows.test.ts` 中的 7 个真实数据库用例。
5. 依次执行 `npm run typecheck`、`npm run lint`、`npm run build`。

CI 使用公开的临时测试凭据（不需要 GitHub Secrets）：`TEST_DATABASE_URL=mysql://root:ci_test_password@127.0.0.1:<service-port>/personal_workbench_test`、`NODE_ENV=test`、`JWT_SECRET=workflow-ci-only-secret`。测试入口会把测试 URL 赋给 `DATABASE_URL`。root 仅用于这个临时容器，允许回滚测试创建故障注入 trigger。

数据库健康检查、迁移/校验、reporter 自检、测试 TypeScript 检查、所有 workflow 用例及后续 workspace 检查都是 job 的 hard gate；缺少 URL、非 `_test` 数据库、连接失败、失败/取消/skip/TODO 用例都会返回非零退出码。测试不再创建简化表，直接使用迁移后的真实 schema。分支合并是否强制等待 `MySQL workflows and workspace checks`，仍取决于 GitHub branch protection/ruleset 配置。

本地复现时先准备**空的专用测试库**，然后运行：

```bash
flyway -configFiles=db/flyway.conf \
  '-url=jdbc:mysql://127.0.0.1:3307/personal_workbench_test?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai' \
  -user=root -password=ci_test_password \
  -baselineOnMigrate=false -validateMigrationNaming=true migrate validate
TEST_DATABASE_URL=mysql://root:ci_test_password@127.0.0.1:3307/personal_workbench_test \
  NODE_ENV=test JWT_SECRET=workflow-ci-only-secret npm run test:workflows:ci
```

测试会清空该库的 workflow 数据，不要指向需要保留数据的数据库。普通 `npm test` / `npm run test:workflows` 同样需要已迁移的测试库，缺少 URL 会报错。

当前没有独立的 OpenAPI 或 architecture 静态检查 script，因此未加入此类自动 gate；`lint` 目前等同 TypeScript 检查。UI/E2E、其他业务集成测试、coverage、部署与 release 均未纳入第一版 CI。

## 自动部署

`.github/workflows/deploy.yml` 在默认分支的 `CI` 成功后自动执行，也支持 GitHub Actions 的手动 `workflow_dispatch`。它通过 SSH 上传通过 CI 的提交，由 `deploy/release.sh` 保留服务器上的 `deploy/.env`，构建镜像，将数据库备份到 `/opt/personal-workbench-backups`，运行 Compose 中的 Flyway migration service，再重启 API/Web 容器并验证 `https://calicovo.icu/api/health`。本机健康检查失败时会恢复上一版容器镜像，成功时保留上一版代码在 `/opt/personal-workbench.previous`。

在仓库的 `production` Environment 中配置以下 Secrets：`DEPLOY_HOST=8.129.88.130`、`DEPLOY_USER=root`、`DEPLOY_SSH_KEY`（服务器授权的私钥）、`DEPLOY_KNOWN_HOSTS`（`ssh-keyscan -H 8.129.88.130` 的输出）。不要把生产 `.env` 提交到仓库；服务器必须已有 `/opt/personal-workbench/deploy/.env` 且权限为 `600`。

首次自动部署使用 Flyway `baselineVersion=16` 识别当前线上已手工迁移到 V16 的数据库，然后执行 V17/V18；空数据库则从 V1 开始执行全部迁移。之后由 `flyway_schema_history` 控制增量执行和 checksum 校验，不一致时停止部署。Compose project 名称固定为 `deploy`，继续使用现有 `workbench_mysql_data` 卷和 Nginx `127.0.0.1:8080` 入口。
