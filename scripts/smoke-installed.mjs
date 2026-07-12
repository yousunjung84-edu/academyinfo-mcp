// Local-tarball smoke for an installed academyinfo-mcp server.
// This produces local installation evidence only; it is never public-npm acceptance proof.
// Usage: node scripts/smoke-installed.mjs <path-to-installed-dist/src/index.js>
import { spawn } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { basename, dirname, join, parse, resolve } from "node:path"

const EXPECTED_TOOLS = [
  "list_sources",
  "list_indicators",
  "search_university",
  "get_university_metrics",
  "compare_universities",
  "explain_indicator",
  "validate_source_coverage",
  "explore_universities",
]
const EXPECTED_DEPENDENCIES = {
  "@modelcontextprotocol/sdk": "1.29.0",
  zod: "4.4.3",
  "better-sqlite3": "11.10.0",
  pino: "10.3.1",
}

function fail(message) {
  console.error(`FAIL: ${message}`)
  process.exit(1)
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"))
}

function readInstalledPackageIdentity(binPath, packageName) {
  let current = dirname(resolve(binPath))
  const filesystemRoot = parse(current).root

  while (current !== filesystemRoot) {
    const candidates = [
      join(current, "node_modules", packageName, "package.json"),
      ...(basename(current) === "node_modules"
        ? [join(current, packageName, "package.json")]
        : []),
    ]

    for (const packageJsonPath of candidates) {
      if (!existsSync(packageJsonPath)) {
        continue
      }
      const packageJson = readJson(packageJsonPath)
      if (packageJson.name === packageName && typeof packageJson.version === "string") {
        return { name: packageJson.name, version: packageJson.version }
      }
    }

    current = dirname(current)
  }

  throw new Error("installed dependency identity unavailable")
}

const bin = process.argv[2]
if (bin === undefined) {
  console.error("usage: node scripts/smoke-installed.mjs <installed index.js>")
  process.exit(2)
}

let application
let dependencies
try {
  const packageRoot = resolve(dirname(bin), "../..")
  const packageJson = readJson(join(packageRoot, "package.json"))
  application = {
    name: packageJson.name,
    version: packageJson.version,
    node_engine: packageJson.engines?.node,
  }
  dependencies = Object.fromEntries(
    Object.entries(EXPECTED_DEPENDENCIES).map(([name, expectedVersion]) => {
      const identity = readInstalledPackageIdentity(bin, name)
      if (identity.name !== name || identity.version !== expectedVersion) {
        throw new Error("installed dependency identity mismatch")
      }
      return [name, identity]
    }),
  )
} catch {
  fail("installed package or dependency identity check failed")
}

const nodeMajor = Number.parseInt(process.versions.node.split(".")[0], 10)
if (
  application.name !== "academyinfo-mcp" ||
  application.node_engine !== ">=22 <23" ||
  nodeMajor !== 22
) {
  fail("installed application identity or Node 22 runtime contract differs")
}

const serverEnvironment = {
  ...process.env,
  DATA_GO_KR_SERVICE_KEY: "",
  ACADEMYINFO_SERVICE_KEY: "",
}
delete serverEnvironment.ACADEMYINFO_DB_PATH

const server = spawn(process.execPath, [bin], {
  env: serverEnvironment,
  stdio: ["pipe", "pipe", "pipe"],
})
let stdoutBuffer = ""
let stderrSeen = false
let settled = false
let listedTools

function stopWithFailure(message) {
  if (settled) return
  settled = true
  server.kill()
  fail(message)
}

function send(message) {
  server.stdin.write(`${JSON.stringify(message)}\n`)
}

function handleMessage(message) {
  if (message?.jsonrpc !== "2.0") {
    stopWithFailure("server stdout contained a non-JSON-RPC message")
    return
  }

  if (message.id === 1) {
    if (message.result?.serverInfo?.name !== "academyinfo-mcp") {
      stopWithFailure("server did not return the expected initialize identity")
      return
    }
    send({ jsonrpc: "2.0", method: "notifications/initialized" })
    send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} })
    return
  }

  if (message.id === 2) {
    const tools = message.result?.tools
    if (!Array.isArray(tools)) {
      stopWithFailure("tools/list did not return a tool array")
      return
    }

    const names = tools.map((tool) => tool?.name)
    if (JSON.stringify(names) !== JSON.stringify(EXPECTED_TOOLS)) {
      stopWithFailure("tools/list names or order differ from the installed contract")
      return
    }
    if (tools.some((tool) => tool?.inputSchema?.type !== "object")) {
      stopWithFailure("tools/list returned a non-object input schema")
      return
    }

    listedTools = tools.map((tool) => ({
      name: tool.name,
      inputSchema: tool.inputSchema,
      outputSchema: tool.outputSchema ?? null,
    }))
    send({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "list_indicators", arguments: {} },
    })
    return
  }

  if (message.id === 3) {
    let payload
    try {
      payload = JSON.parse(message.result?.content?.[0]?.text)
    } catch {
      stopWithFailure("list_indicators did not return JSON text content")
      return
    }
    if (payload.status !== "ok") {
      stopWithFailure("list_indicators did not return status=ok")
      return
    }

    settled = true
    server.kill()
    console.log(
      JSON.stringify({
        evidence_kind: "local_tarball_install_smoke",
        public_npm_acceptance: false,
        application,
        dependencies,
        runtime: {
          node_major: nodeMajor,
          platform: process.platform,
          arch: process.arch,
        },
        tools: listedTools,
        call: { name: "list_indicators", status: payload.status },
        server_stderr: stderrSeen ? "present" : "empty",
      }),
    )
    process.exit(0)
  }
}

server.on("error", () => stopWithFailure("installed server process could not start"))
server.stdin.on("error", () => stopWithFailure("installed server stdin closed unexpectedly"))
server.stderr.on("data", () => {
  stderrSeen = true
})
server.stdout.on("data", (chunk) => {
  stdoutBuffer += chunk.toString()
  for (;;) {
    const newlineIndex = stdoutBuffer.indexOf("\n")
    if (newlineIndex < 0) break
    const line = stdoutBuffer.slice(0, newlineIndex).trim()
    stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1)
    if (line.length === 0) continue
    try {
      handleMessage(JSON.parse(line))
    } catch {
      stopWithFailure("server stdout contained malformed JSON")
    }
  }
})
server.on("exit", () => {
  if (!settled) stopWithFailure("installed server exited before smoke completion")
})

send({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "local-tarball-ci-smoke", version: "0" },
  },
})

setTimeout(() => stopWithFailure("installed server smoke timed out"), 10_000).unref()
