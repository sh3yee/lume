import { computed } from 'vue'
import { t } from '@/app/i18n'
export const IMAGE_COMMANDS = computed(
  () =>
    [
      { id: 'insertImage', label: t('插入图片'), hint: 'Ctrl+Shift+I' },
      { id: 'insertLocalImages', label: t('插入本地图片…') },
      { id: 'copyAllImages', label: t('复制所有图片到…') },
      { id: 'moveAllImages', label: t('移动所有图片到…') },
      { id: 'downloadAllImages', label: t('下载所有网络图片到…') },
      { id: 'uploadAllImages', label: t('上传所有本地图片') },
      { id: 'imageRoot', label: t('设置图片根目录…') },
      { id: 'imageRootReset', label: t('移除图片根目录') },
      { id: 'imageRuleCopy', label: t('复制图片到文件夹…') },
      { id: 'imageRuleUpload', label: t('上传图片') },
      { id: 'imageRuleOriginal', label: t('保留图片原始位置') },
      { id: 'imageRuleGlobal', label: t('使用全局设置') },
    ] as const,
)

export type ImageCommand = (typeof IMAGE_COMMANDS.value)[number]['id']
