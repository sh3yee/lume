<script setup lang="ts">
/**
 * SettingsDialog - 轻量设置弹窗
 *
 * 使用原生 dialog 提供分类式的应用设置入口。
 */
import { language, languageOptions, setLanguage, t } from '@/app/i18n'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  Braces,
  Columns2,
  Palette,
  Image,
  Monitor,
  Moon,
  Sparkles,
  Sun,
  Type,
  X,
} from 'lucide-vue-next'
import {
  markdownPreferences,
  type MarkdownExtension,
} from '@/app/preferences/useMarkdownPreference'
import ImageSettingsPanel from '@/features/images/components/ImageSettingsPanel.vue'
import type { WritingFont } from '@/app/preferences/useWritingPreference'
import type { ThemePreference } from '@/app/preferences/useThemePreference'
import { resolveFontFamily, type FontPreference } from '@/app/preferences/fontFamily'
import { useSystemFonts, type FontOption } from '@/app/preferences/useSystemFonts'
import { isTauri } from '@/platform/tauri/client'
import InterfaceFontSettings from './InterfaceFontSettings.vue'
import FontSelect from './FontSelect.vue'
import SettingsSelect from './SettingsSelect.vue'

type ViewMode = 'wysiwyg' | 'split'
type WritingWidth = 'compact' | 'comfortable' | 'wide'
type SettingsCategory = 'general' | 'editor' | 'markdown' | 'appearance' | 'images'
interface MarkdownSettingsGroup {
  id: string
  label: string
  hint: string
  extensions: Array<{ id: MarkdownExtension; label: string; description: string }>
}

const fontSizeOptions = Array.from({ length: 21 }, (_, index) => ({
  value: index + 12,
  label: `${index + 12} px`,
}))

const props = defineProps<{
  open: boolean
  viewMode: ViewMode
  theme: ThemePreference
  focusMode: boolean
  writingWidth: WritingWidth
  writingFont: WritingFont
  fontSize: number
  lineHeight: number
  tabsEnabled: boolean
  statusBarEnabled: boolean
  interfaceFont: FontPreference
  interfaceFontSize: number
  outlineFontSize: number
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'update:view-mode', value: ViewMode): void
  (e: 'update:theme', value: ThemePreference): void
  (e: 'update:focus-mode', value: boolean): void
  (e: 'update:writing-width', value: WritingWidth): void
  (e: 'update:writing-font', value: WritingFont): void
  (e: 'update:font-size', value: number): void
  (e: 'update:line-height', value: number): void
  (e: 'update:tabs-enabled', value: boolean): void
  (e: 'update:status-bar-enabled', value: boolean): void
  (e: 'update:interface-font', value: FontPreference): void
  (e: 'update:interface-font-size', value: number): void
  (e: 'update:outline-font-size', value: number): void
}>()

