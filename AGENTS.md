# AGENTS.md

本文件定义 Codex 在 `aitoearn-docs` 仓库内的默认工作规则。

## Communication

- 默认用中文回答问题。
- 生成 git commit message 时使用中文 Conventional Commits，例如 `docs: 重构开放平台文档壳子`。
- 不要加入 `Co-Authored-By` 或 `<noreply@anthropic.com>`。

## Project Scope

- 这是 Mintlify 文档项目，不是 Next.js 应用。
- `PRODUCT.md` 和 `DESIGN.md` 是本仓库的产品与视觉边界，涉及信息架构、导航、主题和样式时必须先遵循它们。
- `docs.json` 是站点配置、语言、导航和顶部入口的唯一配置源。
- 当前定位是 AiToEarn 开放平台文档，不恢复旧帮助中心、旧迁移内容、模板示例或批量抓取脚本。
- 外部代码仓库地址统一使用 `https://github.com/yikart/AiToEarn`。

## Content Rules

- 中文页面放在 `zh/`，英文页面放在 `en/`。
- 用户可见内容必须按对应语言维护，不要中英文混写。
- 新增、移动或删除页面时，必须同步更新 `docs.json`。
- 页面文件优先使用短路径和 `index.mdx`，例如 `zh/use/index.mdx` 对应 `zh/use`。
- 文档内容先保持简洁，避免无来源的营销话术、虚构数据和旧产品描述。

## Mintlify Rules

- 保持 `$schema` 为 `https://mintlify.com/docs.json`。
- 主题色以 `oklch(71% .17 294)` 为品牌基准；`docs.json` 中使用兼容的 hex 近似值。
- 保留现有 `favicon.svg`，除非用户明确要求替换。
- Logo 资源放在 `assets/logo/`。
- 不依赖 Mintlify 内部 hash class 写样式；优先使用 `docs.json` 支持的原生配置。
- Mintlify 原生配置无法表达的补丁源码放在 `src/mintlify-overrides/`，编译产物放在 `mintlify-overrides/`。
- 不要直接修改 `mintlify-overrides/*.js`；先改 TypeScript 源码，再运行 `npm run build:overrides`。
- 自定义 CSS 必须限制作用路径和选择器范围，避免全站副作用。

## OpenAPI Rules

- `openapi/zh/aitoearn.openapi.json` 是同步脚本的生成产物，禁止直接编辑；接口文档的一切人工定制（标题、分组、说明、参数增删改）都写入 `openapi/spec-overrides.json`，再运行 `node scripts/sync-openapi-docs.mjs` 重新生成。
- 后端 zod 生成的查询/路径参数存在两层 description：参数层和 `schema.description`，Mintlify 页面优先渲染 schema 层。覆盖参数说明时必须两层同时写入，只改参数层页面不会变化。
- 修改接口文档后必须用本地预览确认页面实际渲染效果，不能只检查生成 JSON 中的字段值。
- 接口标题（summary）和分组（tag）决定页面 URL；修改前先在 `spec-overrides.json` 和 `zh/` 目录搜索指向旧 URL 的站内链接并同步更新，新链接需在本地预览实测可达。

## Development

- 不主动启动 `mint dev`、`npm run dev` 或其它本地服务，除非用户明确要求预览。
- 修改 `src/mintlify-overrides/` 后运行 `npm run build:overrides`，再运行 `npx mint validate` 和 `npx mint broken-links`。
- 不提交 `node_modules/`、`.idea/`、`.mintlify/`、`.DS_Store`。
- 大批删除前先检查 `git status --short` 和当前分支，避免误删用户未提交内容。
