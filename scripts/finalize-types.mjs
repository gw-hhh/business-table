import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// CSS side effects belong to the runtime entry, not the declaration graph.
function visit(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name)
    if (entry.isDirectory()) visit(file)
    else if (entry.name.endsWith('.d.ts')) {
      const declaration = readFileSync(file, 'utf8')
        .replace(/^import\s+['"][^'"\n]+\.css['"];?\s*$/gm, '')
      writeFileSync(file, declaration)
    }
  }
}
visit(fileURLToPath(new URL('../dist/types/', import.meta.url)))
