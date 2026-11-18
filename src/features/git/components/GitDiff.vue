<script setup lang="ts">
import { computed } from 'vue'
import { t } from '@/app/i18n'

const props = defineProps<{ content: string; loading?: boolean; plain?: boolean }>()
const lines = computed(() =>
  props.content.split('\n').map((text) => ({
    text,
    kind: props.plain
      ? ''
      : text.startsWith('@@')
        ? 'hunk'
        : text.startsWith('+')
          ? 'added'
          : text.startsWith('-')
            ? 'removed'
            : '',
  })),
)
</script>

<template>
  <div class="lume-git__diff" tabindex="0" :aria-label="t('版本内容')" :aria-busy="loading">
    <p v-if="loading" class="lume-git__empty">{{ t('正在读取…') }}</p>
    <p v-else-if="!content" class="lume-git__empty">{{ t('没有可显示的文本差异') }}</p>
    <pre v-else><code><span
      v-for="(line, index) in lines"
      :key="index"
      class="lume-git__line"
      :class="line.kind && `lume-git__line--${line.kind}`"
    >{{ line.text }}</span></code></pre>
  </div>
</template>
