<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import EditorContextMenu from '@/features/editor/overlays/EditorContextMenu.vue'
import type { ContextMenuItem } from '@/features/editor/overlays/contextMenuTypes'
import { constrainOverlayPosition } from '@/features/editor/overlays/overlayPosition'
import { useDocument } from '@/features/documents/model/useDocument'
import { IMAGE_COMMANDS, type ImageCommand } from '../model/imageCommands'
import { getDocumentImageMetadata } from '../model/imageMetadata'
import { imageSettings } from '../model/imageSettings'

const OVERLAY_ID = 'lume-image-menu'
const emit = defineEmits<{ command: [id: ImageCommand] }>()
const { content } = useDocument()
const trigger = ref<HTMLButtonElement | null>(null)
const menu = ref<InstanceType<typeof EditorContextMenu> | null>(null)
const isOpen = ref(false)
const position = ref({ x: 8, y: 32 })
const metadata = computed(() => getDocumentImageMetadata(content.value))
const groups = computed<ContextMenuItem[][]>(() => {
  const command = (id: ImageCommand, active?: boolean): ContextMenuItem => ({
    id,
    label: IMAGE_COMMANDS.find((item) => item.id === id)?.label ?? id,
    active,
  })
  return [
    [command('insertImage'), command('insertLocalImages')],
    [
      command('copyAllImages'),
      command('moveAllImages'),
      command('downloadAllImages'),
      command('uploadAllImages'),
    ],
    [
      {
        id: 'imageRootMenu',
        label: '图片根目录',
        children: [
          command('imageRoot'),
          { ...command('imageRootReset'), disabled: !metadata.value.rootUrl },
        ],
      },
    ],
    [
      {
        id: 'imageInsertionMenu',
        label: '插入图片时',
        children: [
          command('imageRuleGlobal', metadata.value.copyTo === undefined),
          command('imageRuleOriginal', metadata.value.copyTo === ''),
          {
            ...command(
              'imageRuleCopy',
              Boolean(metadata.value.copyTo && metadata.value.copyTo !== 'upload'),
            ),
            disabled: !imageSettings.allowYamlCopy,
            reason: imageSettings.allowYamlCopy
              ? undefined
              : '请先在偏好设置 → 图片中允许根据 YAML 设置复制图片。',
          },
          {
            ...command('imageRuleUpload', metadata.value.copyTo === 'upload'),
            disabled: !imageSettings.allowYamlUpload,
            reason: imageSettings.allowYamlUpload
              ? undefined
              : '请先在偏好设置 → 图片中允许根据 YAML 设置自动上传图片。',
          },
        ],
      },
    ],
  ]
})

const closeMenu = () => {
  isOpen.value = false
}

const handleMenuClose = () => {
  closeMenu()
  trigger.value?.focus()
}

const openMenu = async () => {
  const bounds = trigger.value?.getBoundingClientRect()
  if (!bounds) return
  position.value = { x: bounds.left, y: bounds.bottom + 4 }
  isOpen.value = true
  await nextTick()
  const menuBounds = menu.value?.getBounds()
  if (menuBounds) position.value = constrainOverlayPosition(position.value, menuBounds)
  menu.value?.focusFirstItem()
}

const handleToggle = () => {
  if (isOpen.value) closeMenu()
  else void openMenu()
}

const handleCommand = (id: string) => {
  if (!IMAGE_COMMANDS.some((command) => command.id === id)) return
  closeMenu()
  emit('command', id as ImageCommand)
}

const handleOutsidePointerDown = (event: PointerEvent) => {
  const target = event.target
  if (!(target instanceof Element)) return
  if (trigger.value?.contains(target) || target.closest(`[data-editor-overlay="${OVERLAY_ID}"]`))
    return
  closeMenu()
}

const handleKeydown = (event: KeyboardEvent) => {
  if (!isOpen.value || event.key !== 'Escape') return
  event.preventDefault()
  closeMenu()
  trigger.value?.focus()
}

onMounted(() => {
  document.addEventListener('pointerdown', handleOutsidePointerDown)
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('blur', closeMenu)
  window.addEventListener('resize', closeMenu)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleOutsidePointerDown)
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('blur', closeMenu)
  window.removeEventListener('resize', closeMenu)
})
</script>

<template>
  <button
    ref="trigger"
    class="image-menu-trigger"
    type="button"
    data-tauri-drag-region="false"
    aria-haspopup="menu"
    :aria-expanded="isOpen"
    aria-label="图片菜单"
    @contextmenu.stop.prevent
    @mousedown.prevent
    @click.stop="handleToggle"
    @keydown.down.prevent="openMenu"
  >
    图片
  </button>
  <Teleport to="body">
    <EditorContextMenu
      v-if="isOpen"
      ref="menu"
      :groups="groups"
      :position="position"
      :overlay-id="OVERLAY_ID"
      @close="handleMenuClose"
      @action="handleCommand"
    />
  </Teleport>
</template>

<style scoped>
.image-menu-trigger {
  padding: var(--lume-space-2) var(--lume-space-3);
  border: 0;
  border-radius: var(--lume-radius-sm);
  background: transparent;
  color: var(--lume-text-secondary);
  font: inherit;
  font-size: var(--lume-font-size-sm);
  cursor: default;
}

.image-menu-trigger:hover,
.image-menu-trigger[aria-expanded='true'] {
  background: var(--lume-bg-surface-raised);
  color: var(--lume-text-primary);
}

.image-menu-trigger:focus-visible {
  outline: 2px solid var(--lume-accent-default);
  outline-offset: 2px;
}
</style>
