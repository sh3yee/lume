import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const root = new URL('../', import.meta.url)
const storageKey = 'lume-window-state'
const normal = { width: 1000, height: 700, x: 140, y: 90, maximized: false }
const plain = (value) => JSON.parse(JSON.stringify(value))

// Load the actual TypeScript modules with native-window and lifecycle boundaries mocked.
function load(source, mocks, globals = {}) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(source, root), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
  })
  const exports = {}
  runInNewContext(outputText, {
    exports,
    require: (id) => id in mocks ? mocks[id] : require(id),
    console: { warn() {} },
    ...globals,
  })
  return exports
}

function setup(saved = null, initial = normal) {
  let mounted
  let unmount
  let timer
  let state = { ...initial }
  let minimized = false
  const storage = new Map(saved ? [[storageKey, JSON.stringify(saved)]] : [])
  const listeners = {}
  const calls = []
  const monitors = [
    { workArea: { position: { x: 0, y: 0 }, size: { width: 1920, height: 1040 } } },
    { workArea: { position: { x: -1920, y: 0 }, size: { width: 1920, height: 1040 } } },
  ]
  const listen = (event, handler) => {
    listeners[event] = handler
    return Promise.resolve(() => { delete listeners[event] })
  }
  const current = {
    innerSize: async () => ({ width: state.width, height: state.height }),
    outerPosition: async () => ({ x: state.x, y: state.y }),
    isMaximized: async () => state.maximized,
    isMinimized: async () => minimized,
    setSize: async (size) => { calls.push('size'); Object.assign(state, size) },
    setPosition: async (position) => { calls.push('position'); Object.assign(state, position) },
    center: async () => { calls.push('center'); Object.assign(state, { x: 200, y: 100 }) },
    maximize: async () => {
      calls.push('maximize')
      state = { width: 1920, height: 1040, x: 0, y: 0, maximized: true }
    },
    show: async () => { calls.push('show') },
    destroy: async () => { calls.push(['destroy', storage.get(storageKey)]) },
    onResized: (handler) => listen('resize', handler),
    onMoved: (handler) => listen('move', handler),
    onCloseRequested: (handler) => listen('close', handler),
  }
  const native = load('src/platform/tauri/window.ts', {
    './client': { isTauri: () => true },
    '@tauri-apps/api/window': { getCurrentWindow: () => current, availableMonitors: async () => monitors },
  })
  const preferenceStorage = load('src/app/preferences/preferenceStorage.ts', {}, {
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
  })
  const lifecycle = load('src/app/lifecycle/useWindowPersistence.ts', {
    vue: { onMounted: (fn) => { mounted = fn }, onBeforeUnmount: (fn) => { unmount = fn } },
    '@/platform/tauri/window': native,
    '@/app/preferences/preferenceStorage': preferenceStorage,
  }, {
    setTimeout: (fn) => { timer = fn; return 1 },
    clearTimeout: () => { timer = undefined },
  })
  const api = lifecycle.useWindowPersistence(() => {})
  return {
    ...api, native, calls, current, storage, listeners,
    mount: () => mounted(),
    unmount: () => unmount(),
    read: () => JSON.parse(storage.get(storageKey)),
    setState: (next) => { state = { ...next } },
    minimize: () => { minimized = true },
    flushEvent: async () => {
      assert.ok(timer, 'window event should schedule persistence')
      timer()
      // Drain the asynchronous native reads without relying on wall-clock delays.
      await new Promise((resolve) => setImmediate(resolve))
    },
  }
}

test('restores size and position before showing, and supports negative secondary-monitor coordinates', async () => {
  const saved = { ...normal, x: -1400, y: 120 }
  const app = setup(saved)
  await app.mount()
  assert.deepEqual(app.calls, ['position', 'size', 'show'])
  assert.deepEqual(app.read(), saved)
})

test('moving without resizing persists the position and restores it on the next launch', async () => {
  const app = setup()
  await app.mount()
  const moved = { ...normal, x: 720, y: 200 }
  app.setState(moved)
  app.listeners.move()
  await app.flushEvent()
  assert.deepEqual(app.read(), moved)
  const reopened = setup(app.read())
  await reopened.mount()
  assert.deepEqual(plain(await reopened.native.getWindowState()), moved)
})

