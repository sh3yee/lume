<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { Download, ExternalLink, LoaderCircle, RefreshCw, RotateCw } from 'lucide-vue-next'
import { appInfo } from '@/app/appInfo'
import { t } from '@/app/i18n'
import appIcon from '../../../src-tauri/icons/128x128.png'
import { isTauri } from '@/platform/tauri/client'
import { openWebUrl } from '@/platform/tauri/system'
import { useAppUpdater } from './useAppUpdater'

const { supported, status, update, error, busy, downloadPercent, check, download, install } =
  useAppUpdater()
const linkError = shallowRef('')

const statusMessage = computed(() => {
  if (!supported) return t('在线更新仅适用于桌面应用。')
  if (status.value === 'checking') return t('正在检查更新…')
  if (status.value === 'latest') return t('当前已是最新版本。')
  if (status.value === 'available') return t('发现新版本 v{0}', update.value?.version ?? '')
  if (status.value === 'downloading') {
    return downloadPercent.value === null
      ? t('正在下载更新…')
      : t('正在下载更新… {0}%', downloadPercent.value)
  }
  if (status.value === 'ready') return t('更新已下载，可以安装并重启。')
  if (status.value === 'installing') return t('正在安装更新，即将重启…')
  return t('检查是否有可用的新版本。')
})

const handleOpenUrl = async (url: string) => {
  linkError.value = ''
  try {
    if (isTauri()) await openWebUrl(url)
    else window.open(url, '_blank', 'noopener,noreferrer')
  } catch {
    linkError.value = t('无法打开网页，请稍后重试。')
  }
}
</script>

<template>
  <div class="lume-about">
    <header class="lume-about__brand">
      <img class="lume-about__logo" :src="appIcon" alt="" aria-hidden="true" />
      <div>
        <h3 class="lume-about__name">{{ appInfo.name }}</h3>
        <p class="lume-about__tagline">{{ t('为文字留一束安静的光。') }}</p>
      </div>
    </header>

    <dl class="lume-about__metadata">
      <div class="lume-about__row">
        <dt>{{ t('版本') }}</dt>
        <dd>v{{ appInfo.version }}</dd>
      </div>
      <div class="lume-about__row">
        <dt>{{ t('作者') }}</dt>
        <dd>
          <a
            :href="appInfo.authorUrl"
            target="_blank"
            rel="noopener noreferrer"
            @click.prevent="handleOpenUrl(appInfo.authorUrl)"
          >
            {{ appInfo.author }}
            <ExternalLink :size="12" aria-hidden="true" />
          </a>
        </dd>
      </div>
      <div class="lume-about__row">
        <dt>{{ t('许可证') }}</dt>
        <dd>
          <a
            :href="`${appInfo.repositoryUrl}/blob/main/LICENSE.md`"
            target="_blank"
            rel="noopener noreferrer"
            @click.prevent="handleOpenUrl(`${appInfo.repositoryUrl}/blob/main/LICENSE.md`)"
          >
            {{ appInfo.license }}
          </a>
          <span class="lume-about__license-hint">{{ t('仅限非商业用途') }}</span>
        </dd>
      </div>
    </dl>

    <section class="lume-about__updates" aria-labelledby="app-update-title" :aria-busy="busy">
      <h4 id="app-update-title" class="lume-about__section-title">{{ t('软件更新') }}</h4>
      <div class="lume-about__update-content">
        <div class="lume-about__update-controls">
          <p class="lume-about__status" role="status" aria-live="polite">{{ statusMessage }}</p>
          <button
            v-if="status === 'ready' || status === 'installing'"
            class="lume-about__button"
            type="button"
            :disabled="busy"
            @click="install"
          >
            <LoaderCircle v-if="status === 'installing'" class="lume-about__spinner" :size="14" />
            <RotateCw v-else :size="14" />
            {{ status === 'installing' ? t('正在安装…') : t('安装并重启') }}
          </button>
          <button
            v-else-if="status === 'available' || status === 'downloading'"
            class="lume-about__button"
            type="button"
            :disabled="busy"
            @click="download"
          >
            <LoaderCircle v-if="status === 'downloading'" class="lume-about__spinner" :size="14" />
            <Download v-else :size="14" />
            {{ status === 'downloading' ? t('正在下载…') : t('下载更新') }}
          </button>
          <button
            v-else
            class="lume-about__button"
            type="button"
            :disabled="busy || !supported"
            @click="check"
          >
            <RefreshCw :size="14" :class="{ 'lume-about__spinner': status === 'checking' }" />
            {{ status === 'checking' ? t('正在检查…') : t('检查更新') }}
          </button>
        </div>
        <progress
          v-if="status === 'downloading'"
          class="lume-about__progress"
          :value="downloadPercent ?? undefined"
          max="100"
          :aria-label="t('更新下载进度')"
        />
        <p v-if="error" class="lume-about__error" role="alert">{{ error }}</p>
        <p v-if="status === 'ready' || status === 'installing'" class="lume-about__hint">
          {{ t('下载完成后可安装并重启，当前编辑会话将在重启后恢复。') }}
        </p>
        <details v-if="update?.notes" class="lume-about__release-notes">
          <summary>{{ t('更新说明') }}</summary>
          <p class="lume-about__notes">{{ update.notes }}</p>
        </details>
      </div>
    </section>

    <div class="lume-about__row">
      <h4 class="lume-about__section-title">{{ t('相关链接') }}</h4>
      <nav class="lume-about__links" :aria-label="t('相关链接')">
        <a
          :href="appInfo.repositoryUrl"
          target="_blank"
          rel="noopener noreferrer"
          @click.prevent="handleOpenUrl(appInfo.repositoryUrl)"
        >
          {{ t('项目主页') }}
          <ExternalLink :size="12" aria-hidden="true" />
        </a>
        <a
          :href="appInfo.releasesUrl"
          target="_blank"
          rel="noopener noreferrer"
          @click.prevent="handleOpenUrl(appInfo.releasesUrl)"
        >
          {{ t('发布页面') }}
          <ExternalLink :size="12" aria-hidden="true" />
        </a>
      </nav>
    </div>
    <p v-if="linkError" class="lume-about__error" role="alert">{{ linkError }}</p>
  </div>
