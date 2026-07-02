# Mintlify Override Sources

本目录只放 Mintlify 原生配置无法表达的浏览器侧增强源码。

## 文件清单

- `home-nav-state.ts`：首页不应高亮 `使用 / Use` 菜单时的导航状态修正源码。

## 维护规则

- 源码使用 TypeScript，运行 `npm run build:overrides` 编译到 `mintlify-overrides/`。
- 所有脚本必须限制影响路径，避免全站副作用。
- 不依赖 Mintlify 内部 hash class，优先使用 `data-current-path`、语义属性和可解释的 DOM 选择器。
- 新增源码时同步更新本 README 和 `mintlify-overrides/README.md`。
