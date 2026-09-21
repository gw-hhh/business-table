export type ConfigDiagnosticCode = 'ConfigParseError' | 'SchemaValidationError' | 'MigrationError' | 'UnknownRegistryId' | 'CapabilityViolation' | 'FeatureDisabled' | 'RemoteConfigError' | 'DataSourceError' | 'RuntimeExtensionError'
export interface ConfigDiagnostic { code: ConfigDiagnosticCode; path: string; message: string }
export type DiagnosticReporter = (diagnostic: ConfigDiagnostic) => void
