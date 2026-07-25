/** 将 Overlay 的左上角约束在当前视口内。 */
export function constrainOverlayPosition(
  position: { x: number; y: number },
  size: { width: number; height: number },
  margin = 8,
) {
  return {
    x: Math.max(margin, Math.min(position.x, window.innerWidth - size.width - margin)),
    y: Math.max(margin, Math.min(position.y, window.innerHeight - size.height - margin)),
  }
}

/** 将 Overlay 水平居中放在锚点上方；空间不足时回退到锚点下方。 */
export function positionOverlayAroundBounds(
  bounds: { top: number; right: number; bottom: number; left: number },
  size: { width: number; height: number },
  margin = 8,
) {
  const preferredY = bounds.top - size.height - margin
  const fallbackY = bounds.bottom + margin

  return constrainOverlayPosition({
    x: bounds.left + (bounds.right - bounds.left - size.width) / 2,
    y: preferredY >= margin ? preferredY : fallbackY,
  }, size, margin)
}