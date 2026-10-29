<script setup lang="ts">
import { t } from '@/app/i18n'
import { computed, ref, watch } from 'vue'
import { open } from '@tauri-apps/plugin-dialog'
import { FolderOpen, LoaderCircle } from 'lucide-vue-next'
import { uploadImageFiles } from '@/platform/tauri/images'
import { imageSettings } from '../model/imageSettings'

const validating = ref(false)
const validationResult = ref('')
const validationFailed = ref(false)
const argsText = ref(imageSettings.uploader.args.join('\n'))

const insertionOptions = computed(
  () =>
    [
      { value: 'original', label: t('保留图片原始位置') },
      { value: 'copy', label: t('复制图片到指定文件夹') },
      { value: 'upload', label: t('上传图片') },
    ] as const,
)
const insertionRules = computed(
  () =>
    [
      { key: 'applyToLocal', label: t('对本地图片应用上述规则') },
      { key: 'applyToRemote', label: t('对网络图片应用上述规则') },
      { key: 'allowYamlCopy', label: t('允许根据 YAML 设置复制图片到指定文件夹') },
      { key: 'allowYamlUpload', label: t('允许根据 YAML 设置自动上传图片') },
    ] as const,
)
const syntaxOptions = computed(
  () =>
    [
      { key: 'preferRelative', label: t('尽可能使用相对路径') },
      { key: 'ensureDotSlash', label: t('为相对路径添加 ./ 前缀') },
      { key: 'escapePath', label: t('插入时自动转义图片路径') },
    ] as const,
)

const handleChooseCopyFolder = async () => {
  try {
    const selected = await open({
      directory: true,
      multiple: false,
      title: t('选择图片复制文件夹'),
    })
    if (typeof selected === 'string') imageSettings.copyTo = selected
  } catch (error) {
    validationFailed.value = true
    validationResult.value = error instanceof Error ? error.message : String(error)
  }
}

const handleChooseUploader = async () => {
  try {
    const selected = await open({ multiple: false, title: t('选择图片上传程序') })
    if (typeof selected === 'string') imageSettings.uploader.program = selected
  } catch (error) {
    validationFailed.value = true
    validationResult.value = error instanceof Error ? error.message : String(error)
  }
}

const handleValidateUploader = async () => {
  if (validating.value || !imageSettings.uploader.program.trim()) return
  validationResult.value = ''
  validationFailed.value = false
  try {
    const selected = await open({
      multiple: false,
      title: t('选择一张图片验证上传器（将实际上传）'),
      filters: [
        {
          name: t('图片'),
          extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'],
        },
      ],
    })
    if (typeof selected !== 'string') return
    validating.value = true
    const assets = await uploadImageFiles([selected], null, 'uploader-validation', {
      program: imageSettings.uploader.program.trim(),
      args: [...imageSettings.uploader.args],
    })
    validationResult.value = t(
      '上传成功\n{0}',
      assets.map((asset) => asset.markdownPath).join('\n'),
    )
  } catch (error) {
    validationFailed.value = true
    validationResult.value = t(
      '上传失败：{0}',
      error instanceof Error ? error.message : String(error),
    )
  } finally {
    validating.value = false
  }
}

watch(argsText, (value) => {
  imageSettings.uploader.args = value.split(/\r?\n/).filter((arg) => arg.length > 0)
})
</script>