test('closing immediately after resize saves the latest bounds before destroying the window', async () => {
  const app = setup()
  await app.mount()
  const resized = { ...normal, width: 1280, height: 900, x: 320 }
  app.setState(resized)
  app.listeners.resize()
  await app.closeApplicationWindow()
  assert.deepEqual(app.calls.at(-1), ['destroy', JSON.stringify(resized)])
})

test('maximizing and restarting preserves the normal bounds for later unmaximize', async () => {
  const app = setup()
  await app.mount()
  await app.current.maximize()
  app.listeners.resize()
  await app.flushEvent()
  assert.deepEqual(app.read(), { ...normal, maximized: true })
  const reopened = setup(app.read())
  await reopened.mount()
  assert.deepEqual(reopened.calls, ['position', 'size', 'maximize', 'show'])
  assert.deepEqual(reopened.read(), { ...normal, maximized: true })
  reopened.setState(normal)
  reopened.listeners.resize()
  await reopened.flushEvent()
  assert.deepEqual(reopened.read(), normal)
})

test('minimized sentinel coordinates never replace the saved normal bounds', async () => {
  const app = setup(normal)
  await app.mount()
  app.minimize()
  app.setState({ ...normal, width: 0, height: 0, x: -32000, y: -32000 })
  app.listeners.move()
  await app.flushEvent()
  await app.closeApplicationWindow()
  assert.deepEqual(app.read(), normal)
})

test('disconnected monitor positions are recentered and the repaired location is saved', async () => {
  const app = setup({ ...normal, x: 4500, y: 100 })
  await app.mount()
  assert.deepEqual(app.calls, ['size', 'center', 'show'])
  assert.deepEqual(app.read(), { ...normal, x: 200, y: 100 })
})

test('legacy size-only records remain usable and gain position information', async () => {
  const app = setup({ width: 900, height: 600, maximized: false })
  await app.mount()
  assert.deepEqual(app.read(), { width: 900, height: 600, maximized: false, x: 200, y: 100 })
})

test('invalid saved state and restore failures still leave the window visible with listeners active', async () => {
  for (const saved of [{ ...normal, x: 'bad' }, { ...normal, height: 0 }]) {
    const app = setup(saved)
    await app.mount()
    assert.deepEqual(app.calls, ['show'])
    assert.deepEqual(app.read(), normal)
  }
  const app = setup(normal)
  app.current.setPosition = async () => { throw new Error('unavailable') }
  await app.mount()
  assert.ok(app.calls.includes('show'))
  assert.equal(typeof app.listeners.move, 'function')
})

test('unmount removes window listeners', async () => {
  const app = setup()
  await app.mount()
  app.unmount()
  assert.deepEqual(Object.keys(app.listeners), [])
})

test('theme and status-bar preferences persist synchronously and survive reinitialization', () => {
  const vue = require('vue')
  const storage = new Map()
  const preferenceStorage = {
    readPreference: (key) => storage.get(key) ?? null,
    savePreference: (key, value) => storage.set(key, value),
  }
  const mocks = { vue: { ...vue, onBeforeUnmount() {} }, './preferenceStorage': preferenceStorage }
  const globals = {
    document: { documentElement: { dataset: {} } },
    window: { matchMedia: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }) },
  }
  const theme = load('src/app/preferences/useThemePreference.ts', mocks, globals)
  const first = theme.useThemePreference()
  assert.equal(first.themePreference.value, 'light')
  first.themePreference.value = 'dark'
  assert.equal(storage.get('lume-theme'), 'dark')
  assert.equal(theme.useThemePreference().themePreference.value, 'dark')
  const status = load('src/app/preferences/useStatusBarPreference.ts', mocks)
  status.useStatusBarPreference().statusBarEnabled.value = false
  assert.equal(storage.get('lume-statusbar-enabled'), 'false')
  assert.equal(status.useStatusBarPreference().statusBarEnabled.value, false)
})
