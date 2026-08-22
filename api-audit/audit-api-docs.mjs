import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options']
const JSON_CONTENT_TYPES = ['application/json', 'application/*+json']
const FIXTURE_REQUIRED_PARAMETERS = new Set(['accountId', 'groupId', 'recordId', 'flowId', 'taskId', 'logId', 'sessionId', 'platformWorkId', 'platform', 'field', 'id', 'url'])

const SEMANTIC_PROFILES = {
  'GET /api/ai/models/video/generation': {
    expectedResult: '返回可用于视频生成的模型目录，以及模式、分辨率、时长和价格约束',
    kind: 'array', nonEmpty: true, itemRequired: ['name', 'modes', 'resolutions', 'durations', 'pricing'],
  },
  'GET /api/ai/video/generations': {
    expectedResult: '返回当前用户的视频生成任务分页列表',
    kind: 'object', required: ['page', 'pageSize', 'total', 'list'],
  },
  'POST /api/ai/video/generations': {
    expectedResult: '创建视频生成任务并返回任务 ID 与初始状态',
    kind: 'object', required: ['id', 'status'],
  },
  'GET /api/ai/video/generations/{taskId}': {
    expectedResult: '返回指定视频生成任务的状态、输入、结果地址或错误信息',
    kind: 'object', required: ['id', 'status'],
  },
  'GET /api/ai/models/image/generation': {
    expectedResult: '返回文生图模型目录及尺寸、质量、风格和价格约束',
    kind: 'array', nonEmpty: true, itemRequired: ['name', 'sizes', 'pricing'],
  },
  'GET /api/ai/models/image/edit': {
    expectedResult: '返回图像编辑模型目录及尺寸、输入图片数量和价格约束',
    kind: 'array', nonEmpty: true, itemRequired: ['name', 'sizes', 'maxInputImages', 'pricing'],
  },
  'POST /api/ai/image/generate': {
    expectedResult: '同步生成图像并返回图像结果列表和计费信息',
    kind: 'object', required: ['created', 'list'],
  },
  'POST /api/ai/image/edit': {
    expectedResult: '基于输入图片完成编辑并返回图像结果列表和计费信息',
    kind: 'object', required: ['created', 'list'],
  },
  'POST /api/ai/image/generate/async': {
    expectedResult: '创建异步图像生成任务并返回日志 ID 与初始状态',
    kind: 'object', required: ['logId', 'status'],
  },
  'POST /api/ai/image/edit/async': {
    expectedResult: '创建异步图像编辑任务并返回日志 ID 与初始状态',
    kind: 'object', required: ['logId', 'status'],
  },
  'GET /api/ai/image/task/{logId}': {
    expectedResult: '返回指定图像任务的状态、生成结果、计费或错误信息',
    kind: 'object', required: ['logId', 'status'],
  },
  'GET /api/ai/models/chat': {
    expectedResult: '返回可用于对话接口的模型目录、输入输出能力和价格信息',
    kind: 'array', nonEmpty: true, itemRequired: ['name', 'inputModalities', 'outputModalities', 'pricing'],
  },
  'POST /api/ai/chat/completions': {
    expectedResult: '按 OpenAI Chat Completions 格式返回对话结果',
    payload: 'root', kind: 'object', required: ['choices'],
  },
  'POST /api/ai/v1/messages': {
    expectedResult: '按 Anthropic Messages 格式返回对话结果',
    payload: 'root', kind: 'object', required: ['content'],
  },
  'POST /api/ai/v1beta/models/{model}:generateContent': {
    expectedResult: '按 Gemini generateContent 格式返回候选回答',
    payload: 'root', kind: 'object', required: ['candidates'],
  },
  'POST /api/ai/v1beta/models/{model}:streamGenerateContent': {
    expectedResult: '按 Gemini 流式格式持续返回候选回答片段',
    payload: 'root', kind: 'stream',
  },
  'POST /api/ai/images/generations': {
    expectedResult: '按 OpenAI Images 格式返回文生图结果',
    payload: 'root', kind: 'object', required: ['data'],
  },
  'POST /api/ai/images/edits': {
    expectedResult: '按 OpenAI Images 格式返回图像编辑结果',
    payload: 'root', kind: 'object', required: ['data'],
  },
  'GET /api/v2/channels/accounts': {
    expectedResult: '返回当前用户已接入的社媒账号分页列表',
    kind: 'object', required: ['total', 'list'],
  },
  'DELETE /api/v2/channels/accounts': {
    expectedResult: '批量删除指定社媒账号并返回成功确认',
    kind: 'any',
  },
  'GET /api/v2/channels/accounts/{accountId}': {
    expectedResult: '返回指定社媒账号的身份、状态和统计信息',
    kind: 'object', required: ['id', 'type', 'status'],
  },
  'DELETE /api/v2/channels/accounts/{accountId}': {
    expectedResult: '删除指定社媒账号并返回成功确认',
    kind: 'any',
  },
  'GET /api/v2/channels/accounts/{accountId}/auth-status': {
    expectedResult: '返回指定社媒账号当前授权状态',
    kind: 'object', required: ['status'],
  },
  'GET /api/v2/channels/accounts/{accountId}/publish-options/{field}/values': {
    expectedResult: '返回指定账号某个发布选项的可选值',
    kind: 'object', required: ['field', 'valueType', 'items'],
  },
  'POST /api/v2/channels/accounts/{accountId}/publish-options/{field}/values': {
    expectedResult: '创建账号级发布选项值并返回创建结果',
    kind: 'object', required: ['field', 'valueType', 'item'],
  },
  'POST /api/v2/channels/publish/flows': {
    expectedResult: '创建跨账号发布流程并返回流程 ID 与发布任务',
    kind: 'object', required: ['flowId', 'tasks'],
  },
  'POST /api/v2/channels/douyin/open/offline-qr': {
    expectedResult: '创建抖音线下打卡发布入口并返回 App 拉起信息',
    kind: 'object', required: ['recordId', 'status', 'userAction'],
  },
  'POST /api/v2/channels/rednote/open/offline-qr/share-config': {
    expectedResult: '返回小红书 xhs.share 所需的签名配置',
    kind: 'object', required: ['verifyConfig'],
  },
  'GET /api/v2/channels/publish/flows/{flowId}': {
    expectedResult: '返回指定发布流程及其任务状态',
    kind: 'object', required: ['flowId', 'tasks'],
  },
  'POST /api/v2/channels/publish/tasks/{taskId}/publish-now': {
    expectedResult: '触发指定发布任务立即执行并返回任务 ID',
    kind: 'object', required: ['taskId'],
  },
  'POST /api/v2/channels/publish/tasks/{taskId}/retry': {
    expectedResult: '重试指定失败发布任务并返回任务 ID',
    kind: 'object', required: ['taskId'],
  },
  'DELETE /api/v2/channels/publish/tasks/{taskId}': {
    expectedResult: '取消指定发布任务并返回任务 ID',
    kind: 'object', required: ['taskId'],
  },
  'PATCH /api/v2/channels/publish/tasks/{taskId}/publish-at': {
    expectedResult: '修改指定发布任务的执行时间并返回任务 ID',
    kind: 'object', required: ['taskId'],
  },
  'GET /api/v2/channels/publish/records': {
    expectedResult: '返回全部发布记录列表',
    kind: 'array', itemRequired: ['id', 'status', 'accountId'],
  },
  'GET /api/v2/channels/publish/records/queued': {
    expectedResult: '只返回仍在等待或排队执行的发布记录',
    kind: 'array', itemRequired: ['id', 'status', 'accountId'],
  },
  'GET /api/v2/channels/publish/records/published': {
    expectedResult: '只返回已经发布完成的发布记录',
    kind: 'array', itemRequired: ['id', 'status', 'accountId'],
  },
  'GET /api/v2/channels/publish/records/{recordId}': {
    expectedResult: '返回指定发布记录的状态、媒体、作品链接和错误信息',
    kind: 'object', required: ['id', 'status', 'accountId'],
  },
  'DELETE /api/v2/channels/publish/records/{recordId}': {
    expectedResult: '删除指定发布记录并返回成功确认',
    kind: 'any',
  },
  'GET /api/v2/channels/publish/records/{recordId}/user-action': {
    expectedResult: '返回需要用户继续操作时可拉起平台 App 的链接',
    kind: 'object', required: ['recordId', 'platform'], requiredAny: [['schemeUrl', 'shortLink']],
  },
  'GET /api/v2/channels/platforms': {
    expectedResult: '返回所有已注册社媒平台的元数据、可用状态和能力声明',
    kind: 'array', nonEmpty: true, itemRequired: ['platform', 'displayName', 'capabilities', 'status'],
  },
  'GET /api/v2/channels/platforms/{platform}/publish-options': {
    expectedResult: '返回指定平台支持的发布选项定义',
    kind: 'array', itemRequired: ['field', 'label', 'valueType'],
  },
  'GET /api/v2/channels/works/link-info': {
    expectedResult: '解析社媒作品链接并返回平台、作品和快照信息',
    kind: 'object', required: ['platform'], requiredAny: [['work', 'message']],
  },
  'GET /api/v2/channels/works/{platform}': {
    expectedResult: '返回指定平台的作品列表和分页信息',
    kind: 'object', required: ['platform', 'items', 'pagination'],
  },
  'GET /api/v2/channels/works/{platform}/{platformWorkId}': {
    expectedResult: '返回指定平台作品的详情和最新快照',
    kind: 'object', required: ['platform'], requiredAny: [['work', 'message']],
  },
  'GET /api/v2/channels/works/{platform}/{platformWorkId}/analytics': {
    expectedResult: '返回指定平台作品的指标统计和快照',
    kind: 'object', required: ['platform', 'metrics'],
  },
  'POST /api/v2/channels/works/{platform}/{platformWorkId}/ownership/verify': {
    expectedResult: '验证指定平台作品是否属于当前用户并返回判断结果',
    kind: 'object', required: ['platform', 'owned'],
  },
  'GET /api/v2/channels/account-groups': {
    expectedResult: '返回账号分组列表',
    kind: 'array', itemRequired: ['id', 'name'],
  },
  'POST /api/v2/channels/account-groups': {
    expectedResult: '创建账号分组并返回分组对象',
    kind: 'object', required: ['id', 'name'],
  },
  'DELETE /api/v2/channels/account-groups': {
    expectedResult: '批量删除账号分组并返回成功确认',
    kind: 'any',
  },
  'PATCH /api/v2/channels/account-groups/{groupId}': {
    expectedResult: '更新指定账号分组并返回更新后的分组对象',
    kind: 'object', required: ['id', 'name'],
  },
  'PATCH /api/v2/channels/account-groups/{groupId}/accounts/rank': {
    expectedResult: '更新指定分组内账号排序并返回成功确认',
    kind: 'any',
  },
  'GET /api/v2/channels/accounts/auth/{platform}': {
    expectedResult: '创建平台授权会话并返回授权 URL、会话 ID 和过期时间',
    kind: 'object', required: ['url', 'sessionId'],
  },
  'GET /api/v2/channels/accounts/auth/{platform}/status/{sessionId}': {
    expectedResult: '轮询平台授权会话并返回会话状态与账号结果',
    kind: 'object', required: ['sessionId', 'status'],
  },
  'POST /api/assets/uploadSign': {
    expectedResult: '生成对象存储直传所需的资源 ID、上传地址和签名字段',
    kind: 'object', required: ['id', 'uploadUrl'],
  },
  'POST /api/assets/{id}/confirm': {
    expectedResult: '确认资源直传完成并返回最终资源对象',
    kind: 'object', required: ['id', 'status', 'url'],
  },
  'POST /api/ai/v3/contents/generations/tasks': {
    expectedResult: '按火山方舟兼容格式创建视频任务并直接返回任务 ID',
    payload: 'root', kind: 'object', required: ['id'],
  },
  'GET /api/ai/v3/contents/generations/tasks/{taskId}': {
    expectedResult: '按火山方舟兼容格式返回视频任务状态和结果内容',
    payload: 'root', kind: 'object', required: ['id', 'status'],
  },
}

