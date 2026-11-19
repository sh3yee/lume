import {
  Copy,
  File,
  FileCog,
  FileMinus2,
  FilePenLine,
  FilePlus2,
  FileSymlink,
  FileWarning,
} from 'lucide-vue-next'
import type { Component } from 'vue'
import type { MessageKey } from '@/app/i18n'

interface FileIndicator {
  icon: Component
  label: MessageKey
  tone?: 'added' | 'alert'
}

const defaultIndicator: FileIndicator = { icon: File, label: '变更' }
const fileIndicators: Partial<Record<string, FileIndicator>> = {
  '?': { icon: FilePlus2, label: '未跟踪', tone: 'added' },
  A: { icon: FilePlus2, label: '已新增', tone: 'added' },
  M: { icon: FilePenLine, label: '已修改' },
  D: { icon: FileMinus2, label: '已删除', tone: 'alert' },
  R: { icon: FileSymlink, label: '已重命名' },
  C: { icon: Copy, label: '已复制' },
  T: { icon: FileCog, label: '文件类型已更改' },
  U: { icon: FileWarning, label: '未合并', tone: 'alert' },
}

export const gitFileIndicator = (status: string): FileIndicator =>
  fileIndicators[status.charAt(0)] ?? defaultIndicator
