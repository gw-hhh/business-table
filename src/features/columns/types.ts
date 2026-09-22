import type { NumberFormat, ValueMapItem } from '../../types'
import type { RichDocument } from '../rich-text/document'

export interface NumberRule extends NumberFormat {
  enabled?: boolean
  scale?: 1 | 1000 | 10000 | 100000000
  sign?: 'auto' | 'always' | 'accounting'
}
export interface MappingItem extends ValueMapItem { id?: string; border?: string; icon?: string }
export interface MappingConfig {
  enabled: boolean
  type: 'text' | 'number' | 'boolean'
  presentation: 'text' | 'tag' | 'dot'
  empty: string
  unknown: string
  sort?: boolean
  items: MappingItem[]
}
export interface ContentDisplay {
  wrap?: 'ellipsis' | 'two' | 'wrap'
  emptyText?: string
  description?: string
  copyable?: boolean
  link?: boolean
  secondaryField?: string
  showSecondary?: boolean
  dateFormat?: 'iso' | 'slash' | 'cn'
}
export interface TemplateConfig { enabled: boolean; document: RichDocument }
