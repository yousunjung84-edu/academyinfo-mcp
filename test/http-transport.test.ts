import { readFile } from "node:fs/promises"
import type { Server } from "node:http"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { z } from "zod"

import { handleExploreUniversities } from "../src/explore-universities-handler.js"
import { createAcademyinfoHttpServer, readAllowedHosts, readPort } from "../src/http.js"
import { createRuntimeLogger } from "../src/logging.js"

const projectRoot = fileURLToPath(new URL("..", import.meta.url))

const silentLogger = createRuntimeLogger({
  write: () => {},
})

const toolListResultSchema = z.object({
  result: z.object({
    tools: z.array(
      z.object({
        name: z.string(),
        annotations: z
          .object({
            title: z.string(),
            readOnlyHint: z.boolean(),
            openWorldHint: z.boolean(),
          })
          .passthrough(),
      }),
    ),
  }),
})

const toolCallResultSchema = z.object({
  result: z.object({
    structuredContent: z.record(z.string(), z.unknown()),
  }),
})

const expectedToolNames = [
  "list_sources",
  "list_indicators",
  "search_university",
  "get_university_metrics",
  "compare_universities",
  "explain_indicator",
  "validate_source_coverage",
  "explore_universities",
] as const

async function postMcp(baseUrl: string, body: unknown): Promise<Response> {
  return fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify(body),
  })
}

function withoutGeneratedAt(payload: Record<string, unknown>): Record<string, unknown> {
  const { generated_at: _generatedAt, ...rest } = payload
  return rest
}

describe("streamable HTTP transport", () => {
  let httpServer: Server
  let baseUrl = ""

  beforeAll(async () => {
    httpServer = createAcademyinfoHttpServer({ allowedHosts: [], logger: silentLogger })
    await new Promise<void>((resolve) => {
      httpServer.listen(0, "127.0.0.1", () => {
        resolve()
      })
    })
    const address = httpServer.address()
    if (address === null || typeof address === "string") {
      throw new Error("Expected the HTTP server to listen on a TCP port.")
    }
    baseUrl = `http://127.0.0.1:${address.port}`
  })

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      httpServer.close((error) => {
        if (error) {
          reject(error)
        } else {
          resolve()
        }
      })
    })
  })

  it("reads PORT and ALLOWED_HOSTS from the environment with strict validation", () => {
    expect(readPort({})).toBe(8080)
    expect(readPort({ PORT: "9090" })).toBe(9090)
    expect(() => readPort({ PORT: "not-a-port" })).toThrow("PORT must be an integer")
    expect(() => readPort({ PORT: "0" })).toThrow("PORT must be an integer")

    expect(readAllowedHosts({})).toEqual([])
    expect(readAllowedHosts({ ALLOWED_HOSTS: "" })).toEqual([])
    expect(readAllowedHosts({ ALLOWED_HOSTS: "a.example.com, b.example.com ," })).toEqual([
      "a.example.com",
      "b.example.com",
    ])
  })

  it("serves a plain-text health check on /healthz and /health", async () => {
    for (const path of ["/healthz", "/health"] as const) {
      const response = await fetch(`${baseUrl}${path}`)

      expect(response.status).toBe(200)
      expect(await response.text()).toBe("ok")
    }
  })

  it("returns 404 for paths outside /healthz and /mcp", async () => {
    const response = await fetch(`${baseUrl}/`)

    expect(response.status).toBe(404)
  })

  it("rejects non-POST /mcp methods with 405 and an Allow header", async () => {
    for (const method of ["GET", "DELETE"] as const) {
      const response = await fetch(`${baseUrl}/mcp`, { method })

      expect(response.status).toBe(405)
      expect(response.headers.get("allow")).toBe("POST")
    }
  })

  it("reports the package.json version over an HTTP initialize", async () => {
    const packageJson = z
      .object({ version: z.string() })
      .passthrough()
      .parse(JSON.parse(await readFile(join(projectRoot, "package.json"), "utf8")))

    const response = await postMcp(baseUrl, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "http-transport-probe", version: "0.0.1" },
      },
    })

    expect(response.status).toBe(200)
    const body = z
      .object({ result: z.object({ serverInfo: z.object({ name: z.string(), version: z.string() }) }) })
      .passthrough()
      .parse(await response.json())
    expect(body.result.serverInfo).toEqual({
      name: "academyinfo-mcp",
      version: packageJson.version,
    })
  })

  it("lists all eight read-only tools on a fresh stateless request", async () => {
    const response = await postMcp(baseUrl, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {},
    })

    expect(response.status).toBe(200)
    const body = toolListResultSchema.passthrough().parse(await response.json())
    expect(body.result.tools.map((tool) => tool.name)).toEqual([...expectedToolNames])
    for (const tool of body.result.tools) {
      expect(tool.annotations.readOnlyHint).toBe(true)
      expect(tool.annotations.openWorldHint).toBe(false)
    }
  })

  it("returns the same explore_universities payload over HTTP as the in-process handler", async () => {
    const input = {
      university_queries: ["전남대학교 본교", "부산대학교"],
      indicators: ["employment_rate", "competition_rate"],
    }

    const response = await postMcp(baseUrl, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "explore_universities", arguments: input },
    })

    expect(response.status).toBe(200)
    const body = toolCallResultSchema.passthrough().parse(await response.json())
    const inProcess = handleExploreUniversities(input).structuredContent as Record<string, unknown>

    expect(withoutGeneratedAt(body.result.structuredContent)).toEqual(withoutGeneratedAt(inProcess))
  })

  it("rejects explicit non-object explore_universities arguments like the stdio guard", async () => {
    const response = await postMcp(baseUrl, {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "explore_universities", arguments: "not-an-object" },
    })

    expect(response.status).toBe(200)
    const body = z
      .object({ error: z.object({ code: z.number(), message: z.string() }) })
      .passthrough()
      .parse(await response.json())
    expect(body.error.code).toBe(-32602)
  })
})
