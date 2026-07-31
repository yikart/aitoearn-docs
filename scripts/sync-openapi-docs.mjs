import fs from 'node:fs'
import path from 'node:path'

const docsRoot = process.cwd()
const repoRoot = path.resolve(docsRoot, '..')
const websiteRoot = path.join(repoRoot, 'aitoearn-website')
const backendRoot = process.env.AITOEARN_BACKEND_ROOT || 'E:/project-dev/node/yika/aitoearn-monorepo'
const sourceSpecPath = path.join(websiteRoot, 'docs/openPlatform/默认模块.openapi.json')
const zhTargetSpecPath = path.join(docsRoot, 'openapi/zh/aitoearn.openapi.json')
const enTargetSpecPath = path.join(docsRoot, 'openapi/en/aitoearn.openapi.json')
const specOverridesPath = path.join(docsRoot, 'openapi/spec-overrides.json')
const specTranslationsEnPath = path.join(docsRoot, 'openapi/spec-translations.en.json')
const inventoryPath = path.join(docsRoot, 'openapi/endpoint-inventory.json')
const matrixPath = path.join(docsRoot, 'openapi/backend-coverage-matrix.json')
const docsJsonPath = path.join(docsRoot, 'docs.json')

const controllerRoots = [
  path.join(backendRoot, 'apps/aitoearn-server/src'),
  path.join(backendRoot, 'apps/aitoearn-ai/src'),
  path.join(backendRoot, 'libs/assets/src'),
]
const commonRoot = path.join(backendRoot, 'libs/common/src')

const httpMethods = new Set(['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'])
const zhTargetSpecRef = 'openapi/zh/aitoearn.openapi.json'
const enTargetSpecRef = 'openapi/en/aitoearn.openapi.json'
const zhApiReferenceBasePath = '/api-reference'
const enApiReferenceBasePath = '/en/api-reference'
const apiKeyTutorialHref = '/zh/use/api-key'
const xApiKeyDescription = `需要从 AiToEarn 获取 API Key。点击前往[「API Key 获取教程」](${apiKeyTutorialHref})。`
const geminiApiKeyDescription = '传入从 AiToEarn 获取的 API Key。为兼容 Gemini SDK，本接口使用 `x-goog-api-key` 请求头，无需 Google Gemini 官方 API Key。'
const legacyOpenApiRedirects = [
  {
    source: '/api-reference/渠道管理授权/授权会话状态',
    destination: `${zhApiReferenceBasePath}/get-api-v2-channels-accounts-auth-platform-status-session-id`,
  },
]

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function walkTsFiles(root) {
  if (!fs.existsSync(root)) {
    return []
  }

  const result = []
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
      continue
    }

    const fullPath = path.join(root, entry.name)
    if (entry.isDirectory()) {
      result.push(...walkTsFiles(fullPath))
    }
    else if (entry.isFile() && entry.name.endsWith('.ts')) {
      result.push(fullPath)
    }
  }
  return result
}

function normalizePathForDocs(filePath) {
  return filePath.replaceAll('\\', '/')
}

function slugifyEndpointId(value) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function endpointHref(endpoint, basePath = zhApiReferenceBasePath) {
  return `${basePath}/${slugifyEndpointId(`${endpoint.method} ${endpoint.path}`)}`
}

function defaultMintlifySlug(value) {
  return value
    .trim()
    .toLowerCase()
    .replaceAll('/', '')
    .replace(/\s+/g, '-')
}

function defaultOpenApiHref(operation) {
  const tag = operation.tags?.[0]
  const summary = operation.summary
  if (!tag || !summary) {
    return null
  }
  return `${zhApiReferenceBasePath}/${defaultMintlifySlug(tag)}/${defaultMintlifySlug(summary)}`
}

function parseOperationId(operationId) {
  const separatorIndex = operationId.indexOf('_')
  const className = separatorIndex === -1 ? operationId : operationId.slice(0, separatorIndex)
  const rawMethodName = separatorIndex === -1 ? '' : operationId.slice(separatorIndex + 1)
  const methodName = rawMethodName.replace(/_v\d+$/, '')
  return { className, methodName }
}

function extractMethodBlock(source, methodName) {
  const matcher = new RegExp(`(^|\\n)\\s*(?:(?:private|protected|public)\\s+)?(?:async\\s+)?${escapeRegExp(methodName)}\\s*\\(`, 'm')
  const match = matcher.exec(source)
  if (!match) {
    return null
  }

  const signatureStart = match.index
  const openBrace = source.indexOf('{', signatureStart)
  if (openBrace === -1) {
    return null
  }

  let depth = 0
  for (let index = openBrace; index < source.length; index += 1) {
    const char = source[index]
    if (char === '{') {
      depth += 1
    }
    else if (char === '}') {
      depth -= 1
      if (depth === 0) {
        const decoratorStart = findDecoratorStart(source, signatureStart)
        return {
          decorators: source.slice(decoratorStart, signatureStart),
          block: source.slice(openBrace, index + 1),
          start: signatureStart,
          end: index + 1,
        }
      }
    }
  }
  return null
}

function findDecoratorStart(source, signatureStart) {
  const prefix = source.slice(0, signatureStart)
  const lines = prefix.split(/\r?\n/)
  let startLine = lines.length

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const trimmed = lines[index].trim()
    if (
      trimmed.startsWith('@')
      || trimmed.startsWith('*')
      || trimmed.startsWith('/**')
      || trimmed.startsWith('*/')
      || trimmed === ''
    ) {
      startLine = index
      continue
    }
    break
  }

  return lines.slice(0, startLine).join('\n').length
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function findControllerFile(files, className, methodName) {
  const candidates = []
  for (const filePath of files) {
    const source = fs.readFileSync(filePath, 'utf8')
    if (!source.includes(`class ${className}`)) {
      continue
    }

    const method = extractMethodBlock(source, methodName)
    candidates.push({
      filePath,
      source,
      method,
      score: method ? 2 : 1,
    })
  }

  candidates.sort((a, b) => b.score - a.score)
  return candidates[0] || null
}

