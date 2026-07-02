import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { z } from "zod"

const projectRoot = fileURLToPath(new URL("../..", import.meta.url))

const jsonRpcResponseSchema = z
  .object({
    jsonrpc: z.literal("2.0"),
    id: z.union([z.string(), z.number()]).optional(),
    result: z.unknown().optional(),
    error: z
      .object({
        code: z.number(),
        message: z.string(),
        data: z.unknown().optional(),
      })
      .optional(),
  })
  .passthrough()

const listToolsResultSchema = z
  .object({
    tools: z.array(z.object({ name: z.string() }).passthrough()),
  })
  .passthrough()

const callToolResultSchema = z
  .object({
    structuredContent: z.unknown().optional(),
  })
  .passthrough()

type JsonRpcResponse = z.infer<typeof jsonRpcResponseSchema>
type StdioMcpHarnessOptions = {
  readonly cwd?: string
  readonly entryPoint?: string
}
type ResponseHandler = {
  readonly resolve: (response: JsonRpcResponse) => void
  readonly reject: (error: Error) => void
  readonly timeout: NodeJS.Timeout
}

export function testEnvironment(overrides: Record<string, string | undefined>): Record<string, string> {
  const env: Record<string, string> = {}

  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") {
      env[key] = value
    }
  }

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete env[key]
    } else {
      env[key] = value
    }
  }

  return env
}

export class StdioMcpHarness {
  private readonly child: ChildProcessWithoutNullStreams
  private readonly responseHandlers = new Map<number, ResponseHandler>()
  private readonly stderrChunks: string[] = []
  private nextId = 1
  private stdoutBuffer = ""

  constructor(envOverrides: Record<string, string | undefined>, options: StdioMcpHarnessOptions = {}) {
    const entryPoint = options.entryPoint ?? join(projectRoot, "dist", "src", "index.js")

    this.child = spawn(process.execPath, [entryPoint], {
      cwd: options.cwd ?? projectRoot,
      env: testEnvironment(envOverrides),
      stdio: ["pipe", "pipe", "pipe"],
    })
    this.child.stdout.setEncoding("utf8")
    this.child.stderr.setEncoding("utf8")
    this.child.stdout.on("data", (chunk: string) => {
      this.handleStdout(chunk)
    })
    this.child.stderr.on("data", (chunk: string) => {
      this.stderrChunks.push(chunk)
    })
    this.child.on("error", (error) => {
      this.rejectPending(error)
    })
    this.child.on("exit", (code, signal) => {
      this.rejectPending(new Error(`MCP server exited before response: code=${code}, signal=${signal}`))
    })
  }

  stderrText(): string {
    return this.stderrChunks.join("")
  }

  async initialize(): Promise<void> {
    await this.request("initialize", {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: {
        name: "academyinfo-mcp-test",
        version: "0.0.0",
      },
    })
    this.notify("notifications/initialized", {})
  }

  async listTools(): Promise<z.infer<typeof listToolsResultSchema>> {
    const response = await this.request("tools/list", {})
    return listToolsResultSchema.parse(response.result)
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<z.infer<typeof callToolResultSchema>> {
    const response = await this.request("tools/call", { name, arguments: args })
    return callToolResultSchema.parse(response.result)
  }

  async close(): Promise<void> {
    if (this.child.exitCode !== null) {
      return
    }

    const closed = new Promise<void>((resolve) => {
      this.child.once("close", () => {
        resolve()
      })
    })

    this.child.kill()
    await closed
  }

  private request(method: string, params: Record<string, unknown>): Promise<JsonRpcResponse> {
    const id = this.nextId
    this.nextId += 1
    const message = { jsonrpc: "2.0", id, method, params }
    const response = new Promise<JsonRpcResponse>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.responseHandlers.delete(id)
        reject(new Error(`Timed out waiting for ${method}`))
      }, 15_000)

      this.responseHandlers.set(id, { resolve, reject, timeout })
    })

    this.child.stdin.write(`${JSON.stringify(message)}\n`)
    return response
  }

  private notify(method: string, params: Record<string, unknown>): void {
    this.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`)
  }

  private handleStdout(chunk: string): void {
    this.stdoutBuffer += chunk
    let newlineIndex = this.stdoutBuffer.indexOf("\n")

    while (newlineIndex >= 0) {
      const line = this.stdoutBuffer.slice(0, newlineIndex).trim()
      this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1)

      if (line.length > 0) {
        this.handleStdoutLine(line)
      }

      newlineIndex = this.stdoutBuffer.indexOf("\n")
    }
  }

  private handleStdoutLine(line: string): void {
    const response = jsonRpcResponseSchema.parse(JSON.parse(line))
    const responseId = typeof response.id === "number" ? response.id : undefined

    if (responseId === undefined) {
      return
    }

    const handler = this.responseHandlers.get(responseId)

    if (handler === undefined) {
      return
    }

    this.responseHandlers.delete(responseId)
    clearTimeout(handler.timeout)

    if (response.error !== undefined) {
      handler.reject(new Error(`JSON-RPC ${response.error.code}: ${response.error.message}`))
      return
    }

    handler.resolve(response)
  }

  private rejectPending(error: Error): void {
    for (const [id, handler] of this.responseHandlers) {
      this.responseHandlers.delete(id)
      clearTimeout(handler.timeout)
      handler.reject(error)
    }
  }
}

export async function withMcpServer<T>(
  envOverrides: Record<string, string | undefined>,
  callback: (harness: StdioMcpHarness) => Promise<T>,
  options: StdioMcpHarnessOptions = {},
): Promise<T> {
  const harness = new StdioMcpHarness(envOverrides, options)
  await harness.initialize()

  try {
    return await callback(harness)
  } finally {
    await harness.close()
  }
}

export function runDoctor(envOverrides: Record<string, string | undefined>, cwd = projectRoot): string {
  return execFileSync(process.execPath, [join(projectRoot, "scripts", "doctor.ts")], {
    cwd,
    env: testEnvironment(envOverrides),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  })
}

export function runNpmPackDryRun(): string {
  const npmExecPath = process.env["npm_execpath"]

  if (typeof npmExecPath === "string" && npmExecPath.length > 0) {
    return execFileSync(process.execPath, [npmExecPath, "pack", "--dry-run", "--json"], {
      cwd: projectRoot,
      encoding: "utf8",
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    })
  }

  return execFileSync("npm", ["pack", "--dry-run", "--json"], {
    cwd: projectRoot,
    encoding: "utf8",
    shell: process.platform === "win32",
    stdio: ["ignore", "pipe", "pipe"],
  })
}
