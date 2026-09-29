import type {ToolDefinition} from '../presentation/model'

export async function preloadTool(tool: ToolDefinition | undefined): Promise<void> {
  if (!tool || tool.visible === false || tool.disabled === true) return
  try { await tool.preload?.() } catch { /* Intent is speculative; opening owns error feedback. */ }
}
