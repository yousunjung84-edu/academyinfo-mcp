#!/usr/bin/env node
import { createHash } from "node:crypto"
import { spawn } from "node:child_process"
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { basename, dirname, isAbsolute, join, parse, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { StringDecoder } from "node:string_decoder"

const PACKAGE_NAME = "academyinfo-mcp"
const PUBLIC_REGISTRY = "https://registry.npmjs.org/"
const SDK_VERSION = "1.29.0"
const ZOD_VERSION = "4.4.3"
const BETTER_SQLITE3_VERSION = "11.10.0"
const PINO_VERSION = "10.3.1"
const DIRECT_DEPENDENCY_VERSIONS = Object.freeze({
  "@modelcontextprotocol/sdk": SDK_VERSION,
  "better-sqlite3": BETTER_SQLITE3_VERSION,
  pino: PINO_VERSION,
  zod: ZOD_VERSION,
})
export const PUBLIC_RECEIPT_IDENTIFIER = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,63})$/u
export const CLIENT_POLICY_VERSIONS = Object.freeze([
  Object.freeze({ policy: "actual-client", version: "v1" }),
  Object.freeze({ policy: "public-install", version: "v1" }),
  Object.freeze({ policy: "release", version: "v1" }),
])
const DIGEST = /^[a-f0-9]{64}$/
const COMMIT = /^[a-f0-9]{40}$/
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/
const TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
const REGISTRY_BODY_LIMIT = 8 * 1024 * 1024
const RECEIPT_BODY_LIMIT = 1024 * 1024
const PACKAGE_JSON_LIMIT = 1024 * 1024
const LOCKFILE_LIMIT = 8 * 1024 * 1024
const PROTOCOL_OUTPUT_LIMIT = 8 * 1024 * 1024
const PROTOCOL_LINE_LIMIT = 1024 * 1024
const REGISTRY_TIMEOUT_MS = 20_000
const REGISTRY_PROGRESS_TIMEOUT_MS = 5_000
const PRIVATE_MATERIAL = /(?:file:\/\/|[?&](?:key|token|signature|x-amz-)|\/(?:Users|home|private|tmp)\/|\/var\/folders\/|[A-Za-z]:[\\/](?:Users|Temp|Documents and Settings)[\\/]|\\\\[^\\\r\n]+\\[^\\\r\n]+)/iu
const SECRET_KEY_NAME = /(?:^|_)(?:api_?keys?|service_?keys?|access_?keys?|private_?keys?|secrets?|tokens?|passwords?|credentials?|authorizations?|authentications?|auth)(?:_|$)/u
const SECRET_VALUE = /(?:-----BEGIN [^-]*PRIVATE KEY-----|\b(?:github_pat_|gh[pousr]_|npm_|xox[baprs]-|AKIA[0-9A-Z]{16})[A-Za-z0-9_./+=-]*|\b(?:api[_-]?key|service[_-]?key|access[_-]?key|private[_-]?key|secret|token|password|credential|authorization|auth)\s*[:=]\s*\S+)/iu
const SAFE_SECRET_ABSENCE_KEYS = new Set(["data_go_kr_service_key", "academyinfo_service_key"])
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
const BUNDLED_DATASET_ID = "15118998"
const BUNDLED_QUERY = {
  university_queries: ["전남대학교 본교"],
  indicators: ["competition_rate"],
}
export const EXPECTED_EXPLORE_SCHEMA = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  properties: {
    university_queries: {},
    indicators: {},
  },
  additionalProperties: {},
}

export function isExactExploreSchema(value) {
  return canonicalizeJcs(value) === canonicalizeJcs(EXPECTED_EXPLORE_SCHEMA)
}
const LANES = {
  "macos-arm64": { platform: "darwin", operatingSystem: "Darwin", arch: "arm64", requireGlibc: false },
  "windows-x64": { platform: "win32", operatingSystem: "Windows_NT", arch: "x64", requireGlibc: false },
  "ubuntu-glibc-x64": { platform: "linux", operatingSystem: "Linux", arch: "x64", requireGlibc: true },
}
const PROTOCOL_VERSION = "2024-11-05"
const NODE_22_VERSION = /^22\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/
const BUILD_TRAP_NAMES = ["python", "python3", "node-gyp", "cc", "c++", "gcc", "g++", "clang", "clang++", "cl"]
const OPTIONAL_CANDIDATE_ENVIRONMENT_KEYS = ["SystemRoot", "WINDIR", "ComSpec", "PATHEXT"]
const REQUIRED_BUILD_ENVIRONMENT_KEYS = ["PATH", "PYTHON", "npm_config_python", "npm_config_node_gyp", "CC", "CXX"]
const ACTUAL_EVIDENCE_KINDS = [
  "ambiguity-handling",
  "clean-shutdown",
  "exact-resolution",
  "factual-comparison",
  "indicator-explanation",
  "startup",
  "tool-discovery",
]

function reject(condition, message = "verification rejected") {
  if (!condition) throw new Error(message)
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype
}

function exactKeys(value, keys) {
  return isRecord(value) && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort())
}

export function validateSha512Sri(integrity) {
  reject(typeof integrity === "string", "SHA-512 integrity must be a string")
  const match = /^sha512-([A-Za-z0-9+/]+={0,2})$/.exec(integrity)
  reject(match !== null, "integrity must be canonical SHA-512 SRI")
  const digest = Buffer.from(match[1], "base64")
  reject(
    digest.byteLength === 64 && digest.toString("base64") === match[1],
    "integrity must contain one canonical 64-byte SHA-512 digest",
  )
  return digest
}

function hasLoneSurrogate(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true
      index += 1
    } else if (code >= 0xdc00 && code <= 0xdfff) return true
  }
  return false
}

export function canonicalizeJcs(value) {
  if (value === null) return "null"
  if (typeof value === "boolean") return value ? "true" : "false"
  if (typeof value === "string") {
    reject(!hasLoneSurrogate(value), "lone surrogate rejected")
    return JSON.stringify(value)
  }
  if (typeof value === "number") {
    reject(Number.isFinite(value), "non-finite number rejected")
    return JSON.stringify(value)
  }
  reject(typeof value === "object", "unsupported JSON value")
  if (Array.isArray(value)) return `[${value.map(canonicalizeJcs).join(",")}]`
  reject(isRecord(value), "non-plain JSON object rejected")
  return `{${Object.keys(value).sort().map((key) => `${canonicalizeJcs(key)}:${canonicalizeJcs(value[key])}`).join(",")}}`
}

export function sha256Jcs(value) {
  return createHash("sha256").update(canonicalizeJcs(value), "utf8").digest("hex")
}

class StrictJsonParser {
  constructor(text) { this.text = text; this.index = 0 }
  parse() { const result = this.value(); this.space(); reject(this.index === this.text.length, "trailing JSON data"); return result }
  space() { while (/\s/u.test(this.text[this.index] ?? "")) this.index += 1 }
  value() {
    this.space()
    const character = this.text[this.index]
    if (character === "{") return this.object()
    if (character === "[") return this.array()
    if (character === '"') return this.string()
    for (const [token, value] of [["true", true], ["false", false], ["null", null]]) {
      if (this.text.startsWith(token, this.index)) { this.index += token.length; return value }
    }
    const match = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y
    match.lastIndex = this.index
    const found = match.exec(this.text)
    reject(found !== null, "invalid JSON value")
    this.index = match.lastIndex
    const number = Number(found[0])
    reject(Number.isFinite(number), "non-finite JSON number")
    return number
  }
  string() {
    const start = this.index++
    for (;;) {
      const character = this.text[this.index]
      reject(character !== undefined && character.charCodeAt(0) >= 0x20, "invalid JSON string")
      if (character === '"') { this.index += 1; return JSON.parse(this.text.slice(start, this.index)) }
      if (character === "\\") {
        this.index += 1
        const escaped = this.text[this.index]
        reject(escaped !== undefined && '"\\/bfnrtu'.includes(escaped), "invalid JSON escape")
        if (escaped === "u") { reject(/^[a-fA-F0-9]{4}$/.test(this.text.slice(this.index + 1, this.index + 5)), "invalid unicode escape"); this.index += 4 }
      }
      this.index += 1
    }
  }
  object() {
    this.index += 1
    const result = {}
    const seen = new Set()
    this.space()
    if (this.text[this.index] === "}") { this.index += 1; return result }
    for (;;) {
      this.space(); reject(this.text[this.index] === '"', "object key required")
      const key = this.string(); reject(!seen.has(key), "duplicate JSON key"); seen.add(key)
      this.space(); reject(this.text[this.index] === ":", "colon required"); this.index += 1
      result[key] = this.value(); this.space()
      const delimiter = this.text[this.index]; reject(delimiter === "," || delimiter === "}", "invalid object delimiter"); this.index += 1
      if (delimiter === "}") return result
    }
  }
  array() {
    this.index += 1
    const result = []
    this.space()
    if (this.text[this.index] === "]") { this.index += 1; return result }
    for (;;) {
      result.push(this.value()); this.space()
      const delimiter = this.text[this.index]; reject(delimiter === "," || delimiter === "]", "invalid array delimiter"); this.index += 1
      if (delimiter === "]") return result
    }
  }
}

