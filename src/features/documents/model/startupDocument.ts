import { appInfo } from '@/app/appInfo'
import { t } from '@/app/i18n'
import { readPreference, savePreference } from '@/app/preferences/preferenceStorage'
import { WELCOME_DOCUMENT_CONTENT, WELCOME_DOCUMENT_NAME } from './documentStore'
import type { StartupDocument } from './documentTypes'

const LAST_STARTED_VERSION_KEY = 'lume-last-started-version'
const releaseNotes = import.meta.glob<string>('/docs/releases/v*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
})

export const getStartupDocument = (hasPreviousSession: boolean): StartupDocument | null => {
  const previousVersion = readPreference(LAST_STARTED_VERSION_KEY)
  savePreference(LAST_STARTED_VERSION_KEY, appInfo.version)
  if (previousVersion === appInfo.version) return null

  // 旧安装没有版本标记时，用已保存的编辑会话识别老用户。
  if (!previousVersion && !hasPreviousSession) {
    return { kind: 'welcome', name: WELCOME_DOCUMENT_NAME, content: WELCOME_DOCUMENT_CONTENT }
  }

  const notes = releaseNotes[`/docs/releases/v${appInfo.version}.md`]?.trim()
  return {
    kind: 'release-notes',
    name: t('Lume v{0} 更新说明.md', appInfo.version),
    content: `# ${t('欢迎使用 Lume v{0}', appInfo.version)}

${notes || t('此版本的更新说明请查看发布页面。')}

[${t('发布页面')}](${appInfo.releasesUrl}/tag/v${appInfo.version})
`,
  }
}
