import fs from 'node:fs'
import path from 'node:path'

const docsRoot = process.cwd()
const repoRoot = path.resolve(docsRoot, '..')
const websiteRoot = path.join(repoRoot, 'aitoearn-website')
const backendRoot = process.env.AITOEARN_BACKEND_ROOT || 'E:/project-dev/node/yika/aitoearn-monorepo'
const sourceSpecPath = path.join(websiteRoot, 'docs/openPlatform/默认模块.openapi.json')
const targetSpecPath = path.join(docsRoot, 'openapi/zh/aitoearn.openapi.json')
const specOverridesPath = path.join(docsRoot, 'openapi/spec-overrides.json')
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
const targetSpecRef = 'openapi/zh/aitoearn.openapi.json'

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

function buildNavigationGroups(endpoints) {
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

  for (const child of Object.values(value)) {
    sanitizeOpenApi30(child)
  }
  return value
}

function syncDocsJson(endpoints) {
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
    ...buildNavigationGroups(endpoints),
  ]
  enApiTab.groups = [
    {
      group: 'Overview',
      pages: ['en/api/index'],
    },
  ]

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
  if (override.bodyProperties) {
    let schema = operation.requestBody?.content?.['application/json']?.schema
    if (schema?.$ref) {
      schema = targetSpec.components?.schemas?.[schema.$ref.split('/').pop()]
    }
    for (const [propertyName, patch] of Object.entries(override.bodyProperties)) {
      const property = schema?.properties?.[propertyName]
      if (!property) {
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

function generate() {
  const sourceSpec = readJson(sourceSpecPath)
  const endpoints = listEndpoints(sourceSpec)
  if (endpoints.length !== 61) {
    throw new Error(`Expected 61 endpoints, got ${endpoints.length}`)
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
      description: 'AiToEarn Open Platform API Key。',
    },
    'apikey-header-Authorization': {
      type: 'apiKey',
      in: 'header',
      name: 'Authorization',
      description: 'OpenAI 兼容接口使用，示例：Bearer <token>。',
    },
    'apikey-header-x-goog-api-key': {
      type: 'apiKey',
      in: 'header',
      name: 'x-goog-api-key',
      description: 'Gemini SDK 兼容接口使用的 API Key header。',
    },
  }

  for (const endpoint of documentedEndpoints) {
    const operation = targetSpec.paths[endpoint.path][endpoint.method.toLowerCase()]
    applySpecOverride(targetSpec, endpoint, operation, specOverrides[`${endpoint.method} ${endpoint.path}`])
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
    operation['x-aitoearn-backend'] = {
      controller: mapping.controllerFile,
      controllerMethod: mapping.controllerMethod,
      services: mapping.serviceCalls,
      responseCodes: mapping.responseCodeValues,
      rawResponse: skipResponseInterceptor,
    }

    if (skipResponseInterceptor) {
      operation.responses = {
        200: {
          description: '第三方协议原生响应或 SSE 数据。不使用 AiToEarn 通用响应包裹。',
          content: {
            'application/json': {
              schema: rawResponseSchema(),
              examples: buildRawExamples(endpoint),
            },
            'text/event-stream': {
              schema: {
                type: 'string',
                description: 'SSE 流式响应。',
              },
            },
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
  writeJson(targetSpecPath, targetSpec)
  const navigationEndpoints = documentedEndpoints.map((endpoint) => {
    const override = specOverrides[`${endpoint.method} ${endpoint.path}`]
    return override?.tag ? { ...endpoint, tag: override.tag } : endpoint
  })
  syncDocsJson(navigationEndpoints)

  const completed = matrix.filter(item => item.status === 'completed').length
  console.log(JSON.stringify({
    endpoints: endpoints.length,
    matrixRows: matrix.length,
    completed,
    targetSpecPath: normalizePathForDocs(targetSpecPath),
    inventoryPath: normalizePathForDocs(inventoryPath),
    matrixPath: normalizePathForDocs(matrixPath),
  }, null, 2))
}

generate()
