#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
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

if (entryPointPath !== undefined && fileURLToPath(import.meta.url) === entryPointPath) {
  main().catch((error: unknown) => {
    const logger = createRuntimeLogger()

    logger.error(
      { errorName: error instanceof Error ? error.name : "UnknownError" },
      "academyinfo MCP server failed to start",
    )
    process.exitCode = 1
  })
}
