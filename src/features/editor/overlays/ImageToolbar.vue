<script setup lang="ts">
/** 图片工具栏：展示当前对齐方式并向编辑器发出更新事件。 */
import { AlignCenter, AlignLeft, AlignRight } from 'lucide-vue-next'
import type { ImageAlign } from '../../../utils/imageHtml.ts'
import './floating-toolbar.css'

defineProps<{
  align: ImageAlign
  position: { x: number; y: number }
}>()

const emit = defineEmits<{
  align: [value: ImageAlign]
}>()
</script>

<template>
  <div
    class="lume-floating-toolbar lume-image-toolbar"
    role="toolbar"
    aria-label="图片对齐"
    :style="{ left: `${position.x}px`, top: `${position.y}px` }"
    @pointerdown.stop.prevent
  >
    <button type="button" aria-label="左对齐" data-tooltip="左对齐" :class="{ 'is-active': align === 'left' }" @click="emit('align', 'left')">
      <AlignLeft :size="15" :stroke-width="2.1" />
    </button>
    <button type="button" aria-label="居中" data-tooltip="居中" :class="{ 'is-active': align === 'center' }" @click="emit('align', 'center')">
      <AlignCenter :size="15" :stroke-width="2.1" />
    </button>
    <button type="button" aria-label="右对齐" data-tooltip="右对齐" :class="{ 'is-active': align === 'right' }" @click="emit('align', 'right')">
      <AlignRight :size="15" :stroke-width="2.1" />
    </button>
  </div>
</template>

<style scoped>
.lume-image-toolbar {
  width: 90px;
}
</style>