/* eslint-env node */
module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    node: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:vue/vue3-recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier',
  ],
  parser: 'vue-eslint-parser',
  parserOptions: {
    parser: '@typescript-eslint/parser',
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  rules: {
    // 允许 Vue 组件名使用多单词，但保留 App 等根组件
    'vue/multi-word-component-names': [
      'error',
      {
        ignores: ['App', 'index'],
      },
    ],
    // 关闭与 TypeScript 冲突的规则
    'no-undef': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      },
    ],
  },
  ignorePatterns: [
    'dist/',
    'node_modules/',
    'src-tauri/',
    '*.config.ts',
    '*.config.js',
  ],
}