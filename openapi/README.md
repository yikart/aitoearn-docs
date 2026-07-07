# OpenAPI Specs

This directory stores the OpenAPI files used by Mintlify to generate interactive API reference pages.

## Files

- `zh/aitoearn.openapi.json`: Chinese AiToEarn Open Platform API spec generated from the existing backend OpenAPI file and checked against backend source code.
- `spec-overrides.json`: Docs-owned spec patches keyed by `METHOD path`. Set the whole entry to `null` to remove the endpoint from the docs entirely (spec, inventory, matrix, and navigation; internal-only endpoints). Otherwise each entry may set `summary` (sidebar/page title), `tag` (sidebar group; also drives `docs.json` navigation and the page URL), `description` (operation intro shown under the page title), `bodyProperties` (per-property patches merged into the request body schema), `queryParameters` and `pathParameters` (patches for query/path parameters by name). For all patch maps: object fields merge recursively (parameter patches must update both the parameter-level and `schema.description` — Mintlify renders the schema one), set a schema key to `null` to delete it (e.g. a stale `enum`), or set the whole property/parameter to `null` to remove it from the docs (e.g. an internal-only field). Applied to the target spec by `scripts/sync-openapi-docs.mjs`, so backend re-exports never overwrite curated content. Unknown endpoints, body properties, or query parameters fail the sync script.
- `endpoint-inventory.json`: Source OpenAPI endpoint inventory. It must contain the same method/path set as the target spec and `docs.json`.
- `backend-coverage-matrix.json`: Per-endpoint backend coverage matrix, including controller, service, response code, auth, and raw-response checks.

## Rules

- Keep user-facing descriptions in the same language as the target navigation.
- Curate endpoint titles and request-body property descriptions in `spec-overrides.json` instead of editing `zh/aitoearn.openapi.json` directly; regenerate via `node scripts/sync-openapi-docs.mjs`. Titles should stay within 7 CJK characters so the sidebar renders on one line: GET endpoints use noun phrases (XX 列表 / XX 详情 / XX 状态), write endpoints start with a verb, avoid internal jargon.
- When a request parameter's valid values come from another endpoint (e.g. `model` comes from a model-list endpoint), say so in its description: name the endpoint and the response field to pass (e.g. `data[n].name`).
- Use OpenAPI `servers` to enable the Mintlify API playground.
- Define auth in `components.securitySchemes` and apply it through `security`. For normal AiToEarn endpoints, `scripts/sync-openapi-docs.mjs` also injects a required `X-Api-Key` header parameter with the same Chinese tutorial link because Mintlify does not reliably render `securitySchemes.description` on API pages.
- Add realistic `responses` and `examples` so readers can switch between success and error payloads.
- For normal AiToEarn responses, success is determined by `code === 0`, not by HTTP status alone.
- Preserve raw response behavior for compatibility endpoints marked with `@SkipResponseInterceptor()`.
- Prefer OpenAPI-driven endpoint pages before adding custom MDX API pages.
