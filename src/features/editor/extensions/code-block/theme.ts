import { HighlightStyle } from '@codemirror/language'
import { oneDarkHighlightStyle } from '@codemirror/theme-one-dark'

// 复用现有语法标签分组，颜色交给 GitHub 深浅主题变量，切换时保留编辑状态。
const colors: Record<string, string> = {
  '#c678dd': 'var(--lume-code-keyword)',
  '#e06c75': 'var(--lume-code-text)',
  '#61afef': 'var(--lume-code-definition)',
  '#d19a66': 'var(--lume-code-number)',
  '#abb2bf': 'var(--lume-code-text)',
  '#e5c07b': 'var(--lume-code-number)',
  '#56b6c2': 'var(--lume-code-keyword)',
  '#7d8799': 'var(--lume-code-comment)',
  '#98c379': 'var(--lume-code-string)',
  '#ffffff': 'var(--lume-code-invalid)',
}

export const codeBlockHighlightStyle = HighlightStyle.define(
  oneDarkHighlightStyle.specs.map((style) => ({
    ...style,
    ...(typeof style.color === 'string'
      ? { color: colors[style.color] ?? 'var(--lume-code-text)' }
      : {}),
  })),
)

export const codeBlockPreviewThemes = {
  light: 'github-light-default',
  dark: 'github-dark-default',
} as const