function parseArgs(argv) {
  const args = {
    spec: 'openapi/zh/aitoearn.openapi.json',
    outputDir: 'api-audit',
    baseUrl: null,
    livePublic: false,
    smokeAll: false,
    authenticatedRead: false,
    concurrency: 8,
    timeoutMs: 15000,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--live-public') args.livePublic = true
    else if (value === '--smoke-all') args.smokeAll = true
    else if (value === '--authenticated-read') args.authenticatedRead = true
    else if (value === '--spec') args.spec = argv[++index]
    else if (value === '--output-dir') args.outputDir = argv[++index]
    else if (value === '--base-url') args.baseUrl = argv[++index]
    else if (value === '--concurrency') args.concurrency = Number(argv[++index])
    else if (value === '--timeout-ms') args.timeoutMs = Number(argv[++index])
    else throw new Error(`Unknown argument: ${value}`)
  }

  return args
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function resolveRef(value, spec) {
  if (!isObject(value) || typeof value.$ref !== 'string') return value
  const segments = value.$ref.replace(/^#\//, '').split('/').map(segment => segment.replaceAll('~1', '/').replaceAll('~0', '~'))
  let resolved = spec
  for (const segment of segments) resolved = resolved?.[segment]
  return resolved || value
}

function resolveSchema(schema, spec) {
  let current = resolveRef(schema, spec)
  if (!isObject(current)) return current
  if (Array.isArray(current.allOf)) {
    const merged = current.allOf.reduce((result, item) => {
      const resolved = resolveSchema(item, spec)
      if (!isObject(resolved)) return result
      return {
        ...result,
        ...resolved,
        properties: { ...(result.properties || {}), ...(resolved.properties || {}) },
        required: [...new Set([...(result.required || []), ...(resolved.required || [])])],
      }
    }, {})
    current = { ...current, ...merged }
    delete current.allOf
  }
  return current
}

function schemaExample(schema, spec, depth = 0) {
  if (depth > 10) return null
  const resolved = resolveSchema(schema, spec)
  if (!isObject(resolved)) return null
  if (resolved.example !== undefined) return structuredClone(resolved.example)
  if (resolved.default !== undefined) return structuredClone(resolved.default)
  if (Array.isArray(resolved.examples) && resolved.examples.length > 0) return structuredClone(resolved.examples[0])
  if (Array.isArray(resolved.enum) && resolved.enum.length > 0) return structuredClone(resolved.enum[0])
  if (Array.isArray(resolved.oneOf) && resolved.oneOf.length > 0) return schemaExample(resolved.oneOf[0], spec, depth + 1)
  if (Array.isArray(resolved.anyOf) && resolved.anyOf.length > 0) return schemaExample(resolved.anyOf[0], spec, depth + 1)

  const type = Array.isArray(resolved.type) ? resolved.type[0] : resolved.type
  if (type === 'object' || resolved.properties) {
    const result = {}
    for (const [name, property] of Object.entries(resolved.properties || {})) {
      const value = schemaExample(property, spec, depth + 1)
      if (value !== null || (resolved.required || []).includes(name)) result[name] = value
    }
    return result
  }
  if (type === 'array') {
    const item = schemaExample(resolved.items, spec, depth + 1)
    return item === null ? [] : [item]
  }
  if (type === 'boolean') return false
  if (type === 'integer' || type === 'number') return resolved.minimum ?? 0
  if (type === 'string') return 'string'
  return null
}

function firstContent(content) {
  if (!isObject(content)) return null
  for (const preferred of ['application/json', 'multipart/form-data', 'application/x-www-form-urlencoded']) {
    if (content[preferred]) return { mediaType: preferred, value: content[preferred] }
  }
  const entry = Object.entries(content)[0]
  return entry ? { mediaType: entry[0], value: entry[1] } : null
}

function firstExplicitExample(media) {
  if (!isObject(media)) return undefined
  if (media.example !== undefined) return structuredClone(media.example)
  if (isObject(media.examples)) {
    for (const example of Object.values(media.examples)) {
      if (isObject(example) && example.value !== undefined) return structuredClone(example.value)
    }
  }
  return undefined
}

function exampleScalars(value, result = [], depth = 0) {
  if (depth > 12 || result.length >= 200 || value === null || value === undefined) return result
  if (Array.isArray(value)) {
    value.slice(0, 20).forEach(item => exampleScalars(item, result, depth + 1))
  } else if (isObject(value)) {
    Object.values(value).slice(0, 50).forEach(item => exampleScalars(item, result, depth + 1))
  } else {
    result.push(value)
  }
  return result
}

function looksLikePlaceholderExample(value) {
  const scalars = exampleScalars(value)
  if (scalars.length === 0) return true
  const literalStringCount = scalars.filter(item => item === 'string').length
  const placeholders = scalars.filter(item => {
    if (typeof item === 'string') {
      return item === 'string' || /^test[-_]/.test(item) || /example\.(com|png)|\/example\//.test(item)
    }
    return item === 1
  })
  return literalStringCount >= 2 || placeholders.length / scalars.length >= 0.35
}

function isUsableParameterExample(value) {
  return value !== undefined && value !== null && value !== '' && value !== 'string' && !/^test[-_]/.test(String(value))
}

function operationSecurity(operation, spec) {
  const security = operation.security ?? spec.security ?? []
  if (!Array.isArray(security) || security.length === 0) return []
  return [...new Set(security.flatMap(item => isObject(item) ? Object.keys(item) : []))]
}

function listOperations(spec) {
  const operations = []
  let index = 0
  for (const [endpointPath, pathItem] of Object.entries(spec.paths || {})) {
    if (!isObject(pathItem)) continue
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method]
      if (!isObject(operation)) continue
      operations.push({
        index: ++index,
        method: method.toUpperCase(),
        path: endpointPath,
        pathItem,
        operation,
        security: operationSecurity(operation, spec),
      })
    }
  }
  return operations
}

