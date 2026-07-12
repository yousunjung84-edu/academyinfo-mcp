import type { Transport, TransportSendOptions } from "@modelcontextprotocol/sdk/shared/transport.js"
import { ErrorCode } from "@modelcontextprotocol/sdk/types.js"
import type { JSONRPCMessage, MessageExtraInfo, RequestId } from "@modelcontextprotocol/sdk/types.js"

function hasExplicitNonObjectArguments(message: JSONRPCMessage): message is JSONRPCMessage & {
  readonly id: RequestId
} {
  if (!("method" in message) || !("id" in message) || message.method !== "tools/call") {
    return false
  }

  const params = message.params
  if (
    params === undefined
    || params["name"] !== "explore_universities"
    || !Object.hasOwn(params, "arguments")
  ) {
    return false
  }

  const toolArguments = params["arguments"]
  return toolArguments === null
    || Array.isArray(toolArguments)
    || typeof toolArguments === "string"
    || typeof toolArguments === "number"
    || typeof toolArguments === "boolean"
}

/**
 * Preserves SDK transport behavior except for explicit non-object arguments to
 * explore_universities that SDK 1.29.0 otherwise reports as an internal error.
 */
export class ExplicitNonObjectArgumentsGuardTransport implements Transport {
  onclose?: () => void
  onerror?: (error: Error) => void
  onmessage?: <T extends JSONRPCMessage>(message: T, extra?: MessageExtraInfo) => void

  constructor(private readonly transport: Transport) {}


  async start(): Promise<void> {
    this.transport.onclose = () => this.onclose?.()
    this.transport.onerror = (error) => this.onerror?.(error)
    this.transport.onmessage = (message, extra) => {
      if (hasExplicitNonObjectArguments(message)) {
        void this.transport.send({
          jsonrpc: "2.0",
          id: message.id,
          error: {
            code: ErrorCode.InvalidParams,
            message: "Invalid params",
          },
        }, { relatedRequestId: message.id }).catch((error: unknown) => {
          this.onerror?.(error instanceof Error ? error : new Error(String(error)))
        })
        return
      }

      this.onmessage?.(message, extra)
    }

    await this.transport.start()
  }

  async send(message: JSONRPCMessage, options?: TransportSendOptions): Promise<void> {
    await this.transport.send(message, options)
  }

  async close(): Promise<void> {
    await this.transport.close()
  }

  setProtocolVersion(version: string): void {
    this.transport.setProtocolVersion?.(version)
  }
}
