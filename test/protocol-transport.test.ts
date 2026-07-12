import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import type { Transport, TransportSendOptions } from "@modelcontextprotocol/sdk/shared/transport.js"
import type { JSONRPCMessage, MessageExtraInfo } from "@modelcontextprotocol/sdk/types.js"
import { PassThrough } from "node:stream"
import { describe, expect, it, vi } from "vitest"

import { ExplicitNonObjectArgumentsGuardTransport } from "../src/protocol-transport.js"

class RecordingTransport implements Transport {
  readonly sent: Array<readonly [JSONRPCMessage, TransportSendOptions | undefined]> = []
  started = false
  closed = false
  protocolVersion: string | undefined
  onclose?: () => void
  onerror?: (error: Error) => void
  onmessage?: <T extends JSONRPCMessage>(message: T, extra?: MessageExtraInfo) => void

  async start(): Promise<void> {
    this.started = true
  }

  async send(message: JSONRPCMessage, options?: TransportSendOptions): Promise<void> {
    this.sent.push([message, options])
  }

  async close(): Promise<void> {
    this.closed = true
    this.onclose?.()
  }

  setProtocolVersion(version: string): void {
    this.protocolVersion = version
  }

  receive(message: JSONRPCMessage): void {
    this.onmessage?.(message)
  }
}

function toolCall(id: number, toolArguments: unknown, includeArguments = true): JSONRPCMessage {
  return {
    jsonrpc: "2.0",
    id,
    method: "tools/call",
    params: {
      name: "explore_universities",
      ...(includeArguments ? { arguments: toolArguments } : {}),
    },
  }
}

async function settleTransportWrites(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve))
}

describe("ExplicitNonObjectArgumentsGuardTransport", () => {
  it.each([
    [null, 1],
    [[], 2],
    ["private-value", 3],
    [17, 4],
    [false, 5],
  ] as const)("guards explicit non-object arguments %# without forwarding", async (value, id) => {
    const inner = new RecordingTransport()
    const transport = new ExplicitNonObjectArgumentsGuardTransport(inner)
    const onmessage = vi.fn()
    transport.onmessage = onmessage
    await transport.start()

    inner.receive(toolCall(id, value))
    await settleTransportWrites()

    expect(onmessage).not.toHaveBeenCalled()
    expect(inner.sent).toEqual([[
      {
        jsonrpc: "2.0",
        id,
        error: {
          code: -32602,
          message: "Invalid params",
        },
      },
      { relatedRequestId: id },
    ]])
    expect(JSON.stringify(inner.sent)).not.toContain("private-value")
  })

  it("forwards omitted, undefined, object, other-method, and notification messages unchanged", async () => {
    const inner = new RecordingTransport()
    const transport = new ExplicitNonObjectArgumentsGuardTransport(inner)
    const forwarded: JSONRPCMessage[] = []
    transport.onmessage = (message) => forwarded.push(message)
    await transport.start()

    const messages = [
      toolCall(1, undefined, false),
      toolCall(2, undefined),
      toolCall(3, { university_queries: ["전남대학교 본교"] }),
      {
        jsonrpc: "2.0",
        id: 4,
        method: "resources/read",
        params: { arguments: null },
      },
      {
        jsonrpc: "2.0",
        method: "tools/call",
        params: { name: "explore_universities", arguments: null },
      },
    ] as JSONRPCMessage[]

    for (const message of messages) {
      inner.receive(message)
    }

    expect(forwarded).toHaveLength(messages.length)
    forwarded.forEach((message, index) => expect(message).toBe(messages[index]))
    expect(inner.sent).toEqual([])
  })

  it("forwards a legacy tool explicit non-object call untouched", async () => {
    const inner = new RecordingTransport()
    const transport = new ExplicitNonObjectArgumentsGuardTransport(inner)
    const forwarded: JSONRPCMessage[] = []
    transport.onmessage = (message) => forwarded.push(message)
    await transport.start()

    const request: JSONRPCMessage = {
      jsonrpc: "2.0",
      id: 41,
      method: "tools/call",
      params: {
        name: "list_sources",
        arguments: null,
      },
    }
    inner.receive(request)

    expect(forwarded).toEqual([request])
    expect(forwarded[0]).toBe(request)
    expect(inner.sent).toEqual([])
  })

  it("delegates lifecycle, outgoing messages, and protocol version without writing elsewhere", async () => {
    const inner = new RecordingTransport()
    const transport = new ExplicitNonObjectArgumentsGuardTransport(inner)
    const onclose = vi.fn()
    const onerror = vi.fn()
    transport.onclose = onclose
    transport.onerror = onerror

    await transport.start()
    const outgoing: JSONRPCMessage = { jsonrpc: "2.0", id: 8, result: {} }
    await transport.send(outgoing, { relatedRequestId: 8 })
    transport.setProtocolVersion("2025-11-25")
    const error = new Error("transport failed")
    inner.onerror?.(error)
    await transport.close()

    expect(inner.started).toBe(true)
    expect(inner.sent).toEqual([[outgoing, { relatedRequestId: 8 }]])
    expect(inner.protocolVersion).toBe("2025-11-25")
    expect(inner.closed).toBe(true)
    expect(onerror).toHaveBeenCalledWith(error)
    expect(onclose).toHaveBeenCalledOnce()
  })

  it("guards all five explicit non-object values at the raw stdio boundary", async () => {
    const stdin = new PassThrough()
    const stdout = new PassThrough()
    const output: Buffer[] = []
    stdout.on("data", (chunk: Buffer) => output.push(chunk))

    const transport = new ExplicitNonObjectArgumentsGuardTransport(
      new StdioServerTransport(stdin, stdout),
    )
    const onmessage = vi.fn()
    transport.onmessage = onmessage
    await transport.start()

    for (const [index, value] of [null, [], "private-value", 17, false].entries()) {
      stdin.write(`${JSON.stringify(toolCall(index + 1, value))}\n`)
    }
    await settleTransportWrites()

    expect(onmessage).not.toHaveBeenCalled()
    const responses = Buffer.concat(output)
      .toString("utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as unknown)
    expect(responses).toEqual([1, 2, 3, 4, 5].map((id) => ({
      jsonrpc: "2.0",
      id,
      error: { code: -32602, message: "Invalid params" },
    })))
    expect(Buffer.concat(output).toString("utf8")).not.toContain("private-value")

    await transport.close()
  })

  it("forwards an omitted-arguments call from raw stdio without producing a response", async () => {
    const stdin = new PassThrough()
    const stdout = new PassThrough()
    const output: Buffer[] = []
    stdout.on("data", (chunk: Buffer) => output.push(chunk))

    const transport = new ExplicitNonObjectArgumentsGuardTransport(
      new StdioServerTransport(stdin, stdout),
    )
    const onmessage = vi.fn()
    transport.onmessage = onmessage
    await transport.start()

    const request = toolCall(31, undefined, false)
    stdin.write(`${JSON.stringify(request)}\n`)
    await settleTransportWrites()

    expect(onmessage).toHaveBeenCalledOnce()
    expect(onmessage).toHaveBeenCalledWith(request, undefined)
    expect(output).toEqual([])

    await transport.close()
  })
})
