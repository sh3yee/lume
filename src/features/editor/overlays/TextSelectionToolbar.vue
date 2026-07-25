<script setup lang="ts">
/** 文本选区工具栏：只发出格式命令，不直接依赖 Milkdown。 */
import { Bold, Code, Copy, Italic, RemoveFormatting } from 'lucide-vue-next'
import './floating-toolbar.css'

defineProps<{
  inCodeBlock: boolean
  position: { x: number; y: number }
}>()

const emit = defineEmits<{
  clearFormatting: []
  copy: []
  toggleBold: []
  toggleInlineCode: []
  toggleItalic: []
}>()
</script>

<template>
  <div
    class="lume-floating-toolbar"
    role="toolbar"
    aria-label="选中文本格式"
    :style="{ left: `${position.x}px`, top: `${position.y}px` }"
    @pointerdown.stop.prevent
  >
    <template v-if="!inCodeBlock">
      <button type="button" aria-label="加粗" data-tooltip="加粗" @click="emit('toggleBold')">
        <Bold :size="15" :stroke-width="2.25" />
      </button>
      <button type="button" aria-label="斜体" data-tooltip="斜体" @click="emit('toggleItalic')">
        <Italic :size="15" :stroke-width="2.25" />
      </button>
      <button type="button" aria-label="行内代码" data-tooltip="行内代码" @click="emit('toggleInlineCode')">
        <Code :size="15" :stroke-width="2.1" />
      </button>
      <div class="lume-floating-toolbar__separator" role="separator"></div>
      <button type="button" aria-label="清除行内格式" data-tooltip="清除行内格式" @click="emit('clearFormatting')">
        <RemoveFormatting :size="15" :stroke-width="2.1" />
      </button>
    </template>
    <button type="button" aria-label="复制" data-tooltip="复制" @click="emit('copy')">
      <Copy :size="15" :stroke-width="2.1" />
    </button>
  </div>
</template>