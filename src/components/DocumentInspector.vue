<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { vLiquidGlass } from '@/ui/glass/directive'
import { useInterfacePreference } from '@/app/preferences/useInterfacePreference'
import { useDocument } from '@/features/documents/model/useDocument'
import {
  useDocumentOutline,
  type DocumentOutlineItem,
} from '@/features/editor/composables/useDocumentOutline'

interface OutlineNode {
  item: DocumentOutlineItem
  children: OutlineNode[]
}

const { activeDocument, stats } = useDocument()
const { outlineItems, navigateToHeading } = useDocumentOutline()
const { interfaceFont, interfaceFontSize, outlineFontSize } = useInterfacePreference()
const inspectorRef = ref<HTMLElement | null>(null)
const activePanel = ref<'outline' | 'stats'>('outline')
const selectedHeading = ref<number | null>(null)
const viewportWidth = ref(window.innerWidth)
const manualWidth = ref<number | null>(null)
const measuredWidth = ref(220)
let resizeStartX = 0
let resizeStartWidth = 0
const resizing = ref(false)
let measureContext: CanvasRenderingContext2D | null = null

const currentHeading = computed(() => selectedHeading.value ?? outlineItems.value[0]?.index ?? null)
const maxWidth = computed(() => Math.max(180, Math.min(420, Math.floor(viewportWidth.value * 0.4))))
const panelWidth = computed(() =>
  Math.max(180, Math.min(manualWidth.value ?? measuredWidth.value, maxWidth.value)),
)
const statistics = computed(() => [
  { label: '字数', value: stats.value.words.toLocaleString() },
  { label: '字符', value: stats.value.chars.toLocaleString() },
  { label: '行数', value: stats.value.lines.toLocaleString() },
  { label: '阅读时长', value: `约 ${stats.value.readingTime} 分钟` },
])
const outlineRows = computed(() => {
  const roots: OutlineNode[] = []
  const parents: OutlineNode[] = []
  for (const item of outlineItems.value) {
    while (parents.length && parents[parents.length - 1].item.level >= item.level) parents.pop()
    const node: OutlineNode = { item, children: [] }
    const siblings = parents.length ? parents[parents.length - 1].children : roots
    siblings.push(node)
    parents.push(node)
  }

  const rows: {
    item: DocumentOutlineItem
    depth: number
    guides: { branch: boolean; continues: boolean }[]
  }[] = []
  const visit = (nodes: OutlineNode[], ancestors: boolean[], depth: number) => {
    nodes.forEach((node, index) => {
      const continues = index < nodes.length - 1
      const guides = ancestors.map((continuation) => ({ branch: false, continues: continuation }))
      if (depth) guides.push({ branch: true, continues })
      rows.push({ item: node.item, depth, guides })
      visit(node.children, depth ? [...ancestors, continues] : [], depth + 1)
    })
  }
  visit(roots, [], 0)
  return rows
})

const measureOutlineWidth = () => {
  const context = measureContext
  const headings = inspectorRef.value?.querySelectorAll<HTMLButtonElement>(
    '.lume-document-inspector__heading',
  )
  if (!context || !headings?.length) return

  const outlineStyle = getComputedStyle(headings[0].parentElement!)
  const outlinePadding =
    Number.parseFloat(outlineStyle.paddingLeft) + Number.parseFloat(outlineStyle.paddingRight)
  let width = 220
  headings.forEach((heading) => {
    const style = getComputedStyle(heading)
    context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
    const padding = Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight)
    width = Math.max(
      width,
      Math.ceil(
        context.measureText(heading.textContent?.trim() || '').width +
          padding +
          outlinePadding +
          16,
      ),
    )
  })
  measuredWidth.value = Math.min(320, width)
}

const updateViewportWidth = () => {
  viewportWidth.value = window.innerWidth
}

const startResize = (event: PointerEvent) => {
  if (event.button !== 0 || !event.isPrimary) return
  resizeStartX = event.clientX
  resizeStartWidth = panelWidth.value
  resizing.value = true
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  event.preventDefault()
}

const resizePanel = (event: PointerEvent) => {
  if (!resizing.value) return
  manualWidth.value = Math.max(
    180,
    Math.min(maxWidth.value, resizeStartWidth + resizeStartX - event.clientX),
  )
}

const finishResize = (event: PointerEvent) => {
  resizing.value = false
  const handle = event.currentTarget as HTMLElement
  if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId)
}

