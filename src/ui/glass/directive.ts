import type { ObjectDirective } from 'vue'
import { createLiquidGlass } from './liquidGlass'

const instances = new WeakMap<HTMLElement, () => void>()

const syncGlass = (element: HTMLElement, enabled: boolean | undefined) => {
  if (enabled !== false) {
    if (!instances.has(element)) instances.set(element, createLiquidGlass(element))
    return
  }
  instances.get(element)?.()
  instances.delete(element)
}

export const vLiquidGlass: ObjectDirective<HTMLElement, boolean | undefined> = {
  mounted: (element, binding) => syncGlass(element, binding.value),
  updated: (element, binding) => syncGlass(element, binding.value),
  beforeUnmount: (element) => syncGlass(element, false),
}
