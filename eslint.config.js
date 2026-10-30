import js from '@eslint/js'
import ts from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import vue from 'eslint-plugin-vue'
import prettier from 'eslint-config-prettier'

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/dist-ssr/**',
      'src-tauri/**',
      '.agents/**',
      '.vscode/**',
      '.idea/**',
      'logs/**',
      '**/*.local',
      '.pnp.*',
    ],
  },
  { files: ['**/*.{js,jsx,cjs,mjs,ts,tsx,cts,mts,vue}'] },
  js.configs.recommended,
  ...ts.configs['flat/recommended'],
  ...vue.configs['flat/recommended'],
  prettier,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      parserOptions: { parser: tsParser },
    },
    rules: {
      'vue/multi-word-component-names': ['error', { ignores: ['App', 'index'] }],
      // 保留原配置：未声明名称由 TypeScript 检查，避免与类型声明冲突。
      'no-undef': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
]
