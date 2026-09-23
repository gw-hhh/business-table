/** A missing declaration is hidden. Read-only must be declared explicitly. */
export interface ControlDeclaration { enabled: boolean; visible?: boolean; disabled?: boolean }
export type ControlConfig = boolean | ControlDeclaration
export interface ControlAccess { visible: boolean; disabled: boolean }
const record = (value: unknown): Record<string, unknown> | undefined => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
export function resolveControlAccess(local: unknown, remote?: unknown): ControlAccess {
  const own = record(local), override = record(remote)
  const visible = (local === true || own?.enabled === true) && own?.visible !== false
    && remote !== false && override?.enabled !== false && override?.visible !== false
  return { visible, disabled: visible && (own?.disabled === true || override?.disabled === true) }
}