const dialogRef = ref<HTMLDialogElement | null>(null)
const activeCategory = ref<SettingsCategory>('general')
const {
  options: systemFontOptions,
  loading: fontsLoading,
  error: fontsError,
  ensureLoaded: ensureFontsLoaded,
} = useSystemFonts()
const lineHeightOptions = computed(() => [
  { value: 1.4, label: t('紧凑 · 1.4') },
  { value: 1.65, label: t('默认 · 1.65') },
  { value: 1.8, label: t('舒适 · 1.8') },
  { value: 2, label: t('宽松 · 2.0') },
  { value: 2.4, label: t('宽阔 · 2.4') },
])
const markdownSettingsGroups = computed<MarkdownSettingsGroup[]>(() => [
  {
    id: 'syntax',
    label: t('语法支持'),
    hint: t('启用后，将对应的 Markdown 标记显示为格式化内容。'),
    extensions: [
      { id: 'highlight', label: t('高亮'), description: t('使用 ==重点== 标记高亮文字。') },
      { id: 'subscript', label: t('下标'), description: t('使用 H~2~O 显示下标。') },
      { id: 'superscript', label: t('上标'), description: t('使用 X^2^ 显示上标。') },
    ],
  },
  {
    id: 'math-diagrams',
    label: t('公式和图表'),
    hint: t('行内公式可嵌入正文；Mermaid 图表在分栏预览中显示。'),
    extensions: [
      { id: 'inlineMath', label: t('行内公式'), description: t('使用 $x^2$ 在文字中插入公式。') },
      {
        id: 'mermaid',
        label: t('Mermaid 图表'),
        description: t('在预览中将 mermaid 代码块渲染为流程图、时序图等图表。'),
      },
    ],
  },
  {
    id: 'links',
    label: t('链接'),
    hint: t('控制直接输入网址时的显示方式。'),
    extensions: [
      {
        id: 'autoLink',
        label: t('自动识别网址'),
        description: t('将 https://example.com 等裸网址显示为可点击的链接。'),
      },
    ],
  },
  {
    id: 'emoji-alerts',
    label: t('表情和提示块'),
    hint: t('补充常用的表情短代码与 GitHub 风格提示块。'),
    extensions: [
      { id: 'emoji', label: t('表情符号'), description: t('将 :smile: 等短代码显示为表情符号。') },
      {
        id: 'githubAlerts',
        label: t('GitHub 提示块样式'),
        description: t('将 > [!NOTE] 等引用显示为彩色提示块。'),
      },
    ],
  },
])

const categoryMeta = computed<
  Array<{ id: SettingsCategory; label: string; icon: typeof Sparkles }>
>(() => [
  { id: 'general', label: t('常规'), icon: Type },
  { id: 'editor', label: t('编辑'), icon: Sparkles },
  { id: 'markdown', label: 'Markdown', icon: Braces },
  { id: 'images', label: t('图片'), icon: Image },
  { id: 'appearance', label: t('外观'), icon: Palette },
])
const activeCategoryLabel = computed(
  () => categoryMeta.value.find((category) => category.id === activeCategory.value)?.label ?? '',
)

const fontOptions = computed(() => {
  const options = [...systemFontOptions.value]
  // 保留已保存或手动输入的字体，字体列表尚未读取时也能正确回显。
  for (const value of [props.writingFont, props.interfaceFont]) {
    if (!value.startsWith('local:') || options.some((option) => option.value === value)) continue
    options.push({ value, label: value.slice(6) })
  }
  return options satisfies FontOption[]
})
const fontStatus = computed(() => {
  if (fontsError.value) return fontsError.value
  return fontsLoading.value ? t('正在加载字体…') : ''
})

const handleResetTypography = () => {
  emit('update:writing-font', 'serif')
  emit('update:font-size', 15)
  emit('update:line-height', 1.65)
  emit('update:writing-width', 'comfortable')
}