function parseConstructorServiceTypes(source) {
  const result = new Map()
  const constructorMatch = /constructor\s*\(([\s\S]*?)\)\s*\{/.exec(source)
  if (!constructorMatch) {
    return result
  }

  for (const match of constructorMatch[1].matchAll(/(?:private|protected|public)\s+readonly\s+(\w+)\s*:\s*([A-Za-z0-9_]+)/g)) {
    result.set(match[1], match[2])
  }
  return result
}

function parseImports(source, fromFilePath) {
  const imports = new Map()
  for (const match of source.matchAll(/import\s+(?:type\s+)?(?:\{[^}]*\}|[A-Za-z0-9_]+|[\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g)) {
    const statementStart = source.lastIndexOf('\n', match.index) + 1
    const statementEnd = source.indexOf('\n', match.index)
    const statement = source.slice(statementStart, statementEnd === -1 ? source.length : statementEnd)
    const importPath = match[1]
    for (const nameMatch of statement.matchAll(/\b([A-Z][A-Za-z0-9_]*)\b/g)) {
      const name = nameMatch[1]
      if (!imports.has(name)) {
        imports.set(name, resolveImportPath(fromFilePath, importPath))
      }
    }
  }
  return imports
}

function resolveImportPath(fromFilePath, importPath) {
  if (!importPath.startsWith('.')) {
    return null
  }

  const resolvedBase = path.resolve(path.dirname(fromFilePath), importPath)
  const candidates = [
    `${resolvedBase}.ts`,
    path.join(resolvedBase, 'index.ts'),
  ]
  return candidates.find(candidate => fs.existsSync(candidate)) || null
}

function collectServiceCalls(methodBlock) {
  if (!methodBlock) {
    return []
  }

  const calls = []
  for (const match of methodBlock.block.matchAll(/this\.(\w+)\.(\w+)\s*\(/g)) {
    calls.push({ property: match[1], method: match[2] })
  }
  return calls
}

function collectResponseCodesFromService(serviceFilePath, serviceMethodName) {
  if (!serviceFilePath || !serviceMethodName || !fs.existsSync(serviceFilePath)) {
    return { responseCodes: [], customExceptions: [], serviceMethodsVisited: [] }
  }

  const source = fs.readFileSync(serviceFilePath, 'utf8')
  const visited = new Set()
  const responseCodes = new Set()
  const customExceptions = new Set()

  function visit(methodName, depth = 0) {
    if (!methodName || visited.has(methodName) || depth > 6) {
      return
    }
    visited.add(methodName)

    const method = extractMethodBlock(source, methodName)
    if (!method) {
      return
    }

    for (const match of method.block.matchAll(/ResponseCode\.([A-Za-z0-9_]+)/g)) {
      responseCodes.add(match[1])
    }
    for (const match of method.block.matchAll(/throw\s+new\s+([A-Za-z0-9_]+Exception)\b/g)) {
      if (match[1] !== 'AppException') {
        customExceptions.add(match[1])
      }
    }
    for (const match of method.block.matchAll(/this\.(\w+)\s*\(/g)) {
      visit(match[1], depth + 1)
    }
  }

  visit(serviceMethodName)
  return {
    responseCodes: [...responseCodes].sort(),
    customExceptions: [...customExceptions].sort(),
    serviceMethodsVisited: [...visited],
  }
}

function parseResponseCodeMap() {
  const enumPath = path.join(commonRoot, 'enums/response-code.enum.ts')
  const source = fs.readFileSync(enumPath, 'utf8')
  const codeMap = new Map()
  for (const match of source.matchAll(/^\s*([A-Za-z0-9_]+)\s*=\s*(-?\d+),/gm)) {
    codeMap.set(match[1], Number(match[2]))
  }
  return codeMap
}

function parseMessageMap() {
  const messagesPath = path.join(commonRoot, 'i18n/messages.ts')
  const source = fs.readFileSync(messagesPath, 'utf8')
  const messageMap = new Map()
  const blockRegex = /\[ResponseCode\.([A-Za-z0-9_]+)\]:\s*\{([\s\S]*?)\n\s*\},/g
  for (const match of source.matchAll(blockRegex)) {
    const codeName = match[1]
    const block = match[2]
    const zhString = /'zh-CN':\s*'([^']+)'/.exec(block)?.[1]
      || /'zh-CN':\s*template\.compile\('([^']+)'\)/.exec(block)?.[1]
    if (zhString) {
      messageMap.set(codeName, zhString)
    }
  }
  return messageMap
}

function listEndpoints(spec) {
  const endpoints = []
  let index = 1
  for (const [pathName, pathItem] of Object.entries(spec.paths || {})) {
    for (const [method, operation] of Object.entries(pathItem || {})) {
      if (!httpMethods.has(method)) {
        continue
      }
      endpoints.push({
        index: index++,
        method: method.toUpperCase(),
        path: pathName,
        operationId: operation.operationId || '',
        tag: (operation.tags || [])[0] || '未分组',
        summary: operation.summary || '',
        hasRequestBody: Boolean(operation.requestBody),
        parameterCount: operation.parameters?.length || 0,
        originalResponseKeys: Object.keys(operation.responses || {}),
      })
    }
  }
  return endpoints
}

function resolveDataSchema(operation) {
  const schema = operation.responses?.default?.content?.['application/json']?.schema
  const dataSchema = schema?.properties?.data
  return dataSchema ? structuredClone(dataSchema) : {}
}

function commonResponseSchema(dataSchema) {
  return {
    type: 'object',
    properties: {
      data: dataSchema,
      code: {
        type: 'integer',
        description: '业务状态码。0 表示成功，非 0 表示业务错误。',
      },
      message: {
        type: 'string',
        description: '响应消息。',
      },
      requestId: {
        type: 'string',
        description: '请求 ID。',
      },
      timestamp: {
        type: 'integer',
        description: '错误响应时间戳，Unix 毫秒。',
      },
    },
    required: ['code', 'message'],
  }
}

function rawResponseSchema() {
  return {
    type: 'object',
    additionalProperties: true,
    description: '第三方协议原生响应，不使用 AiToEarn 通用响应包裹。',
  }
}

function volcengineUrlSchema(description) {
  return {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description,
      },
    },
    required: ['url'],
    additionalProperties: false,
  }
}

function volcengineVideoGenerationRequestSchema() {
  return {
    type: 'object',
    properties: {
      model: {
        type: 'string',
        description: '模型 ID 或 Endpoint ID。',
      },
      content: {
        type: 'array',
        description: '输入给模型、用于生成视频的内容，保持火山方舟视频生成格式。\n\nSeedance 2.0 系列模型支持以下输入组合：\n\n- **文本**\n- **文本 + 图片**\n- **文本 + 视频**\n- **文本 + 图片 + 音频**\n- **文本 + 图片 + 视频**\n- **文本 + 视频 + 音频**\n- **文本 + 图片 + 视频 + 音频**',
        items: {
          oneOf: [
            {
              title: '纯文本',
              type: 'object',
              properties: {
                type: {
                  type: 'string',
                  enum: ['text'],
                  description: '内容类型，文本内容固定为 text。',
                },
                text: {
                  type: 'string',
                  description: '文本提示词，用于描述期望生成的视频。',
                },
              },
              required: ['type', 'text'],
              additionalProperties: false,
            },
            {
              title: '图片',
              type: 'object',
              properties: {
                type: {
                  type: 'string',
                  enum: ['image_url'],
                  description: '内容类型，图片内容固定为 image_url。',
                },
                image_url: volcengineUrlSchema('图片 URL 或 base64 图片数据。'),
                role: {
                  type: 'string',
                  enum: ['first_frame', 'last_frame', 'reference_image'],
                  description: '图片用途：首帧、尾帧或参考图。',
                },
              },
              required: ['type', 'image_url'],
              additionalProperties: false,
            },
            {
              title: '视频',
              type: 'object',
              properties: {
                type: {
                  type: 'string',
                  enum: ['video_url'],
                  description: '内容类型，视频内容固定为 video_url。',
                },
                video_url: volcengineUrlSchema('参考视频 URL 或素材 ID。'),
                role: {
                  type: 'string',
                  enum: ['reference_video'],
                  description: '视频用途，当前固定为 reference_video。',
                },
              },
              required: ['type', 'video_url', 'role'],
              additionalProperties: false,
            },
            {
              title: '音频',
              type: 'object',
              properties: {
                type: {
                  type: 'string',
                  enum: ['audio_url'],
                  description: '内容类型，音频内容固定为 audio_url。',
                },
                audio_url: volcengineUrlSchema('参考音频 URL、base64 音频数据或素材 ID。'),
                role: {
                  type: 'string',
                  enum: ['reference_audio'],
                  description: '音频用途，当前固定为 reference_audio。',
                },
              },
              required: ['type', 'audio_url', 'role'],
              additionalProperties: false,
            },
          ],
        },
      },
      return_last_frame: {
        type: 'boolean',
        description: '是否返回尾帧图像。',
      },
      tools: {
        type: 'array',
        description: '模型工具配置。',
        items: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['web_search'],
              description: '工具类型。',
            },
          },
          required: ['type'],
          additionalProperties: false,
        },
      },
      resolution: {
        type: 'string',
        description: '分辨率。',
      },
      ratio: {
        type: 'string',
        description: '宽高比。',
      },
      duration: {
        type: 'integer',
        description: '时长（秒）。',
      },
      seed: {
        type: 'integer',
        description: '随机种子。',
      },
      watermark: {
        type: 'boolean',
        description: '是否带水印。',
      },
      generate_audio: {
        type: 'boolean',
        description: '是否生成与画面同步的音频，Seedance 2.0 系列支持。',
      },
      execution_expires_after: {
        type: 'integer',
        minimum: 3600,
        maximum: 259200,
        description: '任务超时阈值（秒），取值范围 [3600, 259200]。',
      },
      priority: {
        type: 'integer',
        minimum: 0,
        maximum: 9,
        description: '任务执行优先级 0-9，数值越大优先级越高，Seedance 2.0 系列支持。',
      },
      safety_identifier: {
        type: 'string',
        description: '终端用户唯一标识符，原样透传给方舟用于合规检测。',
      },
      source: {
        type: 'string',
        enum: ['ai_video', 'ai_draft_generation', 'plugin'],
        description: '消费来源。',
      },
    },
    required: ['model', 'content'],
    additionalProperties: false,
  }
}

