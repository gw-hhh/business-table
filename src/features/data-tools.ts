import type { DataToolName } from '../config/features'
import type { RangeSelectionContext } from './range-selection/context'

export interface DataToolsHandle {
  preload(name: DataToolName): Promise<void> | undefined
  activate(name: DataToolName): Promise<object | undefined>
  open(name: DataToolName): Promise<void>
  getContext(name: DataToolName): object | undefined
  getRangeContext(): RangeSelectionContext | undefined
}
export interface FeatureContextControls {
  close(): void
  isActive(): boolean
  onDispose(dispose: () => void): void
}
export interface FeatureHostHandle<C extends object> {
  preload(): Promise<void> | undefined
  activate(): Promise<C | undefined>
  getContext(): C | undefined
}
