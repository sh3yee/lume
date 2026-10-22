export const readPreference = (key: string): string | null => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export const savePreference = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value)
  } catch {
    // 存储不可用时仍保留当前会话设置。
  }
}

export const boundedNumber = (value: string | null, fallback: number, min: number, max: number) => {
  const number = value === null ? NaN : Number(value)
  return Number.isFinite(number) && number >= min && number <= max ? number : fallback
}
