# AiToEarn API 审计

本目录用于检查 API 文档定义、页面请求示例和真实接口响应。README 仅作为使用指引，所有接口清单和结果细节统一保存在 JSON 文件中。

## 文件说明

- `audit-api-docs.mjs`：审计程序。
- `api-audit-latest.json`：主审计报告，包含 55 个接口的静态检查、真实响应、用途核对和测试状态。
- `ui-audit-latest.json`：有请求体接口在 Mintlify 页面实际生成的 cURL 检查结果。
- `path-parameter-ui-audit-latest.json`：路径参数是否仍保留 `{taskId}` 等占位符。
- `query-parameter-ui-audit-latest.json`：页面是否遗漏必填查询参数。

## 查看测试状态

打开 `api-audit-latest.json`，优先查看顶层的 `testStatus`：

- `testStatus.completed`：已经真实调用并取得响应的接口。
- `testStatus.notCalled`：暂未真实调用的接口及原因。
- `testStatus.notCalled.reasonCounts`：按鉴权、费用、写入、外部动作和删除风险统计数量。
- `endpoints`：每个接口的完整检查细节。

当前主报告归纳为：已真实调用 5 个，暂未真实调用 50 个。静态检查和本地页面检查不计入真实调用数量。

## 运行方式

```powershell
node api-audit/audit-api-docs.mjs
node api-audit/audit-api-docs.mjs --live-public
$env:AITOEARN_CN_API_KEY = '<临时 CN API Key>'
node api-audit/audit-api-docs.mjs --authenticated-read
```

审计程序只会更新 `api-audit-latest.json`，不会生成 Markdown 结果文件。未带运行参数时只进行静态检查；`--live-public` 会调用公开接口；`--authenticated-read` 只用于鉴权读取接口，不执行生成、发布、修改、删除或 OAuth 发起操作。