export function parseJsonStrict(text) {
  return new StrictJsonParser(text).parse()
}

export function containsPrivateMaterial(text) {
  return PRIVATE_MATERIAL.test(text)
}

function containsPrivateLaneLeaf(value) {
  if (typeof value === "string") return PRIVATE_MATERIAL.test(value) || SECRET_VALUE.test(value)
  if (Array.isArray(value)) return value.some(containsPrivateLaneLeaf)
  if (!isRecord(value)) return false
  return Object.entries(value).some(([key, child]) => {
    const normalizedKey = key.replace(/([a-z0-9])([A-Z])/gu, "$1_$2").replaceAll("-", "_").toLowerCase()
    const safeStructuralKey = normalizedKey === "no_api_key"
    const safeAbsence = SAFE_SECRET_ABSENCE_KEYS.has(normalizedKey) && child === "absent"
    const privateKeyMaterial = PRIVATE_MATERIAL.test(key) || SECRET_VALUE.test(key)
    return privateKeyMaterial || (SECRET_KEY_NAME.test(normalizedKey) && !safeStructuralKey && !safeAbsence) || containsPrivateLaneLeaf(child)
  })
}

export function assertNoPrivateLaneMaterial(value) {
  reject(!containsPrivateLaneLeaf(value), "private material detected in public lane receipt")
}

function readRegularFile(path, limit, allowExecutable = false) {
  const stat = lstatSync(path)
  reject(stat.isFile() && !stat.isSymbolicLink() && stat.size > 0 && stat.size <= limit, "unsafe or oversized file")
  reject(process.platform === "win32" || ((stat.mode & 0o022) === 0 && (allowExecutable || (stat.mode & 0o111) === 0)), "unsafe file mode")
  const bytes = readFileSync(path)
  reject(bytes.byteLength === stat.size && bytes.byteLength <= limit, "file changed while reading")
  return bytes
}

function safeDirectory(path) {
  const stat = lstatSync(path)
  reject(stat.isDirectory() && !stat.isSymbolicLink() && (process.platform === "win32" || (stat.mode & 0o022) === 0), "unsafe directory")
  return realpathSync(path)
}

function readOptionalLog(path) {
  if (!existsSync(path)) return ""
  const stat = lstatSync(path)
  reject(stat.isFile() && !stat.isSymbolicLink() && stat.size <= RECEIPT_BODY_LIMIT && (process.platform === "win32" || (stat.mode & 0o133) === 0), "unsafe trap log")
  return readFileSync(path, "utf8")
}

function prepareNewFile(path) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  const target = join(safeDirectory(dirname(path)), basename(path))
  reject(!existsSync(target), "output file already exists")
  return target
}

function readJsonStrict(path, limit = RECEIPT_BODY_LIMIT) {
  const bytes = readRegularFile(path, limit)
  const text = bytes.toString("utf8")
  reject(!containsPrivateMaterial(text), "private material detected")
  const value = parseJsonStrict(text)
  reject(isRecord(value), "JSON document must be an object")
  return value
}

function validTime(value) {
  return typeof value === "string" && TIME.test(value) && new Date(Date.parse(value)).toISOString() === value
}

export function validPublicReceiptIdentifier(value) {
  return typeof value === "string" && PUBLIC_RECEIPT_IDENTIFIER.test(value)
}

export function hasExactDirectDependencies(value) {
  return (
    exactKeys(value, Object.keys(DIRECT_DEPENDENCY_VERSIONS)) &&
    Object.entries(DIRECT_DEPENDENCY_VERSIONS).every(
      ([dependencyName, dependencyVersion]) => value[dependencyName] === dependencyVersion,
    )
  )
}

function within(path, parent) {
  const child = realpathSync(path)
  const root = realpathSync(parent)
  const rel = relative(root, child)
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel))
}

const MODE_FLAGS = {
  lane: {
    single: new Set(["--version", "--lane", "--source-commit", "--candidate-receipt-digest", "--receipt", "--install-log", "--run-id"]),
    repeated: new Set(),
  },
}

export function parsePublicVerifierArgs(mode, argv) {
  const contract = MODE_FLAGS[mode]
  reject(contract !== undefined, "invalid verifier mode")
  const result = { values: new Map(), repeated: new Map() }
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    const value = argv[index + 1]
    reject(
      typeof key === "string" &&
        value !== undefined &&
        (contract.single.has(key) || contract.repeated.has(key)),
      "invalid or mode-incompatible CLI arguments",
    )
    if (contract.repeated.has(key)) {
      const values = result.repeated.get(key) ?? []
      values.push(value)
      result.repeated.set(key, values)
    } else {
      reject(!result.values.has(key), `duplicate argument: ${key}`)
      result.values.set(key, value)
    }
  }
  return result
}

function required(args, key) {
  const value = args.values.get(key)
  reject(typeof value === "string" && value.length > 0, `missing ${key}`)
  return value
}

function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex")
}

export function sanitizeInstallLog(text, forbiddenValues) {
  let sanitized = text.replace(/https?:\/\/[^\s"']+/gu, (url) => {
    try {
      const parsed = new URL(url)
      return `${parsed.origin}${parsed.pathname}`
    } catch { return "<redacted-url>" }
  })
  let redactionCount = 0
  for (const forbidden of [...forbiddenValues].filter(Boolean).sort((a, b) => b.length - a.length)) {
    const variants = new Set([forbidden, forbidden.replaceAll("\\", "/")])
    for (const variant of variants) {
      if (variant.length < 3) continue
      while (sanitized.includes(variant)) { sanitized = sanitized.replace(variant, "<redacted-path>"); redactionCount += 1 }
    }
  }
  sanitized = sanitized
    .replace(/((?:_authToken|authorization|password|token)\s*[=:]\s*)\S+/giu, (_match, prefix) => { redactionCount += 1; return `${prefix}<redacted-secret>` })
    .replace(/[A-Za-z]:\\Users\\[^\\\s]+/gu, () => { redactionCount += 1; return "<redacted-user-path>" })
    .replace(/\/(?:Users|home)\/[^/\s]+/gu, () => { redactionCount += 1; return "/<redacted-user-path>" })
    .replace(/[A-Za-z]:[\\/](?:Users|Documents and Settings)[\\/][^\\/\s]+/giu, () => { redactionCount += 1; return "<redacted-user-path>" })
    .replace(/\\\\[^\\\s]+\\[^\\\s]+(?:\\[^\s]*)?/gu, () => { redactionCount += 1; return "<redacted-unc-path>" })
  return { sanitized: `${sanitized.trimEnd()}\n`, redactionCount }
}

function walkPackageJson(root) {
  const found = []
  const pending = [root]
  while (pending.length > 0) {
    const current = pending.pop()
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name)
      if (entry.isSymbolicLink()) continue
      if (entry.isDirectory()) pending.push(path)
      else if (entry.isFile() && entry.name === "package.json") found.push(path)
    }
  }
  return found
}

function cacheContentPath(cache, integrity) {
  const digest = validateSha512Sri(integrity)
  const hex = digest.toString("hex")
  return join(cache, "_cacache", "content-v2", "sha512", hex.slice(0, 2), hex.slice(2, 4), hex.slice(4))
}