<template>
  <div class="image-settings">
    <section class="image-settings__section" aria-labelledby="image-insertion-label">
      <div>
        <h3 id="image-insertion-label">{{ t('插入图片时') }}</h3>
        <p>{{ t('适用于粘贴、拖放和从本地选择图片。') }}</p>
      </div>
      <select v-model="imageSettings.insertAction" :aria-label="t('插入图片时的处理方式')">
        <option v-for="option in insertionOptions" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>
      <div v-if="imageSettings.insertAction === 'copy'" class="image-settings__field">
        <label for="image-copy-folder">{{ t('复制目标文件夹') }}</label>
        <div class="image-settings__input-row">
          <input
            id="image-copy-folder"
            v-model="imageSettings.copyTo"
            type="text"
            spellcheck="false"
            placeholder="${filename}.assets"
          />
          <button
            type="button"
            :aria-label="t('选择图片复制文件夹')"
            @click="handleChooseCopyFolder"
          >
            <FolderOpen :size="16" />
          </button>
        </div>
        <p>
          {{ t('相对路径以文档所在文件夹为基准；') }}<code>${filename}</code>
          {{ t('代表文档名（不含扩展名）。') }}
        </p>
        <p>{{ t('保存时会将文档中的本地图片复制到此目录；分享文档时请同时带上图片文件夹。') }}</p>
      </div>
      <div class="image-settings__checks">
        <label v-for="rule in insertionRules" :key="rule.key" class="image-settings__check">
          <input v-model="imageSettings[rule.key]" type="checkbox" />
          <span>{{ rule.label }}</span>
        </label>
      </div>
      <p>
        {{ t('文档中的') }} <code>typora-copy-images-to</code> {{ t('可单独指定复制目录，设置为') }}
        <code>upload</code> {{ t('时自动上传。') }}
      </p>
    </section>

    <section class="image-settings__section" aria-labelledby="image-syntax-label">
      <h3 id="image-syntax-label">{{ t('图片路径格式') }}</h3>
      <div class="image-settings__checks">
        <label v-for="option in syntaxOptions" :key="option.key" class="image-settings__check">
          <input
            v-model="imageSettings[option.key]"
            type="checkbox"
            :disabled="option.key === 'ensureDotSlash' && !imageSettings.preferRelative"
          />
          <span>{{ option.label }}</span>
        </label>
      </div>
      <p>{{ t('转义会将空格等字符编码为 URL 格式，便于其他 Markdown 工具读取。') }}</p>
    </section>

    <section class="image-settings__section" aria-labelledby="image-uploader-label">
      <div>
        <h3 id="image-uploader-label">{{ t('图片上传器') }}</h3>
        <p>{{ t('使用已安装的 PicGo-Core、Upgit 或自定义上传程序。') }}</p>
      </div>
      <div class="image-settings__field">
        <label for="image-uploader-program">{{ t('程序路径或名称') }}</label>
        <div class="image-settings__input-row">
          <input
            id="image-uploader-program"
            v-model="imageSettings.uploader.program"
            type="text"
            spellcheck="false"
            :placeholder="t('例如 C:\\Tools\\picgo.exe')"
          />
          <button type="button" :aria-label="t('选择图片上传程序')" @click="handleChooseUploader">
            <FolderOpen :size="16" />
          </button>
        </div>
      </div>
      <div class="image-settings__field">
        <label for="image-uploader-args">{{ t('程序参数（每行一个）') }}</label>
        <textarea
          id="image-uploader-args"
          v-model="argsText"
          rows="3"
          spellcheck="false"
          placeholder="upload"
        />
        <p>
          {{ t('图片路径会自动追加到参数末尾。参数支持') }} <code>${filename}</code> {{ t('和') }}
          <code>${filepath}</code>{{ t('；含空格的参数无需加引号。') }}
        </p>
      </div>
      <div class="image-settings__validation">
        <button
          type="button"
          :disabled="validating || !imageSettings.uploader.program.trim()"
          @click="handleValidateUploader"
        >
          <LoaderCircle v-if="validating" class="image-settings__spinner" :size="14" />
          {{ validating ? t('正在上传…') : t('选择图片验证上传器') }}
        </button>
        <p>{{ t('验证会将所选图片实际上传到当前配置的图床。') }}</p>
      </div>
      <pre
        v-if="validationResult"
        class="image-settings__result"
        :class="{ 'image-settings__result--failed': validationFailed }"
        role="status"
        >{{ validationResult }}</pre>
    </section>
  </div>
</template>

<style scoped>
.image-settings {
  display: flex;
  flex-direction: column;
  gap: var(--lume-space-6);
}

.image-settings__section {
  display: flex;
  flex-direction: column;
  gap: var(--lume-space-4);
}

.image-settings__section + .image-settings__section {
  border-top: 1px solid var(--lume-border-subtle);
  padding-top: var(--lume-space-6);
}

.image-settings h3 {
  margin: 0;
  font-size: var(--lume-font-size-md);
  font-weight: var(--lume-font-weight-semibold);
}

.image-settings p {
  margin: var(--lume-space-2) 0 0;
  color: var(--lume-text-tertiary);
  font-size: var(--lume-font-size-xs);
  line-height: var(--lume-line-height-normal);
  overflow-wrap: anywhere;
}

.image-settings__field,
.image-settings__checks {
  display: flex;
  flex-direction: column;
  gap: var(--lume-space-3);
}

.image-settings__field > label,
.image-settings__check {
  color: var(--lume-text-secondary);
  font-size: var(--lume-font-size-sm);
}

.image-settings__input-row {
  display: flex;
  gap: var(--lume-space-2);
}

.image-settings__input-row input {
  flex: 1;
  min-width: 0;
}

.image-settings select,
.image-settings input[type='text'],
.image-settings textarea,
.image-settings button {
  padding: var(--lume-space-3);
  border: 1px solid var(--lume-border-default);
  border-radius: var(--lume-radius-md);
  background: var(--lume-bg-surface-raised);
  color: var(--lume-text-primary);
  font: inherit;
  font-size: var(--lume-font-size-sm);
}

.image-settings textarea {
  resize: vertical;
  min-height: 70px;
}

.image-settings button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--lume-space-2);
  cursor: pointer;
}

.image-settings button:hover:not(:disabled) {
  border-color: var(--lume-accent-default);
  color: var(--lume-accent-default);
}

.image-settings button:disabled,
.image-settings input:disabled {
  opacity: 0.5;
  cursor: default;
}

.image-settings :is(input[type='text'], select, textarea):focus {
  outline: none;
  border-color: var(--lume-input-focus-border);
  background: var(--lume-input-focus-bg);
  box-shadow: none;
}

.image-settings :is(input[type='checkbox'], button):focus-visible {
  outline: 2px solid var(--lume-accent-default);
  outline-offset: 2px;
}

.image-settings__check {
  display: flex;
  align-items: center;
  gap: var(--lume-space-3);
  cursor: pointer;
}

.image-settings input[type='checkbox'] {
  margin: 0;
  accent-color: var(--lume-accent-default);
}

.image-settings__result {
  margin: 0;
  padding: var(--lume-space-3);
  border-radius: var(--lume-radius-md);
  background: var(--lume-bg-surface-raised);
  color: var(--lume-text-secondary);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: var(--lume-font-size-xs);
}

.image-settings__result--failed {
  color: var(--lume-error, #dc5757);
}

.image-settings__spinner {
  animation: image-settings-spin 1s linear infinite;
}

@keyframes image-settings-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