const resizeWithKeyboard = (event: KeyboardEvent) => {
  if (event.key === 'Home' || event.key === 'Enter') manualWidth.value = null
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    manualWidth.value = Math.max(
      180,
      Math.min(maxWidth.value, panelWidth.value + (event.key === 'ArrowLeft' ? 16 : -16)),
    )
  } else return
  event.preventDefault()
}

const handleHeadingClick = async (index: number) => {
  const target = outlineItems.value[index]
  if ((await navigateToHeading(index)) && outlineItems.value[index] === target) {
    selectedHeading.value = index
  }
}

watch(
  [outlineRows, interfaceFont, interfaceFontSize, outlineFontSize, activePanel],
  measureOutlineWidth,
  { flush: 'post' },
)
watch(
  () => activeDocument.value?.id,
  () => {
    selectedHeading.value = null
  },
)

watch(outlineItems, () => {
  selectedHeading.value = null
})

onMounted(() => {
  measureContext = document.createElement('canvas').getContext('2d')
  measureOutlineWidth()
  window.addEventListener('resize', updateViewportWidth)
  document.fonts.addEventListener('loadingdone', measureOutlineWidth)
  void document.fonts.ready.then(measureOutlineWidth)
})
onBeforeUnmount(() => {
  measureContext = null
  window.removeEventListener('resize', updateViewportWidth)
  document.fonts.removeEventListener('loadingdone', measureOutlineWidth)
})
</script>

<template>
  <aside
    v-liquid-glass
    ref="inspectorRef"
    class="lume-document-inspector lume-side-glass"
    :style="{ width: `${panelWidth}px` }"
    aria-label="文档信息"
  >
    <div
      class="lume-document-inspector__resize"
      :class="{ 'lume-document-inspector__resize--active': resizing }"
      role="separator"
      aria-orientation="vertical"
      aria-label="调整大纲宽度"
      :aria-valuenow="panelWidth"
      :aria-valuemin="180"
      :aria-valuemax="maxWidth"
      tabindex="0"
      title="拖动调整宽度，双击恢复自适应"
      @pointerdown="startResize"
      @pointermove="resizePanel"
      @pointerup="finishResize"
      @pointercancel="finishResize"
      @lostpointercapture="resizing = false"
      @dblclick="manualWidth = null"
      @keydown="resizeWithKeyboard"
    ></div>
    <div class="lume-document-inspector__tabs" aria-label="文档信息视图">
      <button
        class="lume-document-inspector__tab"
        :class="{ 'lume-document-inspector__tab--active': activePanel === 'outline' }"
        type="button"
        :aria-pressed="activePanel === 'outline'"
        @click="activePanel = 'outline'"
      >
        大纲
      </button>
      <button
        class="lume-document-inspector__tab"
        :class="{ 'lume-document-inspector__tab--active': activePanel === 'stats' }"
        type="button"
        :aria-pressed="activePanel === 'stats'"
        @click="activePanel = 'stats'"
      >
        统计
      </button>
    </div>

    <nav
      v-if="activePanel === 'outline'"
      class="lume-document-inspector__content"
      aria-label="文档大纲"
    >
      <div v-if="outlineItems.length" class="lume-document-inspector__outline">
        <button
          v-for="{ item, depth, guides } in outlineRows"
          :key="`${item.index}-${item.text}`"
          class="lume-document-inspector__heading"
          :class="{
            'lume-document-inspector__heading--active': currentHeading === item.index,
            'lume-document-inspector__heading--root': depth === 0,
          }"
          :style="{ '--outline-depth': depth }"
          type="button"
          :title="item.text || '无标题'"
          :aria-current="currentHeading === item.index ? 'location' : undefined"
          @click="handleHeadingClick(item.index)"
        >
          <span
            v-for="(guide, guideIndex) in guides"
            :key="guideIndex"
            class="lume-document-inspector__guide"
            :class="{
              'lume-document-inspector__guide--branch': guide.branch,
              'lume-document-inspector__guide--continues': guide.continues,
            }"
            :style="{ '--guide-depth': guideIndex }"
            aria-hidden="true"
          ></span>
          {{ item.text || '无标题' }}
        </button>
      </div>
      <div v-else class="lume-document-inspector__empty">
        <p>暂无大纲</p>
        <span>添加标题后在此显示</span>
      </div>
    </nav>

    <section v-else class="lume-document-inspector__content" aria-label="文档统计">
      <dl class="lume-document-inspector__statistics">
        <div v-for="item in statistics" :key="item.label">
          <dt>{{ item.label }}</dt>
          <dd>{{ item.value }}</dd>
        </div>
      </dl>
    </section>
  </aside>
</template>

