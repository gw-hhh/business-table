import type {ConfigDiagnostic} from './diagnostics'
import type {ConfigurationObserver, ConfigurationObservers, ConfigurationSource} from './observation'
import {resolveConfiguration} from './schema'
import type {ResolveConfigurationInput, ResolvedConfiguration} from './types'

export type {ConfigurationSource} from './observation'
export interface ConfigurationAttempt {
  source: ConfigurationSource
  status: 'accepted' | 'rejected' | 'ignored'
  /** Normalized accepted value. Rejected candidates are not copied into the trace. */
  value?: unknown
  reason?: Omit<ConfigDiagnostic, 'code'> & {code: ConfigDiagnostic['code'] | 'NormalizationOmission'}
  derivedFrom?: string
}
export interface ConfigurationExplanationEntry {
  /** RFC 6901 JSON Pointer. Column IDs are escaped without losing their identity. */
  path: string
  source: ConfigurationSource | null
  effectiveValue: unknown
  history: ConfigurationAttempt[]
}
export interface ConfigurationExplanation {
  scope: 'supplied-snapshot'
  /** Feature gates, settings policies and live Runtime changes are not evaluated. */
  coverage: readonly ['columns', 'pagination', 'presentation']
  resolved: ResolvedConfiguration
  entries: ConfigurationExplanationEntry[]
}

const pointer = (path: readonly string[]) => '/' + path.map(part => part.replace(/~/g, '~0').replace(/\//g, '~1')).join('/')

/**
 * Explain only this supplied configuration snapshot, using the production parsers
 * and capability guards. Call explicitly when needed; traces are never persisted.
 */
export function explainConfiguration(input: ResolveConfigurationInput): ConfigurationExplanation {
  const entries = new Map<string, ConfigurationExplanationEntry>()
  function entry(path: readonly string[]) {
    const key = pointer(path)
    let value = entries.get(key)
    if (!value) {
      value = {path: key, source: null, effectiveValue: undefined, history: []}
      entries.set(key, value)
    }
    return value
  }
  function observer(source: ConfigurationSource): ConfigurationObserver {
    return {
      accept(path, value, effectiveValue = value) {
        const current = entry(path)
        current.source = source
        current.effectiveValue = structuredClone(effectiveValue)
        current.history.push({source, status: 'accepted', value: structuredClone(value)})
      },
      reject(path, diagnostic) {
        entry(path).history.push({source, status: 'rejected', reason: {...diagnostic}})
      },
      effective(path, value) { entry(path).effectiveValue = structuredClone(value) },
      derive(path, from, value) {
        const current = entry(path), origin = entry(from)
        current.source = origin.source
        current.effectiveValue = structuredClone(value)
        current.history.push({source: origin.source ?? source, status: 'accepted', value: structuredClone(value), derivedFrom: pointer(from)})
      },
      omit(path, message) {
        entry(path).history.push({source, status: 'ignored', reason: {code: 'NormalizationOmission', path: pointer(path), message}})
      },
    }
  }
  const observers: ConfigurationObservers = {
    declaration: observer('declaration'), default: observer('default'), remote: observer('remote'),
    preference: observer('preference'), view: observer('view'),
  }
  const resolved = resolveConfiguration(input, undefined, observers)
  return {scope: 'supplied-snapshot', coverage: ['columns', 'pagination', 'presentation'], resolved, entries: [...entries.values()]}
}