export async function readResponseBounded(response, limit, signal) {
  const declared = response.headers.get("content-length")
  reject(declared === null || (/^\d+$/.test(declared) && Number.isSafeInteger(Number(declared)) && Number(declared) <= limit), "registry body exceeds safety limit")
  reject(response.body !== null, "registry body missing")
  const reader = response.body.getReader()
  const chunks = []
  let length = 0
  for (;;) {
    let progressTimer
    let abortListener
    try {
      const item = await Promise.race([
        reader.read(),
        new Promise((_resolve, rejectPromise) => {
          const timedOut = () => {
            rejectPromise(new Error("registry body timed out"))
            void reader.cancel()
          }
          progressTimer = setTimeout(timedOut, REGISTRY_PROGRESS_TIMEOUT_MS)
          abortListener = timedOut
          if (signal.aborted) timedOut()
          else signal.addEventListener("abort", timedOut, { once: true })
        }),
      ])
      if (item.done) break
      length += item.value.byteLength
      if (length > limit) {
        void reader.cancel()
        throw new Error("registry body exceeds safety limit")
      }
      chunks.push(item.value)
    } finally {
      if (progressTimer !== undefined) clearTimeout(progressTimer)
      if (abortListener !== undefined) signal.removeEventListener("abort", abortListener)
    }
  }
  return Buffer.concat(chunks, length)
}

async function fetchPackument(name) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REGISTRY_TIMEOUT_MS)
  try {
    const response = await fetch(`${PUBLIC_REGISTRY}${encodeURIComponent(name)}`, {
      headers: { accept: "application/json", "user-agent": "academyinfo-public-installed-verifier/1" },
      redirect: "error",
      signal: controller.signal,
    })
    reject(response.ok, `registry packument unavailable for ${name}`)
    const bytes = await readResponseBounded(response, REGISTRY_BODY_LIMIT, controller.signal)
    const value = parseJsonStrict(bytes.toString("utf8"))
    reject(isRecord(value), "registry packument malformed")
    return value
  } finally {
    clearTimeout(timeout)
  }
}

function provenanceSummary(dist) {
  const signatures = Array.isArray(dist.signatures) ? dist.signatures : []
  const keyids = signatures.map((item) => item?.keyid)
  reject(keyids.every((keyid) => typeof keyid === "string" && keyid.length > 0), "registry signature key identity missing")
  keyids.sort()
  const attestations = isRecord(dist.attestations) ? dist.attestations : null
  let attestationUrl = null
  if (attestations !== null) {
    reject(typeof attestations.url === "string", "registry attestation URL missing")
    const url = validatePublicRegistryResolution(attestations.url)
    attestationUrl = `${url.origin}${url.pathname}`
  }
  return {
    signatures: {
      available: signatures.length > 0,
      count: signatures.length,
      keyids,
      evidence_sha256: signatures.length === 0 ? null : sha256Jcs(signatures),
    },
    provenance: {
      available: attestations !== null,
      attestation_url: attestationUrl,
      evidence_sha256: attestations === null ? null : sha256Jcs(attestations),
    },
  }
}

