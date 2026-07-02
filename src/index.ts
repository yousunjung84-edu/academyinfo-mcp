#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { realpathSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { createRuntimeLogger } from "./logging.js"
import { createAcademyinfoServer } from "./server.js"

export async function main(): Promise<void> {
  const logger = createRuntimeLogger()
  const server = createAcademyinfoServer()
  const transport = new StdioServerTransport()

  logger.info({ event: "academyinfo_mcp_starting" }, "starting academyinfo MCP server")
  await server.connect(transport)
}

const entryPointPath = process.argv[1]

// Resolve symlinks on both sides before comparing: import.meta.url is realpath-resolved
// by Node, but process.argv[1] is not, so a symlinked path (e.g. macOS /var -> /private/var
// temp dirs, or npm/npx install locations) would otherwise skip main() and exit silently.
function isDirectEntryPoint(): boolean {
  if (entryPointPath === undefined) {
    return false
  }

  try {
    return realpathSync(entryPointPath) === fileURLToPath(import.meta.url)
  } catch {
    return false
  }
}

if (isDirectEntryPoint()) {
  main().catch((error: unknown) => {
    const logger = createRuntimeLogger()

    logger.error(
      { errorName: error instanceof Error ? error.name : "UnknownError" },
      "academyinfo MCP server failed to start",
    )
    process.exitCode = 1
  })
}
