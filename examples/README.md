# Connector configurations

Ready-to-paste `mcpServers` entries for clients that accept the standard Claude
connector format. Each file registers one server, so paste whichever matches how
you want to run it — not both, or the tools appear twice.

| file | how it runs | needs |
|---|---|---|
| [`connector-local.json`](connector-local.json) | `npx` downloads and runs the published package over stdio | Node `>=22 <23` |
| [`connector-remote.json`](connector-remote.json) | connects to a hosted endpoint over Streamable HTTP | nothing installed |

The local form pins nothing, so it follows `latest`. To hold a version, use
`academyinfo-mcp@0.4.0` in the `args` array.

Both serve the same bundled point-in-time snapshot. The hosted endpoint is a
personal deployment offered as-is with no availability guarantee; the local form
does not depend on it. See [Support](../README.md#support).
