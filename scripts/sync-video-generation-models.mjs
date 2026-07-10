import fs from 'node:fs'
import path from 'node:path'

const docsRoot = process.cwd()
const modelListUrl = process.env.AITOEARN_VIDEO_MODELS_URL || 'https://aitoearn.cn/api/ai/models/video/generation'

const targets = [
  {
    path: path.join(docsRoot, 'zh/use/video-generation/index.mdx'),
    locale: 'zh-CN',
    title: '当前模型支持情况',
    updatedAt: value => `更新于 ${value}（北京时间）。`,
    headers: ['模型', '支持的模式', '支持的分辨率', '支持的时长', '图片输入数量', '音频输入数量', '视频输入数量', '支持比例'],
    separator: '、',
    formatDuration: (min, max) => min === max ? `${min} 秒` : `${min}-${max} 秒`,
  },
  {
    path: path.join(docsRoot, 'en/use/video-generation/index.mdx'),
    locale: 'en-US',
    title: 'Current model support',
    updatedAt: value => `Updated at ${value} (Beijing Time).`,
    headers: ['Model', 'Supported modes', 'Supported resolutions', 'Supported durations', 'Image inputs', 'Audio inputs', 'Video inputs', 'Supported aspect ratios'],
    separator: ', ',
    formatDuration: (min, max) => min === max ? `${min} ${min === 1 ? 'second' : 'seconds'}` : `${min}-${max} seconds`,
  },
]

const startMarker = '{/* AUTO-GENERATED:VIDEO_MODELS_START */}'
const endMarker = '{/* AUTO-GENERATED:VIDEO_MODELS_END */}'

async function fetchVideoModels() {
  const response = await fetch(modelListUrl, {
    headers: {
      accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch video models: ${response.status} ${response.statusText}`)
  }

  const payload = await response.json()
  const data = Array.isArray(payload) ? payload : payload?.data
  if (!Array.isArray(data)) {
    throw new Error('Video model response must be an array or { data: array }')
  }

  return data.map((model, index) => normalizeModel(model, index))
}

function normalizeModel(model, index) {
  if (!model || typeof model !== 'object') {
    throw new Error(`Video model at index ${index} must be an object`)
  }
  if (typeof model.name !== 'string' || model.name.trim() === '') {
    throw new Error(`Video model at index ${index} is missing name`)
  }

  return {
    ...model,
    label: typeof model.label === 'string' && model.label ? model.label : model.name,
    modes: toStringArray(model.modes),
    resolutions: toStringArray(model.resolutions),
    durations: toNumberArray(model.durations),
    aspectRatios: toStringArray(model.aspectRatios),
  }
}

function toStringArray(value) {
  return Array.isArray(value) ? value.filter(item => typeof item === 'string' && item.trim() !== '') : []
}

function toNumberArray(value) {
  return Array.isArray(value) ? value.filter(item => typeof item === 'number' && Number.isFinite(item)) : []
}

function formatDate(value, locale) {
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(value)
}

function unique(values) {
  return [...new Set(values.filter(value => value !== undefined && value !== null && value !== ''))]
}

function formatArray(values, separator) {
  return values.length > 0 ? values.join(separator) : '-'
}

function formatDurations(values, formatDuration) {
  const durations = unique(values).sort((a, b) => a - b)
  if (durations.length === 0) {
    return '-'
  }
  return formatDuration(durations[0], durations[durations.length - 1])
}

function formatCount(value) {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '0'
}

function supportsAny(model, modes) {
  return model.modes.some(mode => modes.includes(mode))
}

function getImageCount(model) {
  const maxCount = model.inputConstraints?.images?.maxCount ?? model.maxInputImages
  if (maxCount !== undefined) {
    return formatCount(maxCount)
  }
  return supportsAny(model, ['image2video', 'flf2video', 'lf2video', 'multi-image2video', 'multi-ref']) ? '1' : '0'
}

function getAudioCount(model) {
  const maxCount = model.inputConstraints?.audios?.maxCount
  if (maxCount !== undefined) {
    return formatCount(maxCount)
  }
  return '0'
}

function getVideoCount(model) {
  const maxCount = model.inputConstraints?.videos?.maxCount
  if (maxCount !== undefined) {
    return formatCount(maxCount)
  }
  return supportsAny(model, ['video2video', 'multi-ref']) ? '1' : '0'
}

function escapeTableCell(value) {
  return String(value ?? '-')
    .replaceAll('|', '\\|')
    .replace(/\r?\n/g, '<br />')
}

function table(headers, rows) {
  return [
    `| ${headers.map(escapeTableCell).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map(row => `| ${row.map(escapeTableCell).join(' | ')} |`),
  ].join('\n')
}

function buildModelTable(models, target) {
  return table(
    target.headers,
    models.map(model => [
      `${model.label}<br />\`${model.name}\``,
      formatArray(model.modes, target.separator),
      formatArray(model.resolutions, target.separator),
      formatDurations(model.durations, target.formatDuration),
      getImageCount(model),
      getAudioCount(model),
      getVideoCount(model),
      formatArray(model.aspectRatios, target.separator),
    ]),
  )
}

function buildGeneratedBlock(models, target) {
  return [
    startMarker,
    '',
    `## ${target.title}`,
    '',
    `<Info>${target.updatedAt(formatDate(new Date(), target.locale))}</Info>`,
    '',
    buildModelTable(models, target),
    '',
    endMarker,
  ].join('\n')
}

function updateTargetFile(targetPath, block) {
  const source = fs.readFileSync(targetPath, 'utf8')
  const startIndex = source.indexOf(startMarker)
  const endIndex = source.indexOf(endMarker)

  if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
    const nextSource = `${source.slice(0, startIndex)}${block}${source.slice(endIndex + endMarker.length)}`
    fs.writeFileSync(targetPath, nextSource, 'utf8')
    return
  }

  fs.writeFileSync(targetPath, `${source.trimEnd()}\n\n${block}\n`, 'utf8')
}

async function main() {
  const models = await fetchVideoModels()
  for (const target of targets) {
    updateTargetFile(target.path, buildGeneratedBlock(models, target))
  }
  console.log(JSON.stringify({
    models: models.length,
    targetPaths: targets.map(target => target.path.replaceAll('\\', '/')),
    modelListUrl,
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
