import type {ConfigDiagnostic} from './diagnostics'

/** Optional normalization observer. Runtime resolution does not allocate a trace. */
export interface ConfigurationObserver {
  accept(path: readonly string[], value: unknown, effectiveValue?: unknown): void
  reject(path: readonly string[], diagnostic: ConfigDiagnostic): void
  effective(path: readonly string[], value: unknown): void
  derive(path: readonly string[], from: readonly string[], value: unknown): void
  omit(path: readonly string[], message: string): void
}

export type ConfigurationSource = 'declaration' | 'default' | 'remote' | 'preference' | 'view'
export type ConfigurationObservers = Record<ConfigurationSource, ConfigurationObserver>