watch(
  () => props.open,
  (open) => {
    if (open && isTauri()) void ensureFontsLoaded()
  },
  { immediate: true },
)

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
    @contextmenu.prevent
  >
    <div class="lume-settings__panel">
      <header class="lume-settings__header">
        <h2 id="settings-title" class="lume-settings__title">
          <span class="lume-settings__title-label">{{ t('偏好设置') }}</span>
          <span class="lume-settings__title-separator" aria-hidden="true">/</span>
          <span class="lume-settings__current-category">{{ activeCategoryLabel }}</span>
        </h2>
        <button
          class="lume-settings__close"
          type="button"
          :aria-label="t('关闭设置')"
          @click="emit('close')"
        >
          <X :size="17" :stroke-width="1.6" />
        </button>
      </header>

      <div class="lume-settings__body">
        <nav class="lume-settings__sidebar" :aria-label="t('设置分类')">
          <button
            v-for="category in categoryMeta"
            :key="category.id"
            type="button"
            class="lume-settings__nav-item"
            :class="{ 'lume-settings__nav-item--active': activeCategory === category.id }"
            :aria-current="activeCategory === category.id ? 'page' : undefined"
            @click="activeCategory = category.id"
          >
            <component :is="category.icon" :size="16" :stroke-width="1.7" />
            <span>{{ category.label }}</span>
          </button>
        </nav>

        <div class="lume-settings__content">
          <section v-if="activeCategory === 'general'" class="lume-settings__section">
            <SettingsSelect
              id="app-language"
              :label="t('系统语言')"
              :description="t('选择界面显示语言，立即生效并自动保存。')"
              :value="language"
              :options="languageOptions"
              :container="dialogRef"
              @change="setLanguage"
            />
          </section>

          <section v-if="activeCategory === 'editor'" class="lume-settings__section">
            <div class="lume-settings__section-heading">
              <h3 class="lume-settings__label">{{ t('编辑模式') }}</h3>
              <p class="lume-settings__hint">{{ t('选择最适合当前写作流程的工作区布局。') }}</p>
            </div>

            <div class="lume-settings__options" role="radiogroup" :aria-label="t('编辑模式')">
              <button
                class="lume-settings__option"
                :class="{ 'lume-settings__option--active': viewMode === 'wysiwyg' }"
                type="button"
                role="radio"
                :aria-checked="viewMode === 'wysiwyg'"
                @click="emit('update:view-mode', 'wysiwyg')"
              >
                <span class="lume-settings__option-icon">
                  <Sparkles :size="19" :stroke-width="1.6" />
                </span>
                <span class="lume-settings__option-copy">
                  <strong>{{ t('所见即所得') }}</strong>
                  <small>{{ t('专注内容，直接编辑最终效果') }}</small>
                </span>
                <span class="lume-settings__check"></span>
              </button>

              <button
                class="lume-settings__option"
                :class="{ 'lume-settings__option--active': viewMode === 'split' }"
                type="button"
                role="radio"
                :aria-checked="viewMode === 'split'"
                @click="emit('update:view-mode', 'split')"
              >
                <span class="lume-settings__option-icon">
                  <Columns2 :size="19" :stroke-width="1.6" />
                </span>
                <span class="lume-settings__option-copy">
                  <strong>{{ t('分栏预览') }}</strong>
                  <small>{{ t('同时查看 Markdown 源码与渲染结果') }}</small>
                </span>
                <span class="lume-settings__check"></span>
              </button>
            </div>
          </section>

          <section
            v-if="activeCategory === 'editor'"
            class="lume-settings__section lume-settings__section--divided"
          >
            <button
              type="button"
              class="lume-settings__option lume-settings__option--toggle"
              :class="{ 'lume-settings__option--active': tabsEnabled }"
              role="switch"
              :aria-checked="tabsEnabled"
              :aria-label="t('显示文档标签栏')"
              aria-describedby="tabs-setting-description"
              @click="emit('update:tabs-enabled', !tabsEnabled)"
            >
              <span class="lume-settings__option-copy">
                <strong>{{ t('显示文档标签栏') }}</strong>
                <small id="tabs-setting-description">
                  {{
                    t(
                      '在标题栏切换多个文档，默认启用。关闭后显示当前文件标题，不会关闭已打开的文档。',
                    )
                  }}
                </small>
              </span>
              <span class="lume-settings__check" aria-hidden="true"></span>
            </button>
            <button
              type="button"
              class="lume-settings__option lume-settings__option--toggle"
              :class="{ 'lume-settings__option--active': statusBarEnabled }"
              role="switch"
              :aria-checked="statusBarEnabled"
              :aria-label="t('显示状态栏')"
              aria-describedby="status-bar-setting-description"
              @click="emit('update:status-bar-enabled', !statusBarEnabled)"
            >
              <span class="lume-settings__option-copy">
                <strong>{{ t('显示状态栏') }}</strong>
                <small id="status-bar-setting-description">
                  {{ t('在窗口底部显示行列位置、字数、字符数和阅读时长，默认开启。') }}
                </small>
              </span>
              <span class="lume-settings__check" aria-hidden="true"></span>
            </button>
          </section>

          <template v-if="activeCategory === 'markdown'">
            <section
              v-for="(group, index) in markdownSettingsGroups"
              :key="group.id"
              class="lume-settings__section"
              :class="{ 'lume-settings__section--divided': index > 0 }"
              :aria-labelledby="`markdown-settings-${group.id}`"
            >
              <div class="lume-settings__section-heading">
                <h3 :id="`markdown-settings-${group.id}`" class="lume-settings__label">
                  {{ group.label }}
                </h3>
                <p class="lume-settings__hint">{{ group.hint }}</p>
              </div>
              <div class="lume-settings__options lume-settings__options--stacked">
                <template v-for="extension in group.extensions" :key="extension.id">
                  <button
                    type="button"
                    class="lume-settings__option lume-settings__option--toggle"
                    role="switch"
                    :aria-checked="markdownPreferences.enabled[extension.id]"
                    :aria-label="extension.label"
                    :aria-describedby="`markdown-description-${extension.id}`"
                    :class="{
                      'lume-settings__option--active': markdownPreferences.enabled[extension.id],
                    }"
                    @click="
                      markdownPreferences.enabled[extension.id] =
                        !markdownPreferences.enabled[extension.id]
                    "
                  >
                    <span class="lume-settings__option-copy">
                      <strong>{{ extension.label }}</strong>
                      <small :id="`markdown-description-${extension.id}`">
                        {{ extension.description }}
                      </small>
                    </span>
                    <span class="lume-settings__check" aria-hidden="true"></span>
                  </button>
                  <button
                    v-if="extension.id === 'emoji'"
                    type="button"
                    class="lume-settings__option lume-settings__option--toggle"
                    role="switch"
                    :aria-label="t('自动触发表情符号补全')"
                    aria-describedby="markdown-emoji-completion-description"
                    :aria-checked="markdownPreferences.emojiCompletion === 'auto'"
                    :disabled="!markdownPreferences.enabled.emoji"
                    :class="{
                      'lume-settings__option--active':
                        markdownPreferences.emojiCompletion === 'auto',
                    }"
                    @click="
                      markdownPreferences.emojiCompletion =
                        markdownPreferences.emojiCompletion === 'auto' ? 'manual' : 'auto'
                    "
                  >
                    <span class="lume-settings__option-copy">
                      <strong>{{ t('自动触发表情符号补全') }}</strong>
                      <small id="markdown-emoji-completion-description">
                        {{
                          t(
                            '输入冒号和名称时自动显示建议；关闭后按 Esc 手动触发，用 ↑ / ↓ 选择，按 Enter 或 Tab 确认。需先启用表情符号。',
                          )
                        }}
                      </small>
                    </span>
                    <span class="lume-settings__check" aria-hidden="true"></span>
                  </button>
                </template>
              </div>
            </section>
          </template>

          <section
            v-if="activeCategory === 'editor'"
            class="lume-settings__section lume-settings__section--divided"
          >
            <div class="lume-settings__section-heading">
              <h3 class="lume-settings__label">{{ t('写作模式') }}</h3>
              <p class="lume-settings__hint">
                {{ t('切换到更聚焦的界面，减少侧栏和多余信息的干扰。') }}
              </p>
            </div>

            <div class="lume-settings__options" role="radiogroup" :aria-label="t('写作模式')">
              <button
                class="lume-settings__option"
                :class="{ 'lume-settings__option--active': !focusMode }"
                type="button"
                role="radio"
                :aria-checked="!focusMode"
                @click="emit('update:focus-mode', false)"
              >
                <span class="lume-settings__option-icon">
                  <Columns2 :size="19" :stroke-width="1.6" />
                </span>
                <span class="lume-settings__option-copy">
                  <strong>{{ t('常规模式') }}</strong>
                  <small>{{ t('保留侧栏和标签，适合多文档浏览') }}</small>
                </span>
                <span class="lume-settings__check"></span>
              </button>

              <button
                class="lume-settings__option"
                :class="{ 'lume-settings__option--active': focusMode }"
                type="button"
                role="radio"
                :aria-checked="focusMode"
                @click="emit('update:focus-mode', true)"
              >
                <span class="lume-settings__option-icon">
                  <Sparkles :size="19" :stroke-width="1.6" />
                </span>
                <span class="lume-settings__option-copy">
                  <strong>{{ t('专注模式') }}</strong>
                  <small>{{ t('隐藏侧栏与标签，最大化写作区域') }}</small>
                </span>
                <span class="lume-settings__check"></span>
              </button>
            </div>
          </section>

          <section
            v-if="activeCategory === 'general'"
            class="lume-settings__section lume-settings__section--divided"
          >
            <div class="lume-settings__section-heading">
              <h3 class="lume-settings__label">{{ t('正文排版') }}</h3>
              <p class="lume-settings__hint">
                {{ t('只调整正文编辑和预览，自动保存。界面与大纲文字在“外观”中单独设置。') }}
              </p>
            </div>

            <div class="lume-settings__typography">
              <FontSelect
                id="writing-font"
                :label="t('正文字体')"
                :value="writingFont"
                :options="fontOptions"
                :container="dialogRef"
                :status="fontStatus"
                @open="ensureFontsLoaded"
                @change="emit('update:writing-font', $event)"
              />
              <SettingsSelect
                id="writing-font-size"
                :label="t('正文字号')"
                :value="fontSize"
                :options="fontSizeOptions"
                :container="dialogRef"
                @change="emit('update:font-size', $event)"
              />
              <SettingsSelect
                id="writing-line-height"
                :label="t('正文行距')"
                :value="lineHeight"
                :options="lineHeightOptions"
                :container="dialogRef"
                @change="emit('update:line-height', $event)"
              />
              <div class="lume-settings__inline-group">
                <span class="lume-settings__inline-label">{{ t('正文宽度') }}</span>
                <div
                  class="lume-settings__mini-options"
                  role="radiogroup"
                  :aria-label="t('正文宽度')"
                >
                  <button
                    class="lume-settings__mini-option"
                    :class="{ 'lume-settings__mini-option--active': writingWidth === 'compact' }"
                    type="button"
                    role="radio"
                    :aria-checked="writingWidth === 'compact'"
                    @click="emit('update:writing-width', 'compact')"
                  >
                    {{ t('紧凑') }}
                  </button>
                  <button
                    class="lume-settings__mini-option"
                    :class="{
                      'lume-settings__mini-option--active': writingWidth === 'comfortable',
                    }"
                    type="button"
                    role="radio"
                    :aria-checked="writingWidth === 'comfortable'"
                    @click="emit('update:writing-width', 'comfortable')"
                  >
                    {{ t('舒适') }}
                  </button>
                  <button
                    class="lume-settings__mini-option"
                    :class="{ 'lume-settings__mini-option--active': writingWidth === 'wide' }"
                    type="button"
                    role="radio"
                    :aria-checked="writingWidth === 'wide'"
                    @click="emit('update:writing-width', 'wide')"
                  >
                    {{ t('宽屏') }}
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section
            v-if="activeCategory === 'general'"
            class="lume-settings__section lume-settings__section--divided"
          >
            <h3 class="lume-settings__label">{{ t('排版预览') }}</h3>
            <p
              class="lume-settings__font-preview"
              :style="{
                fontFamily: resolveFontFamily(writingFont),
                fontSize: `${fontSize}px`,
                lineHeight,
              }"
            >
              {{ t('让文字自然流动，让想法清晰呈现。') }}<br />A quiet space to write, refine, and
              share.
            </p>
            <button class="lume-settings__mini-option" type="button" @click="handleResetTypography">
              {{ t('恢复默认排版') }}
            </button>
          </section>

          <section v-if="activeCategory === 'appearance'" class="lume-settings__section">
            <div class="lume-settings__section-heading">
              <h3 class="lume-settings__label">{{ t('外观主题') }}</h3>
              <p class="lume-settings__hint">{{ t('选择浅色、深色，或自动跟随系统外观。') }}</p>
            </div>

            <div class="lume-settings__theme-options" role="radiogroup" :aria-label="t('外观主题')">
              <button
                class="lume-settings__theme-option"
                :class="{ 'lume-settings__theme-option--active': theme === 'system' }"
                type="button"
                role="radio"
                :aria-checked="theme === 'system'"
                @click="emit('update:theme', 'system')"
              >
                <Monitor :size="17" :stroke-width="1.6" />
                <span>{{ t('跟随系统') }}</span>
              </button>
              <button
                class="lume-settings__theme-option"
                :class="{ 'lume-settings__theme-option--active': theme === 'light' }"
                type="button"
                role="radio"
                :aria-checked="theme === 'light'"
                @click="emit('update:theme', 'light')"
              >
                <Sun :size="17" :stroke-width="1.6" />
                <span>{{ t('浅色') }}</span>
              </button>
              <button
                class="lume-settings__theme-option"
                :class="{ 'lume-settings__theme-option--active': theme === 'dark' }"
                type="button"
                role="radio"
                :aria-checked="theme === 'dark'"
                @click="emit('update:theme', 'dark')"
              >
                <Moon :size="17" :stroke-width="1.6" />
                <span>{{ t('深色') }}</span>
              </button>
            </div>
          </section>

          <InterfaceFontSettings
            v-if="activeCategory === 'appearance'"
            :font="interfaceFont"
            :font-size="interfaceFontSize"
            :outline-font-size="outlineFontSize"
            :font-options="fontOptions"
            :container="dialogRef"
            :font-status="fontStatus"
            @open-fonts="ensureFontsLoaded"
            @update:font="emit('update:interface-font', $event)"
            @update:font-size="emit('update:interface-font-size', $event)"
            @update:outline-font-size="emit('update:outline-font-size', $event)"
          />

          <ImageSettingsPanel v-if="activeCategory === 'images'" />

          <footer class="lume-settings__footer">
            <span>{{ t('快捷键') }}</span>
            <kbd>Ctrl</kbd><span>+</span><kbd>,</kbd>
          </footer>
        </div>
      </div>
    </div>
  </dialog>
