import { t } from '@/app/i18n'
import { invokeCommand, isTauri } from './client'
import { isFontFamilyName } from '@/utils/fontFamily'

interface FontQueryWindow extends Window {
  queryLocalFonts?: () => Promise<{ family: string }[]>
}

export const listSystemFonts = async (): Promise<string[]> => {
  let result: unknown
  if (isTauri()) {
    result = await invokeCommand<unknown>('lume_list_system_fonts')
  } else {
    const queryFonts = (window as FontQueryWindow).queryLocalFonts
    if (!queryFonts) throw new Error(t('当前环境无法列出系统字体，可以直接输入已安装的字体名称。'))
    const fonts = await queryFonts.call(window)
    result = fonts.map((font) => font.family)
  }
  if (!Array.isArray(result) || !result.every((font): font is string => typeof font === 'string')) {
    throw new Error(t('暂时无法获取字体列表。'))
  }
  const families = new Map<string, string>()
  for (const value of result) {
    const family = value.trim()
    if (!isFontFamilyName(family) || family.startsWith('@')) continue
    const key = family.toLocaleLowerCase()
    if (!families.has(key)) families.set(key, family)
  }
  if (families.size === 0) throw new Error(t('没有读取到系统字体，可以直接输入已安装的字体名称。'))
  return [...families.values()].sort((a, b) => a.localeCompare(b, 'zh-CN'))
}
