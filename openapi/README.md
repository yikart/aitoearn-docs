# OpenAPI Specs

This directory stores the OpenAPI files used by Mintlify to generate interactive API reference pages.

## Files

- `zh/aitoearn.openapi.json`: Chinese AiToEarn Open Platform API spec generated from the existing backend OpenAPI file and checked against backend source code.
- `endpoint-inventory.json`: Source OpenAPI endpoint inventory. It must contain the same method/path set as the target spec and `docs.json`.
- `backend-coverage-matrix.json`: Per-endpoint backend coverage matrix, including controller, service, response code, auth, and raw-response checks.

## Rules

- Keep user-facing descriptions in the same language as the target navigation.
- Use OpenAPI `servers` to enable the Mintlify API playground.
- Define auth in `components.securitySchemes` and apply it through `security`.
- Add realistic `responses` and `examples` so readers can switch between success and error payloads.
- For normal AiToEarn responses, success is determined by `code === 0`, not by HTTP status alone.
- Preserve raw response behavior for compatibility endpoints marked with `@SkipResponseInterceptor()`.
- Prefer OpenAPI-driven endpoint pages before adding custom MDX API pages.