function addVolcengineVideoCompatibilityEndpoints(spec) {
  spec.paths = spec.paths || {}
  spec.components = spec.components || {}
  spec.components.schemas = spec.components.schemas || {}

  const requiredSchemas = [
    'VolcengineVideoGenerationResponseVo',
    'VolcengineTaskStatusResponseVo',
  ]
  for (const schemaName of requiredSchemas) {
    if (!spec.components.schemas[schemaName]) {
      throw new Error(`Source OpenAPI spec is missing schema: ${schemaName}`)
    }
  }

  const taskStatusSchema = spec.components.schemas.VolcengineTaskStatusResponseVo
  taskStatusSchema.properties = taskStatusSchema.properties || {}
  Object.assign(taskStatusSchema.properties, {
    generate_audio: {
      type: 'boolean',
      description: '是否包含同步音频',
    },
    tools: {
      type: 'array',
      description: '本次请求模型实际使用的工具',
      items: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            description: '实际使用的工具类型',
          },
        },
        required: ['type'],
        additionalProperties: false,
      },
    },
    safety_identifier: {
      type: 'string',
      description: '终端用户标识（原样回显）',
    },
    priority: {
      type: 'number',
      description: '任务执行优先级',
    },
    execution_expires_after: {
      type: 'number',
      description: '任务超时阈值（秒）',
    },
  })

  spec.paths['/api/ai/v3/contents/generations/tasks'] = spec.paths['/api/ai/v3/contents/generations/tasks'] || {}
  spec.paths['/api/ai/v3/contents/generations/tasks'].post = spec.paths['/api/ai/v3/contents/generations/tasks'].post || {
    tags: ['AI 服务/视频生成'],
    summary: '火山格式创建视频生成任务',
    description: '接口说明：火山方舟视频生成兼容接口，适用于已经接入火山视频生成 API、希望迁移到 AiToEarn 但不想大改请求结构的客户。参考火山官方文档：[创建视频生成任务](https://www.volcengine.com/docs/82379/1520757?lang=zh)。',
    operationId: 'VolcengineVideoController_videoGeneration',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: volcengineVideoGenerationRequestSchema(),
          examples: {
            textToVideo: {
              summary: '文本生成视频',
              value: {
                model: 'doubao-seedance-2-0-260128',
                content: [
                  {
                    type: 'text',
                    text: 'Create a cinematic product video with close-up shots, soft studio lighting, and smooth camera movement.',
                  },
                ],
                generate_audio: true,
                ratio: '16:9',
                duration: 8,
                watermark: false,
              },
            },
          },
        },
      },
    },
    responses: {
      200: {
        description: '火山格式原生响应，不使用 AiToEarn 通用响应包裹。',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/VolcengineVideoGenerationResponseVo',
            },
            examples: {
              success: {
                summary: '成功',
                value: {
                  id: '6a461da66fe8a12d33daabdd',
                },
              },
            },
          },
        },
      },
    },
  }

  spec.paths['/api/ai/v3/contents/generations/tasks/{taskId}'] = spec.paths['/api/ai/v3/contents/generations/tasks/{taskId}'] || {}
  spec.paths['/api/ai/v3/contents/generations/tasks/{taskId}'].get = spec.paths['/api/ai/v3/contents/generations/tasks/{taskId}'].get || {
    tags: ['AI 服务/视频生成'],
    summary: '火山格式查询视频任务',
    description: '接口说明：查询火山格式视频生成任务状态，返回结构保持火山任务查询格式。参考火山官方文档：[查询视频生成任务](https://www.volcengine.com/docs/82379/1521309?lang=zh)。',
    operationId: 'VolcengineVideoController_videoTaskStatus',
    parameters: [
      {
        name: 'taskId',
        in: 'path',
        required: true,
        description: '任务 ID，由火山格式创建视频生成任务接口返回。',
        schema: {
          type: 'string',
        },
      },
    ],
    responses: {
      200: {
        description: '火山格式原生响应，不使用 AiToEarn 通用响应包裹。',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/VolcengineTaskStatusResponseVo',
            },
            examples: {
              success: {
                summary: '成功',
                value: {
                  id: '6a461da66fe8a12d33daabdd',
                  model: 'doubao-seedance-2-0-260128',
                  status: 'succeeded',
                  error: null,
                  created_at: 1782980006,
                  updated_at: 1782980484,
                  content: {
                    video_url: 'https://ark-content-generation-cn-beijing.tos-cn-beijing.volces.com/example/video.mp4',
                    last_frame_url: 'https://assets.aitoearn.ai/example/last-frame.png',
                  },
                  seed: 9190,
                  resolution: '720p',
                  ratio: '16:9',
                  duration: 8,
                  framespersecond: 24,
                  generate_audio: true,
                  tools: [
                    {
                      type: 'web_search',
                    },
                  ],
                  safety_identifier: 'user:01JQ8W2M4Y6N7P8R9S0T1U2V3W',
                  priority: 0,
                  execution_expires_after: 172800,
                  usage: {
                    completion_tokens: 411300,
                    total_tokens: 411300,
                    tool_usage: {
                      web_search: 1,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  }
}

function isVolcengineVideoCompatibilityEndpoint(endpoint) {
  return endpoint.path === '/api/ai/v3/contents/generations/tasks'
    || endpoint.path === '/api/ai/v3/contents/generations/tasks/{taskId}'
}

function rawJsonResponseContent(endpoint, operation) {
  if (isVolcengineVideoCompatibilityEndpoint(endpoint)) {
    const response = operation.responses?.[200] || operation.responses?.default
    const jsonContent = response?.content?.['application/json']
    if (jsonContent) {
      return structuredClone(jsonContent)
    }
  }

  return {
    schema: rawResponseSchema(),
    examples: buildRawExamples(endpoint),
  }
}

function schemaExample(schema, spec, depth = 0) {
  if (!schema || depth > 5) {
    return {}
  }
  if (schema.example !== undefined) {
    return schema.example
  }
  if (schema.default !== undefined) {
    return schema.default
  }
  if (schema.$ref) {
    const refName = schema.$ref.split('/').pop()
    return schemaExample(spec.components?.schemas?.[refName], spec, depth + 1)
  }
  if (schema.allOf?.length) {
    return Object.assign({}, ...schema.allOf.map(item => schemaExample(item, spec, depth + 1)))
  }
  if (schema.oneOf?.length) {
    return schemaExample(schema.oneOf[0], spec, depth + 1)
  }
  if (schema.anyOf?.length) {
    return schemaExample(schema.anyOf[0], spec, depth + 1)
  }
  if (schema.enum?.length) {
    return schema.enum[0]
  }

  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type
  if (type === 'array') {
    return [schemaExample(schema.items, spec, depth + 1)]
  }
  if (type === 'object' || schema.properties) {
    const result = {}
    const properties = schema.properties || {}
    const keys = [...new Set([...(schema.required || []), ...Object.keys(properties)])].slice(0, 12)
    for (const key of keys) {
      result[key] = schemaExample(properties[key], spec, depth + 1)
    }
    return result
  }
  if (type === 'integer' || type === 'number') {
    return 1
  }
  if (type === 'boolean') {
    return true
  }
  if (schema.format === 'uri') {
    return 'https://assets.aitoearn.cn/example.png'
  }
  if (schema.format === 'date-time') {
    return '2026-07-02T12:00:00.000Z'
  }
  return 'string'
}

function businessCodeExample(codeName, codeMap, messageMap) {
  const code = codeMap.get(codeName)
  const message = messageMap.get(codeName) || codeName
  const dataByCode = {
    ChannelPublishDuplicateItem: { accountId: 'acc_123', platform: 'douyin' },
    ChannelPublishTaskAlreadyExists: { flowId: 'flow_123' },
    ChannelAccountNotFound: {},
    ChannelPublishMixedRelayAndLocalAccounts: {},
    ChannelPublishPlatformNotSupported: { platform: 'douyin' },
    ChannelPublishValidationFailed: {
      platform: 'douyin',
      accountId: 'acc_123',
      issues: ['发布内容校验失败'],
    },
    ChannelPublishPlatformStatusFailed: { status: 500 },
    ChannelPublishPlatformWorkIdMissing: {},
    ChannelPublishPermalinkMissing: {},
    PublishFlowNotFound: {},
  }

  return {
    summary: `${codeName} (${code ?? 'unknown'})`,
    value: {
      code: code ?? 400,
      message,
      data: dataByCode[codeName] || {},
      timestamp: 1772099056662,
    },
  }
}

function buildExamples(endpoint, operation, mapping, spec, codeMap, messageMap) {
  const examples = {
    success: {
      summary: '成功',
      value: {
        code: 0,
        message: '请求成功',
        data: schemaExample(resolveDataSchema(operation), spec),
      },
    },
  }

  const hasBodyOrParams = endpoint.hasRequestBody || endpoint.parameterCount > 0
  if (hasBodyOrParams) {
    examples.validationFailed10002 = businessCodeExample('ValidationFailed', codeMap, messageMap)
  }
  if (mapping.requiresAuth) {
    examples.unauthorized401 = {
      summary: '未认证或 API Key 无效',
      value: {
        code: 401,
        message: 'Unauthorized',
        data: {},
        timestamp: 1772099056662,
      },
    }
  }

  for (const codeName of mapping.responseCodes) {
    const code = codeMap.get(codeName)
    if (!code || code === 0) {
      continue
    }
    const key = `${codeName.charAt(0).toLowerCase()}${codeName.slice(1)}${code}`
    examples[key] = businessCodeExample(codeName, codeMap, messageMap)
  }

  return examples
}

function buildRawExamples(endpoint) {
  return {
    success: {
      summary: '第三方协议原生成功响应',
      value: {
        id: `${endpoint.operationId || 'response'}_example`,
        object: 'response',
      },
    },
  }
}

function getSecurity(mapping) {
  if (!mapping.requiresAuth) {
    return []
  }
  if (mapping.apiKeyHeader === 'Authorization') {
    return [{ 'apikey-header-Authorization': [] }]
  }
  if (mapping.apiKeyHeader === 'x-goog-api-key') {
    return [{ 'apikey-header-x-goog-api-key': [] }]
  }
  return [{ 'apikey-header-X-Api-Key': [] }]
}

function syncXApiKeyHeaderParameter(operation) {
  if (!Array.isArray(operation.parameters)) {
    return
  }

  operation.parameters = operation.parameters.filter(parameter => (
    parameter.$ref
    || parameter.in !== 'header'
    || parameter.name?.toLowerCase() !== 'x-api-key'
  ))
}

function buildNavigationGroups(endpoints, targetSpecRef) {
  const groups = []
  const byTag = new Map()
  for (const endpoint of endpoints) {
    if (!byTag.has(endpoint.tag)) {
      byTag.set(endpoint.tag, [])
    }
    byTag.get(endpoint.tag).push(`${endpoint.method} ${endpoint.path}`)
  }
  for (const [tag, pages] of byTag.entries()) {
    groups.push({
      group: tag,
      openapi: targetSpecRef,
      pages,
    })
  }
  return groups
}

function buildOpenApiRedirects(endpoints, targetSpec) {
  const redirects = []
  for (const endpoint of endpoints) {
    const operation = targetSpec.paths?.[endpoint.path]?.[endpoint.method.toLowerCase()]
    const source = operation ? defaultOpenApiHref(operation) : null
    const destination = operation?.['x-mint']?.href
    if (source && destination && source !== destination) {
      redirects.push({ source, destination })
    }
  }
  return redirects
}

function mergeRedirects(existingRedirects, generatedRedirects) {
  const redirects = []
  const sources = new Set()
  for (const redirect of [...(existingRedirects || []), ...generatedRedirects]) {
    if (!redirect?.source || !redirect?.destination || sources.has(redirect.source)) {
      continue
    }
    redirects.push(redirect)
    sources.add(redirect.source)
  }
  return redirects
}

function sanitizeOpenApi30(value) {
  if (Array.isArray(value)) {
    for (const item of value) {
      sanitizeOpenApi30(item)
    }
    return value
  }
  if (!value || typeof value !== 'object') {
    return value
  }

  delete value.propertyNames
  delete value.unevaluatedProperties
  delete value.dependentRequired
  delete value.dependentSchemas
  delete value.$schema

  if (value.properties && typeof value.id === 'string') {
    delete value.id
  }

  if (Object.prototype.hasOwnProperty.call(value, 'const')) {
    value.enum = [value.const]
    delete value.const
  }

  for (const unionKey of ['anyOf', 'oneOf']) {
    const unionValue = value[unionKey]
    if (!Array.isArray(unionValue)) {
      continue
    }

    const nullItems = unionValue.filter(item => item?.type === 'null')
    const nonNullItems = unionValue.filter(item => item?.type !== 'null')
    if (nullItems.length > 0 && nonNullItems.length === 1) {
      delete value[unionKey]
      Object.assign(value, nonNullItems[0])
      value.nullable = true
    }
  }

  if (value.type === 'null') {
    value.type = 'string'
    value.nullable = true
  }

  if (
    value.additionalProperties
    && typeof value.additionalProperties === 'object'
    && !Array.isArray(value.additionalProperties)
    && Object.keys(value.additionalProperties).length === 0
  ) {
    value.additionalProperties = true
  }

  if (Array.isArray(value.items)) {
    value.items = value.items[0] || {}
  }

  for (const [key, child] of Object.entries(value)) {
    if (key === 'example' || key === 'examples') {
      continue
    }
    sanitizeOpenApi30(child)
  }
  return value
}

const englishTextOverrides = {
  'AI 服务': 'AI Services',
  'AI 服务/视频生成': 'AI Services/Video Generation',
  'AI 服务/图像生成': 'AI Services/Image Generation',
  'AI 服务/大语言模型': 'AI Services/Large Language Models',
  '渠道管理': 'Channel Management',
  '渠道管理/账号': 'Channel Management/Accounts',
  '渠道管理/内容发布': 'Channel Management/Publishing',
  '渠道管理/平台': 'Channel Management/Platforms',
  '渠道管理/作品': 'Channel Management/Works',
  '渠道管理/账号分组': 'Channel Management/Account Groups',
  '渠道管理/授权': 'Channel Management/Authorization',
  '资源管理': 'Asset Management',
  'AiToEarn 开放平台 API': 'AiToEarn Open Platform API',
  '视频生成模型': 'Video Generation Models',
  '生成视频': 'Generate Video',
  '视频任务列表': 'Video Task List',
  '视频任务状态': 'Video Task Status',
  '图像生成模型': 'Image Generation Models',
  '图像编辑模型': 'Image Editing Models',
  '生成图像': 'Generate Image',
  '编辑图像': 'Edit Image',
  '异步生成图像': 'Generate Image Async',
  '异步编辑图像': 'Edit Image Async',
  '图像任务状态': 'Image Task Status',
  '对话模型列表': 'Chat Model List',
  'OpenAI 对话': 'OpenAI Chat',
  'Anthropic 对话': 'Anthropic Chat',
  'Gemini 对话': 'Gemini Chat',
  'Gemini 流式对话': 'Gemini Streaming Chat',
  'OpenAI 图像生成': 'OpenAI Image Generation',
  'OpenAI 图像编辑': 'OpenAI Image Editing',
  '账号列表': 'Account List',
  '批量删除账号': 'Batch Delete Accounts',
  '账号详情': 'Account Details',
  '删除账号': 'Delete Account',
  '账号授权状态': 'Account Authorization Status',
  '发布选项可选值': 'Publish Option Values',
  '创建发布选项值': 'Create Publish Option Value',
  '创建发布流程': 'Create Publish Flow',
  '发布流程详情': 'Publish Flow Details',
  '立即发布': 'Publish Now',
  '重试发布任务': 'Retry Publish Task',
  '取消发布任务': 'Cancel Publish Task',
  '修改发布时间': 'Update Publish Time',
  '发布记录列表': 'Publish Record List',
  '待发布列表': 'Queued Publish List',
  '已发布列表': 'Published List',
  '删除发布记录': 'Delete Publish Record',
  '发布记录详情': 'Publish Record Details',
  'App 拉起链接': 'App Deep Link',
  '这个接口只对抖音发布记录有效。`recordId` 必须来自**尚未完成发布**的记录；已完成、失败或其他状态的记录只会返回业务错误 `15018`，拿不到标准的 App 拉起返回。': 'This endpoint only works for Douyin release records. `recordId` must come from a record that has not finished publishing yet; completed, failed, or other records only return business error `15018` and do not produce the standard App deep link response.',
  '处于等待用户操作状态的抖音发布记录 ID。取值来自发布记录列表接口返回的 `data[n].id`，不能使用已发布完成的记录或其他非抖音发布记录。': 'The Douyin release record ID that is still waiting for user action. Use `data[n].id` from the release record list response; do not use a completed record or any non-Douyin release record.',
  '接口说明：根据发布流程 ID 查询一次多账号发布流程及其任务状态。`flowId` 可从[创建发布流程](/en/api-reference/post-api-v2-channels-publish-flows)接口返回的 `data.flowId` 获取，也可从[发布记录列表](/en/api-reference/get-api-v2-channels-publish-records)返回项的 `flowId` 获取。': 'Interface description: Query a multi-account publish flow and its task status by publish flow ID. `flowId` can be obtained from the `data.flowId` returned by the [Create Publish Flow](/en/api-reference/post-api-v2-channels-publish-flows) endpoint, or from the `flowId` field in the [Publish Record List](/en/api-reference/get-api-v2-channels-publish-records) response items.',
  '发布流程 ID。取值来自创建发布流程接口返回的 `data.flowId`，或发布记录列表返回的 `data[n].flowId`。': 'Publish flow ID. Use the `data.flowId` returned by the Create Publish Flow endpoint, or the `data[n].flowId` returned by the Publish Record List endpoint.',
  '平台列表': 'Platform List',
  '平台发布选项': 'Platform Publish Options',
  '解析作品链接': 'Parse Work Link',
  '作品列表': 'Work List',
  '作品详情': 'Work Details',
  '作品数据统计': 'Work Analytics',
  '验证作品归属': 'Verify Work Ownership',
  '分组列表': 'Group List',
  '创建分组': 'Create Group',
  '批量删除分组': 'Batch Delete Groups',
  '更新分组': 'Update Group',
  '调整账号排序': 'Update Account Order',
  '发起平台授权': 'Start Platform Authorization',
  '获取授权状态': 'Get Authorization Status',
  '生成上传签名': 'Generate Upload Signature',
  '确认资源上传': 'Confirm Asset Upload',
  '成功': 'Success',
  '未认证或 API Key 无效': 'Unauthenticated or invalid API Key',
  '第三方协议原生成功响应': 'Native third-party success response',
  '基础对话': 'Basic chat',
  '请用一句话介绍 AiToEarn。': 'Introduce AiToEarn in one sentence.',
  '请只回复 OK。': 'Reply with OK only.',
  '指定平台当前支持的发布选项列表。返回空数组表示没有额外发布选项。': 'The publishing options currently supported by the specified platform. An empty array means there are no additional publishing options.',
  '渠道账号 ID。取值来自[「账号列表」](/api-reference/get-api-v2-channels-accounts)接口返回的 `data.list[n].id`。': 'Channel account ID. Use `data.list[n].id` returned by the [Account List](/en/api-reference/get-api-v2-channels-accounts) endpoint.',
  '接口说明：查询指定平台在发布时是否需要平台专属的额外参数，以及这些参数的字段名、取值结构和账号要求。\n\n返回的每个 `data[n]` 表示一个额外参数。常见场景包括 B 站分区 `tid`、YouTube 分类 `categoryId`、Threads 地点 `location_id`、Pinterest Board `boardId`。如果返回空数组，说明该平台当前没有需要通过发布选项接口处理的额外参数。\n\n使用方式：取返回项中的 `field`，放到[「发布选项可选值」](/api-reference/get-api-v2-channels-accounts-account-id-publish-options-field-values)接口路径参数 `field` 中查询可选值；如果后续返回项包含 `filterSchema`，按该 schema 将过滤条件作为查询参数传给「发布选项可选值」接口；如果包含 `createSchema`，可按该 schema 组织请求体后调用[「创建发布选项值」](/api-reference/post-api-v2-channels-accounts-account-id-publish-options-field-values)接口。': 'Endpoint description: Queries whether a specified platform requires platform-specific publishing parameters, including their field names, value structures, and account requirements.\n\nEach `data[n]` item represents an additional parameter. Common scenarios include the Bilibili partition `tid`, YouTube category `categoryId`, Threads location `location_id`, and Pinterest Board `boardId`. An empty array means the platform currently has no additional parameters that need to be handled through the publishing options endpoint.\n\nUsage: Pass the returned `field` to the [Publish Option Values](/en/api-reference/get-api-v2-channels-accounts-account-id-publish-options-field-values) endpoint. If a future response includes `filterSchema`, pass matching filters as query parameters. If it includes `createSchema`, construct the request body from that schema and call [Create Publish Option Value](/en/api-reference/post-api-v2-channels-accounts-account-id-publish-options-field-values).',
  'Anthropic 渠道模型 ID。先调用[「对话模型列表」](/api-reference/get-api-ai-models-chat)接口（`GET /api/ai/models/chat`），选择返回结果中 `channel` 为 `anthropic` 的 `data[n].name`。': 'Anthropic channel model ID. First call the [Chat Model List](/en/api-reference/get-api-ai-models-chat) endpoint (`GET /api/ai/models/chat`), then select `data[n].name` where `channel` is `anthropic`.',
  '最大输出 Token 数。取值范围为 1 至 9007199254740991，默认值为 32000；示例使用 64 以控制测试消耗。': 'Maximum output tokens. The allowed range is 1 to 9007199254740991 and the default is 32000; the example uses 64 to limit test usage.',
  '请求成功': 'Request succeeded',
  '请求已被服务处理。业务是否成功以响应体 code === 0 为准。': 'The request has been processed by the service. Business success is determined by whether the response body has code === 0.',
  '业务状态码。0 表示成功，非 0 表示业务错误。': 'Business status code. 0 means success; non-zero means a business error.',
  '响应消息。': 'Response message.',
  '请求 ID。': 'Request ID.',
  '错误响应时间戳，Unix 毫秒。': 'Error response timestamp in Unix milliseconds.',
  '第三方协议原生响应，不使用 AiToEarn 通用响应包裹。': 'Native third-party protocol response, not wrapped in the AiToEarn common response envelope.',
  '第三方协议原生响应或 SSE 数据。不使用 AiToEarn 通用响应包裹。': 'Native third-party protocol response or SSE data, not wrapped in the AiToEarn common response envelope.',
  'SSE 流式响应。': 'SSE streaming response.',
  'Anthropic Messages 协议的 SSE 事件流。': 'SSE event stream using the Anthropic Messages protocol.',
  '传入从 AiToEarn 获取 API Key。点击前往[「API Key 获取教程」](/zh/use/api-key)。示例：Bearer xxx。': 'Pass the API Key obtained from AiToEarn. Go to the ["API Key Tutorial"](/en/use/api-key). Example: Bearer xxx.',
  '传入从 AiToEarn 获取的 API Key。为兼容 Gemini SDK，本接口使用 `x-goog-api-key` 请求头，无需 Google Gemini 官方 API Key。': 'Pass an API Key obtained from AiToEarn. For Gemini SDK compatibility, this endpoint uses the `x-goog-api-key` request header; a Google Gemini API Key is not required.',
}

function localizeEnglishLinks(value) {
  return value
    .replaceAll('文生图', 'text-to-image')
    .replaceAll('图生图', 'image-to-image')
    .replaceAll('推特', 'Twitter')
    .replaceAll('抖音', 'Douyin')
    .replaceAll('小红书', 'REDnote')
    .replaceAll('快手', 'Kuaishou')
    .replaceAll('微信视频号', 'WeChat Channels')
    .replaceAll('微信公众号', 'WeChat Official Account')
    .replaceAll('哔哩哔哩', 'Bilibili')
    .replaceAll('B 站', 'Bilibili')
    .replaceAll('/zh/use/', '/en/use/')
    .replace(/(?<!\/en)\/api-reference\//g, '/en/api-reference/')
    .replaceAll('「', '')
    .replaceAll('」', '')
}

function translateOpenApiText(value, translations) {
  if (!/\p{Script=Han}/u.test(value)) {
    return localizeEnglishLinks(value)
  }

  const translated = englishTextOverrides[value] || translations[value]
  return localizeEnglishLinks(translated || value)
}

function translateOpenApiValue(value, translations) {
  if (typeof value === 'string') {
    return translateOpenApiText(value, translations)
  }
  if (Array.isArray(value)) {
    return value.map(item => translateOpenApiValue(item, translations))
  }
  if (!value || typeof value !== 'object') {
    return value
  }

  const result = {}
  for (const [key, child] of Object.entries(value)) {
    result[key] = translateOpenApiValue(child, translations)
  }
  return result
}

function collectCjkStrings(value, pathSegments = [], result = []) {
  if (typeof value === 'string') {
    if (/\p{Script=Han}/u.test(value)) {
      result.push({ path: pathSegments.join('.'), value })
    }
    return result
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectCjkStrings(item, [...pathSegments, `[${index}]`], result))
    return result
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      collectCjkStrings(child, [...pathSegments, key], result)
    }
  }
  return result
}

function buildEnglishOpenApiSpec(zhSpec, endpoints, translations) {
  const enSpec = translateOpenApiValue(structuredClone(zhSpec), translations)
  enSpec.info = {
    ...enSpec.info,
    title: 'AiToEarn Open Platform API',
    description: 'AiToEarn Open Platform API. You can switch between the China and international sites for testing. Business success is determined by whether the response body has code === 0.',
  }
  enSpec.servers = [
    { url: 'https://aitoearn.cn', description: 'China site' },
    { url: 'https://aitoearn.ai', description: 'International site' },
  ]

  for (const endpoint of endpoints) {
    const operation = enSpec.paths?.[endpoint.path]?.[endpoint.method.toLowerCase()]
    if (!operation?.['x-mint']) {
      continue
    }
    operation['x-mint'].href = endpointHref(endpoint, enApiReferenceBasePath)
  }

  const cjkStrings = collectCjkStrings(enSpec)
  if (cjkStrings.length > 0) {
    const samples = cjkStrings.slice(0, 12).map(item => `${item.path}: ${item.value}`).join('\n')
    throw new Error(`English OpenAPI spec still contains untranslated Chinese strings:\n${samples}`)
  }

  return enSpec
}

function buildEnglishNavigationEndpoints(endpoints, translations) {
  return endpoints.map(endpoint => ({
    ...endpoint,
    tag: translateOpenApiText(endpoint.tag, translations),
  }))
}

function syncDocsJson(endpoints, targetSpec, translations) {
  const docsJson = readJson(docsJsonPath)
  const zhLanguage = docsJson.navigation.languages.find(item => item.language === 'zh')
  const enLanguage = docsJson.navigation.languages.find(item => item.language === 'en')
  const zhApiTab = zhLanguage.tabs.find(item => item.tab === 'API 文档')
  const enApiTab = enLanguage.tabs.find(item => item.tab === 'API Docs')

  zhApiTab.groups = [
    {
      group: '概览',
      pages: ['zh/api/index'],
    },
    ...buildNavigationGroups(endpoints, zhTargetSpecRef),
  ]
  enApiTab.groups = [
    {
      group: 'Overview',
      pages: ['en/api/index'],
    },
    ...buildNavigationGroups(buildEnglishNavigationEndpoints(endpoints, translations), enTargetSpecRef),
  ]
  docsJson.redirects = mergeRedirects(
    docsJson.redirects,
    [...buildOpenApiRedirects(endpoints, targetSpec), ...legacyOpenApiRedirects],
  )

  writeJson(docsJsonPath, docsJson)
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function mergePatch(target, patch) {
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete target[key]
    }
    else if (isPlainObject(value) && isPlainObject(target[key])) {
      mergePatch(target[key], value)
    }
    else {
      target[key] = value
    }
  }
}

function applyParameterOverrides(endpoint, operation, overridesMap, parameterLocation) {
  for (const [parameterName, patch] of Object.entries(overridesMap)) {
    const index = (operation.parameters || []).findIndex(item => item.name === parameterName && item.in === parameterLocation)
    if (index === -1) {
      if (patch === null) {
        continue
      }
      throw new Error(`spec-overrides.json: ${endpoint.method} ${endpoint.path} ${parameterLocation}Parameters has unknown parameter: ${parameterName}`)
    }
    if (patch === null) {
      operation.parameters.splice(index, 1)
      continue
    }
    mergePatch(operation.parameters[index], patch)
  }
}

function applySpecOverride(targetSpec, endpoint, operation, override) {
  if (!override) {
    return
  }
  if (override.summary) {
    operation.summary = override.summary
  }
  if (override.tag) {
    operation.tags = [override.tag]
  }
  if (override.description) {
    operation.description = override.description
  }
  if (override.queryParameters) {
    applyParameterOverrides(endpoint, operation, override.queryParameters, 'query')
  }
  if (override.pathParameters) {
    applyParameterOverrides(endpoint, operation, override.pathParameters, 'path')
  }
  if (override.requestBody !== undefined) {
    if (override.requestBody === null) {
      delete operation.requestBody
    }
    else {
      if (!operation.requestBody) {
        throw new Error(`spec-overrides.json: ${endpoint.method} ${endpoint.path} has no requestBody`)
      }
      mergePatch(operation.requestBody, override.requestBody)
    }
  }
  if (override.bodyProperties) {
    let schema = operation.requestBody?.content?.['application/json']?.schema
    if (schema?.$ref) {
      schema = targetSpec.components?.schemas?.[schema.$ref.split('/').pop()]
    }
    for (const [propertyName, patch] of Object.entries(override.bodyProperties)) {
      const property = schema?.properties?.[propertyName]
      if (!property) {
        if (patch === null) {
          continue
        }
        throw new Error(`spec-overrides.json: ${endpoint.method} ${endpoint.path} bodyProperties has unknown property: ${propertyName}`)
      }
      if (patch === null) {
        delete schema.properties[propertyName]
        if (Array.isArray(schema.required)) {
          schema.required = schema.required.filter(name => name !== propertyName)
        }
        continue
      }
      mergePatch(property, patch)
    }
  }
}

function hasResponseOverride(override) {
  return override?.responseDescription !== undefined
    || override?.responseContent !== undefined
    || override?.responseDataSchema !== undefined
    || override?.responseExamples !== undefined
    || override?.responseRequired !== undefined
}

function removeRequiredKeywords(schema) {
  if (!schema || typeof schema !== 'object') {
    return
  }
  delete schema.required
  for (const value of Object.values(schema)) {
    if (Array.isArray(value)) {
      value.forEach(removeRequiredKeywords)
    }
    else {
      removeRequiredKeywords(value)
    }
  }
}

function applyResponseOverrides(endpoint, operation, override) {
  if (!hasResponseOverride(override)) {
    return
  }

  const response = operation.responses?.[200] || operation.responses?.['200']
  if (!response) {
    throw new Error(`spec-overrides.json: ${endpoint.method} ${endpoint.path} has no 200 response`)
  }
  if (override.responseDescription !== undefined) {
    response.description = override.responseDescription
  }
  if (override.responseContent !== undefined) {
    if (override.responseContent === null) {
      delete response.content
      return
    }
    response.content = structuredClone(override.responseContent)
  }
  const jsonContent = response.content?.['application/json']
  if ((override.responseDataSchema !== undefined || override.responseExamples !== undefined) && !jsonContent) {
    throw new Error(`spec-overrides.json: ${endpoint.method} ${endpoint.path} has no application/json response`)
  }
  if (override.responseDataSchema !== undefined) {
    const responseSchema = jsonContent.schema
    if (!responseSchema?.properties?.data) {
      throw new Error(`spec-overrides.json: ${endpoint.method} ${endpoint.path} response has no data schema`)
    }
    responseSchema.properties.data = structuredClone(override.responseDataSchema)
  }
  if (override.responseRequired === false) {
    removeRequiredKeywords(jsonContent.schema)
  }
  if (override.responseExamples !== undefined) {
    if (override.responseExamples === null) {
      delete jsonContent.examples
    }
    else {
      jsonContent.examples = structuredClone(override.responseExamples)
    }
  }
}

function applyChannelWorkLinkInfoSchema(spec) {
  const schema = spec.components?.schemas?.ChannelWorkDataVo
  if (!schema) {
    return
  }

  schema.properties = {
    platform: {
      type: 'string',
      enum: [
        'douyin',
        'xhs',
        'wxSph',
        'KWAI',
        'youtube',
        'wxGzh',
        'bilibili',
        'twitter',
        'tiktok',
        'facebook',
        'instagram',
        'threads',
        'pinterest',
        'linkedin',
        'google_business',
      ],
      description: '平台',
    },
    work: {
      description: '作品资料',
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: '平台作品 ID',
        },
        url: {
          description: '作品链接',
          type: 'string',
        },
        mediaType: {
          description: '作品媒体类型',
          type: 'string',
        },
      },
      additionalProperties: false,
    },
    snapshots: {
      default: [],
      description: '本次保存的作品数据快照',
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: true,
      },
    },
    extra: {
      type: 'object',
      properties: {
        dataId: { type: 'string' },
        uniqueId: { type: 'string' },
        type: { type: 'string' },
        videoType: { type: 'string' },
        resolvedUrl: { type: 'string' },
      },
      additionalProperties: false,
    },
  }

  schema.required = ['platform', 'work', 'snapshots', 'extra']
  schema.additionalProperties = false
}