function operationParameters(item, spec) {
  const parameters = [...(item.pathItem.parameters || []), ...(item.operation.parameters || [])]
  return parameters.map(parameter => resolveRef(parameter, spec)).filter(isObject)
}

function fallbackParameterValue(parameter) {
  const name = parameter.name || ''
  const schema = parameter.schema || {}
  if (parameter.example !== undefined) return parameter.example
  if (schema.example !== undefined) return schema.example
  if (schema.default !== undefined) return schema.default
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0]

  const values = {
    platform: 'tiktok',
    field: 'privacy_level',
    model: 'gemini-2.5-flash',
    accountId: 'test-account-id',
    groupId: 'test-group-id',
    recordId: 'test-record-id',
    taskId: 'test-task-id',
    logId: 'test-log-id',
    sessionId: 'test-session-id',
    platformWorkId: 'test-work-id',
    id: 'test-asset-id',
    url: 'https://www.tiktok.com/@example/video/1',
  }
  if (values[name] !== undefined) return values[name]
  if (schema.type === 'integer' || schema.type === 'number') return schema.minimum ?? 1
  if (schema.type === 'boolean') return false
  return `test-${name || 'value'}`
}

function fixtureParameterValue(item, parameter, fixtures) {
  const name = parameter.name || ''
  if (name === 'taskId') {
    if (item.path.startsWith('/api/ai/v3/')) return fixtures.volcTaskId
    if (item.path.startsWith('/api/ai/video/')) return fixtures.videoTaskId
    if (item.path.includes('/publish/tasks/')) return fixtures.publishTaskId
  }
  const fixtureNames = {
    accountId: 'accountId',
    groupId: 'groupId',
    recordId: 'publishRecordId',
    flowId: 'publishFlowId',
    logId: 'imageLogId',
    sessionId: 'authSessionId',
    platformWorkId: 'platformWorkId',
    platform: 'platform',
    field: 'publishOptionField',
    id: 'assetId',
    url: 'workUrl',
  }
  return fixtures[fixtureNames[name]]
}

function buildRequestBody(item, spec) {
  const requestBody = resolveRef(item.operation.requestBody, spec)
  if (!isObject(requestBody)) return null
  const content = firstContent(requestBody.content)
  if (!content) return null
  const explicitExample = firstExplicitExample(content.value)
  const value = explicitExample !== undefined ? explicitExample : schemaExample(content.value.schema, spec)
  return {
    mediaType: content.mediaType,
    value,
    explicit: explicitExample !== undefined,
    placeholder: explicitExample !== undefined && looksLikePlaceholderExample(explicitExample),
    schema: content.value.schema,
  }
}

function buildUrl(item, spec, baseUrl, fixtures = {}, strictFixtures = false) {
  let endpointPath = item.path
  const query = new URLSearchParams()
  const missingFixtures = []
  for (const parameter of operationParameters(item, spec)) {
    if (!parameter.name) continue
    const fixtureValue = fixtureParameterValue(item, parameter, fixtures)
    const schema = parameter.schema || {}
    const documentedValue = parameter.example ?? schema.example ?? schema.default ?? (Array.isArray(schema.enum) ? schema.enum[0] : undefined)
    const requireRealFixture = strictFixtures && FIXTURE_REQUIRED_PARAMETERS.has(parameter.name)
    let value = fixtureValue ?? (requireRealFixture ? undefined : documentedValue)
    if (value === undefined && strictFixtures && parameter.required) {
      missingFixtures.push(parameter.name)
      continue
    }
    if (value === undefined) value = fallbackParameterValue(parameter)
    if (parameter.in === 'path') endpointPath = endpointPath.replace(`{${parameter.name}}`, encodeURIComponent(String(value)))
    if (parameter.in === 'query' && parameter.required) query.set(parameter.name, String(value))
  }
  const suffix = query.size > 0 ? `?${query}` : ''
  return {
    url: `${baseUrl.replace(/\/$/, '')}${endpointPath}${suffix}`,
    missingFixtures,
  }
}

