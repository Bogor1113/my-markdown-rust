import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { useAppStore } from '../stores/useAppStore'
import type { FsChangeEvent } from '../types'

/** 开始递归监听目录（Rust 侧），目录变化会推送 file-changed 事件 */
export async function watchDirectory(path: string): Promise<void> {
  await invoke('watch_directory', { path })
}

/** 停止目录监听 */
export async function stopWatching(): Promise<void> {
  await invoke('stop_watching')
}

// 事件防抖+节流：一次保存/批量操作会连续产生多条事件（notify 在 Windows 上
// 一次写入会触发数据+元数据多个 Modify）。既要合并（300ms 静默后处理一批），
// 又要在持续事件流（编译/日志写入/系统索引）下限频：两次处理的最小间隔按
// THROTTLE_MS 保证，避免每 300ms 都跑一遍 listDirectory+readFile+React setState
// 的重量级链路（静止/最小化时 CPU 占用的主要来源之一）。
const DEBOUNCE_MS = 300
const THROTTLE_MS = 1200
// 事件风暴时丢弃中间态，只保留最新 80 条再处理：handleFsEvent 是全量重扫
// （listDirectory + 重读标签），丢中间状态不会丢最终状态，只是少跑几轮。
const MAX_KEEP = 80

let pendingEvents: FsChangeEvent[] = []
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let lastFlush = 0

/** 冲刷当前积压的事件批次并交给 store 处理 */
function flush() {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  if (pendingEvents.length === 0) return
  const batch = pendingEvents
  pendingEvents = []
  void useAppStore.getState().handleFsEvent(batch)
}

/** 调度一次冲刷：合并 300ms 内的静默批次，同时保证两次冲刷间隔 ≥ THROTTLE_MS */
function schedule() {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  if (pendingEvents.length === 0) return
  const elapsed = Date.now() - lastFlush
  const wait = elapsed >= THROTTLE_MS ? DEBOUNCE_MS : THROTTLE_MS - elapsed
  debounceTimer = setTimeout(() => {
    lastFlush = Date.now()
    flush()
  }, wait)
}

/** 注册 file-changed 监听，返回取消函数 */
export async function setupFsWatcher(): Promise<UnlistenFn> {
  return listen<FsChangeEvent>('file-changed', (event) => {
    pendingEvents.push(event.payload)
    // 事件风暴防护：积压超过上限时丢弃旧批次尾部，防止内存膨胀与持续高频处理
    if (pendingEvents.length > MAX_KEEP) {
      pendingEvents = pendingEvents.slice(-MAX_KEEP)
    }
    schedule()
  })
}