export function validatePublicRegistryResolution(resolved) {
  reject(typeof resolved === "string", "package resolution must be a string")
  reject(!resolved.startsWith("file:") && !isAbsolute(resolved), "local package resolution detected")
  const authority = /^https:\/\/([^/?#]+)(?:\/|$)/u.exec(resolved)?.[1]
  const url = new URL(resolved)
  reject(
    authority === "registry.npmjs.org" &&
      url.origin === "https://registry.npmjs.org" &&
      url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      url.host === "registry.npmjs.org" &&
      url.port === "" &&
      url.search === "" &&
      url.hash === "",
    "non-public registry resolution detected",
  )
  return url
}

async function installedIdentities(cache, version) {
  const npxRoot = join(cache, "_npx")
  reject(existsSync(npxRoot), "npx cache tree missing")
  const packageFiles = walkPackageJson(npxRoot)
  const expected = new Map([
    [PACKAGE_NAME, version],
    ["@modelcontextprotocol/sdk", SDK_VERSION],
    ["better-sqlite3", BETTER_SQLITE3_VERSION],
    ["pino", PINO_VERSION],
    ["zod", ZOD_VERSION],
  ])
  const roots = new Map()
  for (const packageFile of packageFiles) {
    let packageJson
    try { packageJson = parseJsonStrict(readRegularFile(packageFile, PACKAGE_JSON_LIMIT).toString("utf8")) } catch { continue }
    if (!expected.has(packageJson.name)) continue
    const entries = roots.get(packageJson.name) ?? []
    entries.push({ packageFile, packageJson })
    roots.set(packageJson.name, entries)
  }

  const application = roots.get(PACKAGE_NAME) ?? []
  reject(application.length === 1, "installed application identity is absent or duplicated")
  const packageRoot = dirname(application[0].packageFile)
  let current = packageRoot
  let lockPath
  while (current !== parse(current).root) {
    const candidate = join(current, "package-lock.json")
    if (existsSync(candidate)) { lockPath = candidate; break }
    current = dirname(current)
  }
  reject(lockPath !== undefined, "npx package lock missing")
  const lock = parseJsonStrict(readRegularFile(lockPath, LOCKFILE_LIMIT).toString("utf8"))
  reject(isRecord(lock.packages), "npx package lock packages missing")

  for (const entry of Object.values(lock.packages)) {
    if (!isRecord(entry) || typeof entry.resolved !== "string") continue
    validatePublicRegistryResolution(entry.resolved)
  }

  const identities = {}
  for (const [name, expectedVersion] of expected) {
    const candidates = roots.get(name) ?? []
    reject(candidates.length === 1, `${name} installed identity is absent or duplicated`)
    const installed = candidates[0]
    reject(installed.packageJson.name === name && installed.packageJson.version === expectedVersion, `${name} installed version mismatch`)
    const packageKey = Object.keys(lock.packages).find((key) => key.replaceAll("\\", "/").endsWith(`/node_modules/${name}`) || key === `node_modules/${name}`)
    reject(packageKey !== undefined, `${name} lock identity missing`)
    const locked = lock.packages[packageKey]
    reject(locked.version === expectedVersion && typeof locked.integrity === "string" && typeof locked.resolved === "string", `${name} lock identity mismatch`)
    const packument = await fetchPackument(name)
    const registryVersion = packument.versions?.[expectedVersion]
    reject(isRecord(registryVersion) && isRecord(registryVersion.dist), `${name} registry version missing`)
    reject(registryVersion.name === name && registryVersion.version === expectedVersion, `${name} registry identity mismatch`)
    validateSha512Sri(locked.integrity)
    validateSha512Sri(registryVersion.dist.integrity)
    reject(locked.integrity === registryVersion.dist.integrity && locked.resolved === registryVersion.dist.tarball, `${name} lock/packument tarball identity mismatch`)
    const contentPath = cacheContentPath(cache, locked.integrity)
    const content = readRegularFile(contentPath, 128 * 1024 * 1024)
    const actualIntegrity = `sha512-${createHash("sha512").update(content).digest("base64")}`
    reject(actualIntegrity === locked.integrity, `${name} cached tarball integrity mismatch`)
    identities[name] = {
      name,
      version: expectedVersion,
      package_json_sha256: sha256Bytes(readRegularFile(installed.packageFile, PACKAGE_JSON_LIMIT)),
      registry_tarball: registryVersion.dist.tarball,
      registry_integrity: registryVersion.dist.integrity,
      lock_integrity: locked.integrity,
      cached_tarball_integrity_verified: true,
      registry_evidence: provenanceSummary(registryVersion.dist),
    }
  }
  const appJson = application[0].packageJson
  reject(appJson.engines?.node === ">=22 <23", "installed Node engine contract mismatch")
  reject(
    hasExactDirectDependencies(appJson.dependencies),
    "application dependency requirements are not exact",
  )
  return { identities, applicationPackument: await fetchPackument(PACKAGE_NAME) }
}

function callPayload(message) {
  if (isRecord(message?.result?.structuredContent)) return message.result.structuredContent
  const text = message?.result?.content?.find?.((entry) => entry?.type === "text")?.text
  reject(typeof text === "string", "tool response content missing")
  const value = parseJsonStrict(text)
  reject(isRecord(value), "tool response payload malformed")
  return value
}

export function validateBundledQueryPayload(payload) {
  reject(isRecord(payload), "bundled query payload malformed")
  reject(payload.status === "ok" && payload.tool === "explore_universities", "bundled query did not succeed")
  reject(
    isRecord(payload.query) && canonicalizeJcs(payload.query) === canonicalizeJcs(BUNDLED_QUERY),
    "bundled query identity mismatch",
  )
  const comparisons = payload.data?.comparisons
  const explanations = payload.data?.indicator_explanations
  reject(Array.isArray(comparisons) && comparisons.length === 1, "bundled query comparison missing")
  reject(Array.isArray(explanations) && explanations.length === 1, "bundled query explanation missing")
  const comparison = comparisons[0]
  const explanation = explanations[0]
  const metrics = comparison?.metrics
  reject(
    isRecord(comparison) &&
      comparison.university_name === "전남대학교" &&
      comparison.campus_name === "본교" &&
      Array.isArray(comparison.missing_metrics) &&
      comparison.missing_metrics.length === 0 &&
      Array.isArray(metrics) &&
      metrics.length === 1 &&
      metrics[0]?.indicator === BUNDLED_QUERY.indicators[0] &&
      metrics[0]?.source?.dataset_id === BUNDLED_DATASET_ID,
    "bundled query comparison identity mismatch",
  )
  reject(
    isRecord(explanation) &&
      explanation.indicator === BUNDLED_QUERY.indicators[0] &&
      explanation.source?.dataset_id === BUNDLED_DATASET_ID,
    "bundled query explanation identity mismatch",
  )
  reject(
    metrics[0].source_column === explanation.source_column &&
      metrics[0].base_year === explanation.base_year &&
      metrics[0].unit === explanation.unit &&
      metrics[0].source.source_column === metrics[0].source_column &&
      metrics[0].source.base_year === metrics[0].base_year &&
      metrics[0].source.unit === metrics[0].unit &&
      explanation.source.source_column === explanation.source_column &&
      explanation.source.base_year === explanation.base_year &&
      explanation.source.unit === explanation.unit,
    "bundled query comparison/explanation identity mismatch",
  )
  reject(Array.isArray(payload.sources) && payload.sources.length > 0, "bundled query provenance missing")
  reject(
    payload.sources.every(
      (source) => isRecord(source) && source.dataset_id === BUNDLED_DATASET_ID,
    ),
    "bundled query source dataset identity mismatch",
  )
  const relevantSources = payload.sources.filter(
    (source) =>
      source.source_column === explanation.source_column &&
      source.base_year === explanation.base_year &&
      source.unit === explanation.unit,
  )
  reject(
    relevantSources.length === 1,
    "bundled query source dataset identity must occur exactly once",
  )
  return {
    passed: true,
    tool: "explore_universities",
    status: "ok",
    query: {
      university_queries: [...BUNDLED_QUERY.university_queries],
      indicators: [...BUNDLED_QUERY.indicators],
    },
    source_dataset_ids: [BUNDLED_DATASET_ID],
  }
}

export function validateSolicitedJsonRpcResponse(message, state) {
  reject(
    exactKeys(message, ["jsonrpc", "id", "result"]) &&
      message.jsonrpc === "2.0" &&
      Number.isSafeInteger(message.id) &&
      message.id === state.expectedResponseId &&
      state.pendingIds.has(message.id) &&
      !state.seenResponseIds.has(message.id),
    "unsolicited, duplicate, or out-of-order JSON-RPC response",
  )
}

export function validateProtocolClose(code, signal, state) {
  reject(state.settled === true, `public candidate exited before journey completion (${code}, ${signal})`)
  reject(state.pendingResponseCount === 0, "public candidate exited with solicited responses pending")
  reject(state.trailingStdout.trim() === "", "stdout ended with malformed JSON-RPC output")
  reject(code === 0 && signal === null, `public candidate exited uncleanly (${code}, ${signal})`)
}

function environmentValue(source, key) {
  const direct = source[key]
  if (typeof direct === "string") return direct
  const match = Object.keys(source).find((candidate) => candidate.toLowerCase() === key.toLowerCase())
  return match === undefined ? undefined : source[match]
}

export function buildCandidateEnvironment(source, isolation) {
  reject(
    isRecord(isolation) &&
      exactKeys(isolation, ["home", "cache", "config", "trapLog", "temp"]) &&
      [isolation.home, isolation.cache, isolation.config, isolation.trapLog, isolation.temp]
        .every((value) => typeof value === "string" && value !== ""),
    "candidate isolation paths mismatch",
  )
  const forwarded = {}
  for (const key of OPTIONAL_CANDIDATE_ENVIRONMENT_KEYS) {
    const value = environmentValue(source, key)
    if (typeof value === "string" && value !== "") forwarded[key] = value
  }
  for (const key of REQUIRED_BUILD_ENVIRONMENT_KEYS) {
    const value = environmentValue(source, key)
    reject(typeof value === "string" && value !== "", `required candidate environment variable missing: ${key}`)
    forwarded[key] = value
  }
  return {
    ...forwarded,
    HOME: isolation.home,
    USERPROFILE: isolation.home,
    TMPDIR: isolation.temp,
    TMP: isolation.temp,
    TEMP: isolation.temp,
    BUILD_TRAP_LOG: isolation.trapLog,
    NPM_CONFIG_CACHE: isolation.cache,
    NPM_CONFIG_USERCONFIG: isolation.config,
    NPM_CONFIG_REGISTRY: PUBLIC_REGISTRY,
    NPM_CONFIG_LOGLEVEL: "verbose",
    NPM_CONFIG_COLOR: "false",
    npm_config_registry: PUBLIC_REGISTRY,
    npm_config_cache: isolation.cache,
    npm_config_userconfig: isolation.config,
    TZ: "UTC",
    LANG: "C.UTF-8",
    LC_ALL: "C.UTF-8",
    NO_COLOR: "1",
  }
}

async function protocolJourney(version, lane, environment) {
  const command = process.platform === "win32" ? "npx.cmd" : "npx"
  const specification = `${PACKAGE_NAME}@${version}`
  const child = spawn(command, ["-y", specification], { cwd: process.cwd(), env: environment, stdio: ["pipe", "pipe", "pipe"], windowsHide: true })
  let stderr = ""
  let stdoutBuffer = ""
  let stdoutBytes = 0
  let stderrBytes = 0
  const stdoutDecoder = new StringDecoder("utf8")
  let settled = false
  let failed = false
  let messageCount = 0
  let expectedResponseId = 1
  const pendingIds = new Set()
  const seenResponseIds = new Set()
  let initializeEvidence
  let toolEvidence
  let bundledEvidence
  let ubuntuEvidence = null

  const completion = new Promise((resolvePromise, rejectPromise) => {
    const timer = setTimeout(() => {
      failed = true
      child.kill()
      rejectPromise(new Error("public candidate protocol journey timed out"))
    }, 180_000)
    function complete() {
      if (settled) return
      settled = true
      child.stdin.end()
    }
    function fail(error) {
      if (failed) return
      failed = true
      child.kill()
      clearTimeout(timer)
      rejectPromise(error instanceof Error ? error : new Error(String(error)))
    }
    function send(value) {
      if (Object.hasOwn(value, "id")) {
        reject(Number.isSafeInteger(value.id) && !pendingIds.has(value.id) && !seenResponseIds.has(value.id), "duplicate JSON-RPC request id")
        pendingIds.add(value.id)
      }
      child.stdin.write(`${JSON.stringify(value)}\n`)
    }
    function handle(message) {
      validateSolicitedJsonRpcResponse(message, {
        expectedResponseId,
        pendingIds,
        seenResponseIds,
      })
      pendingIds.delete(message.id)
      seenResponseIds.add(message.id)
      expectedResponseId += 1
      messageCount += 1
      if (message.id === 1) {
        reject(message.result?.protocolVersion === PROTOCOL_VERSION && message.result?.serverInfo?.name === PACKAGE_NAME && message.result?.serverInfo?.version === version, "initialize protocol/server identity mismatch")
        initializeEvidence = { passed: true, protocol_version: message.result?.protocolVersion, server_name: message.result.serverInfo.name, server_version: message.result.serverInfo.version ?? null }
        send({ jsonrpc: "2.0", method: "notifications/initialized" })
        send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} })
      } else if (message.id === 2) {
        const tools = message.result?.tools
        reject(Array.isArray(tools), "tools/list result missing")
        const names = tools.map((tool) => tool?.name)
        reject(JSON.stringify(names) === JSON.stringify(EXPECTED_TOOLS), "exact eight-tool list mismatch")
        const explore = tools.find((tool) => tool?.name === "explore_universities")
        reject(isExactExploreSchema(explore?.inputSchema), "explore_universities schema mismatch")
        toolEvidence = { passed: true, names, explore_input_schema: explore.inputSchema }
        send({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "explore_universities", arguments: { university_queries: ["전남대학교 본교"], indicators: ["competition_rate"] } } })
      } else if (message.id === 3) {
        const payload = callPayload(message)
        bundledEvidence = validateBundledQueryPayload(payload)
        if (lane === "ubuntu-glibc-x64") send({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "explore_universities", arguments: { university_queries: ["전남대학교"], indicators: ["competition_rate", "fill_rate"] } } })
        else complete()
      } else if (message.id === 4) {
        reject(lane === "ubuntu-glibc-x64", "unsolicited Ubuntu-only response")
        const payload = callPayload(message)
        reject(payload.status === "ambiguous" && payload.data?.comparisons?.length === 0 && payload.data?.resolved_universities?.length === 0, "Ubuntu ambiguity journey returned partial or guessed data")
        send({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "explore_universities", arguments: { university_queries: ["전남대학교 본교", "가천대학교 본교"], indicators: ["competition_rate", "fill_rate"] } } })
      } else if (message.id === 5) {
        reject(lane === "ubuntu-glibc-x64", "unsolicited Ubuntu-only response")
        const payload = callPayload(message)
        reject(payload.status === "ok" && payload.data?.comparisons?.length === 2 && payload.data?.indicator_explanations?.length === 2, "Ubuntu exact comparison journey failed")
        const forbiddenKeys = new Set(["ranking", "rank", "recommendation", "recommended", "winner", "loser", "score", "weight"])
        const pending = [payload.data]
        while (pending.length > 0) {
          const value = pending.pop()
          if (Array.isArray(value)) pending.push(...value)
          else if (isRecord(value)) for (const [key, childValue] of Object.entries(value)) { reject(!forbiddenKeys.has(key.toLowerCase()), "ranking/recommendation field detected"); pending.push(childValue) }
        }
        ubuntuEvidence = { passed: true, ambiguity_no_partial_data: true, exact_resolution: true, factual_comparison: true, indicator_explanation: true, no_ranking_or_recommendation: true }
        complete()
      } else {
        throw new Error("unsolicited JSON-RPC response")
      }
    }
    child.on("error", fail)
    child.stderr.on("data", (chunk) => {
      stderrBytes += chunk.byteLength
      if (stderrBytes > PROTOCOL_OUTPUT_LIMIT) return fail(new Error("install output exceeded safety limit"))
      stderr += chunk.toString()
    })
    child.stdout.on("data", (chunk) => {
      stdoutBytes += chunk.byteLength
      if (stdoutBytes > PROTOCOL_OUTPUT_LIMIT) return fail(new Error("protocol stdout exceeded safety limit"))
      stdoutBuffer += stdoutDecoder.write(chunk)
      if (Buffer.byteLength(stdoutBuffer, "utf8") > PROTOCOL_LINE_LIMIT && !stdoutBuffer.includes("\n")) return fail(new Error("protocol stdout line exceeded safety limit"))
      for (;;) {
        const newline = stdoutBuffer.indexOf("\n")
        if (newline < 0) break
        const rawLine = stdoutBuffer.slice(0, newline)
        if (Buffer.byteLength(rawLine, "utf8") > PROTOCOL_LINE_LIMIT) return fail(new Error("protocol stdout line exceeded safety limit"))
        const line = rawLine.trim()
        stdoutBuffer = stdoutBuffer.slice(newline + 1)
        if (line === "") continue
        try { handle(parseJsonStrict(line)) } catch (error) { fail(error) }
      }
    })
    child.on("close", (code, signal) => {
      clearTimeout(timer)
      if (failed) return
      stdoutBuffer += stdoutDecoder.end()
      try {
        validateProtocolClose(code, signal, {
          settled,
          pendingResponseCount: pendingIds.size,
          trailingStdout: stdoutBuffer,
        })
        resolvePromise()
      } catch (error) {
        rejectPromise(error)
      }
    })
    send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "academyinfo-public-installed-verifier", version: "1" } } })
  })
  await completion
  return {
    stderr,
    evidence: {
      initialize: initializeEvidence,
      tools_list: toolEvidence,
      bundled_query: bundledEvidence,
      no_api_key: { passed: true, data_go_kr_service_key: "absent", academyinfo_service_key: "absent" },
      json_rpc_stdout: { passed: true, parsed_message_count: messageCount, non_json_rpc_line_count: 0 },
      ubuntu_client_journey: ubuntuEvidence,
    },
  }
}

