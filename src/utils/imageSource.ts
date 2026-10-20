/** 清理复制路径时附带的外层引号和方向控制符，保留路径内部字符。 */
export const normalizeImageSourceInput = (source: string) => {
  const padding =
    /^[\s\u200e\u200f\u202a-\u202e\u2066-\u2069]+|[\s\u200e\u200f\u202a-\u202e\u2066-\u2069]+$/g
  const value = source.replace(padding, '')
  return value.startsWith('"') && value.endsWith('"')
    ? value.slice(1, -1).replace(padding, '')
    : value
}
