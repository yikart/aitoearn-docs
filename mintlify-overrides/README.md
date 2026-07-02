# Mintlify Overrides

本目录放 Mintlify 实际加载的自定义 CSS/JS 产物。

## 文件清单

- `home-nav-state.css`：首页取消 `使用 / Use` 顶部菜单视觉高亮。
- `home-nav-state.js`：由 `src/mintlify-overrides/home-nav-state.ts` 编译生成，移除首页误加的 `aria-current`。

## 维护规则

- 不直接手改编译产物 JS；修改 `src/mintlify-overrides/*.ts` 后运行 `npm run build:overrides`。
- CSS 可直接维护，但必须限制选择器作用范围。
- 新增文件前先确认 Mintlify 原生 `docs.json` 无法表达该能力。
