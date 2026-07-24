#!/usr/bin/env node
import { realpathSync } from "node:fs"
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http"
import { fileURLToPath } from "node:url"

import {
  StreamableHTTPServerTransport,
  type StreamableHTTPServerTransportOptions,
} from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js"
import type { Logger } from "pino"

import { createRuntimeLogger } from "./logging.js"
import { ExplicitNonObjectArgumentsGuardTransport } from "./protocol-transport.js"
import { createAcademyinfoServer } from "./server.js"

const DEFAULT_PORT = 8080

export type HttpRuntimeOptions = {
  readonly allowedHosts: readonly string[]
  readonly logger: Logger
}

export function readAllowedHosts(env: NodeJS.ProcessEnv = process.env): readonly string[] {
  return (env["ALLOWED_HOSTS"] ?? "")
    .split(",")
    .map((host) => host.trim())
    .filter((host) => host.length > 0)
}

export function readPort(env: NodeJS.ProcessEnv = process.env): number {
  const configured = env["PORT"]?.trim()
  if (configured === undefined || configured.length === 0) {
    return DEFAULT_PORT
  }

  const port = Number(configured)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT must be an integer between 1 and 65535, not: ${configured}`)
  }

  return port
}

export function createAcademyinfoHttpServer(options: HttpRuntimeOptions): Server {
  return createServer((request, response) => {
    void handleHttpRequest(request, response, options)
  })
}

async function handleHttpRequest(
  request: IncomingMessage,
  response: ServerResponse,
  options: HttpRuntimeOptions,
): Promise<void> {
  // Google Frontend consumes the literal /healthz path on run.app domains
  // before it reaches the container, so /health serves the same probe publicly.
  if (request.url === "/healthz" || request.url === "/health") {
    response.writeHead(200, { "content-type": "text/plain" })
    response.end("ok")
    return
  }

  const path = request.url?.split("?", 1)[0]
  if (path !== "/mcp") {
    response.writeHead(404, { "content-type": "text/plain" })
    response.end("not found")
    return
  }

  // Stateless mode has no SSE stream or session to serve: GET and DELETE
  // stay unsupported so only single-shot POST requests reach the transport.
  if (request.method !== "POST") {
    response.writeHead(405, { allow: "POST", "content-type": "text/plain" })
    response.end("method not allowed")
    return
  }

  // Every request gets fresh server and transport instances so no state can
  // leak between requests under autoscaling or multiple instances.
  const server = createAcademyinfoServer()
  const transportOptions: StreamableHTTPServerTransportOptions = {
    enableJsonResponse: true,
    ...(options.allowedHosts.length > 0
      ? { enableDnsRebindingProtection: true, allowedHosts: [...options.allowedHosts] }
      : {}),
  }
  const inner = new StreamableHTTPServerTransport(transportOptions)
  // The SDK transport types onclose/onerror/onmessage accessors as `| undefined`,
  // which exactOptionalPropertyTypes rejects against the optional Transport
  // properties; the runtime shape is compatible.
  const transport = new ExplicitNonObjectArgumentsGuardTransport(inner as Transport)

  response.on("close", () => {
    void inner.close()
    void server.close()
  })

  try {
    await server.connect(transport)
    await inner.handleRequest(request, response)
  } catch (error: unknown) {
    options.logger.error(
      {
        event: "academyinfo_mcp_http_request_failed",
        errorName: error instanceof Error ? error.name : "UnknownError",
      },
      "academyinfo MCP HTTP request failed",
    )
    if (!response.headersSent) {
      response.writeHead(500, { "content-type": "application/json" })
      response.end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        }),
      )
    }
  }
}

export function main(): void {
  const logger = createRuntimeLogger()
  const port = readPort()
  const allowedHosts = readAllowedHosts()
  const httpServer = createAcademyinfoHttpServer({ allowedHosts, logger })

  httpServer.listen(port, () => {
    logger.info(
      { event: "academyinfo_mcp_http_listening", port, allowedHosts: [...allowedHosts] },
      "listening for MCP over streamable HTTP",
    )
  })
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
  } catch (error: unknown) {
    const logger = createRuntimeLogger()

    logger.error(
      {
        event: "academyinfo_mcp_entry_point_resolution_failed",
        errorName: error instanceof Error ? error.name : "UnknownError",
      },
      "academyinfo MCP HTTP entry point could not be resolved",
    )
    process.exitCode = 1
    return false
  }
}

if (isDirectEntryPoint()) {
  try {
    main()
  } catch (error: unknown) {
    const logger = createRuntimeLogger()

    logger.error(
      { errorName: error instanceof Error ? error.name : "UnknownError" },
      "academyinfo MCP HTTP server failed to start",
    )
    process.exitCode = 1
  }
}