function generate() {
  const sourceSpec = readJson(sourceSpecPath)
  addVolcengineVideoCompatibilityEndpoints(sourceSpec)
  const endpoints = listEndpoints(sourceSpec)
  if (endpoints.length !== 63) {
    throw new Error(`Expected 63 endpoints, got ${endpoints.length}`)
  }

  const specOverrides = readJson(specOverridesPath)
  const endpointKeys = new Set(endpoints.map(item => `${item.method} ${item.path}`))
  const unknownOverrideKeys = Object.keys(specOverrides).filter(key => !endpointKeys.has(key))
  if (unknownOverrideKeys.length > 0) {
    throw new Error(`spec-overrides.json has keys not present in the source spec: ${unknownOverrideKeys.join(', ')}`)
  }

  const controllerFiles = controllerRoots.flatMap(walkTsFiles)
  const codeMap = parseResponseCodeMap()
  const messageMap = parseMessageMap()
  const targetSpec = structuredClone(sourceSpec)
  const matrix = []

  // 覆盖条目为 null 表示整个接口不进入文档：从目标 spec、清单、矩阵和导航中一并剔除。
  const documentedEndpoints = endpoints.filter((endpoint) => {
    if (specOverrides[`${endpoint.method} ${endpoint.path}`] !== null) {
      return true
    }
    const pathItem = targetSpec.paths[endpoint.path]
    delete pathItem[endpoint.method.toLowerCase()]
    if (!Object.keys(pathItem).some(method => httpMethods.has(method))) {
      delete targetSpec.paths[endpoint.path]
    }
    return false
  }).map((endpoint, index) => ({ ...endpoint, index: index + 1 }))

  targetSpec.info = {
    ...targetSpec.info,
    title: 'AiToEarn 开放平台 API',
    description: 'AiToEarn 开放平台 API，支持在中国站与国际站之间切换调试。业务是否成功以响应体 code === 0 为准。',
  }
  targetSpec.servers = [
    { url: 'https://aitoearn.cn', description: '中国站' },
    { url: 'https://aitoearn.ai', description: '国际站' },
  ]
  targetSpec.components = targetSpec.components || {}
  targetSpec.components.securitySchemes = {
    ...(targetSpec.components.securitySchemes || {}),
    'apikey-header-X-Api-Key': {
      type: 'apiKey',
      in: 'header',
      name: 'X-Api-Key',
      description: xApiKeyDescription,
    },
    'apikey-header-Authorization': {
      type: 'apiKey',
      in: 'header',
      name: 'Authorization',
      description: '传入从 AiToEarn 获取 API Key。点击前往[「API Key 获取教程」](/zh/use/api-key)。示例：Bearer xxx。',
    },
    'apikey-header-x-goog-api-key': {
      type: 'apiKey',
      in: 'header',
      name: 'x-goog-api-key',
      description: geminiApiKeyDescription,
    },
  }
  applyChannelWorkLinkInfoSchema(targetSpec)

  const endpointHrefs = new Set()
  for (const endpoint of documentedEndpoints) {
    const href = endpointHref(endpoint)
    if (endpointHrefs.has(href)) {
      throw new Error(`Duplicate generated OpenAPI href: ${href}`)
    }
    endpointHrefs.add(href)
  }

  for (const endpoint of documentedEndpoints) {
    const operation = targetSpec.paths[endpoint.path][endpoint.method.toLowerCase()]
    applySpecOverride(targetSpec, endpoint, operation, specOverrides[`${endpoint.method} ${endpoint.path}`])
    const existingMint = operation['x-mint'] || {}
    operation['x-mint'] = {
      ...existingMint,
      href: endpointHref(endpoint),
      metadata: {
        ...(existingMint.metadata || {}),
        title: operation.summary,
        sidebarTitle: operation.summary,
      },
    }
    const { className, methodName } = parseOperationId(endpoint.operationId)
    const controller = findControllerFile(controllerFiles, className, methodName)
    const controllerMethod = controller?.method
    const controllerImports = controller ? parseImports(controller.source, controller.filePath) : new Map()
    const serviceTypes = controller ? parseConstructorServiceTypes(controller.source) : new Map()
    const serviceCalls = collectServiceCalls(controllerMethod)
    const serviceRecords = []
    const responseCodes = new Set()
    const customExceptions = new Set()
    const serviceMethodsVisited = new Set()

    for (const call of serviceCalls) {
      const serviceType = serviceTypes.get(call.property)
      const serviceFilePath = serviceType ? controllerImports.get(serviceType) : null
      const collected = collectResponseCodesFromService(serviceFilePath, call.method)
      for (const codeName of collected.responseCodes) {
        responseCodes.add(codeName)
      }
      for (const exceptionName of collected.customExceptions) {
        customExceptions.add(exceptionName)
      }
      for (const visited of collected.serviceMethodsVisited) {
        serviceMethodsVisited.add(visited)
      }
      serviceRecords.push({
        property: call.property,
        type: serviceType || null,
        file: serviceFilePath ? normalizePathForDocs(serviceFilePath) : null,
        method: call.method,
      })
    }

    const decorators = controllerMethod?.decorators || ''
    const isPublic = decorators.includes('@Public')
    const skipResponseInterceptor = decorators.includes('@SkipResponseInterceptor')
    const apiKeyHeader = /@ApiKeyHeader\(['"]([^'"]+)['"]\)/.exec(decorators)?.[1] || 'X-Api-Key'
    const requiresAuth = !isPublic

    const mapping = {
      ...endpoint,
      controllerClass: className,
      controllerMethod: methodName,
      controllerFile: controller ? normalizePathForDocs(controller.filePath) : null,
      controllerFound: Boolean(controller?.method),
      requiresAuth,
      isPublic,
      skipResponseInterceptor,
      apiKeyHeader: requiresAuth ? apiKeyHeader : null,
      serviceCalls: serviceRecords,
      serviceMethodsVisited: [...serviceMethodsVisited],
      responseCodes: [...responseCodes].sort(),
      responseCodeValues: [...responseCodes].sort().map(codeName => ({
        name: codeName,
        code: codeMap.get(codeName) ?? null,
        message: messageMap.get(codeName) || null,
      })),
      customExceptions: [...customExceptions].sort(),
      aiServiceTracked: controller?.filePath.includes('/apps/aitoearn-ai/') || serviceRecords.some(item => item.file?.includes('/apps/aitoearn-ai/')),
      status: controller?.method ? 'completed' : 'controllerMissing',
      notes: [],
    }

    if (className === 'AssetsHttpController') {
      mapping.notes.push('Controller is provided by libs/assets and mounted by aitoearn-server.')
    }
    if (skipResponseInterceptor) {
      mapping.notes.push('Raw third-party protocol response; not wrapped by ResponseInterceptor.')
    }
    if (serviceRecords.length === 0) {
      mapping.notes.push('No direct this.<service>.<method>() call found in controller method.')
    }

    operation.security = getSecurity(mapping)
    syncXApiKeyHeaderParameter(operation, mapping)
    operation['x-aitoearn-backend'] = {
      controller: mapping.controllerFile,
      controllerMethod: mapping.controllerMethod,
      services: mapping.serviceCalls,
      responseCodes: mapping.responseCodeValues,
      rawResponse: skipResponseInterceptor,
    }

    if (skipResponseInterceptor) {
      const jsonContent = rawJsonResponseContent(endpoint, operation)
      operation.responses = {
        200: {
          description: isVolcengineVideoCompatibilityEndpoint(endpoint)
            ? '火山格式原生响应，不使用 AiToEarn 通用响应包裹。'
            : '第三方协议原生响应或 SSE 数据。不使用 AiToEarn 通用响应包裹。',
          content: {
            'application/json': jsonContent,
            ...(!isVolcengineVideoCompatibilityEndpoint(endpoint)
              ? {
                  'text/event-stream': {
                    schema: {
                      type: 'string',
                      description: 'SSE 流式响应。',
                    },
                  },
                }
              : {}),
          },
        },
      }
    }
    else {
      operation.responses = {
        200: {
          description: '请求已被服务处理。业务是否成功以响应体 code === 0 为准。',
          content: {
            'application/json': {
              schema: commonResponseSchema(resolveDataSchema(operation)),
              examples: buildExamples(endpoint, operation, mapping, sourceSpec, codeMap, messageMap),
            },
          },
        },
      }
    }

    applyResponseOverrides(endpoint, operation, specOverrides[`${endpoint.method} ${endpoint.path}`])

    matrix.push(mapping)
  }

  writeJson(inventoryPath, documentedEndpoints)
  writeJson(matrixPath, matrix)
  if (Array.isArray(targetSpec.tags)) {
    const usedTags = new Set()
    for (const pathItem of Object.values(targetSpec.paths || {})) {
      for (const [method, operation] of Object.entries(pathItem || {})) {
        if (!httpMethods.has(method)) {
          continue
        }
        for (const tag of operation.tags || []) {
          usedTags.add(tag)
          const parentTag = tag.split('/')[0]
          usedTags.add(parentTag)
        }
      }
    }
    targetSpec.tags = targetSpec.tags.filter(item => usedTags.has(item.name))
    for (const tag of usedTags) {
      if (!targetSpec.tags.some(item => item.name === tag)) {
        targetSpec.tags.push({ name: tag })
      }
    }
  }
  sanitizeOpenApi30(targetSpec)
  const englishTranslations = readJson(specTranslationsEnPath)
  const englishTargetSpec = buildEnglishOpenApiSpec(targetSpec, documentedEndpoints, englishTranslations)
  writeJson(zhTargetSpecPath, targetSpec)
  writeJson(enTargetSpecPath, englishTargetSpec)
  const navigationEndpoints = documentedEndpoints.map((endpoint) => {
    const override = specOverrides[`${endpoint.method} ${endpoint.path}`]
    return override?.tag ? { ...endpoint, tag: override.tag } : endpoint
  })
  syncDocsJson(navigationEndpoints, targetSpec, englishTranslations)

  const completed = matrix.filter(item => item.status === 'completed').length
  console.log(JSON.stringify({
    endpoints: endpoints.length,
    matrixRows: matrix.length,
    completed,
    zhTargetSpecPath: normalizePathForDocs(zhTargetSpecPath),
    enTargetSpecPath: normalizePathForDocs(enTargetSpecPath),
    inventoryPath: normalizePathForDocs(inventoryPath),
    matrixPath: normalizePathForDocs(matrixPath),
  }, null, 2))
}

