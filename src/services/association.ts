import { invoke } from '@tauri-apps/api/core'

/** 文件关联状态（与 Rust 侧 AssociationStatus 对应） */
export interface AssociationStatus {
  associated: boolean
  progId: string
  message: string
}

/** 检查 .md 文件是否已关联到本应用 */
export async function checkMdAssociation(): Promise<AssociationStatus> {
  return invoke<AssociationStatus>('check_md_association')
}

/** 写入注册表，将 .md / .markdown 关联到本应用 */
export async function setMdAssociation(): Promise<AssociationStatus> {
  return invoke<AssociationStatus>('set_md_association')
}
