import { build } from 'esbuild'
import { mkdtemp, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

// 仅转译回归用例，不启动应用或执行项目构建。
const workspace = process.cwd()
const directory = await mkdtemp(join(workspace, '.editor-tests-'))
const outfile = join(directory, 'tests.mjs')
try {
  await build({
    entryPoints: ['tests/editor-capabilities.test.ts'],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    packages: 'external',
  })
  await import(pathToFileURL(outfile).href)
} finally {
  if (dirname(directory) !== workspace) throw new Error('测试临时目录不属于当前工作区')
  await rm(directory, { recursive: true, force: true })
}
