import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"

import { findProjectRoot } from "./database-paths.js"
import { registerAcademyinfoTools } from "./tools.js"

const packageVersionSchema = z.object({ version: z.string().min(1) })

// A missing or version-less package.json must degrade the reported version, not
// prevent startup: the error-path contract keeps the server serving explicit
// missing_db responses from minimal runtime roots.
const UNRESOLVED_PACKAGE_VERSION = "0.0.0-unknown"

function readPackageVersion(): string {
  try {
    const projectRoot = findProjectRoot(dirname(fileURLToPath(import.meta.url)))
    const packageJson: unknown = JSON.parse(
      readFileSync(join(projectRoot, "package.json"), "utf8"),
    )
    const parsed = packageVersionSchema.safeParse(packageJson)
    return parsed.success ? parsed.data.version : UNRESOLVED_PACKAGE_VERSION
  } catch {
    return UNRESOLVED_PACKAGE_VERSION
  }
}

const packageVersion = readPackageVersion()

export function createAcademyinfoServer(): McpServer {
  const server = new McpServer({
    name: "academyinfo-mcp",
    version: packageVersion,
  })

  registerAcademyinfoTools(server)

  return server
}