export function genericStdioProjection(protocol) {
  reject(
    exactKeys(protocol, [
      "initialize",
      "tools_list",
      "bundled_query",
      "no_api_key",
      "json_rpc_stdout",
      "ubuntu_client_journey",
    ]),
    "generic stdio source shape mismatch",
  )
  reject(
    exactKeys(protocol.initialize, ["passed", "protocol_version", "server_name", "server_version"]) &&
      exactKeys(protocol.tools_list, ["passed", "names", "explore_input_schema"]) &&
      exactKeys(protocol.bundled_query, ["passed", "tool", "status", "query", "source_dataset_ids"]) &&
      exactKeys(protocol.no_api_key, ["passed", "data_go_kr_service_key", "academyinfo_service_key"]) &&
      exactKeys(protocol.json_rpc_stdout, ["passed", "parsed_message_count", "non_json_rpc_line_count"]),
    "generic stdio evidence shape mismatch",
  )
  return {
    schema_version: "generic-stdio-journey-projection.v1",
    initialize: protocol.initialize,
    tools_list: protocol.tools_list,
    bundled_query: protocol.bundled_query,
    no_api_key: protocol.no_api_key,
    json_rpc_stdout: {
      passed: protocol.json_rpc_stdout.passed,
      non_json_rpc_line_count: protocol.json_rpc_stdout.non_json_rpc_line_count,
    },
  }
}

export function genericStdioJourneyDigest(protocol) {
  return sha256Jcs(genericStdioProjection(protocol))
}

function buildClosedReceipt(schemaVersion, payloadKey, digestKey, payload) {
  const payloadDigest = sha256Jcs(payload)
  const receipt = { receipt_schema_version: schemaVersion, [payloadKey]: payload, [digestKey]: payloadDigest }
  receipt.receipt_digest_v1 = sha256Jcs(receipt)
  return receipt
}

