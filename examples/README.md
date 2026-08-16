# Connector configurations

Many MCP clients register servers by taking a pasted `mcpServers` object rather
than a command line. This directory holds that object for `academyinfo-mcp`, ready
to paste.

## The format

Each key under `mcpServers` is the server's name, and several servers can be
registered in one paste. A client reads the transport from **which key the entry
has** — `command` for stdio, `url` for HTTP — so no separate transport field is
needed:

```json
{
  "mcpServers": {
    "a-stdio-server": {
      "command": "npx",
      "args": ["-y", "some-mcp-package"]
    },
    "an-http-server": {
      "description": "shown in some clients",
      "url": "https://example.invalid/mcp",
      "headers": { "Authorization": "Bearer TOKEN" }
    }
  }
}
```

`description` and `headers` are optional; `headers` only matters for an endpoint
that requires credentials.

> Claude Code writes its own `.mcp.json` entries with an explicit `"type": "http"`.
> That key belongs to Claude Code's file format, not to this pasted-object format —
> at least one connector dialog rejects an entry that carries it.

## This server

Paste one of these, not both: they share the key `academyinfo`, so pasting both
would register the server twice.

**Hosted, nothing to install** ([`connector-remote.json`](connector-remote.json)):

```json
{
  "mcpServers": {
    "academyinfo": {
      "description": "Korean university disclosure indicators (대학알리미) — 488 institutions, 17 indicators",
      "url": "https://academyinfo-mcp-433006350023.asia-northeast3.run.app/mcp"
    }
  }
}
```

No credentials are needed, so no `headers` are set.

**Local, run by `npx`** ([`connector-local.json`](connector-local.json)) — needs
Node `>=22 <23`:

```json
{
  "mcpServers": {
    "academyinfo": {
      "command": "npx",
      "args": ["-y", "academyinfo-mcp"]
    }
  }
}
```

This follows `latest`. To hold a version, use `academyinfo-mcp@0.4.0` in `args`.

## Which to choose

Both serve the same bundled point-in-time snapshot and the same eight tools.

The local form has no external dependency and lets you pin a version, which suits
analysis you need to reproduce later. The hosted form needs nothing installed,
which suits trying the server out or a client that cannot run local processes — but
it is a personal deployment offered as-is, with no availability guarantee. See
[Support](../README.md#support).

If a client accepts the entry but no tools appear, the configuration is not the
problem: check whether the network allows outbound connections to the endpoint.
