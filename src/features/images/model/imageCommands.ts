export const IMAGE_COMMANDS = [
  { id: 'insertImage', label: '插入图片', hint: 'Ctrl+Shift+I' },
  { id: 'insertLocalImages', label: '插入本地图片…' },
  { id: 'copyAllImages', label: '复制所有图片到…' },
  { id: 'moveAllImages', label: '移动所有图片到…' },
  { id: 'downloadAllImages', label: '下载所有网络图片到…' },
  { id: 'uploadAllImages', label: '上传所有本地图片' },
  { id: 'imageRoot', label: '设置图片根目录…' },
  { id: 'imageRootReset', label: '移除图片根目录' },
  { id: 'imageRuleCopy', label: '复制图片到文件夹…' },
  { id: 'imageRuleUpload', label: '上传图片' },
  { id: 'imageRuleOriginal', label: '保留图片原始位置' },
  { id: 'imageRuleGlobal', label: '使用全局设置' },
] as const

export type ImageCommand = (typeof IMAGE_COMMANDS)[number]['id']