async function runLane(args) {
  const version = required(args, "--version")
  const lane = required(args, "--lane")
  const sourceCommit = required(args, "--source-commit")
  const candidateReceiptDigest = required(args, "--candidate-receipt-digest")
  const receiptPath = resolve(required(args, "--receipt"))
  const logPath = resolve(required(args, "--install-log"))
  const runId = required(args, "--run-id")
  reject(
    SEMVER.test(version) &&
      LANES[lane] !== undefined &&
      COMMIT.test(sourceCommit) &&
      DIGEST.test(candidateReceiptDigest) &&
      validPublicReceiptIdentifier(runId),
    "invalid lane identity arguments",
  )
  reject(process.versions.node.split(".")[0] === "22", "verifier requires Node 22")
  const expectedRuntime = LANES[lane]
  reject(process.platform === expectedRuntime.platform && process.arch === expectedRuntime.arch, "runner platform/architecture mismatch")
  const report = process.report.getReport()
  const glibc = report.header?.glibcVersionRuntime ?? null
  reject(!expectedRuntime.requireGlibc || (typeof glibc === "string" && /^\d+\.\d+$/.test(glibc)), "Ubuntu glibc runtime identity missing")

  const home = resolve(process.env.VERIFIER_HOME ?? "")
  const cache = resolve(process.env.NPM_CONFIG_CACHE ?? "")
  const cwd = resolve(process.env.VERIFIER_CWD ?? "")
  const config = resolve(process.env.NPM_CONFIG_USERCONFIG ?? "")
  const trapDir = resolve(process.env.BUILD_TRAP_DIR ?? "")
  const trapLog = resolve(process.env.BUILD_TRAP_LOG ?? "")
  const canaryPath = resolve(process.env.BUILD_TRAP_CANARY ?? "")
  for (const path of [home, cache, cwd, config, trapDir, canaryPath]) reject(existsSync(path), "fresh isolation path missing")
  reject(process.cwd() === safeDirectory(cwd), "verifier did not run in the fresh working directory")
  const isolationRoots = [home, cache, cwd, dirname(config), trapDir].map(safeDirectory)
  readRegularFile(config, RECEIPT_BODY_LIMIT)
  readRegularFile(canaryPath, RECEIPT_BODY_LIMIT)
  const isolationParent = dirname(isolationRoots[0])
  reject(isolationRoots.every((path) => dirname(path) === isolationParent), "isolation paths are not siblings")
  const temp = mkdtempSync(join(isolationParent, "temporary-directory-"))
  const cleanupTemp = () => rmSync(temp, { recursive: true, force: true })
  process.once("exit", cleanupTemp)
  const tempRoot = safeDirectory(temp)
  reject(new Set([...isolationRoots, tempRoot]).size === isolationRoots.length + 1, "HOME/cache/cwd/config/temp/traps are not distinct")
  reject(
    readdirSync(home).length === 0 &&
      readdirSync(cache).length === 0 &&
      readdirSync(cwd).length === 0 &&
      readdirSync(tempRoot).length === 0 &&
      JSON.stringify(readdirSync(dirname(config)).sort()) === JSON.stringify([basename(config)]),
    "HOME/cache/cwd/config/temp were not fresh before install",
  )
  const workspace = process.env.GITHUB_WORKSPACE
  reject(
    typeof workspace === "string" &&
      existsSync(workspace) &&
      statSync(workspace).isDirectory() &&
      readdirSync(workspace).length === 0,
    "checkout contents remain reachable during public install",
  )
  const npmrc = readRegularFile(config, RECEIPT_BODY_LIMIT).toString("utf8")
  reject(npmrc.includes(`registry=${PUBLIC_REGISTRY}`) && !/\b(?:file:|link:|workspace:)/u.test(npmrc), "explicit public npm configuration missing")
  const canary = readJsonStrict(canaryPath)
  reject(
    canary.passed === true &&
      canary.exit_code === 86 &&
      JSON.stringify(canary.traps) === JSON.stringify(BUILD_TRAP_NAMES),
    "build trap canary was not proven",
  )
  reject(
    [process.env.PYTHON, process.env.npm_config_python, process.env.npm_config_node_gyp, process.env.CC, process.env.CXX]
      .every((path) => typeof path === "string" && existsSync(path) && within(path, trapDir)) &&
      realpathSync((process.env.PATH ?? "").split(process.platform === "win32" ? ";" : ":")[0]) === realpathSync(trapDir),
    "build traps are not active in the install environment",
  )
  const trapIdentities = Object.fromEntries(BUILD_TRAP_NAMES.map((name) => {
    const path = join(trapDir, process.platform === "win32" ? `${name}.cmd` : name)
    reject(existsSync(path), `missing ${name} build trap`)
    return [name, sha256Bytes(readRegularFile(path, RECEIPT_BODY_LIMIT, true))]
  }))
  reject(readOptionalLog(trapLog).trim() === "", "build trap log was not clean before install")

  const serverEnvironment = buildCandidateEnvironment(process.env, {
    home,
    cache,
    config,
    trapLog,
    temp: tempRoot,
  })
  const protocol = await protocolJourney(version, lane, serverEnvironment)
  reject(readOptionalLog(trapLog).trim() === "", "native build tool trap fired during install")
  const { identities, applicationPackument } = await installedIdentities(cache, version)
  reject(applicationPackument["dist-tags"]?.candidate === version, "candidate dist-tag does not resolve to exact version")
  reject(identities[PACKAGE_NAME].registry_integrity === identities[PACKAGE_NAME].lock_integrity, "candidate integrity mismatch")
  for (const identity of Object.values(identities)) reject(within(cacheContentPath(cache, identity.registry_integrity), cache), "cached tarball escaped fresh cache")

  const forbidden = [home, cache, cwd, config, tempRoot, trapDir, process.env.RUNNER_TEMP, workspace]
  const sanitizedLog = sanitizeInstallLog(protocol.stderr, forbidden)
  reject(sanitizedLog.sanitized.trim().length > 0, "verbose install output was not captured")
  for (const value of forbidden.filter(Boolean)) reject(!sanitizedLog.sanitized.includes(value) && !sanitizedLog.sanitized.includes(value.replaceAll("\\", "/")), "private path survived log sanitization")
  reject(!containsPrivateMaterial(sanitizedLog.sanitized), "private material survived log sanitization")
  reject(Buffer.byteLength(sanitizedLog.sanitized, "utf8") <= PROTOCOL_OUTPUT_LIMIT, "sanitized log exceeded safety limit")
  const safeLogPath = prepareNewFile(logPath)
  writeFileSync(safeLogPath, sanitizedLog.sanitized, { mode: 0o600, flag: "wx" })
  const logBytes = readRegularFile(safeLogPath, PROTOCOL_OUTPUT_LIMIT)
  const payload = {
    schema_version: "public-install-evidence-payload.v1",
    evidence_kind: "exact-public-registry-candidate-install",
    package_name: PACKAGE_NAME,
    package_version: version,
    package_integrity: identities[PACKAGE_NAME].registry_integrity,
    source_commit: sourceCommit,
    candidate_receipt_digest: candidateReceiptDigest,
    candidate_dist_tag: { name: "candidate", resolved_version: version },
    invocation: `npx -y ${PACKAGE_NAME}@${version}`,
    registry: PUBLIC_REGISTRY,
    lane,
    runtime: { node: process.versions.node, node_major: 22, platform: process.platform, operating_system: expectedRuntime.operatingSystem, architecture: process.arch, glibc_version_runtime: glibc },
    isolation: { fresh_home: true, fresh_npm_cache: true, fresh_working_directory: true, fresh_user_config: true, checkout_removed_before_install: true, local_artifact_reachable: false, local_or_unversioned_install_allowed: false },
    build_traps: { active: true, names: canary.traps, trap_sha256: trapIdentities, canary_proven: true, canary_evidence_sha256: sha256Bytes(readRegularFile(canaryPath, RECEIPT_BODY_LIMIT)), canary_exit_code: 86, fired_during_install: false, compilation_observed: false },
    installed_identities: identities,
    protocol: protocol.evidence,
    generic_stdio_journey_digest_v1: genericStdioJourneyDigest(protocol.evidence),
    install_log: { level: "verbose", sanitized: true, sha256: sha256Bytes(logBytes), byte_length: logBytes.length, line_count: sanitizedLog.sanitized.split("\n").length - 1, redaction_count: sanitizedLog.redactionCount },
    promotion_performed: false,
    public_evidence_complete: true,
    run_id: runId,
    observed_at: new Date().toISOString(),
  }
  assertNoPrivateLaneMaterial(payload)
  const receipt = buildClosedReceipt("public-install-lane-receipt.v1", "public_install_evidence_payload_v1", "public_install_evidence_digest_v1", payload)
  assertNoPrivateLaneMaterial(receipt)
  const receiptText = `${canonicalizeJcs(receipt)}\n`
  reject(Buffer.byteLength(receiptText, "utf8") <= RECEIPT_BODY_LIMIT, "lane receipt exceeded safety limit")
  const safeReceiptPath = prepareNewFile(receiptPath)
  const safeReceiptDigestPath = prepareNewFile(`${receiptPath}.sha256`)
  writeFileSync(safeReceiptPath, receiptText, { mode: 0o600, flag: "wx" })
  writeFileSync(safeReceiptDigestPath, `${receipt.receipt_digest_v1}  ${basename(receiptPath)}\n`, { mode: 0o600, flag: "wx" })
  cleanupTemp()
  process.removeListener("exit", cleanupTemp)
  process.stdout.write(`${receipt.receipt_digest_v1}\n`)
}

function validDigestEvidence(value, expectedKinds) {
  return Array.isArray(value) && value.length === expectedKinds.length && value.every((entry, index) => exactKeys(entry, ["kind", "digest"]) && entry.kind === expectedKinds[index] && DIGEST.test(entry.digest))
}