function applyTargetOverridesOnly() {
  const targetSpec = readJson(zhTargetSpecPath)
  const englishTargetSpec = readJson(enTargetSpecPath)
  const specOverrides = readJson(specOverridesPath)
  const documentedEndpoints = readJson(inventoryPath)
  const appliedEndpoints = []
  const targetIndex = process.argv.indexOf('--target')
  const targetKeys = new Set(
    targetIndex === -1
      ? []
      : (process.argv[targetIndex + 1] || '').split(',').map(value => value.trim()).filter(Boolean),
  )

  targetSpec.components.securitySchemes['apikey-header-x-goog-api-key'].description = geminiApiKeyDescription
  applyChannelWorkLinkInfoSchema(targetSpec)

  for (const endpoint of documentedEndpoints) {
    const endpointKey = `${endpoint.method} ${endpoint.path}`
    if (targetKeys.size > 0 && !targetKeys.has(endpointKey)) {
      continue
    }
    const override = specOverrides[`${endpoint.method} ${endpoint.path}`]
    if (!override) {
      continue
    }
    const operation = targetSpec.paths?.[endpoint.path]?.[endpoint.method.toLowerCase()]
    if (!operation) {
      throw new Error(`Generated OpenAPI is missing ${endpoint.method} ${endpoint.path}`)
    }
    applySpecOverride(targetSpec, endpoint, operation, override)
    applyResponseOverrides(endpoint, operation, override)
    if (operation['x-mint']?.metadata) {
      operation['x-mint'].metadata.title = operation.summary
      operation['x-mint'].metadata.sidebarTitle = operation.summary
    }
    appliedEndpoints.push(endpoint)
  }

  if (appliedEndpoints.length === 0) {
    throw new Error('No matching overrides found in spec-overrides.json')
  }

  sanitizeOpenApi30(targetSpec)
  const englishTranslations = readJson(specTranslationsEnPath)
  englishTargetSpec.components.securitySchemes['apikey-header-x-goog-api-key'].description = translateOpenApiValue(
    geminiApiKeyDescription,
    englishTranslations,
  )
  for (const endpoint of appliedEndpoints) {
    const method = endpoint.method.toLowerCase()
    const translatedOperation = translateOpenApiValue(
      structuredClone(targetSpec.paths[endpoint.path][method]),
      englishTranslations,
    )
    if (translatedOperation['x-mint']) {
      translatedOperation['x-mint'].href = endpointHref(endpoint, enApiReferenceBasePath)
    }
    const cjkStrings = collectCjkStrings(translatedOperation)
    if (cjkStrings.length > 0) {
      const samples = cjkStrings.slice(0, 12).map(item => `${item.path}: ${item.value}`).join('\n')
      throw new Error(`English OpenAPI operation ${endpoint.method} ${endpoint.path} still contains untranslated Chinese strings:\n${samples}`)
    }
    englishTargetSpec.paths[endpoint.path][method] = translatedOperation
  }
  writeJson(zhTargetSpecPath, targetSpec)
  writeJson(enTargetSpecPath, englishTargetSpec)

  console.log(JSON.stringify({
    mode: 'target-overrides-only',
    applied: appliedEndpoints.length,
    zhTargetSpecPath: normalizePathForDocs(zhTargetSpecPath),
    enTargetSpecPath: normalizePathForDocs(enTargetSpecPath),
  }, null, 2))
}

if (process.argv.includes('--target-overrides-only')) {
  applyTargetOverridesOnly()
}
else {
  generate()
}
