import { createLowlight } from 'lowlight'
import { createParser } from '@milkdown/plugin-highlight/lowlight'

import python from 'highlight.js/lib/languages/python'
import java from 'highlight.js/lib/languages/java'
import bash from 'highlight.js/lib/languages/bash'
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import json from 'highlight.js/lib/languages/json'
import css from 'highlight.js/lib/languages/css'
import xml from 'highlight.js/lib/languages/xml'
import markdown from 'highlight.js/lib/languages/markdown'
import yaml from 'highlight.js/lib/languages/yaml'
import plaintext from 'highlight.js/lib/languages/plaintext'
import sql from 'highlight.js/lib/languages/sql'

/**
 * 单一 lowlight 实例：语法高亮 + 语言列表共用。
 * 只注册精选常用语言（默认的 common 会打包 34 种语法，此处裁剪以控制启动体积）；
 * 未注册的语言交给 highlightAuto 自动识别（见 highlightParser）。
 */
export const lowlight = createLowlight()
lowlight.register('python', python)
lowlight.register('java', java)
lowlight.register('bash', bash)
lowlight.register('javascript', javascript)
lowlight.register('typescript', typescript)
lowlight.register('json', json)
lowlight.register('css', css)
lowlight.register('xml', xml)
lowlight.register('markdown', markdown)
lowlight.register('yaml', yaml)
lowlight.register('plaintext', plaintext)
lowlight.register('sql', sql)
// hive：highlight.js 没有独立的 Hive 语法，HiveQL 语法与 SQL 一致，复用 SQL 语法注册
lowlight.register('hive', sql)

/**
 * 容错高亮解析器。
 *
 * 直接用 `createParser(lowlight)` 时，一旦某个代码块使用了 lowlight 未注册的语言
 * （如 `toml`/`dockerfile`/`jsx`/`tsx` 等），`lowlight.highlight` 会抛
 * `Unknown language` 异常。而 prosemirror-highlight 的 `calculateDecoration` 把整轮
 * 遍历包在一个 try/catch 里 —— 抛错会让循环中断，导致**当前代码块之后的所有代码块都
 * 丢失高亮**（表现就是「滚到下面就不高亮了」「有时候某语言不高亮」）。
 *
 * 这里捕获异常并回退到 `highlightAuto`（自动识别，绝不会抛错），保证任何语言都不会
 * 中断整轮遍历，所有代码块都能正常高亮。
 */
const baseParser = createParser(lowlight)
export const highlightParser = (opts: {
  content: string
  language?: string
  pos: number
  size: number
}): ReturnType<typeof baseParser> => {
  try {
    return baseParser(opts)
  } catch {
    try {
      return baseParser({ ...opts, language: undefined })
    } catch {
      return []
    }
  }
}

/** 已注册的语言列表（供代码块语言选择器用） */
export const CODE_LANGUAGES: string[] = lowlight.listLanguages()