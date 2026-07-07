# Mintlify Overrides

本目录放 Mintlify 实际加载的自定义 CSS/JS 产物。

## 文件清单

- `hide-auth-request-headers.js`：由 `src/mintlify-overrides/hide-auth-request-headers.ts` 编译生成，API 详情页隐藏由鉴权字段重复渲染出来的“请求头”区块，只保留“授权”区块。
- `home-nav-state.css`：首页取消顶部中间菜单视觉高亮。
- `home-nav-state.js`：由 `src/mintlify-overrides/home-nav-state.ts` 编译生成，移除首页误加的 `aria-current`。
- `sidebar-width.css`：桌面端侧边栏由 14rem 加宽到 17rem 并收窄导航内边距，让 API 长接口名单行显示；仅在非 custom 页面且实际存在 `#sidebar-content` 时同步正文让位，避免首页和 404 等无侧栏页面被推偏。

## 维护规则

- 不直接手改编译产物 JS；修改 `src/mintlify-overrides/*.ts` 后运行 `npm run build:overrides`。
- CSS 可直接维护，但必须限制选择器作用范围。
- 新增文件前先确认 Mintlify 原生 `docs.json` 无法表达该能力。