export function validateActualClientReceipt(receipt, expected) {
  reject(exactKeys(receipt, ["receipt_schema_version", "actual_client_evidence_payload_v1", "actual_client_evidence_digest_v1", "operator_attestation", "receipt_digest_v1"]), "actual-client receipt shape mismatch")
  reject(receipt.receipt_schema_version === "actual-claude-desktop-receipt.v1", "actual-client receipt schema mismatch")
  const payload = receipt.actual_client_evidence_payload_v1
  reject(exactKeys(payload, [
    "schema_version", "evidence_kind", "actual_client", "simulated", "client_name", "client_version", "platform", "architecture",
    "package_name", "package_version", "package_integrity", "source_commit", "candidate_receipt_digest", "invocation", "observed_at",
    "observations", "evidence_artifact_digests", "sanitization",
  ]), "actual-client payload shape mismatch")
  reject(payload.schema_version === "actual-claude-desktop-evidence-payload.v1" && payload.evidence_kind === "actual-claude-desktop-macos", "actual-client evidence identity mismatch")
  reject(payload.actual_client === true && payload.simulated === false && payload.client_name === "Claude Desktop" && /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/.test(payload.client_version), "actual Claude Desktop observation required")
  reject(payload.platform === "darwin" && payload.architecture === "arm64", "actual client must be macOS/arm64")
  validateSha512Sri(expected.packageIntegrity)
  validateSha512Sri(payload.package_integrity)
  reject(payload.package_name === PACKAGE_NAME && payload.package_version === expected.version && payload.package_integrity === expected.packageIntegrity, "actual-client package identity mismatch")
  reject(payload.source_commit === expected.sourceCommit && payload.candidate_receipt_digest === expected.candidateReceiptDigest, "actual-client candidate join mismatch")
  reject(payload.invocation === `npx -y ${PACKAGE_NAME}@${expected.version}` && validTime(payload.observed_at), "actual-client invocation/time mismatch")
  const observations = payload.observations
  reject(exactKeys(observations, ["startup", "tool_discovery", "ambiguity_handling", "exact_resolution", "factual_comparison", "indicator_explanation", "clean_shutdown"]), "actual-client observations incomplete")
  reject(observations.startup === true && observations.clean_shutdown === true && observations.exact_resolution === true, "actual-client startup/resolution/shutdown missing")
  reject(exactKeys(observations.tool_discovery, ["passed", "tool_names"]) && observations.tool_discovery.passed === true && JSON.stringify(observations.tool_discovery.tool_names) === JSON.stringify(EXPECTED_TOOLS), "actual-client exact tool discovery missing")
  reject(exactKeys(observations.ambiguity_handling, ["passed", "no_guess", "no_partial_data"]) && Object.values(observations.ambiguity_handling).every((value) => value === true), "actual-client ambiguity proof missing")
  reject(exactKeys(observations.factual_comparison, ["passed", "no_ranking", "no_recommendation"]) && Object.values(observations.factual_comparison).every((value) => value === true), "actual-client factual comparison proof missing")
  reject(exactKeys(observations.indicator_explanation, ["passed", "provenance_present", "license_present", "year_present", "unit_present", "source_column_present"]) && Object.values(observations.indicator_explanation).every((value) => value === true), "actual-client explanation/provenance proof missing")
  reject(validDigestEvidence(payload.evidence_artifact_digests, ACTUAL_EVIDENCE_KINDS), "actual-client evidence artifact digests incomplete")
  reject(exactKeys(payload.sanitization, ["credentials_absent", "private_paths_absent", "local_user_names_absent", "machine_identifiers_absent"]) && Object.values(payload.sanitization).every((value) => value === true), "actual-client sanitization attestation missing")
  reject(sha256Jcs(payload) === receipt.actual_client_evidence_digest_v1 && DIGEST.test(receipt.actual_client_evidence_digest_v1), "actual-client payload digest mismatch")
  const attestation = receipt.operator_attestation
  reject(exactKeys(attestation, ["role", "attested_at", "decision", "actual_client_evidence_digest_v1", "attestation_digest"]), "operator attestation shape mismatch")
  reject(attestation.role === "operator" && validTime(attestation.attested_at) && attestation.decision === "actual-client-observed" && attestation.actual_client_evidence_digest_v1 === receipt.actual_client_evidence_digest_v1, "operator attestation mismatch")
  const { attestation_digest: attestationDigest, ...attestationProjection } = attestation
  reject(DIGEST.test(attestationDigest) && sha256Jcs(attestationProjection) === attestationDigest, "operator attestation digest mismatch")
  const { receipt_digest_v1: receiptDigest, ...receiptProjection } = receipt
  reject(DIGEST.test(receiptDigest) && sha256Jcs(receiptProjection) === receiptDigest, "actual-client outer digest mismatch")
  if (expected.actualReceiptDigest !== undefined) reject(receiptDigest === expected.actualReceiptDigest, "unexpected actual-client receipt digest")
  return { payload, receiptDigest }
}

function validRegistryEvidence(value) {
  if (
    !exactKeys(value, ["signatures", "provenance"]) ||
    !exactKeys(value.signatures, ["available", "count", "keyids", "evidence_sha256"]) ||
    !exactKeys(value.provenance, ["available", "attestation_url", "evidence_sha256"])
  ) return false
  const signatures = value.signatures
  const signatureDigestAvailable = DIGEST.test(signatures.evidence_sha256)
  if (
    typeof signatures.available !== "boolean" ||
    !Number.isSafeInteger(signatures.count) ||
    signatures.count < 0 ||
    !Array.isArray(signatures.keyids) ||
    signatures.keyids.length !== signatures.count ||
    !signatures.keyids.every((key) => typeof key === "string" && key.length > 0) ||
    JSON.stringify(signatures.keyids) !== JSON.stringify([...signatures.keyids].sort()) ||
    signatures.available !== (signatures.count > 0) ||
    signatures.available !== signatureDigestAvailable ||
    (!signatures.available && signatures.evidence_sha256 !== null)
  ) return false
  const provenance = value.provenance
  const provenanceAvailable =
    typeof provenance.attestation_url === "string" &&
    DIGEST.test(provenance.evidence_sha256)
  if (
    typeof provenance.available !== "boolean" ||
    provenance.available !== provenanceAvailable ||
    (!provenance.available &&
      (provenance.attestation_url !== null || provenance.evidence_sha256 !== null))
  ) return false
  if (provenance.available) {
    try {
      validatePublicRegistryResolution(provenance.attestation_url)
    } catch {
      return false
    }
  }
  return true
}

function validateClosedLaneObjects(payload, expectedLane) {
  reject(exactKeys(payload.runtime, ["node", "node_major", "platform", "operating_system", "architecture", "glibc_version_runtime"]), "public lane runtime shape mismatch")
  reject(exactKeys(payload.build_traps, ["active", "names", "trap_sha256", "canary_proven", "canary_evidence_sha256", "canary_exit_code", "fired_during_install", "compilation_observed"]), "public lane build trap shape mismatch")
  reject(exactKeys(payload.install_log, ["level", "sanitized", "sha256", "byte_length", "line_count", "redaction_count"]), "public lane install log shape mismatch")
  reject(exactKeys(payload.protocol, ["initialize", "tools_list", "bundled_query", "no_api_key", "json_rpc_stdout", "ubuntu_client_journey"]), "public lane protocol shape mismatch")
  reject(exactKeys(payload.protocol.initialize, ["passed", "protocol_version", "server_name", "server_version"]), "public lane initialize shape mismatch")
  reject(exactKeys(payload.protocol.tools_list, ["passed", "names", "explore_input_schema"]), "public lane tools shape mismatch")
  reject(exactKeys(payload.protocol.bundled_query, ["passed", "tool", "status", "query", "source_dataset_ids"]), "public lane query shape mismatch")
  reject(exactKeys(payload.protocol.no_api_key, ["passed", "data_go_kr_service_key", "academyinfo_service_key"]), "public lane key proof shape mismatch")
  reject(exactKeys(payload.protocol.json_rpc_stdout, ["passed", "parsed_message_count", "non_json_rpc_line_count"]), "public lane stdout proof shape mismatch")
  if (expectedLane === "ubuntu-glibc-x64") {
    reject(exactKeys(payload.protocol.ubuntu_client_journey, ["passed", "ambiguity_no_partial_data", "exact_resolution", "factual_comparison", "indicator_explanation", "no_ranking_or_recommendation"]), "public lane Ubuntu proof shape mismatch")
  } else {
    reject(payload.protocol.ubuntu_client_journey === null, "unexpected Ubuntu proof")
  }
  for (const identity of Object.values(payload.installed_identities ?? {})) {
    reject(exactKeys(identity, ["name", "version", "package_json_sha256", "registry_tarball", "registry_integrity", "lock_integrity", "cached_tarball_integrity_verified", "registry_evidence"]), "installed identity shape mismatch")
    validateSha512Sri(identity.registry_integrity)
    validateSha512Sri(identity.lock_integrity)
    reject(validRegistryEvidence(identity.registry_evidence), "registry evidence shape mismatch")
  }
}

