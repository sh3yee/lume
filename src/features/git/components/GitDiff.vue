<script setup lang="ts">
import { computed } from 'vue'
import { t } from '@/app/i18n'
import { parseDiffLines } from '../diffLines'

const props = defineProps<{ content: string; loading?: boolean; plain?: boolean }>()
const diff = computed(() => parseDiffLines(props.content))
const markers = { added: '+', removed: '−' }
</script>

<template>
  <div class="lume-git__diff" tabindex="0" :aria-label="t('版本内容')" :aria-busy="loading">
    <p v-if="loading" class="lume-git__empty">{{ t('正在读取…') }}</p>
    <p v-else-if="!content" class="lume-git__empty">{{ t('没有可显示的文本差异') }}</p>
    <pre v-else-if="plain"><code class="lume-git__plain-content">{{ content }}</code></pre>
    <div
      v-else
      class="lume-git__patch"
      :style="{ '--lume-git-line-number-width': diff.lineNumberWidth }"
    >
      <div
        v-for="(line, index) in diff.lines"
        :key="index"
        class="lume-git__line"
        :class="{
          'lume-git__line--numbered': line.before !== undefined || line.after !== undefined,
        }"
        :data-kind="line.kind"
      >
        <template v-if="line.before !== undefined || line.after !== undefined">
          <span class="lume-git__line-number">{{ line.before }}</span>
          <span class="lume-git__line-number">{{ line.after }}</span>
          <span class="lume-git__line-marker">
            {{ line.kind === 'added' || line.kind === 'removed' ? markers[line.kind] : '' }}
          </span>
        </template>
        <span class="lume-git__line-text">{{ line.text }}</span>
      </div>
    </div>
  </div>
</template>