</template>

<style scoped>
.lume-settings__font-preview {
  margin: 0;
  padding: var(--lume-space-5);
  border: 1px solid var(--lume-border-subtle);
  border-radius: var(--lume-radius-md);
  overflow-wrap: anywhere;
}

.lume-settings {
  --lume-settings-control-width: 220px;
  position: fixed;
  top: 50%;
  left: 50%;
  width: min(800px, calc(100vw - 40px));
  max-height: calc(100vh - 40px);
  margin: 0;
  padding: 0;
  overflow: hidden;
  transform: translate(-50%, -50%);
  border: 1px solid var(--lume-glass-edge);
  border-radius: var(--lume-radius-xl);
  background: transparent;
  color: var(--lume-text-primary);
  box-shadow:
    inset 0 1px 0 var(--lume-glass-rim),
    var(--lume-shadow-lg);
}

.lume-settings::backdrop {
  background-color: rgba(10, 10, 10, 0.38);
  backdrop-filter: blur(5px);
}

.lume-settings__panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  max-height: calc(100vh - 40px);
}

.lume-settings__header {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  gap: var(--lume-space-5);
  min-height: 46px;
  padding: var(--lume-space-3) var(--lume-space-6);
  border-bottom: 1px solid color-mix(in srgb, var(--lume-border-subtle) 55%, transparent);
  border-radius: var(--lume-radius-xl) var(--lume-radius-xl) 0 0;
  background-color: color-mix(in srgb, var(--lume-bg-overlay) 96%, transparent);
  background-image: linear-gradient(
    105deg,
    var(--lume-accent-subtle) 0%,
    color-mix(in srgb, var(--lume-accent-subtle) 30%, transparent) 36%,
    transparent 70%
  );
  box-shadow: inset 0 1px 0 var(--lume-glass-rim);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.lume-settings__title {
  display: flex;
  min-width: 0;
  align-items: baseline;
  gap: var(--lume-space-4);
  margin: 0;
  font-size: calc(var(--lume-font-size-base) + 2px);
  font-weight: var(--lume-font-weight-medium);
  line-height: 1.4;
}

.lume-settings__title-label {
  flex-shrink: 0;
}

.lume-settings__title-separator {
  flex-shrink: 0;
  color: var(--lume-border-strong);
  font-size: var(--lume-font-size-base);
  font-weight: var(--lume-font-weight-regular);
}

.lume-settings__current-category {
  min-width: 0;
  overflow: hidden;
  color: var(--lume-text-secondary);
  font-size: var(--lume-font-size-sm);
  font-weight: var(--lume-font-weight-regular);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lume-settings__hint {
  margin: var(--lume-space-2) 0 0;
  color: var(--lume-text-tertiary);
  font-size: var(--lume-font-size-xs);
  line-height: var(--lume-line-height-normal);
}

.lume-settings__close {
  flex-shrink: 0;
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
  transition:
    background-color var(--lume-transition-fast),
    color var(--lume-transition-fast);
}

.lume-settings__close:hover {
  background-color: var(--lume-bg-surface-raised);
  color: var(--lume-text-primary);
}

.lume-settings__body {
  display: flex;
  min-height: 0;
  height: 420px;
}

.lume-settings__sidebar {
  flex: 0 0 144px;
  width: 144px;
  padding: var(--lume-space-4) var(--lume-space-3);
  overflow-y: auto;
  border-right: 1px solid color-mix(in srgb, var(--lume-border-subtle) 55%, transparent);
  border-bottom-left-radius: var(--lume-radius-xl);
  background-color: color-mix(in srgb, var(--lume-chrome-bg) 96%, transparent);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.lume-settings__nav-item {
  width: 100%;
  min-height: 36px;
  display: inline-flex;
  align-items: center;
  gap: var(--lume-space-3);
  padding: var(--lume-space-3);
  margin-bottom: var(--lume-space-2);
  border: 1px solid transparent;
  border-radius: var(--lume-radius-md);
  background: transparent;
  color: var(--lume-text-secondary);
  font-size: var(--lume-font-size-sm);
  cursor: pointer;
  text-align: left;
  white-space: nowrap;
  transition:
    background-color var(--lume-transition-fast),
    color var(--lume-transition-fast);
}

.lume-settings__nav-item > svg {
  flex-shrink: 0;
}

.lume-settings__nav-item:hover {
  background: color-mix(in srgb, var(--lume-text-primary) 6%, transparent);
  color: var(--lume-text-primary);
}

.lume-settings__nav-item--active {
  background: var(--lume-accent-subtle);
  color: var(--lume-accent-default);
  font-weight: var(--lume-font-weight-medium);
}

.lume-settings__nav-item:focus-visible {
  outline: 2px solid var(--lume-accent-default);
  outline-offset: -2px;
}

.lume-settings__content {
  container: lume-settings-content / inline-size;
  flex: 1;
  min-width: 0;
  min-height: 0;
  padding: var(--lume-space-5) var(--lume-space-7);
  overflow-y: auto;
  background-color: var(--lume-bg-surface);
}

@supports not (backdrop-filter: blur(1px)) {
  .lume-settings__header {
    background: var(--lume-bg-overlay);
  }

  .lume-settings__sidebar {
    background: var(--lume-bg-surface-raised);
  }
}

@media (prefers-reduced-transparency: reduce) {
  .lume-settings__header,
  .lume-settings__sidebar {
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  .lume-settings__header {
    background: var(--lume-bg-surface);
  }

  .lume-settings__sidebar {
    background: var(--lume-bg-surface-raised);
  }
}

.lume-settings__section {
  display: flex;
  flex-direction: column;
  gap: var(--lume-space-4);
}

.lume-settings__section-heading {
  width: 100%;
}

.lume-settings__section--divided {
  margin-top: var(--lume-space-6);
  padding-top: var(--lume-space-6);
  border-top: 1px solid var(--lume-border-subtle);
}

.lume-settings__label {
  margin: 0;
  font-size: var(--lume-font-size-base);
  font-weight: var(--lume-font-weight-semibold);
}

.lume-settings__options {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--lume-space-3);
}

.lume-settings__options--stacked {
  grid-template-columns: 1fr;
}

.lume-settings__typography {
  display: flex;
  flex-direction: column;
}

.lume-settings__inline-group {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, var(--lume-settings-control-width));
  min-height: 52px;
  align-items: center;
  gap: var(--lume-space-6);
  padding: var(--lume-space-3) 0;
}

.lume-settings__inline-label {
  color: var(--lume-text-primary);
  font-size: var(--lume-font-size-sm);
  font-weight: var(--lume-font-weight-medium);
}

.lume-settings__mini-options {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--lume-space-2);
}

.lume-settings__mini-option {
  align-self: flex-start;
  min-width: 0;
  min-height: 30px;
  padding: 0 var(--lume-space-3);
  border: 1px solid var(--lume-border-default);
  border-radius: var(--lume-radius-md);
  background: var(--lume-bg-surface-raised);
  color: var(--lume-text-secondary);
  font-size: var(--lume-font-size-sm);
  cursor: pointer;
  transition:
    border-color var(--lume-transition-fast),
    background-color var(--lume-transition-fast),
    color var(--lume-transition-fast);
}

.lume-settings__mini-option:hover {
  border-color: var(--lume-border-strong);
  color: var(--lume-text-primary);
}

.lume-settings__mini-option--active {
  border-color: var(--lume-accent-default);
  background: var(--lume-accent-subtle);
  color: var(--lume-accent-default);
}
.lume-settings__option {
  min-height: 80px;
  display: flex;
  align-items: center;
  gap: var(--lume-space-3);
  padding: var(--lume-space-4);
  border: 1px solid var(--lume-border-default);
  border-radius: var(--lume-radius-md);
  background-color: var(--lume-bg-surface-raised);
  color: var(--lume-text-primary);
  text-align: left;
  cursor: pointer;
  transition:
    border-color var(--lume-transition-fast),
    background-color var(--lume-transition-fast),
    box-shadow var(--lume-transition-fast),
    transform var(--lume-transition-fast);
}

.lume-settings__option:hover {
  border-color: var(--lume-border-strong);
  transform: translateY(-1px);
}

.lume-settings__option--toggle {
  min-height: 64px;
}

.lume-settings__option:disabled {
  opacity: 0.5;
  cursor: default;
  transform: none;
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
  flex: 0 0 28px;
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--lume-radius-md);
  background-color: var(--lume-bg-surface);
  color: var(--lume-accent-default);
  box-shadow: var(--lume-shadow-xs);
}

.lume-settings__option-icon > svg,
.lume-settings__theme-option > svg {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
}

.lume-settings__option-copy {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: var(--lume-space-2);
  overflow-wrap: anywhere;
}

.lume-settings__option-copy strong {
  font-size: var(--lume-font-size-sm);
  font-weight: var(--lume-font-weight-medium);
}

.lume-settings__option-copy small {
  color: var(--lume-text-tertiary);
  font-size: var(--lume-font-size-xs);
  line-height: var(--lume-line-height-normal);
}

.lume-settings__check {
  flex: 0 0 9px;
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
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  gap: var(--lume-space-3);
}

.lume-settings__theme-option {
  width: 100%;
  min-width: 0;
  min-height: 56px;
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
  transition:
    border-color var(--lume-transition-fast),
    background-color var(--lume-transition-fast),
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
  margin-top: var(--lume-space-5);
  padding-top: var(--lume-space-4);
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

@container lume-settings-content (max-width: 420px) {
  .lume-settings__inline-group {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--lume-space-3);
  }
}

@media (max-width: 560px) {
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