export function validateLaneReceipt(receipt, expected, expectedLane, expectedDigest) {
  reject(exactKeys(receipt, ["receipt_schema_version", "public_install_evidence_payload_v1", "public_install_evidence_digest_v1", "receipt_digest_v1"]), "public lane receipt shape mismatch")
  reject(receipt.receipt_schema_version === "public-install-lane-receipt.v1", "public lane schema mismatch")
  const payload = receipt.public_install_evidence_payload_v1
  reject(exactKeys(payload, [
    "schema_version", "evidence_kind", "package_name", "package_version", "package_integrity", "source_commit",
    "candidate_receipt_digest", "candidate_dist_tag", "invocation", "registry", "lane", "runtime", "isolation",
    "build_traps", "installed_identities", "protocol", "install_log", "promotion_performed",
    "public_evidence_complete", "run_id", "observed_at",
    "generic_stdio_journey_digest_v1",
  ]), "public lane payload shape mismatch")
  assertNoPrivateLaneMaterial(payload)
  validateClosedLaneObjects(payload, expectedLane)
  reject(
    DIGEST.test(payload.generic_stdio_journey_digest_v1) &&
      payload.generic_stdio_journey_digest_v1 === genericStdioJourneyDigest(payload.protocol),
    "public lane generic stdio journey digest mismatch",
  )
  validateSha512Sri(expected.packageIntegrity)
  validateSha512Sri(payload.package_integrity)
  const bundledQuery = payload.protocol.bundled_query
  reject(
    bundledQuery.tool === "explore_universities" &&
      bundledQuery.status === "ok" &&
      canonicalizeJcs(bundledQuery.query) === canonicalizeJcs(BUNDLED_QUERY) &&
      JSON.stringify(bundledQuery.source_dataset_ids) === JSON.stringify([BUNDLED_DATASET_ID]),
    "public lane bundled query provenance mismatch",
  )
  reject(payload.schema_version === "public-install-evidence-payload.v1" && payload.evidence_kind === "exact-public-registry-candidate-install", "public lane payload identity mismatch")
  reject(payload.lane === expectedLane && payload.package_name === PACKAGE_NAME && payload.package_version === expected.version && payload.package_integrity === expected.packageIntegrity, "public lane identity mismatch")
  reject(payload.source_commit === expected.sourceCommit && payload.candidate_receipt_digest === expected.candidateReceiptDigest, "public lane candidate join mismatch")
  reject(
    exactKeys(payload.candidate_dist_tag, ["name", "resolved_version"]) &&
      payload.candidate_dist_tag.name === "candidate" &&
      payload.candidate_dist_tag.resolved_version === expected.version &&
      payload.invocation === `npx -y ${PACKAGE_NAME}@${expected.version}` &&
      payload.registry === PUBLIC_REGISTRY,
    "public lane registry invocation mismatch",
  )
  const laneRuntime = LANES[expectedLane]
  reject(
    laneRuntime !== undefined &&
      NODE_22_VERSION.test(payload.runtime?.node) &&
      payload.runtime?.node_major === 22 &&
      payload.runtime?.platform === laneRuntime.platform &&
      payload.runtime?.operating_system === laneRuntime.operatingSystem &&
      payload.runtime?.architecture === laneRuntime.arch &&
      (laneRuntime.requireGlibc
        ? /^\d+\.\d+$/.test(payload.runtime?.glibc_version_runtime)
        : payload.runtime?.glibc_version_runtime === null),
    "public lane runtime mismatch",
  )
  reject(
    exactKeys(payload.isolation, ["fresh_home", "fresh_npm_cache", "fresh_working_directory", "fresh_user_config", "checkout_removed_before_install", "local_artifact_reachable", "local_or_unversioned_install_allowed"]) &&
      payload.isolation.fresh_home === true &&
      payload.isolation.fresh_npm_cache === true &&
      payload.isolation.fresh_working_directory === true &&
      payload.isolation.fresh_user_config === true &&
      payload.isolation.checkout_removed_before_install === true &&
      payload.isolation.local_artifact_reachable === false &&
      payload.isolation.local_or_unversioned_install_allowed === false,
    "public lane isolation proof incomplete",
  )
  reject(
    payload.build_traps?.active === true &&
      JSON.stringify(payload.build_traps.names) === JSON.stringify(BUILD_TRAP_NAMES) &&
      Object.keys(payload.build_traps.trap_sha256 ?? {}).sort().join("\n") === [...BUILD_TRAP_NAMES].sort().join("\n") &&
      Object.values(payload.build_traps.trap_sha256).every((digest) => DIGEST.test(digest)) &&
      payload.build_traps.canary_proven === true &&
      DIGEST.test(payload.build_traps.canary_evidence_sha256) &&
      payload.build_traps.canary_exit_code === 86 &&
      payload.build_traps.fired_during_install === false &&
      payload.build_traps.compilation_observed === false,
    "public lane build trap proof incomplete",
  )
  reject(
    exactKeys(payload.installed_identities, [
      PACKAGE_NAME,
      "@modelcontextprotocol/sdk",
      "better-sqlite3",
      "pino",
      "zod",
    ]),
    "public lane installed identities incomplete",
  )
  for (const [name, version] of [
    [PACKAGE_NAME, expected.version],
    ["@modelcontextprotocol/sdk", SDK_VERSION],
    ["better-sqlite3", BETTER_SQLITE3_VERSION],
    ["pino", PINO_VERSION],
    ["zod", ZOD_VERSION],
  ]) {
    const identity = payload.installed_identities[name]
    let registryTarballIsPublic = false
    try {
      validatePublicRegistryResolution(identity?.registry_tarball)
      registryTarballIsPublic = true
    } catch {}
    reject(
      identity?.name === name &&
        identity.version === version &&
        DIGEST.test(identity.package_json_sha256) &&
        registryTarballIsPublic &&
        identity.registry_integrity === identity.lock_integrity &&
        identity.cached_tarball_integrity_verified === true &&
        validRegistryEvidence(identity.registry_evidence),
      `${name} public lane identity/integrity proof incomplete`,
    )
  }
  const expectedMessageCount = expectedLane === "ubuntu-glibc-x64" ? 5 : 3
  reject(
    payload.protocol?.initialize?.passed === true &&
      payload.protocol.initialize.protocol_version === PROTOCOL_VERSION &&
      payload.protocol.initialize.server_name === PACKAGE_NAME &&
      payload.protocol.initialize.server_version === expected.version &&
      payload.protocol?.tools_list?.passed === true &&
      JSON.stringify(payload.protocol.tools_list.names) === JSON.stringify(EXPECTED_TOOLS) &&
      isExactExploreSchema(payload.protocol.tools_list.explore_input_schema) &&
      payload.protocol?.bundled_query?.passed === true &&
      payload.protocol?.no_api_key?.passed === true &&
      payload.protocol.no_api_key.data_go_kr_service_key === "absent" &&
      payload.protocol.no_api_key.academyinfo_service_key === "absent" &&
      payload.protocol?.json_rpc_stdout?.passed === true &&
      payload.protocol.json_rpc_stdout.parsed_message_count === expectedMessageCount &&
      payload.protocol.json_rpc_stdout.non_json_rpc_line_count === 0 &&
      (expectedLane !== "ubuntu-glibc-x64" || (
        payload.protocol?.ubuntu_client_journey?.passed === true &&
        payload.protocol.ubuntu_client_journey.ambiguity_no_partial_data === true &&
        payload.protocol.ubuntu_client_journey.exact_resolution === true &&
        payload.protocol.ubuntu_client_journey.factual_comparison === true &&
        payload.protocol.ubuntu_client_journey.indicator_explanation === true &&
        payload.protocol.ubuntu_client_journey.no_ranking_or_recommendation === true
      )),
    "public lane protocol proof incomplete",
  )
  reject(
    payload.install_log?.level === "verbose" &&
      payload.install_log.sanitized === true &&
      DIGEST.test(payload.install_log.sha256) &&
      Number.isSafeInteger(payload.install_log.byte_length) &&
      payload.install_log.byte_length > 0 &&
      Number.isSafeInteger(payload.install_log.line_count) &&
      payload.install_log.line_count > 0 &&
      Number.isSafeInteger(payload.install_log.redaction_count),
    "public lane sanitized install log proof incomplete",
  )
  reject(payload.public_evidence_complete === true && payload.promotion_performed === false && validPublicReceiptIdentifier(payload.run_id) && validTime(payload.observed_at), "public lane gates incomplete")
  reject(sha256Jcs(payload) === receipt.public_install_evidence_digest_v1, "public lane payload digest mismatch")
  const { receipt_digest_v1: digest, ...projection } = receipt
  reject(DIGEST.test(digest) && digest === expectedDigest && sha256Jcs(projection) === digest, "public lane outer digest mismatch")
  return digest
}


async function main() {
  const [mode, ...argv] = process.argv.slice(2)
  const args = parsePublicVerifierArgs(mode, argv)
  if (mode === "lane") await runLane(args)
  else throw new Error("usage: public-installed-verify.mjs lane [arguments]")
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(`FAIL: ${error instanceof Error ? error.message : "verification rejected"}`)
    process.exit(1)
  })
}
