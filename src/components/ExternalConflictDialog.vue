<script setup lang="ts">
/** 外部文件变化冲突弹窗：任何选择都不会静默丢弃本地修改。 */
defineProps<{
  fileName: string
  deleted: boolean
}>()

const emit = defineEmits<{
  keep: []
  reload: []
}>()
</script>

<template>
  <Teleport to="body">
    <div class="lume-conflict" role="presentation">
      <section class="lume-conflict__dialog" role="alertdialog" aria-modal="true">
        <h2>文件在外部发生变化</h2>
        <p v-if="deleted"><strong>{{ fileName }}</strong> 已在外部删除。本地内容仍保留，可继续编辑并自动重新创建文件。</p>
        <p v-else><strong>{{ fileName }}</strong> 已被其他程序修改。请选择保留本地修改或从磁盘重新加载。</p>
        <div class="lume-conflict__actions">
          <button type="button" @click="emit('keep')">保留我的修改</button>
          <button v-if="!deleted" class="lume-conflict__primary" type="button" @click="emit('reload')">从磁盘重新加载</button>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.lume-conflict { position: fixed; inset: 0; z-index: var(--lume-z-modal); display: grid; place-items: center; padding: var(--lume-space-6); background: rgba(10, 10, 10, 0.34); backdrop-filter: blur(5px); }
.lume-conflict__dialog { width: min(420px, 100%); padding: var(--lume-space-5); border: 1px solid var(--lume-border-default); border-radius: var(--lume-radius-lg); background: var(--lume-bg-surface); box-shadow: var(--lume-shadow-lg); }
.lume-conflict h2 { margin: 0; color: var(--lume-text-primary); font-size: var(--lume-font-size-base); }
.lume-conflict p { margin: var(--lume-space-3) 0 0; color: var(--lume-text-secondary); font-size: var(--lume-font-size-sm); line-height: 1.6; }
.lume-conflict__actions { display: flex; justify-content: flex-end; gap: var(--lume-space-2); margin-top: var(--lume-space-5); }
.lume-conflict button { height: 32px; padding: 0 var(--lume-space-4); border: 1px solid var(--lume-border-default); border-radius: var(--lume-radius-md); background: var(--lume-bg-surface-raised); color: var(--lume-text-secondary); cursor: pointer; }
.lume-conflict__primary { border-color: var(--lume-accent-default) !important; background: var(--lume-accent-default) !important; color: var(--lume-accent-contrast) !important; }
</style>