# Design

## Overview

AiToEarn 开放平台文档使用 Mintlify `luma` 主题。当前阶段只搭建文档壳子，视觉目标是接近 Dify 文档的三段式顶部导航、左侧目录和干净正文区域。

## Brand Assets

- 浅色背景 logo：`assets/logo/logo-light.png`
- 深色背景 logo：`assets/logo/logo-dark.png`
- Favicon：保留根目录 `favicon.svg`
- GitHub：`https://github.com/yikart/AiToEarn`

Mintlify logo 配置以实际渲染为准：

- `logo.light`：`/assets/logo/logo-light.png`
- `logo.dark`：`/assets/logo/logo-dark.png`

## Color

- 品牌基准：`oklch(71% .17 294)`
- Mintlify hex 近似：
  - Primary：`#A989FF`
  - Light：`#B8A1FF`
  - Dark：`#8B63F7`
- 不使用纯黑背景或大面积高饱和渐变。

## Navigation

桌面端目标结构：

- 左侧：AiToEarn logo 和 Mintlify 语言切换。
- 中间：`使用 / Use`、`API 文档 / API Docs`，分别使用 lucide `book-open` 与 `code` 图标。
- 右侧：搜索、GitHub、官网按钮、主题切换。

Mintlify `mint` 主题下的 `navigation.tabs` 会渲染为 header 下方的第二行 tab bar，不适合模拟 Dify 风格的一行顶部导航。当前改用 Dify 同类的 `luma` 主题，在 `navigation.languages[].tabs` 放置 `使用 / Use` 与 `API 文档 / API Docs` 作为顶部中间菜单；右侧动作区由 `navigation.languages[].navbar.links` 和 `primary` 维护。

首页 `zh/home.mdx` 与 `en/home.mdx` 是独立入口页，使用 `mode: "custom"`，不加入 `使用 / Use` tab 的左侧目录；但需要在 navigation 中保留隐藏的 `首页 / Home` tab，确保 Mintlify 语言切换可以在 `zh/home` 与 `en/home` 之间映射，而不是回落到 `use` 页面。`使用 / Use` tab 的首个页面是 `zh/use/index.mdx` 与 `en/use/index.mdx`。

Mintlify `luma` 在隐藏首页 tab 上仍会把第一个可见 tab 渲染为 active，因此 `mintlify-overrides/home-nav-state.css` 中保留一段仅匹配 `data-current-path="/zh/home"` / `"/en/home"` 的最小样式覆盖，取消 `使用 / Use` 的视觉高亮；不要把这段覆盖扩展到其它页面。

`src/mintlify-overrides/home-nav-state.ts` 只处理同一个问题：在首页运行时移除顶部菜单误加的 `aria-current`，并清掉 active 背景。编译产物是 `mintlify-overrides/home-nav-state.js`，不得直接手改产物 JS，也不得用于其它导航行为。

语言分流：

- 中文官网按钮：`https://aitoearn.cn/`
- 英文及其它语言官网按钮：`https://aitoearn.ai/`

## Layout

- 使用 Mintlify 原生布局，不自建复杂框架。
- 左侧目录保持信息密度，正文区域保持空白和可读性。
- 当前内容页只保留最小标题和占位，后续按真实内容扩展。

## Styling Boundaries

- 优先使用 Mintlify 原生配置，不依赖内部 hash class。
- 不写大段覆盖样式，不用 CSS 重建 Mintlify 原生组件。
