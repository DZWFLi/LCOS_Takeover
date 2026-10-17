import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

describe('scripts/dev-all.ps1 waiting_input transport environment', () => {
  it('passes both directions of the Core and Huabu connection into their child processes', () => {
    const scriptPath = fileURLToPath(new URL('../../../scripts/dev-all.ps1', import.meta.url))
    const script = readFileSync(scriptPath, 'utf8')

    const coreCommand = script.match(/WindowTitle = 'LCOS Core[\s\S]*?npm run dev:local-core/)?.[0]
    expect(coreCommand).toContain("$env:LOCAL_CORE_API_TOKEN='dev-token'")
    expect(coreCommand).toContain("$env:HUABU_HOST_URL='http://127.0.0.1:$HUABU_API_PORT'")
    expect(coreCommand).toContain("$env:HUABU_HOST_TOKEN='dev-token'")

    const huabuCommand = script.match(/WindowTitle = 'Huabu dev[\s\S]*?pnpm dev/)?.[0]
    expect(huabuCommand).toContain("$env:HUABU_CONNECTION_TOKEN='dev-token'")
    expect(huabuCommand).toContain("$env:LCOS_CORE_URL='http://127.0.0.1:$CORE_PORT'")
    expect(huabuCommand).toContain("$env:LOCAL_CORE_API_TOKEN='dev-token'")
  })
})