</template>

<style scoped>
.lume-about {
  --about-label-width: 72px;
  --about-column-gap: var(--lume-space-5);
  display: grid;
  gap: var(--lume-space-5);
  padding-block: var(--lume-space-3);
  font-size: var(--lume-font-size-sm);
}

.lume-about__brand,
.lume-about__row,
.lume-about__updates {
  display: grid;
  grid-template-columns: var(--about-label-width) minmax(0, 1fr);
  column-gap: var(--about-column-gap);
}

.lume-about__brand {
  align-items: center;
  margin-bottom: var(--lume-space-2);
}

.lume-about__logo {
  display: block;
  width: 56px;
  height: 56px;
  object-fit: contain;
  transform: translateX(-3px);
}

.lume-about__name {
  margin: 0 0 var(--lume-space-2);
  font-size: var(--lume-font-size-2xl);
  font-weight: var(--lume-font-weight-semibold);
}

.lume-about__tagline,
.lume-about__status {
  margin: 0;
  color: var(--lume-text-secondary);
  line-height: var(--lume-line-height-relaxed);
}

.lume-about__metadata {
  display: grid;
  gap: var(--lume-space-4);
  margin: 0;
}

.lume-about__row {
  line-height: var(--lume-line-height-relaxed);
}

.lume-about__row dt {
  color: var(--lume-text-secondary);
}

.lume-about__row dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.lume-about__license-hint {
  display: block;
  color: var(--lume-text-tertiary);
  font-size: var(--lume-font-size-xs);
}

.lume-about__updates {
  align-items: start;
  padding-block: var(--lume-space-5);
  border-top: 1px solid var(--lume-border-subtle);
  border-bottom: 1px solid var(--lume-border-subtle);
}

.lume-about__update-content {
  display: grid;
  min-width: 0;
  gap: var(--lume-space-3);
}

.lume-about__section-title {
  margin: 0;
  color: var(--lume-text-secondary);
  font-size: inherit;
  font-weight: var(--lume-font-weight-regular);
  line-height: 32px;
}

.lume-about__update-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--lume-space-4);
}

.lume-about__status {
  min-width: 0;
  overflow-wrap: anywhere;
}

.lume-about__button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  gap: var(--lume-space-3);
  min-height: 32px;
  padding: var(--lume-space-3) var(--lume-space-4);
  border: 1px solid transparent;
  border-radius: var(--lume-radius-md);
  font: inherit;
  cursor: pointer;
  background: var(--lume-accent-default);
  color: var(--lume-accent-contrast);
}

.lume-about__button:hover:not(:disabled) {
  background: var(--lume-accent-hover);
}

.lume-about__button:disabled {
  cursor: default;
  opacity: 0.6;
}

.lume-about a {
  display: inline-flex;
  align-items: center;
  gap: var(--lume-space-2);
  color: var(--lume-accent-default);
  text-decoration: none;
}

.lume-about a:hover {
  text-decoration: underline;
}

.lume-about :is(a, button, summary):focus-visible {
  outline: 2px solid var(--lume-accent-default);
  outline-offset: 3px;
}

.lume-about__hint {
  margin: 0;
  color: var(--lume-text-tertiary);
  font-size: var(--lume-font-size-xs);
  line-height: var(--lume-line-height-relaxed);
}

.lume-about__error {
  margin: 0;
  color: var(--lume-color-danger);
  line-height: var(--lume-line-height-relaxed);
  overflow-wrap: anywhere;
}

.lume-about__progress {
  width: 100%;
  height: 6px;
  accent-color: var(--lume-accent-default);
}

.lume-about__release-notes {
  width: 100%;
  color: var(--lume-text-secondary);
}

.lume-about__release-notes summary {
  cursor: pointer;
}

.lume-about__notes {
  margin: var(--lume-space-4) 0 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: var(--lume-line-height-relaxed);
}

.lume-about__links {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--lume-space-3) var(--lume-space-5);
  min-height: 32px;
}

.lume-about__spinner {
  animation: lume-about-spin 1s linear infinite;
}

@keyframes lume-about-spin {
  to {
    transform: rotate(360deg);
  }
}

@container lume-settings-content (max-width: 440px) {
  .lume-about__update-controls {
    flex-wrap: wrap;
  }
}

@media (prefers-reduced-motion: reduce) {
  .lume-about__spinner {
    animation: none;
  }
}
</style>
