export interface ContextMenuItem {
  id: string
  label: string
  disabled?: boolean
  active?: boolean | 'mixed'
  reason?: string
  children?: ContextMenuItem[]
}

export interface PropertyField {
  key: string
  label: string
  value: string
  multiline?: boolean
  required?: boolean
}

export interface PropertyForm {
  title: string
  fields: PropertyField[]
  error?: string
  busy?: boolean
}
