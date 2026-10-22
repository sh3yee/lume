/**
 * Adapted from https://github.com/rizzytoday/liquid-glass (core/liquid-glass.js).
 * Canvas displacement-map algorithm; Vue lifecycle and neutral single-pass adaptation.
 *
 * MIT License
 * Copyright (c) 2026 Riz Roze
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg'
const FILTER_PROPERTY = '--lume-glass-filter'
const REFRACTION_SCALE = -48
const MAP_PADDING = 24
let filterSequence = 0

const createDisplacementMap = (width: number, height: number, radius: number) => {
  const canvas = document.createElement('canvas')
  canvas.width = width + MAP_PADDING * 2
  canvas.height = height + MAP_PADDING * 2
  const context = canvas.getContext('2d')
  if (!context) return null

  context.fillStyle = 'rgb(128, 128, 128)'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.save()
  context.beginPath()
  context.roundRect(MAP_PADDING, MAP_PADDING, width, height, radius)
  context.clip()

  const horizontal = context.createLinearGradient(
    MAP_PADDING + width,
    MAP_PADDING,
    MAP_PADDING,
    MAP_PADDING,
  )
  horizontal.addColorStop(0, '#000000')
  horizontal.addColorStop(1, '#ff0000')
  context.fillStyle = horizontal
  context.fillRect(MAP_PADDING, MAP_PADDING, width, height)

  context.globalCompositeOperation = 'difference'
  const vertical = context.createLinearGradient(
    MAP_PADDING,
    MAP_PADDING,
    MAP_PADDING,
    MAP_PADDING + height,
  )
  vertical.addColorStop(0, '#000000')
  vertical.addColorStop(1, '#0000ff')
  context.fillStyle = vertical
  context.fillRect(MAP_PADDING, MAP_PADDING, width, height)

  // 中央保持中性位移，只让边缘折射背景；圆角沿用元素本身的样式。
  const edge = Math.min(8, Math.min(width, height) * 0.15)
  context.globalCompositeOperation = 'source-over'
  context.filter = 'blur(3px)'
  context.fillStyle = 'rgb(128, 128, 128)'
  context.beginPath()
  context.roundRect(
    MAP_PADDING + edge,
    MAP_PADDING + edge,
    width - edge * 2,
    height - edge * 2,
    Math.max(0, radius - edge),
  )
  context.fill()
  context.restore()
  return canvas.toDataURL()
}

export const createLiquidGlass = (element: HTMLElement) => {
  // SVG 背景滤镜在 Chromium 中启用，其他引擎继续使用 CSS 模糊回退。
  if (!/Chrome\//.test(navigator.userAgent)) return () => {}

  const id = `lume-glass-refraction-${++filterSequence}`
  const svg = document.createElementNS(SVG_NAMESPACE, 'svg')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('focusable', 'false')
  svg.style.cssText = 'position:fixed;width:0;height:0;pointer-events:none;'
  svg.innerHTML = `<defs>
    <filter id="${id}" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feImage result="map" preserveAspectRatio="none" />
      <feDisplacementMap in="SourceGraphic" in2="map" scale="${REFRACTION_SCALE}"
        xChannelSelector="R" yChannelSelector="B" />
    </filter>
  </defs>`
  const filter = svg.querySelector('filter')!
  const image = svg.querySelector('feImage')!
  const previousFilter = element.style.getPropertyValue(FILTER_PROPERTY)
  let frame = 0
  let previousSize = ''
  document.body.appendChild(svg)

  const update = () => {
    const rect = element.getBoundingClientRect()
    const width = Math.round(rect.width)
    const height = Math.round(rect.height)
    if (width < 1 || height < 1) return
    const radius = Number.parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0
    const size = `${width}:${height}:${radius}`
    if (size === previousSize) return
    const map = createDisplacementMap(width, height, radius)
    if (!map) return
    previousSize = size

    for (const node of [filter, image]) {
      node.setAttribute('x', String(-MAP_PADDING))
      node.setAttribute('y', String(-MAP_PADDING))
      node.setAttribute('width', String(width + MAP_PADDING * 2))
      node.setAttribute('height', String(height + MAP_PADDING * 2))
    }
    image.setAttribute('href', map)
    element.style.setProperty(FILTER_PROPERTY, `url("#${id}")`)
  }

  const observer = new ResizeObserver(() => {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(update)
  })
  observer.observe(element)

  return () => {
    observer.disconnect()
    cancelAnimationFrame(frame)
    svg.remove()
    if (previousFilter) element.style.setProperty(FILTER_PROPERTY, previousFilter)
    else element.style.removeProperty(FILTER_PROPERTY)
  }
}
