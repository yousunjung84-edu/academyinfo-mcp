// Cross-platform smoke test for an *installed* academyinfo-mcp server.
// Usage: node scripts/smoke-installed.mjs <path-to-installed-dist/src/index.js>
// Exits 0 on success, non-zero on failure. Used by CI after `npm pack` + clean install,
// and runnable locally against a temp install.
import { spawn } from "node:child_process"

const bin = process.argv[2]
if (bin === undefined) {
  console.error("usage: node scripts/smoke-installed.mjs <installed index.js>")
  process.exit(2)
}

const server = spawn(process.execPath, [bin], { stdio: ["pipe", "pipe", "pipe"] })
let stdout = ""
server.stdout.on("data", (chunk) => {
  stdout += chunk.toString()
})

const send = (message) => server.stdin.write(`${JSON.stringify(message)}\n`)

send({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "ci-smoke", version: "0" },
  },
})
send({ jsonrpc: "2.0", method: "notifications/initialized" })
setTimeout(() => send({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "list_indicators", arguments: {} } }), 500)

setTimeout(() => {
  server.kill()

  let initialized = false
  let toolStatus
  for (const line of stdout.split("\n").filter(Boolean)) {
    try {
      const message = JSON.parse(line)
      if (message.id === 1 && message.result?.serverInfo?.name === "academyinfo-mcp") {
        initialized = true
      }
      if (message.id === 2) {
        const payload = JSON.parse(message.result.content[0].text)
        toolStatus = payload.status
      }
    } catch {
      // JSON-RPC frames only; ignore anything unparsable.
    }
  }

  if (/academyinfo_mcp_starting/.test(stdout)) {
    console.error("FAIL: server logged to stdout (would corrupt JSON-RPC)")
    process.exit(1)
  }
  if (!initialized) {
    console.error("FAIL: server did not initialize (entry point / startup)")
    process.exit(1)
  }
  if (toolStatus !== "ok") {
    console.error(`FAIL: list_indicators returned status=${String(toolStatus)}`)
    process.exit(1)
  }

  console.log("SMOKE OK: installed bin started and served list_indicators (status=ok)")
  process.exit(0)
}, 2500)
