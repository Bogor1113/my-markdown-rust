/**
 * 模糊文件名匹配器
 *
 * 优化：缓存文件树遍历结果和文件名，避免每次按键重新遍历。
 */

import type { FileEntry } from '../types'

export interface FuzzyResult {
  path: string
  name: string
  matches: number[]
  score: number
}

function fuzzyScore(query: string, text: string): { score: number; matches: number[] } | null {
  const q = query.toLowerCase()
  const t = text.toLowerCase()

  let qi = 0
  let ti = 0
  const matches: number[] = []
  let score = 0
  let prevMatched = false
  let consecutive = 0

  while (qi < q.length && ti < t.length) {
    if (q[qi] === t[ti]) {
      matches.push(ti)
      if (prevMatched) {
        consecutive++
        score += consecutive * 15
      } else {
        consecutive = 0
      }
      if (ti === 0) score += 30
      if (ti > 0 && /[/\\\-_. ]/.test(text[ti - 1])) score += 20
      score += 10
      qi++
      prevMatched = true
    } else {
      prevMatched = false
      consecutive = 0
    }
    ti++
  }

  if (qi < q.length) return null
  score += Math.max(0, 50 - text.length)
  return { score, matches }
}

/** 缓存条目：避免每次按键重新 walk 文件树 */
interface CachedEntry {
  path: string
  name: string
}

/** 缓存：以 fileTree 对象引用为键（store 每次 loadDirectory 都产出新对象） */
const cacheMap = new WeakMap<Record<string, FileEntry[]>, { rootPath: string; entries: CachedEntry[] }>()

function collectAllFilesCached(
  rootPath: string,
  fileTree: Record<string, FileEntry[]>,
): CachedEntry[] {
  // 注意不能用字符串拼接做 key：对象参与拼接会被 toString 成 "[object Object]"，
  // 与 fileTree 的引用/内容完全无关，缓存永不失效（新加载的目录永远搜不到）。
  const hit = cacheMap.get(fileTree)
  if (hit && hit.rootPath === rootPath && hit.entries.length > 0) {
    return hit.entries
  }

  const entries: CachedEntry[] = []
  const visited = new Set<string>()

  const walk = (dir: string) => {
    if (visited.has(dir)) return
    visited.add(dir)
    const items = fileTree[dir]
    if (!items) return
    for (const e of items) {
      if (!e.isDir) {
        entries.push({ path: e.path, name: e.path.split(/[\\/]/).pop() || e.path })
      } else {
        walk(e.path)
      }
    }
  }

  walk(rootPath)
  cacheMap.set(fileTree, { rootPath, entries })
  return entries
}

export function fuzzySearchFiles(
  query: string,
  rootPath: string | null,
  fileTree: Record<string, FileEntry[]>,
  recentFiles: string[],
  limit = 50,
): FuzzyResult[] {
  if (!query.trim()) {
    return recentFiles.slice(0, limit).map((p) => ({
      path: p,
      name: p.split(/[\\/]/).pop() || p,
      matches: [],
      score: 0,
    }))
  }

  if (!rootPath) return []

  const allEntries = collectAllFilesCached(rootPath, fileTree)
  const results: FuzzyResult[] = []

  for (const entry of allEntries) {
    const r = fuzzyScore(query, entry.name)
    if (r) {
      results.push({ path: entry.path, name: entry.name, matches: r.matches, score: r.score })
    }
  }

  results.sort((a, b) => b.score - a.score)
  return results.slice(0, limit)
}
