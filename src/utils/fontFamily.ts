export const isFontFamilyName = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.trim().length > 0 &&
  value.length <= 200 &&
  !/\p{Cc}/u.test(value)

export const quoteFontFamily = (family: string) =>
  `"${family.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