function classifyRisk(item) {
  const key = `${item.method} ${item.path}`
  if (item.method === 'GET' || item.method === 'HEAD') return item.security.length === 0 ? 'public-read' : 'authenticated-read'
  if (item.method === 'DELETE') return 'destructive'
  if (/publish-now|\/retry$|ownership\/verify/.test(item.path)) return 'external-action'
  if (/^POST \/api\/ai\//.test(key)) return 'billable-ai'
  if (item.method === 'PATCH') return 'write'
  return 'write'
}

function classifyPurpose(item) {
  const summary = item.operation.summary || ''
  if (/models\//.test(item.path) || /模型列表|生成模型|编辑模型/.test(summary)) return 'model-catalog'
  if (/platforms$/.test(item.path) || /平台列表/.test(summary)) return 'platform-catalog'
  if (/列表|记录|works\/{platform}$|accounts$/.test(summary + item.path)) return 'list'
  if (/状态|详情|统计|可选值|publish-options/.test(summary + item.path)) return 'detail-or-status'
  if (/生成|创建|发起|签名|确认/.test(summary)) return 'create-or-start'
  if (/删除|取消/.test(summary)) return 'delete-or-cancel'
  if (/更新|修改|调整/.test(summary)) return 'update'
  if (/发布|重试|验证/.test(summary)) return 'action'
  return 'other'
}

function semanticProfile(item) {
  return SEMANTIC_PROFILES[`${item.method} ${item.path}`] || null
}

function hasOwn(value, name) {
  return isObject(value) && Object.prototype.hasOwnProperty.call(value, name)
}

function summarizeActualResult(item, live) {
  if (!live) return '未实测'
  if (live.responseJson === null) return `${live.httpStatus ?? 'ERR'} ${live.contentType || '非 JSON 响应'}`
  const profile = semanticProfile(item)
  const payload = profile?.payload === 'root' ? live.responseJson : live.responseJson?.data
  if (Array.isArray(payload)) {
    const keys = isObject(payload[0]) ? Object.keys(payload[0]).slice(0, 8).join(', ') : typeof payload[0]
    return `数组 ${payload.length} 项${keys ? `，首项字段：${keys}` : ''}`
  }
  if (isObject(payload)) return `对象字段：${Object.keys(payload).slice(0, 12).join(', ') || '无'}`
  return `${payload === null ? 'null' : typeof payload}：${String(payload).slice(0, 120)}`
}

function addSemanticCheck(checks, issues, name, pass, failureMessage) {
  checks.push({ name, pass })
  if (!pass) issues.push(failureMessage)
}

function purposeConsistencyChecks(item, payload, checks, issues) {
  const key = `${item.method} ${item.path}`
  if (Array.isArray(payload) && [
    'GET /api/ai/models/video/generation',
    'GET /api/ai/models/image/generation',
    'GET /api/ai/models/image/edit',
    'GET /api/ai/models/chat',
    'GET /api/v2/channels/platforms',
  ].includes(key)) {
    const identity = key.endsWith('/platforms') ? 'platform' : 'name'
    const values = payload.map(entry => entry?.[identity]).filter(Boolean)
    addSemanticCheck(checks, issues, `${identity} 唯一`, values.length === new Set(values).size, `目录中存在重复的 ${identity}`)
  }

  if (key === 'GET /api/ai/models/video/generation' && Array.isArray(payload)) {
    const defaultsValid = payload.every(model => {
      const defaults = model?.defaults || {}
      return (!defaults.resolution || model.resolutions?.includes(defaults.resolution))
        && (!defaults.duration || model.durations?.includes(defaults.duration))
        && (!defaults.aspectRatio || model.aspectRatios?.includes(defaults.aspectRatio))
    })
    addSemanticCheck(checks, issues, '默认参数属于可选范围', defaultsValid, '至少一个视频模型的默认参数不在其可选范围内')
  }

  if (['GET /api/ai/models/image/generation', 'GET /api/ai/models/image/edit'].includes(key) && Array.isArray(payload)) {
    const pricingValid = payload.every(model => (model.pricing || []).every(price => !price.size || model.sizes?.includes(price.size)))
    addSemanticCheck(checks, issues, '价格尺寸属于可选范围', pricingValid, '至少一个图像模型的价格尺寸不在其可选尺寸内')
  }

  if (key === 'GET /api/ai/models/image/edit' && Array.isArray(payload)) {
    const inputValid = payload.every(model => Number.isInteger(model.maxInputImages) && model.maxInputImages > 0)
    addSemanticCheck(checks, issues, '支持输入图片', inputValid, '图像编辑目录中存在不支持输入图片的模型')
  }

  if (key === 'GET /api/ai/models/chat' && Array.isArray(payload)) {
    const modalitiesValid = payload.every(model => Array.isArray(model.inputModalities) && model.inputModalities.length > 0 && Array.isArray(model.outputModalities) && model.outputModalities.length > 0)
    addSemanticCheck(checks, issues, '输入输出能力完整', modalitiesValid, '至少一个对话模型缺少输入或输出能力声明')
  }

  if (key === 'GET /api/v2/channels/platforms' && Array.isArray(payload)) {
    const availableCapabilities = payload.every(platform => {
      if (platform.status !== 'available') return true
      const capabilities = platform.capabilities || {}
      return ['auth', 'publish', 'work', 'analytics'].some(name => capabilities[name]?.supported === true)
    })
    addSemanticCheck(checks, issues, '可用平台具有核心能力', availableCapabilities, '存在状态为 available 但没有任何核心能力的平台')
  }

  if (key === 'GET /api/ai/video/generations' && isObject(payload)) {
    addSemanticCheck(checks, issues, '分页总数合理', !Array.isArray(payload.list) || payload.total >= payload.list.length, '视频任务 total 小于当前返回列表数量')
  }
  if (key === 'GET /api/v2/channels/accounts' && isObject(payload)) {
    addSemanticCheck(checks, issues, '账号总数合理', !Array.isArray(payload.list) || payload.total >= payload.list.length, '账号 total 小于当前返回列表数量')
  }
}

function semanticAudit(item, live) {
  const profile = semanticProfile(item)
  if (!profile) return {
    status: 'not-covered',
    expectedResult: '',
    actualResult: summarizeActualResult(item, live),
    checks: [],
    issues: ['缺少接口用途校验规则'],
  }
  if (!live) return {
    status: 'not-tested',
    expectedResult: profile.expectedResult,
    actualResult: '未实测',
    checks: [],
    issues: [],
  }

  const checks = []
  const issues = []
  if (live.responseJson === null && profile.kind !== 'stream') {
    return {
      status: 'blocked',
      expectedResult: profile.expectedResult,
      actualResult: summarizeActualResult(item, live),
      checks,
      issues: live.issues?.length ? live.issues : ['没有可用于核对业务用途的 JSON 响应'],
    }
  }

  const root = live.responseJson
  const payload = profile.payload === 'root' ? root : root?.data
  if (profile.payload !== 'root') {
    const envelopeOk = isObject(root) && hasOwn(root, 'code') && hasOwn(root, 'data')
    checks.push({ name: '统一响应外壳', pass: envelopeOk })
    if (!envelopeOk) issues.push('实际响应缺少约定的 code/data 统一响应外壳')
  }

  if (profile.kind === 'stream') {
    const streamLike = /text\/event-stream|application\/x-ndjson/i.test(live.contentType || '') || typeof live.responseSample === 'string' && live.responseSample.trim().length > 0
    checks.push({ name: '流式响应', pass: streamLike })
    if (!streamLike) issues.push('实际响应不是可识别的流式内容')
  } else if (profile.kind !== 'any') {
    const kindOk = profile.kind === 'array' ? Array.isArray(payload) : isObject(payload)
    checks.push({ name: `返回 ${profile.kind}`, pass: kindOk })
    if (!kindOk) issues.push(`实际业务数据应为 ${profile.kind}，收到 ${Array.isArray(payload) ? 'array' : payload === null ? 'null' : typeof payload}`)
  }

  if (profile.nonEmpty && Array.isArray(payload)) {
    const pass = payload.length > 0
    checks.push({ name: '目录非空', pass })
    if (!pass) issues.push('实际返回空目录，无法承担文档描述的参数选择用途')
  }

  if (isObject(payload)) {
    for (const name of profile.required || []) {
      const pass = hasOwn(payload, name)
      checks.push({ name: `字段 ${name}`, pass })
      if (!pass) issues.push(`实际业务数据缺少关键字段 ${name}`)
    }
    for (const names of profile.requiredAny || []) {
      const pass = names.some(name => hasOwn(payload, name) && payload[name] !== null && payload[name] !== '')
      checks.push({ name: `字段 ${names.join('/')}`, pass })
      if (!pass) issues.push(`实际业务数据至少应包含一个有效字段：${names.join(' / ')}`)
    }
  }

  if (Array.isArray(payload)) {
    payload.slice(0, 50).forEach((entry, index) => {
      for (const name of profile.itemRequired || []) {
        if (!hasOwn(entry, name)) issues.push(`第 ${index + 1} 项缺少关键字段 ${name}`)
      }
    })
    if (profile.itemRequired?.length) {
      checks.push({ name: `列表项字段 ${profile.itemRequired.join('/')}`, pass: !issues.some(issue => /第 \d+ 项缺少关键字段/.test(issue)) })
    }
  }

  purposeConsistencyChecks(item, payload, checks, issues)

  return {
    status: issues.length > 0 ? 'mismatch' : 'pass',
    expectedResult: profile.expectedResult,
    actualResult: summarizeActualResult(item, live),
    checks,
    issues: [...new Set(issues)].slice(0, 30),
  }
}

function classifyVerdict(staticIssues, live, semantic) {
  if (!live) return '待实测'
  if (live.status === 'fixture-needed') return '缺少真实样本'
  if (live.status === 'skipped-side-effect') return '只读审计跳过'
  if (live.httpStatus === null || live.httpStatus >= 500) return '接口异常'
  if (live.httpStatus < 200 || live.httpStatus >= 300 || live.businessCode !== null && live.businessCode !== 0) return '接口未成功'
  if (live.schemaErrors?.length > 0 || semantic.status === 'mismatch') return '返回与文档不一致'
  if (staticIssues.some(issue => issue.severity === 'error')) return '文档定义异常'
  if (staticIssues.length > 0) return '通过但文档待完善'
  return '正常'
}

function responseExampleQuality(operation) {
  const examples = []
  for (const [status, response] of Object.entries(operation.responses || {})) {
    if (!/^2\d\d$/.test(status)) continue
    const resolved = response
    for (const media of Object.values(resolved.content || {})) {
      if (media?.example !== undefined) examples.push(media.example)
      if (isObject(media?.examples)) {
        for (const example of Object.values(media.examples)) {
          if (example?.value !== undefined) examples.push(example.value)
        }
      }
    }
  }
  if (examples.length === 0) return 'missing'
  const successExamples = examples.filter(example => !isObject(example) || !hasOwn(example, 'code') || example.code === 0)
  const candidates = successExamples.length > 0 ? successExamples : examples
  return candidates.some(example => !looksLikePlaceholderExample(example)) ? 'concrete' : 'placeholder'
}

function validateValue(value, schema, spec, location = '$', depth = 0) {
  if (depth > 20) return []
  const resolved = resolveSchema(schema, spec)
  if (!isObject(resolved)) return []
  if (resolved.nullable && value === null) return []
  if (Array.isArray(resolved.oneOf)) {
    const results = resolved.oneOf.map(candidate => validateValue(value, candidate, spec, location, depth + 1))
    return results.some(result => result.length === 0) ? [] : [`${location} does not match any oneOf schema`]
  }
  if (Array.isArray(resolved.anyOf)) {
    const results = resolved.anyOf.map(candidate => validateValue(value, candidate, spec, location, depth + 1))
    return results.some(result => result.length === 0) ? [] : [`${location} does not match any anyOf schema`]
  }

  const type = Array.isArray(resolved.type) ? resolved.type : [resolved.type].filter(Boolean)
  const errors = []
  if (resolved.const !== undefined && value !== resolved.const) {
    errors.push(`${location} expected constant ${JSON.stringify(resolved.const)}, received ${JSON.stringify(value)}`)
  }
  if (Array.isArray(resolved.enum) && !resolved.enum.some(candidate => Object.is(candidate, value))) {
    errors.push(`${location} expected one of ${resolved.enum.map(candidate => JSON.stringify(candidate)).join(', ')}, received ${JSON.stringify(value)}`)
  }
  if (type.includes('object') || resolved.properties) {
    if (!isObject(value)) return [`${location} expected object, received ${Array.isArray(value) ? 'array' : typeof value}`]
    for (const required of resolved.required || []) {
      if (!(required in value)) errors.push(`${location}.${required} is required`)
    }
    for (const [name, property] of Object.entries(resolved.properties || {})) {
      if (name in value) errors.push(...validateValue(value[name], property, spec, `${location}.${name}`, depth + 1))
    }
  } else if (type.includes('array')) {
    if (!Array.isArray(value)) return [`${location} expected array, received ${typeof value}`]
    value.slice(0, 20).forEach((item, index) => errors.push(...validateValue(item, resolved.items, spec, `${location}[${index}]`, depth + 1)))
  } else if (type.includes('string') && typeof value !== 'string') errors.push(`${location} expected string, received ${typeof value}`)
  else if (type.includes('integer') && !Number.isInteger(value)) errors.push(`${location} expected integer, received ${typeof value}`)
  else if (type.includes('number') && typeof value !== 'number') errors.push(`${location} expected number, received ${typeof value}`)
  else if (type.includes('boolean') && typeof value !== 'boolean') errors.push(`${location} expected boolean, received ${typeof value}`)
  return errors
}

function responseForStatus(operation, status) {
  const responses = operation.responses || {}
  return responses[String(status)] || responses[`${Math.floor(status / 100)}XX`] || responses.default || null
}

function responseSchema(response, spec) {
  const resolved = resolveRef(response, spec)
  const content = firstContent(resolved?.content)
  return content?.value?.schema || null
}

function semanticPayloadSchema(item, spec) {
  const success = Object.entries(item.operation.responses || {}).find(([status]) => /^2\d\d$/.test(status))
  if (!success) return null
  const root = resolveSchema(responseSchema(success[1], spec), spec)
  const profile = semanticProfile(item)
  if (!profile || !isObject(root)) return null
  return resolveSchema(profile.payload === 'root' ? root : root.properties?.data, spec)
}

function staticAudit(item, spec) {
  const issues = []
  const operation = item.operation
  if (!semanticProfile(item)) issues.push({ severity: 'error', code: 'missing-semantic-profile', message: '缺少接口用途校验规则' })
  if (!operation.summary) issues.push({ severity: 'error', code: 'missing-summary', message: '缺少 summary' })
  if (!operation.description) issues.push({ severity: 'warning', code: 'missing-description', message: '缺少接口说明' })
  if (!Array.isArray(operation.tags) || operation.tags.length === 0) issues.push({ severity: 'error', code: 'missing-tag', message: '缺少 tag' })
  if (!operation['x-mint']?.href) issues.push({ severity: 'warning', code: 'missing-href', message: '缺少 x-mint.href' })
  if (item.security.length === 0 && /当前账号可用/.test(operation.description || '')) {
    issues.push({ severity: 'warning', code: 'public-account-specific-description', message: '公开接口没有账号上下文，但说明写成“当前账号可用”' })
  }
  if (item.security.includes('apikey-header-Authorization')) {
    issues.push({ severity: 'warning', code: 'authorization-prefix-ui-mismatch', message: '安全说明示例要求 Bearer，但 Mintlify cURL 只生成 Authorization: <api-key>，需与后端要求统一' })
  }

  const successResponses = Object.entries(operation.responses || {}).filter(([status]) => /^2\d\d$/.test(status))
  if (successResponses.length === 0) issues.push({ severity: 'error', code: 'missing-success-response', message: '缺少 2xx 响应定义' })
  for (const [status, response] of successResponses) {
    const resolved = resolveRef(response, spec)
    if (!resolved?.description) issues.push({ severity: 'warning', code: 'missing-response-description', message: `${status} 缺少响应说明` })
    const content = firstContent(resolved?.content)
    if (!content) issues.push({ severity: 'warning', code: 'missing-response-content', message: `${status} 缺少响应 content` })
    else if (!content.value?.schema) issues.push({ severity: 'warning', code: 'missing-response-schema', message: `${status} 缺少响应 schema` })
  }
  const responseExample = responseExampleQuality(operation)
  if (successResponses.length > 0 && responseExample === 'missing') {
    issues.push({ severity: 'warning', code: 'missing-response-example', message: '成功响应没有 example，页面会使用占位值' })
  } else if (responseExample === 'placeholder') {
    issues.push({ severity: 'warning', code: 'placeholder-response-example', message: '成功响应 example 仍是 string/1 等占位数据' })
  }

  const profile = semanticProfile(item)
  const payloadSchema = semanticPayloadSchema(item, spec)
  if (profile && payloadSchema && ['object', 'array'].includes(profile.kind)) {
    const schemaType = payloadSchema.type || (payloadSchema.properties ? 'object' : null)
    if (schemaType && schemaType !== profile.kind) {
      issues.push({ severity: 'error', code: 'response-purpose-type-mismatch', message: `成功响应业务数据定义为 ${schemaType}，接口用途要求 ${profile.kind}` })
    }
    const objectSchema = profile.kind === 'array' ? resolveSchema(payloadSchema.items, spec) : payloadSchema
    const expectedFields = profile.kind === 'array' ? profile.itemRequired || [] : profile.required || []
    if (expectedFields.length > 0 && isObject(objectSchema)) {
      const documentedFields = Object.keys(objectSchema.properties || {})
      if (documentedFields.length === 0) {
        issues.push({ severity: 'warning', code: 'empty-purpose-response-schema', message: `成功响应 schema 没有描述关键字段：${expectedFields.join(', ')}` })
      } else {
        const missingFields = expectedFields.filter(name => !documentedFields.includes(name))
        if (missingFields.length > 0) issues.push({ severity: 'error', code: 'missing-purpose-response-fields', message: `成功响应 schema 缺少用途关键字段：${missingFields.join(', ')}` })
      }
    }
  }

  const body = buildRequestBody(item, spec)
  if (operation.requestBody && !body) issues.push({ severity: 'error', code: 'missing-request-content', message: '请求体缺少可用 content' })
  if (body && !body.explicit) issues.push({ severity: 'warning', code: 'generated-request-example', message: '请求体没有具体 example' })
  if (body?.placeholder) issues.push({ severity: 'warning', code: 'placeholder-request-example', message: '请求体 example 仍是 string/1 等占位数据' })
  if (body?.schema && body.value !== undefined) {
    for (const message of validateValue(body.value, body.schema, spec).slice(0, 10)) {
      issues.push({ severity: 'error', code: 'invalid-request-example', message })
    }
  }

  for (const parameter of operationParameters(item, spec)) {
    if (!parameter.required) continue
    const schema = parameter.schema || {}
    const hasExample = isUsableParameterExample(parameter.example)
      || isUsableParameterExample(schema.example)
      || isUsableParameterExample(schema.default)
      || (Array.isArray(schema.enum) && schema.enum.some(isUsableParameterExample))
    if (!hasExample) issues.push({ severity: 'warning', code: 'generated-parameter-example', message: `必填${parameter.in}参数 ${parameter.name} 没有 example/default/enum` })
  }

  return issues
}

function headersFor(item, apiKey) {
  const headers = { Accept: 'application/json, text/event-stream;q=0.9, */*;q=0.1' }
  if (!apiKey) return headers
  if (item.security.includes('apikey-header-X-Api-Key')) headers['X-Api-Key'] = apiKey
  if (item.security.includes('apikey-header-x-goog-api-key')) headers['x-goog-api-key'] = apiKey
  if (item.security.includes('apikey-header-Authorization')) {
    headers.Authorization = item.path.startsWith('/api/ai/v3/') ? apiKey : `Bearer ${apiKey}`
  }
  return headers
}

function shouldRun(item, args) {
  if (args.authenticatedRead) return item.method === 'GET'
  if (args.smokeAll) return true
  if (args.livePublic) return item.security.length === 0
  return false
}

async function executeRequest(item, spec, baseUrl, args, apiKey, fixtures = {}, strictFixtures = false) {
  const builtUrl = buildUrl(item, spec, baseUrl, fixtures, strictFixtures)
  const { url } = builtUrl
  if (builtUrl.missingFixtures.length > 0) {
    return {
      status: 'fixture-needed',
      url,
      httpStatus: null,
      contentType: '',
      elapsedMs: 0,
      businessCode: null,
      issues: [`缺少真实参数：${builtUrl.missingFixtures.join(', ')}`],
      schemaErrors: [],
      responseSample: '',
      responseJson: null,
    }
  }
  const body = buildRequestBody(item, spec)
  const authenticated = args.authenticatedRead && item.security.length > 0
  const headers = headersFor(item, authenticated ? apiKey : null)
  const options = {
    method: item.method,
    headers,
    redirect: 'manual',
    signal: AbortSignal.timeout(args.timeoutMs),
  }

  if (!['GET', 'HEAD', 'DELETE'].includes(item.method) && body?.mediaType === 'application/json') {
    headers['Content-Type'] = 'application/json'
    options.body = JSON.stringify(body.value ?? {})
  }

  const startedAt = Date.now()
  try {
    const response = await fetch(url, options)
    const elapsedMs = Date.now() - startedAt
    const contentType = response.headers.get('content-type') || ''
    const text = await response.text()
    let json = null
    try {
      json = JSON.parse(text)
    } catch {}

    const expectedPublicSuccess = item.security.length === 0
    const expectedAuthenticatedSuccess = authenticated
    const expectedSuccess = expectedPublicSuccess || expectedAuthenticatedSuccess
    const issues = []
    if (/text\/html/i.test(contentType) || /^\s*<!doctype html/i.test(text)) issues.push('返回 HTML，不是接口 JSON/SSE')
    if (response.status >= 500) issues.push(`服务端错误 ${response.status}`)
    if (response.status === 404) issues.push('文档路径返回 404')
    if (response.status === 405) issues.push('文档方法返回 405')
    if (expectedSuccess && !(response.status >= 200 && response.status < 300)) issues.push(`预期成功但返回 ${response.status}`)
    if (!expectedSuccess && item.security.length > 0 && ![400, 401, 403, 422].includes(response.status)) {
      issues.push(`未鉴权烟测返回了非预期状态 ${response.status}`)
    }
    if (expectedSuccess && isObject(json) && 'code' in json && json.code !== 0) issues.push(`业务 code=${json.code}`)

    const schema = responseSchema(responseForStatus(item.operation, response.status), spec)
    const schemaErrors = json !== null && schema ? validateValue(json, schema, spec).slice(0, 20) : []
    if (expectedSuccess && schemaErrors.length > 0) issues.push(`真实响应与 schema 不一致：${schemaErrors[0]}`)

    let status = 'pass'
    if (issues.length > 0) status = 'fail'
    else if (!expectedSuccess && [400, 422].includes(response.status)) status = 'warning'
    else if (!expectedSuccess && [401, 403].includes(response.status)) status = 'auth-gate-ok'

    return {
      status,
      url,
      httpStatus: response.status,
      contentType,
      elapsedMs,
      businessCode: isObject(json) && 'code' in json ? json.code : null,
      issues,
      schemaErrors,
      responseSample: text.slice(0, 12000),
      responseJson: json,
    }
  } catch (error) {
    return {
      status: 'fail',
      url,
      httpStatus: null,
      contentType: '',
      elapsedMs: Date.now() - startedAt,
      businessCode: null,
      issues: [error?.name === 'TimeoutError' ? `请求超时（${args.timeoutMs}ms）` : String(error?.message || error)],
      schemaErrors: [],
      responseSample: '',
      responseJson: null,
    }
  }
}

async function runPool(items, concurrency, worker) {
  const results = new Array(items.length)
  let cursor = 0
  async function run() {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await worker(items[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run))
  return results
}

function firstObject(value) {
  if (Array.isArray(value)) return value.find(isObject) || null
  if (!isObject(value)) return null
  for (const key of ['list', 'items', 'tasks', 'records']) {
    if (Array.isArray(value[key])) return value[key].find(isObject) || null
  }
  return value
}

function collectFixtures(item, live, fixtures) {
  if (!live || live.httpStatus < 200 || live.httpStatus >= 300 || !isObject(live.responseJson)) return false
  const data = live.responseJson.data ?? live.responseJson
  const candidate = firstObject(data)
  let changed = false
  const assign = (name, value) => {
    if (value === undefined || value === null || value === '' || fixtures[name] !== undefined) return
    fixtures[name] = value
    changed = true
  }

  if (item.path === '/api/v2/channels/platforms' && Array.isArray(data)) {
    const platform = data.find(entry => entry?.status === 'available') || data.find(isObject)
    assign('platform', platform?.platform)
  }
  if (item.path === '/api/v2/channels/accounts') {
    assign('accountId', candidate?.id)
    assign('groupId', candidate?.groupId)
    assign('platform', candidate?.type || candidate?.platform)
  }
  if (item.path === '/api/ai/video/generations') assign('videoTaskId', candidate?.id || candidate?.taskId)
  if (item.path === '/api/ai/image/task/{logId}') assign('imageLogId', candidate?.logId)
  if (/^\/api\/v2\/channels\/publish\/records(?:\/queued|\/published)?$/.test(item.path)) {
    assign('publishRecordId', candidate?.id)
    assign('publishFlowId', candidate?.flowId)
    assign('publishTaskId', candidate?.taskId)
    assign('accountId', candidate?.accountId)
    assign('platform', candidate?.accountType || candidate?.platform)
    assign('platformWorkId', candidate?.platformWorkId)
    assign('workUrl', candidate?.workLink)
  }
  if (item.path === '/api/v2/channels/account-groups') assign('groupId', candidate?.id)
  if (item.path === '/api/v2/channels/platforms/{platform}/publish-options') assign('publishOptionField', candidate?.field)
  if (item.path === '/api/v2/channels/works/{platform}') {
    assign('platformWorkId', candidate?.platformWorkId || candidate?.id)
    assign('workUrl', candidate?.url || candidate?.link || candidate?.workLink)
  }
  if (item.path === '/api/v2/channels/accounts/auth/{platform}') assign('authSessionId', data?.sessionId)
  if (item.path === '/api/ai/v3/contents/generations/tasks/{taskId}') assign('volcTaskId', data?.id)
  return changed
}

function skippedLive(item, reason, status = 'fixture-needed') {
  return {
    status,
    url: '',
    httpStatus: null,
    contentType: '',
    elapsedMs: 0,
    businessCode: null,
    issues: [reason],
    schemaErrors: [],
    responseSample: '',
    responseJson: null,
  }
}

async function runAuthenticatedReads(operations, spec, baseUrl, args, apiKey) {
  const fixtures = Object.fromEntries(Object.entries({
    accountId: process.env.AITOEARN_ACCOUNT_ID,
    groupId: process.env.AITOEARN_GROUP_ID,
    publishRecordId: process.env.AITOEARN_PUBLISH_RECORD_ID,
    publishFlowId: process.env.AITOEARN_PUBLISH_FLOW_ID,
    publishTaskId: process.env.AITOEARN_PUBLISH_TASK_ID,
    videoTaskId: process.env.AITOEARN_VIDEO_TASK_ID,
    imageLogId: process.env.AITOEARN_IMAGE_LOG_ID,
    volcTaskId: process.env.AITOEARN_VOLC_TASK_ID,
    authSessionId: process.env.AITOEARN_AUTH_SESSION_ID,
    platform: process.env.AITOEARN_PLATFORM,
    platformWorkId: process.env.AITOEARN_PLATFORM_WORK_ID,
    publishOptionField: process.env.AITOEARN_PUBLISH_OPTION_FIELD,
    workUrl: process.env.AITOEARN_WORK_URL,
  }).filter(([, value]) => value))
  const results = new Map()
  const pending = []

  for (const item of operations.filter(operation => operation.method === 'GET')) {
    if (item.path === '/api/v2/channels/accounts/auth/{platform}') {
      results.set(item.index, skippedLive(item, '该 GET 会创建 OAuth 授权会话，只读审计中不执行', 'skipped-side-effect'))
    } else {
      pending.push(item)
    }
  }

  for (let round = 0; round < 6 && pending.length > 0; round += 1) {
    const ready = []
    for (let index = pending.length - 1; index >= 0; index -= 1) {
      const item = pending[index]
      const built = buildUrl(item, spec, baseUrl, fixtures, true)
      if (built.missingFixtures.length === 0) ready.push(...pending.splice(index, 1))
    }
    if (ready.length === 0) break

    const liveResults = await runPool(ready, args.concurrency, async (item, index) => {
      const result = await executeRequest(item, spec, baseUrl, args, apiKey, fixtures, true)
      process.stderr.write(`[read ${round + 1}.${index + 1}/${ready.length}] ${item.method} ${item.path} -> ${result.httpStatus ?? result.status} ${result.status}\n`)
      return result
    })
    ready.forEach((item, index) => {
      results.set(item.index, liveResults[index])
      collectFixtures(item, liveResults[index], fixtures)
    })
  }

  for (const item of pending) {
    const built = buildUrl(item, spec, baseUrl, fixtures, true)
    results.set(item.index, skippedLive(item, `缺少可串联的真实参数：${built.missingFixtures.join(', ')}`))
  }
  return { results, fixtures }
}

function wasActuallyCalled(endpoint) {
  if (!endpoint.live) return false
  if (['fixture-needed', 'skipped-side-effect'].includes(endpoint.live.status)) return false
  return endpoint.live.httpStatus !== null || endpoint.live.elapsedMs > 0
}

function notCalledReason(endpoint) {
  if (endpoint.path === '/api/v2/channels/accounts/auth/{platform}') {
    return {
      code: 'requires-auth-or-fixture',
      message: '会创建 OAuth 授权会话，只读审计中暂未调用',
    }
  }
  const reasons = {
    'authenticated-read': {
      code: 'requires-auth-or-fixture',
      message: '需要 API Key、真实账号或业务 ID',
    },
    'billable-ai': {
      code: 'billable',
      message: '可能消耗 AI 额度',
    },
    write: {
      code: 'writes-production-data',
      message: '会创建或修改线上数据',
    },
    'external-action': {
      code: 'external-side-effect',
      message: '会触发发布或第三方动作',
    },
    destructive: {
      code: 'destructive',
      message: '会删除线上数据',
    },
  }
  return reasons[endpoint.risk] || {
    code: 'not-executed',
    message: '本轮未执行真实接口调用',
  }
}

function classifyTestExecution(endpoint) {
  if (wasActuallyCalled(endpoint)) {
    return {
      status: 'completed',
      reasonCode: null,
      reason: null,
    }
  }
  const reason = notCalledReason(endpoint)
  return {
    status: 'not-called',
    reasonCode: reason.code,
    reason: endpoint.live?.issues?.[0] || reason.message,
  }
}

function buildTestStatus(endpoints) {
  const completed = endpoints.filter(endpoint => endpoint.testExecution.status === 'completed')
  const notCalled = endpoints.filter(endpoint => endpoint.testExecution.status === 'not-called')
  const reasonCounts = {}
  for (const endpoint of notCalled) {
    const key = endpoint.testExecution.reasonCode
    reasonCounts[key] = (reasonCounts[key] || 0) + 1
  }
  return {
    definition: 'completed 仅表示已经向真实接口发起请求；OpenAPI 静态检查和本地文档页面检查不计入真实调用数量。',
    completed: {
      count: completed.length,
      endpoints: completed.map(endpoint => ({
        method: endpoint.method,
        path: endpoint.path,
        httpStatus: endpoint.live.httpStatus,
        businessCode: endpoint.live.businessCode,
        verdict: endpoint.verdict,
      })),
    },
    notCalled: {
      count: notCalled.length,
      reasonCounts,
      endpoints: notCalled.map(endpoint => ({
        method: endpoint.method,
        path: endpoint.path,
        reasonCode: endpoint.testExecution.reasonCode,
        reason: endpoint.testExecution.reason,
      })),
    },
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const root = process.cwd()
  const specPath = path.resolve(root, args.spec)
  const outputDir = path.resolve(root, args.outputDir)
  const spec = readJson(specPath)
  const baseUrl = args.baseUrl || spec.servers?.[0]?.url
  if (!baseUrl) throw new Error('OpenAPI spec has no server URL; pass --base-url')
  const apiKey = process.env.AITOEARN_CN_API_KEY || ''
  if (args.authenticatedRead && !apiKey) throw new Error('Set AITOEARN_CN_API_KEY before using --authenticated-read')

  const operations = listOperations(spec)
  const runnable = operations.filter(item => shouldRun(item, args))
  const liveByIndex = new Map()
  let fixtureKeys = []
  if (args.authenticatedRead) {
    const authenticated = await runAuthenticatedReads(operations, spec, baseUrl, args, apiKey)
    authenticated.results.forEach((value, key) => liveByIndex.set(key, value))
    fixtureKeys = Object.keys(authenticated.fixtures)
  } else if (runnable.length > 0) {
    const liveResults = await runPool(runnable, args.concurrency, async (item, index) => {
      const result = await executeRequest(item, spec, baseUrl, args, apiKey)
      process.stderr.write(`[${index + 1}/${runnable.length}] ${item.method} ${item.path} -> ${result.httpStatus ?? 'ERR'} ${result.status}\n`)
      return result
    })
    runnable.forEach((item, index) => liveByIndex.set(item.index, liveResults[index]))
  }

  const endpoints = operations.map(item => {
    const staticIssues = staticAudit(item, spec)
    const live = liveByIndex.get(item.index) || null
    const semantic = semanticAudit(item, live)
    const endpoint = {
      index: item.index,
      method: item.method,
      path: item.path,
      summary: item.operation.summary || '',
      description: item.operation.description || '',
      tags: item.operation.tags || [],
      operationId: item.operation.operationId || '',
      href: item.operation['x-mint']?.href || '',
      security: item.security,
      risk: classifyRisk(item),
      purpose: classifyPurpose(item),
      expectedResult: semantic.expectedResult,
      requestExample: buildRequestBody(item, spec),
      staticIssues,
      live,
      semantic,
      verdict: classifyVerdict(staticIssues, live, semantic),
    }
    endpoint.testExecution = classifyTestExecution(endpoint)
    return endpoint
  })

  const report = {
    generatedAt: new Date().toISOString(),
    specPath: path.relative(root, specPath).replaceAll('\\', '/'),
    baseUrl,
    mode: args.authenticatedRead ? 'authenticated-read' : args.smokeAll ? 'smoke-all' : args.livePublic ? 'live-public' : 'static-only',
    fixtureKeys,
    summary: {
      total: endpoints.length,
      public: endpoints.filter(endpoint => endpoint.security.length === 0).length,
      protected: endpoints.filter(endpoint => endpoint.security.length > 0).length,
      byRisk: Object.fromEntries([...new Set(endpoints.map(endpoint => endpoint.risk))].map(risk => [risk, endpoints.filter(endpoint => endpoint.risk === risk).length])),
    },
    testStatus: buildTestStatus(endpoints),
    endpoints,
  }

  fs.mkdirSync(outputDir, { recursive: true })
  const jsonPath = path.join(outputDir, 'api-audit-latest.json')
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify({ jsonPath, summary: report.summary, testStatus: report.testStatus }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