<style scoped>
.lume-document-inspector {
  position: relative;
  min-width: 0;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  overflow: hidden;
  border-left: 0;
  background: transparent;
}

.lume-document-inspector__resize {
  position: absolute;
  z-index: 2;
  inset: 0 auto 0 0;
  width: 6px;
  cursor: col-resize;
  touch-action: none;
}

.lume-document-inspector__resize:hover,
.lume-document-inspector__resize:focus-visible,
.lume-document-inspector__resize--active {
  background: var(--lume-accent-subtle);
  box-shadow: inset 2px 0 var(--lume-accent-default);
  outline: none;
}

.lume-document-inspector__tabs {
  min-height: 40px;
  flex-shrink: 0;
  display: flex;
  align-items: stretch;
  gap: 18px;
  margin: 0 16px;
  border-bottom: 1px solid var(--lume-panel-border, var(--lume-border-subtle));
}

.lume-document-inspector__tab {
  position: relative;
  padding: 0 1px;
  border: 0;
  background: transparent;
  color: var(--lume-text-tertiary);
  font-size: var(--lume-font-size-xs);
  cursor: pointer;
}

.lume-document-inspector__tab--active {
  color: var(--lume-text-primary);
  font-weight: var(--lume-font-weight-semibold);
}

.lume-document-inspector__tab--active::after {
  position: absolute;
  right: 0;
  bottom: -1px;
  left: 0;
  height: 2px;
  border-radius: var(--lume-radius-full);
  background: var(--lume-accent-default);
  content: '';
}

.lume-document-inspector__content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 8px 0;
}

.lume-document-inspector__outline {
  position: relative;
  padding: 0 10px;
}

.lume-document-inspector__heading {
  position: relative;
  width: 100%;
  min-height: 32px;
  display: block;
  margin-bottom: 0;
  overflow: hidden;
  padding: 4px 10px 4px calc(10px + var(--outline-depth, 0) * 20px);
  border: 0;
  border-radius: var(--lume-radius-md);
  background: transparent;
  color: var(--lume-text-secondary);
  font-size: var(--lume-outline-font-size);
  line-height: 1.6;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}

.lume-document-inspector__heading--root {
  color: var(--lume-text-primary);
  font-weight: var(--lume-font-weight-semibold);
}

.lume-document-inspector__guide {
  position: absolute;
  inset-block: 0;
  left: calc(14px + var(--guide-depth) * 20px);
  width: 10px;
  color: var(--lume-border-strong);
  pointer-events: none;
}

.lume-document-inspector__guide--branch::before,
.lume-document-inspector__guide--continues::before {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 1px;
  background: currentColor;
  content: '';
}

.lume-document-inspector__guide--branch:not(.lume-document-inspector__guide--continues)::before {
  bottom: 50%;
}

.lume-document-inspector__guide--branch::after {
  position: absolute;
  top: 50%;
  left: 0;
  width: 6px;
  height: 1px;
  background: currentColor;
  content: '';
}

.lume-document-inspector__heading:hover {
  background: var(--lume-bg-surface-raised);
  color: var(--lume-text-primary);
}

.lume-document-inspector__heading--active,
.lume-document-inspector__heading--active:hover {
  background: var(--lume-accent-subtle);
  color: var(--lume-accent-default);
  font-weight: var(--lume-font-weight-medium);
}

.lume-document-inspector__tab:focus-visible,
.lume-document-inspector__heading:focus-visible {
  outline: 2px solid var(--lume-accent-default);
  outline-offset: -2px;
}

.lume-document-inspector__empty {
  padding: 28px 6px;
  color: var(--lume-text-tertiary);
  font-size: var(--lume-font-size-xs);
  line-height: 1.7;
  text-align: center;
}

.lume-document-inspector__empty p {
  margin: 0 0 4px;
  color: var(--lume-text-secondary);
}

.lume-document-inspector__statistics {
  margin: 0 16px;
}

.lume-document-inspector__statistics div {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: baseline;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--lume-panel-border, var(--lume-border-subtle));
}

.lume-document-inspector__statistics div:last-child {
  border-bottom: 0;
}

.lume-document-inspector__statistics dt {
  color: var(--lume-text-tertiary);
  font-size: var(--lume-font-size-xs);
  line-height: 1.6;
}

.lume-document-inspector__statistics dd {
  margin: 0;
  color: var(--lume-text-primary);
  font-size: var(--lume-font-size-sm);
  font-weight: var(--lume-font-weight-medium);
  font-variant-numeric: tabular-nums;
  line-height: 1.6;
  text-align: right;
  overflow-wrap: anywhere;
}
</style>
