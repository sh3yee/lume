const normalizeSegments = (path: string) => {
  const segments: string[] = []
  for (const segment of path.split('/')) {
    if (!segment || segment === '.') continue
    if (segment === '..') segments.pop()
    else segments.push(segment)
  }
  return segments.join('/')
}

const getDocumentPathKey = (path: string) => {
  const windowsPath = path.replace(/\\/g, '/')
  const drive = windowsPath.match(/^([a-z]):\//i)
  if (drive) {
    return `windows:${drive[1].toLowerCase()}:/${normalizeSegments(windowsPath.slice(3)).toLowerCase()}`
  }

  // UNC 的服务器和共享名属于根路径，不能被后续的 .. 消除。
  const share = windowsPath.match(/^\/\/([^/]+)\/([^/]+)(?:\/|$)/)
  if (share && !['?', '.'].includes(share[1]) && !['.', '..'].includes(share[2])) {
    const root = `//${share[1]}/${share[2]}`.toLowerCase()
    return `windows:${root}/${normalizeSegments(windowsPath.slice(share[0].length)).toLowerCase()}`
  }

  // POSIX 文件名区分大小写，反斜杠也是合法的文件名字符。
  if (path.startsWith('/') && !path.startsWith('//')) {
    return `posix:/${normalizeSegments(path)}`
  }
  return `literal:${path}`
}

/** 比较已打开文件的路径，缺少磁盘路径的文档不会相互合并。 */
export const isSameDocumentPath = (left: string | null, right: string | null) => {
  if (!left || !right) return false
  return getDocumentPathKey(left) === getDocumentPathKey(right)
}
