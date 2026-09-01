<script setup lang="ts">
/**
 * SettingsDialog - 轻量设置弹窗
 *
 * 使用原生 dialog 提供分类式的应用设置入口。
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { AlignJustify, Columns2, Droplets, Monitor, Moon, Sparkles, Sun, Type, X } from 'lucide-vue-next'

type ViewMode = 'wysiwyg' | 'split'
type ThemePreference = 'system' | 'light' | 'dark' | 'glass'
type WritingWidth = 'compact' | 'comfortable' | 'wide'
type FontScale = 'small' | 'medium' | 'large'
type SettingsCategory = 'editor' | 'writing' | 'appearance'

const props = defineProps<{
  open: boolean
  viewMode: ViewMode
  theme: ThemePreference
  focusMode: boolean
  writingWidth: WritingWidth
  fontScale: FontScale
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'update:view-mode', value: ViewMode): void
  (e: 'update:theme', value: ThemePreference): void
  (e: 'update:focus-mode', value: boolean): void
  (e: 'update:writing-width', value: WritingWidth): void
  (e: 'update:font-scale', value: FontScale): void
}>()

const dialogRef = ref<HTMLDialogElement | null>(null)
const activeCategory = ref<SettingsCategory>('editor')
const categoryMeta: Array<{ id: SettingsCategory; label: string; icon: typeof Sparkles }> = [
  { id: 'editor', label: '编辑', icon: Sparkles },
  { id: 'writing', label: '写作', icon: Type },
  { id: 'appearance', label: '外观', icon: Droplets },
]

watch(
  () => props.open,
  (open) => {
    const dialog = dialogRef.value
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  },
)

function handleCancel(event: Event) {
  event.preventDefault()
  emit('close')
}

function handleBackdropClick(event: MouseEvent) {
  if (event.target === dialogRef.value) emit('close')
}

onMounted(() => {
  if (props.open) dialogRef.value?.showModal()
})

onBeforeUnmount(() => dialogRef.value?.close())
</script>

<template>
  <dialog
    ref="dialogRef"
    class="lume-settings"
    aria-labelledby="settings-title"
    @cancel="handleCancel"
    @click="handleBackdropClick"
    @close="emit('close')"
  >
    <div class="lume-settings__panel">
      <header class="lume-settings__header">
        <div class="lume-settings__heading">
          <span class="lume-settings__eyebrow">Lume Preferences</span>
          <h2 id="settings-title" class="lume-settings__title">偏好设置</h2>
          <p class="lume-settings__description">让写作空间更符合你的习惯。</p>
        </div>
        <button class="lume-settings__close" type="button" aria-label="关闭设置" @click="emit('close')">
          <X :size="17" :stroke-width="1.6" />
        </button>
      </header>

      <div class="lume-settings__body">
        <nav class="lume-settings__sidebar" aria-label="设置分类">
          <button v-for="category in categoryMeta" :key="category.id" type="button" class="lume-settings__nav-item"
            :class="{ 'lume-settings__nav-item--active': activeCategory === category.id }"
            @click="activeCategory = category.id">
            <component :is="category.icon" :size="16" :stroke-width="1.7" />
            <span>{{ category.label }}</span>
          </button>
        </nav>

        <div class="lume-settings__content">
          <section v-if="activeCategory === 'editor'" class="lume-settings__section">
            <div class="lume-settings__section-heading">
              <h3 class="lume-settings__label">编辑模式</h3>
              <p class="lume-settings__hint">选择最适合当前写作流程的工作区布局。</p>
            </div>

            <div class="lume-settings__options" role="radiogroup" aria-label="编辑模式">
              <button class="lume-settings__option" :class="{ 'lume-settings__option--active': viewMode === 'wysiwyg' }"
                type="button" role="radio" :aria-checked="viewMode === 'wysiwyg'"
                @click="emit('update:view-mode', 'wysiwyg')">
                <span class="lume-settings__option-icon">
                  <Sparkles :size="19" :stroke-width="1.6" />
                </span>
                <span class="lume-settings__option-copy">
                  <strong>所见即所得</strong>
                  <small>专注内容，直接编辑最终效果</small>
                </span>
                <span class="lume-settings__check"></span>
              </button>

              <button class="lume-settings__option" :class="{ 'lume-settings__option--active': viewMode === 'split' }"
                type="button" role="radio" :aria-checked="viewMode === 'split'"
                @click="emit('update:view-mode', 'split')">
                <span class="lume-settings__option-icon">
                  <Columns2 :size="19" :stroke-width="1.6" />
                </span>
                <span class="lume-settings__option-copy">
                  <strong>分栏预览</strong>
                  <small>同时查看 Markdown 源码与渲染结果</small>
                </span>
                <span class="lume-settings__check"></span>
              </button>
            </div>
          </section>

          <section v-if="activeCategory === 'editor'" class="lume-settings__section lume-settings__section--divided">
            <div class="lume-settings__section-heading">
              <h3 class="lume-settings__label">写作模式</h3>
              <p class="lume-settings__hint">切换到更聚焦的界面，减少侧栏和多余信息的干扰。</p>
            </div>

            <div class="lume-settings__options" role="radiogroup" aria-label="写作模式">
              <button class="lume-settings__option" :class="{ 'lume-settings__option--active': !focusMode }"
                type="button" role="radio" :aria-checked="!focusMode" @click="emit('update:focus-mode', false)">
                <span class="lume-settings__option-icon">
                  <Columns2 :size="19" :stroke-width="1.6" />
                </span>
                <span class="lume-settings__option-copy">
                  <strong>常规模式</strong>
                  <small>保留侧栏和标签，适合多文档浏览</small>
                </span>
                <span class="lume-settings__check"></span>
              </button>

              <button class="lume-settings__option" :class="{ 'lume-settings__option--active': focusMode }"
                type="button" role="radio" :aria-checked="focusMode" @click="emit('update:focus-mode', true)">
                <span class="lume-settings__option-icon">
                  <Sparkles :size="19" :stroke-width="1.6" />
                </span>
                <span class="lume-settings__option-copy">
                  <strong>专注模式</strong>
                  <small>隐藏侧栏与标签，最大化写作区域</small>
                </span>
                <span class="lume-settings__check"></span>
              </button>
            </div>
          </section>

          <section v-if="activeCategory === 'writing'" class="lume-settings__section">
            <div class="lume-settings__section-heading">
              <h3 class="lume-settings__label">阅读习惯</h3>
              <p class="lume-settings__hint">调整正文宽度和字号，让长文在屏幕上更舒服地阅读和编辑。</p>
            </div>

            <div class="lume-settings__options lume-settings__options--stacked">
              <div class="lume-settings__inline-group">
                <span class="lume-settings__inline-label">正文宽度</span>
                <div class="lume-settings__mini-options" role="radiogroup" aria-label="正文宽度">
                  <button class="lume-settings__mini-option"
                    :class="{ 'lume-settings__mini-option--active': writingWidth === 'compact' }" type="button"
                    role="radio" :aria-checked="writingWidth === 'compact'"
                    @click="emit('update:writing-width', 'compact')">紧凑</button>
                  <button class="lume-settings__mini-option"
                    :class="{ 'lume-settings__mini-option--active': writingWidth === 'comfortable' }" type="button"
                    role="radio" :aria-checked="writingWidth === 'comfortable'"
                    @click="emit('update:writing-width', 'comfortable')">舒适</button>
                  <button class="lume-settings__mini-option"
                    :class="{ 'lume-settings__mini-option--active': writingWidth === 'wide' }" type="button"
                    role="radio" :aria-checked="writingWidth === 'wide'"
                    @click="emit('update:writing-width', 'wide')">宽屏</button>
                </div>
              </div>

              <div class="lume-settings__inline-group">
                <span class="lume-settings__inline-label">正文字号</span>
                <div class="lume-settings__mini-options" role="radiogroup" aria-label="正文字号">
                  <button class="lume-settings__mini-option"
                    :class="{ 'lume-settings__mini-option--active': fontScale === 'small' }" type="button" role="radio"
                    :aria-checked="fontScale === 'small'" @click="emit('update:font-scale', 'small')">小</button>
                  <button class="lume-settings__mini-option"
                    :class="{ 'lume-settings__mini-option--active': fontScale === 'medium' }" type="button" role="radio"
                    :aria-checked="fontScale === 'medium'" @click="emit('update:font-scale', 'medium')">中</button>
                  <button class="lume-settings__mini-option"
                    :class="{ 'lume-settings__mini-option--active': fontScale === 'large' }" type="button" role="radio"
                    :aria-checked="fontScale === 'large'" @click="emit('update:font-scale', 'large')">大</button>
                </div>
              </div>
            </div>
          </section>

          <section v-if="activeCategory === 'appearance'" class="lume-settings__section">
            <div class="lume-settings__section-heading">
              <h3 class="lume-settings__label">外观主题</h3>
              <p class="lume-settings__hint">选择舒适的界面配色，毛玻璃主题会朦胧透出窗口后方内容。</p>
            </div>

            <div class="lume-settings__theme-options" role="radiogroup" aria-label="外观主题">
              <button class="lume-settings__theme-option"
                :class="{ 'lume-settings__theme-option--active': theme === 'system' }" type="button" role="radio"
                :aria-checked="theme === 'system'" @click="emit('update:theme', 'system')">
                <Monitor :size="17" :stroke-width="1.6" />
                <span>跟随系统</span>
              </button>
              <button class="lume-settings__theme-option"
                :class="{ 'lume-settings__theme-option--active': theme === 'light' }" type="button" role="radio"
                :aria-checked="theme === 'light'" @click="emit('update:theme', 'light')">
                <Sun :size="17" :stroke-width="1.6" />
                <span>浅色</span>
              </button>
              <button class="lume-settings__theme-option"
                :class="{ 'lume-settings__theme-option--active': theme === 'dark' }" type="button" role="radio"
                :aria-checked="theme === 'dark'" @click="emit('update:theme', 'dark')">
                <Moon :size="17" :stroke-width="1.6" />
                <span>深色</span>
              </button>
              <button class="lume-settings__theme-option"
                :class="{ 'lume-settings__theme-option--active': theme === 'glass' }" type="button" role="radio"
                :aria-checked="theme === 'glass'" @click="emit('update:theme', 'glass')">
                <Droplets :size="17" :stroke-width="1.6" />
                <span>毛玻璃</span>
              </button>
            </div>
          </section>

          <footer class="lume-settings__footer">
            <span>快捷键</span>
            <kbd>Ctrl</kbd><span>+</span><kbd>,</kbd>
          </footer>
        </div>
      </div>
    </div>
  </dialog>
</template>

<style scoped>
.lume-settings {
  position: fixed;
  top: 50%;
  left: 50%;
  width: min(860px, calc(100vw - 40px));
  max-height: calc(100vh - 40px);
  margin: 0;
  padding: 0;
  overflow: hidden;
  transform: translate(-50%, -50%);
  border: 1px solid color-mix(in srgb, var(--lume-border-default) 75%, transparent);
  border-radius: var(--lume-radius-xl);
  background: transparent;
  color: var(--lume-text-primary);
  box-shadow: var(--lume-shadow-xl);
}

.lume-settings::backdrop {
  background-color: rgba(10, 10, 10, 0.38);
  backdrop-filter: blur(5px);
}

.lume-settings__panel {
  display: flex;
    flex-direction: column;
    min-height: 0;
  background-color: var(--lume-bg-surface);
}

.lume-settings__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: var(--lume-space-8) var(--lume-space-8) var(--lume-space-6);
  background: linear-gradient(135deg, var(--lume-accent-subtle), transparent 55%);
}

.lume-settings__heading {
  display: flex;
  flex-direction: column;
}

.lume-settings__eyebrow {
  margin-bottom: var(--lume-space-3);
  color: var(--lume-accent-default);
  font-size: 10px;
  font-weight: var(--lume-font-weight-semibold);
  letter-spacing: 1.4px;
  text-transform: uppercase;
}

.lume-settings__title {
  margin: 0;
  font-size: var(--lume-font-size-2xl);
  font-weight: var(--lume-font-weight-semibold);
  letter-spacing: -0.4px;
}

.lume-settings__description,
.lume-settings__hint {
  margin: var(--lume-space-3) 0 0;
  color: var(--lume-text-tertiary);
  font-size: var(--lume-font-size-sm);
}

.lume-settings__close {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  border-radius: var(--lume-radius-md);
  background: transparent;
  color: var(--lume-text-tertiary);
  cursor: pointer;
}

.lume-settings__close:hover {
  background-color: var(--lume-bg-surface-raised);
  color: var(--lume-text-primary);
}

.lume-settings__body {
  display: flex;
  min-height: 420px;
  height: 420px;
}

.lume-settings__sidebar {
  width: 180px;
  padding: var(--lume-space-4) var(--lume-space-3);
  border-right: 1px solid var(--lume-border-subtle);
  background: var(--lume-bg-surface-raised);
}

.lume-settings__nav-item {
  width: 100%;
  display: inline-flex;
  align-items: center;
  gap: var(--lume-space-3);
  padding: var(--lume-space-3) var(--lume-space-4);
  margin-bottom: var(--lume-space-2);
  border: 1px solid transparent;
  border-radius: var(--lume-radius-md);
  background: transparent;
  color: var(--lume-text-secondary);
  cursor: pointer;
  text-align: left;
  transition: background-color var(--lume-transition-fast), border-color var(--lume-transition-fast), color var(--lume-transition-fast);
}

.lume-settings__nav-item:hover {
  background: var(--lume-bg-surface);
  color: var(--lume-text-primary);
}

.lume-settings__nav-item--active {
  border-color: var(--lume-accent-default);
  background: var(--lume-accent-subtle);
  color: var(--lume-accent-default);
}
.lume-settings__content {
  flex: 1;
    min-height: 0;
  padding: var(--lume-space-6) var(--lume-space-8) var(--lume-space-7);
  overflow-y: auto;
}

.lume-settings__section {
  display: flex;
  flex-direction: column;
  gap: var(--lume-space-5);
}

.lume-settings__section-heading {
  width: 100%;
}

.lume-settings__section--divided {
  margin-top: var(--lume-space-7);
  padding-top: var(--lume-space-6);
  border-top: 1px solid var(--lume-border-subtle);
}

.lume-settings__label {
  margin: 0;
  font-size: var(--lume-font-size-md);
  font-weight: var(--lume-font-weight-semibold);
}

.lume-settings__options {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--lume-space-4);
}

.lume-settings__options--stacked {
  grid-template-columns: 1fr;
}

.lume-settings__inline-group {
  display: flex;
  flex-direction: column;
  gap: var(--lume-space-3);
}

.lume-settings__inline-label {
  color: var(--lume-text-secondary);
  font-size: var(--lume-font-size-sm);
  font-weight: var(--lume-font-weight-medium);
}

.lume-settings__mini-options {
  display: flex;
  gap: var(--lume-space-3);
  flex-wrap: wrap;
}

.lume-settings__mini-option {
  min-width: 72px;
  min-height: 36px;
  padding: 0 var(--lume-space-4);
  border: 1px solid var(--lume-border-default);
  border-radius: var(--lume-radius-md);
  background: var(--lume-bg-surface-raised);
  color: var(--lume-text-secondary);
  cursor: pointer;
  transition: border-color var(--lume-transition-fast), background-color var(--lume-transition-fast), color var(--lume-transition-fast);
}

.lume-settings__mini-option:hover {
  border-color: var(--lume-border-strong);
  color: var(--lume-text-primary);
}

.lume-settings__mini-option--active {
  border-color: var(--lume-accent-default);
  background: var(--lume-accent-subtle);
  color: var(--lume-accent-default);
  box-shadow: 0 0 0 1px var(--lume-accent-default);
}
.lume-settings__option {
  position: relative;
  min-height: 118px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--lume-space-4);
  padding: var(--lume-space-5);
  border: 1px solid var(--lume-border-default);
  border-radius: var(--lume-radius-lg);
  background-color: var(--lume-bg-surface-raised);
  color: var(--lume-text-primary);
  text-align: left;
  cursor: pointer;
  transition: border-color var(--lume-transition-fast), background-color var(--lume-transition-fast),
    box-shadow var(--lume-transition-fast), transform var(--lume-transition-fast);
}

.lume-settings__option:hover {
  border-color: var(--lume-border-strong);
  transform: translateY(-1px);
}

.lume-settings__option--active {
  border-color: var(--lume-accent-default);
  background-color: var(--lume-accent-subtle);
  box-shadow: 0 0 0 1px var(--lume-accent-default);
}

.lume-settings__option:focus-visible,
.lume-settings__theme-option:focus-visible,
.lume-settings__close:focus-visible {
  outline: 2px solid var(--lume-accent-default);
  outline-offset: 2px;
}

.lume-settings__option-icon {
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--lume-radius-md);
  background-color: var(--lume-bg-surface);
  color: var(--lume-accent-default);
  box-shadow: var(--lume-shadow-xs);
}

.lume-settings__option-copy {
  display: flex;
  flex-direction: column;
  gap: var(--lume-space-2);
}

.lume-settings__option-copy strong {
  font-size: var(--lume-font-size-base);
  font-weight: var(--lume-font-weight-semibold);
}

.lume-settings__option-copy small {
  color: var(--lume-text-tertiary);
  font-size: var(--lume-font-size-xs);
  line-height: var(--lume-line-height-normal);
}

.lume-settings__check {
  position: absolute;
  top: var(--lume-space-5);
  right: var(--lume-space-5);
  width: 9px;
  height: 9px;
  border: 1px solid var(--lume-border-strong);
  border-radius: var(--lume-radius-full);
  background-color: var(--lume-bg-surface);
}

.lume-settings__option--active .lume-settings__check {
  border: 2px solid var(--lume-bg-surface);
  background-color: var(--lume-accent-default);
  box-shadow: 0 0 0 1px var(--lume-accent-default);
}

.lume-settings__theme-options {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(4, minmax(110px, 1fr));
  gap: var(--lume-space-3);
}

.lume-settings__theme-option {
  width: 100%;
    min-width: 0;
    min-height: 80px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--lume-space-3);
  padding: 0 var(--lume-space-4);
  border: 1px solid var(--lume-border-default);
  border-radius: var(--lume-radius-md);
  background-color: var(--lume-bg-surface-raised);
  color: var(--lume-text-secondary);
  font-size: var(--lume-font-size-sm);
  cursor: pointer;
  white-space: nowrap;
  transition: border-color var(--lume-transition-fast), background-color var(--lume-transition-fast),
    color var(--lume-transition-fast);
}

.lume-settings__theme-option span {
  display: inline-block;
  overflow: hidden;
  text-overflow: ellipsis;
}
.lume-settings__theme-option:hover {
  border-color: var(--lume-border-strong);
  color: var(--lume-text-primary);
}

.lume-settings__theme-option--active {
  border-color: var(--lume-accent-default);
  background-color: var(--lume-accent-subtle);
  color: var(--lume-accent-default);
  box-shadow: 0 0 0 1px var(--lume-accent-default);
}

.lume-settings__footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--lume-space-2);
  margin-top: var(--lume-space-7);
  padding-top: var(--lume-space-5);
  border-top: 1px solid var(--lume-border-subtle);
  color: var(--lume-text-tertiary);
  font-size: var(--lume-font-size-xs);
}

.lume-settings__footer kbd {
  min-width: 22px;
  padding: 2px 5px;
  border: 1px solid var(--lume-border-default);
  border-bottom-color: var(--lume-border-strong);
  border-radius: var(--lume-radius-sm);
  background-color: var(--lume-bg-surface-raised);
  color: var(--lume-text-secondary);
  font-family: var(--lume-font-sans);
  text-align: center;
  box-shadow: 0 1px 0 var(--lume-border-subtle);
}

@media (max-width: 560px) {
  .lume-settings__header,
  .lume-settings__content {
    padding-right: var(--lume-space-6);
    padding-left: var(--lume-space-6);
  }

  .lume-settings__options {
    grid-template-columns: 1fr;
  }

  .lume-settings__theme-options {
    grid-template-columns: 1fr;
  }
}
</style>