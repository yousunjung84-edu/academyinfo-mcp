import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"

import { registerAcademyinfoTools } from "./tools.js"

export function createAcademyinfoServer(): McpServer {
  const server = new McpServer({
    name: "academyinfo-mcp",
    version: "0.1.0",
  })

  registerAcademyinfoTools(server)

  return server
}
