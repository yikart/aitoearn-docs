# AiToEarn Open Platform Docs

这是 AiToEarn 开放平台文档站，基于 Mintlify 维护。

## 目录

- `docs.json`：Mintlify 站点配置和导航入口。
- `zh/`：中文文档页面。
- `en/`：英文文档页面。
- `assets/`：文档站静态资源。
- `src/mintlify-overrides/`：Mintlify 原生配置无法表达的 TypeScript 源码。
- `mintlify-overrides/`：Mintlify 实际加载的自定义 JS/CSS 产物。

## 本地预览

仅在需要预览时运行：

```bash
npm run dev
```

`npm run dev` 会先编译 `src/mintlify-overrides/` 下的 TypeScript override。

如果本机未安装 Mintlify CLI，先安装：

```bash
npm i -g mint
```

## 维护规则

- 新增或删除页面时，必须同步更新 `docs.json`。
- 中文内容放在 `zh/`，英文内容放在 `en/`，不要混写。
- 不恢复旧帮助中心、旧迁移内容、批量抓取脚本或模板示例。
- 外部代码仓库地址统一使用 `https://github.com/yikart/AiToEarn`。
- 修改 Mintlify 自定义脚本时，先改 `src/mintlify-overrides/`，再运行 `npm run build:overrides`。
