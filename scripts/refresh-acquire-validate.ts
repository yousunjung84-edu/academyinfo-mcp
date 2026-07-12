import { createHash } from "node:crypto"
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { inflateRawSync } from "node:zlib"

import { sha256Jcs } from "../src/release-receipts.js"
import { sourceUrl } from "./seed15118998-config.js"

const DATASET_ID = "15118998"
const REVIEWED_SOURCE_PAGE = new URL(sourceUrl)
const REPORT_NAME = "validation-report.v1.json"
const PRODUCER = "Refresh acquisition and validation"
const MAX_REDIRECTS = 5
const PAGE_LIMIT = 2 * 1024 * 1024
const XLSX_LIMIT = 64 * 1024 * 1024
const ZIP_ENTRY_LIMIT = 10_000
const ZIP_UNCOMPRESSED_LIMIT = 256 * 1024 * 1024
const ZIP_XML_LIMIT = 64 * 1024 * 1024
const REQUEST_TOTAL_TIMEOUT_MS = 20_000
const BODY_PROGRESS_TIMEOUT_MS = 5_000
const SHA256 = /^[a-f0-9]{64}$/
const PRIVATE_MATERIAL = /(?:15139279|file:\/\/|[?&](?:key|token|signature|x-amz-)|\/(?:Users|home)\/|[A-Za-z]:[\\/](?:Users|Documents and Settings)[\\/]|\\\\[^\\\r\n]+\\[^\\\r\n]+)/iu
const COMMIT = /^[a-f0-9]{40}$/

export const FIXED_CANDIDATE_PATHS = [
  "data/seed/academyinfo_15118998.sqlite",
  "data/seed/academyinfo_15118998.manifest.json",
  "data/seed/indicators.json",
  "evidence/header-snapshots/15118998.headers.json",
  "evidence/checksums/15118998.checksums.json",
  "evidence/sample-rows/15118998.sample.json",
] as const

export const REPORT_KEYS = [
  "report_schema_version",
  "producer_workflow",
  "producer_run_id",
  "source_commit",
  "validation_policy_digest_v1",
  "schema_versions",
  "canonical_page_url",
  "redirect_hops",
  "metadata_field_hashes",
  "metadata_fingerprint_v1",
  "license_observation",
  "download",
  "invariants",
  "semantic_digests",
  "files",
  "sanitized",
  "result",
  "failure_code",
  "report_digest_v1",
] as const
export type ValidationReport = {
  readonly [Key in (typeof REPORT_KEYS)[number]]: unknown
}

export type RefreshResult = "changed" | "no_change" | "failure"
export type FailureCode =
  | "PAGE_UNREACHABLE"
  | "PAGE_HTTP_ERROR"
  | "PAGE_BODY_LIMIT"
  | "PAGE_METADATA_INVALID"
  | "DOWNLOAD_LINK_MISSING"
  | "DOWNLOAD_LINK_POLICY_REJECTED"
  | "DOWNLOAD_REDIRECT_POLICY_REJECTED"
  | "DOWNLOAD_UNREACHABLE"
  | "DOWNLOAD_TIMEOUT"
  | "DOWNLOAD_HTTP_ERROR"
  | "DOWNLOAD_BODY_LIMIT"
  | "DOWNLOAD_CONTENT_TYPE_MISMATCH"
  | "DOWNLOAD_ARCHIVE_INVALID"
  | "VALIDATION_FAILED"

export interface AcquisitionOptions {
  readonly canonicalPage: string
  readonly sourceCommit: string
  readonly policyDigest: string
  readonly output: string
  readonly producerRunId?: string | null
}

export interface RedirectHop {
  readonly host: string
  readonly path: string
  readonly status: number
}

export interface GeneratedCandidate {
  readonly root: string
  readonly semanticDigests: Readonly<Record<string, string>>
}

export interface AcquisitionDependencies {
  readonly fetch?: typeof fetch
  readonly buildCandidate?: (workbook: Uint8Array) => GeneratedCandidate
  readonly now?: () => string
}

class AcquisitionFailure extends Error {
  constructor(readonly code: FailureCode) {
    super(code)
  }
}

function projectRoot(): string {
  let current = dirname(fileURLToPath(import.meta.url))
  for (;;) {
    const packagePath = join(current, "package.json")
    if (existsSync(packagePath)) {
      try {
        const pkg = JSON.parse(readFileSync(packagePath, "utf8")) as { name?: unknown }
        if (pkg.name === "academyinfo-mcp") return current
      } catch {
        // Keep searching; malformed ancestors are not trusted as the project root.
      }
    }
    const parent = dirname(current)
    if (parent === current) throw new Error("Project root is unavailable")
    current = parent
  }
}

function isWithin(parent: string, child: string): boolean {
  const path = relative(parent, child)
  return path === "" || (!path.startsWith(`..${sep}`) && path !== ".." && !isAbsolute(path))
}

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex")
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function safeUrl(raw: string): URL {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new AcquisitionFailure("PAGE_METADATA_INVALID")
  }
  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== "" ||
    (url.port !== "" && url.port !== "443")
  ) {
    throw new AcquisitionFailure("PAGE_METADATA_INVALID")
  }
  return url
}

function reviewedCanonicalPage(url: URL): boolean {
  return (
    url.hostname.toLowerCase() === REVIEWED_SOURCE_PAGE.hostname.toLowerCase() &&
    url.pathname === REVIEWED_SOURCE_PAGE.pathname
  )
}

function officialHostBase(hostname: string): string {
  const host = hostname.toLowerCase()
  return host.startsWith("www.") ? host.slice(4) : host
}

function allowedOfficialUrl(url: URL, baseHost: string): boolean {
  const hostname = url.hostname.toLowerCase()
  return (
    url.protocol === "https:" &&
    url.username === "" &&
    url.password === "" &&
    (url.port === "" || url.port === "443") &&
    (hostname === baseHost || hostname.endsWith(`.${baseHost}`))
  )
}

async function readBoundedBody(
  response: Response,
  limit: number,
  limitCode: FailureCode,
  timeoutCode: FailureCode,
  signal: AbortSignal,
): Promise<Uint8Array> {
  const declared = response.headers.get("content-length")
  if (declared !== null && (!/^\d+$/.test(declared) || !Number.isSafeInteger(Number(declared)) || Number(declared) > limit)) {
    throw new AcquisitionFailure(limitCode)
  }
  if (response.body === null) return new Uint8Array()
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  for (;;) {
    let progressTimer: ReturnType<typeof setTimeout> | undefined
    let abortListener: (() => void) | undefined
    try {
      const item = await Promise.race([
        reader.read(),
        new Promise<never>((_resolve, rejectPromise) => {
          const timedOut = (): void => {
            rejectPromise(new AcquisitionFailure(timeoutCode))
            void reader.cancel()
          }
          progressTimer = setTimeout(timedOut, BODY_PROGRESS_TIMEOUT_MS)
          abortListener = timedOut
          if (signal.aborted) timedOut()
          else signal.addEventListener("abort", timedOut, { once: true })
        }),
      ])
      if (item.done) break
      length += item.value.byteLength
      if (length > limit) {
        void reader.cancel()
        throw new AcquisitionFailure(limitCode)
      }
      chunks.push(item.value)
    } finally {
      if (progressTimer !== undefined) clearTimeout(progressTimer)
      if (abortListener !== undefined) signal.removeEventListener("abort", abortListener)
    }
  }
  const body = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body
}

interface FetchResult {
  readonly response: Response
  readonly body: Uint8Array
  readonly hops: readonly RedirectHop[]
  readonly finalUrl: URL
}

async function boundedFetch(
  initial: URL,
  baseHost: string,
  bodyLimit: number,
  bodyLimitCode: FailureCode,
  fetchImpl: typeof fetch,
  phase: "page" | "download",
): Promise<FetchResult> {
  let url = initial
  const hops: RedirectHop[] = []
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TOTAL_TIMEOUT_MS)
  const timeoutCode: FailureCode = phase === "page" ? "PAGE_UNREACHABLE" : "DOWNLOAD_TIMEOUT"
  try {
    for (let count = 0; count <= MAX_REDIRECTS; count += 1) {
      if (!allowedOfficialUrl(url, baseHost)) {
        throw new AcquisitionFailure(phase === "page" ? "PAGE_METADATA_INVALID" : "DOWNLOAD_REDIRECT_POLICY_REJECTED")
      }
      let response: Response
      try {
        response = await fetchImpl(url, {
          method: "GET",
          redirect: "manual",
          signal: controller.signal,
          headers: { accept: phase === "page" ? "text/html,application/xhtml+xml" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/zip,application/octet-stream" },
        })
      } catch (error) {
        if (error instanceof AcquisitionFailure) throw error
        if (controller.signal.aborted) throw new AcquisitionFailure(timeoutCode)
        throw new AcquisitionFailure(phase === "page" ? "PAGE_UNREACHABLE" : "DOWNLOAD_UNREACHABLE")
      }
      hops.push({ host: url.hostname.toLowerCase(), path: url.pathname, status: response.status })
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location")
        if (location === null || count === MAX_REDIRECTS) {
          throw new AcquisitionFailure(phase === "page" ? "PAGE_HTTP_ERROR" : "DOWNLOAD_REDIRECT_POLICY_REJECTED")
        }
        let next: URL
        try {
          next = new URL(location, url)
        } catch {
          throw new AcquisitionFailure(phase === "page" ? "PAGE_HTTP_ERROR" : "DOWNLOAD_REDIRECT_POLICY_REJECTED")
        }
        if (!allowedOfficialUrl(next, baseHost)) {
          throw new AcquisitionFailure(phase === "page" ? "PAGE_HTTP_ERROR" : "DOWNLOAD_REDIRECT_POLICY_REJECTED")
        }
        url = next
        continue
      }
      if (response.status !== 200) {
        throw new AcquisitionFailure(phase === "page" ? "PAGE_HTTP_ERROR" : "DOWNLOAD_HTTP_ERROR")
      }
      return {
        response,
        body: await readBoundedBody(response, bodyLimit, bodyLimitCode, timeoutCode, controller.signal),
        hops,
        finalUrl: url,
      }
    }
    throw new AcquisitionFailure(phase === "page" ? "PAGE_HTTP_ERROR" : "DOWNLOAD_REDIRECT_POLICY_REJECTED")
  } finally {
    clearTimeout(timeout)
  }
}

function htmlDecode(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&#x2F;", "/")
    .replaceAll("&#47;", "/")
    .replaceAll("&quot;", '"')
}

function selectDownloadUrl(html: string, pageUrl: URL, baseHost: string): URL {
  const candidates = new Map<string, URL>()
  const attributes = /(?:href|data-(?:url|href|download))\s*=\s*["']([^"']+)["']/giu
  for (const match of html.matchAll(attributes)) {
    const raw = match[1]
    if (raw === undefined) continue
    let candidate: URL
    try {
      candidate = new URL(htmlDecode(raw), pageUrl)
    } catch {
      continue
    }
    const path = candidate.pathname.toLowerCase()
    const surrounding = html.slice(Math.max(0, (match.index ?? 0) - 160), (match.index ?? 0) + match[0].length + 160)
    if (!path.endsWith(".xlsx") && !(/download/i.test(path) && /\.xlsx/i.test(surrounding))) continue
    if (!allowedOfficialUrl(candidate, baseHost)) throw new AcquisitionFailure("DOWNLOAD_LINK_POLICY_REJECTED")
    candidate.hash = ""
    candidates.set(candidate.href, candidate)
  }
  if (candidates.size !== 1) throw new AcquisitionFailure("DOWNLOAD_LINK_MISSING")
  const selected = candidates.values().next().value as URL | undefined
  if (selected === undefined) throw new AcquisitionFailure("DOWNLOAD_LINK_MISSING")
  return selected
}

function contentTypeAllowed(response: Response): boolean {
  const type = (response.headers.get("content-type") ?? "").split(";", 1)[0]?.trim().toLowerCase()
  return new Set([
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/zip",
    "application/octet-stream",
  ]).has(type ?? "")
}

interface ZipSummary {
  readonly entries: number
  readonly compressedBytes: number
  readonly uncompressedBytes: number
  readonly xmlBytes: number
}

const CRC32_TABLE = Uint32Array.from({ length: 256 }, (_, value) => {
  let remainder = value
  for (let bit = 0; bit < 8; bit += 1) {
    remainder = (remainder & 1) === 0 ? remainder >>> 1 : 0xedb88320 ^ (remainder >>> 1)
  }
  return remainder >>> 0
})

function crc32(bytes: Uint8Array): number {
  let remainder = 0xffffffff
  for (const byte of bytes) {
    remainder = CRC32_TABLE[(remainder ^ byte) & 0xff]! ^ (remainder >>> 8)
  }
  return (remainder ^ 0xffffffff) >>> 0
}

export function validateXlsxArchive(bytes: Uint8Array): ZipSummary {
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (buffer.length < 22 || buffer.readUInt32LE(0) !== 0x04034b50) throw new AcquisitionFailure("DOWNLOAD_ARCHIVE_INVALID")
  const minimum = Math.max(0, buffer.length - 65_557)
  let eocd = -1
  for (let offset = buffer.length - 22; offset >= minimum; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      eocd = offset
      break
    }
  }
  if (eocd < 0) throw new AcquisitionFailure("DOWNLOAD_ARCHIVE_INVALID")
  const commentLength = buffer.readUInt16LE(eocd + 20)
  if (
    buffer.readUInt16LE(eocd + 4) !== 0 ||
    buffer.readUInt16LE(eocd + 6) !== 0 ||
    buffer.readUInt16LE(eocd + 8) !== buffer.readUInt16LE(eocd + 10) ||
    eocd + 22 + commentLength !== buffer.length
  ) {
    throw new AcquisitionFailure("DOWNLOAD_ARCHIVE_INVALID")
  }
  const count = buffer.readUInt16LE(eocd + 10)
  const centralSize = buffer.readUInt32LE(eocd + 12)
  const centralOffset = buffer.readUInt32LE(eocd + 16)
  if (count === 0 || count > ZIP_ENTRY_LIMIT || centralOffset + centralSize !== eocd) {
    throw new AcquisitionFailure("DOWNLOAD_ARCHIVE_INVALID")
  }
  const names = new Set<string>()
  const ranges: { start: number; end: number }[] = []
  let offset = centralOffset
  let compressedBytes = 0
  let uncompressedBytes = 0
  let xmlBytes = 0
  for (let index = 0; index < count; index += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) throw new AcquisitionFailure("DOWNLOAD_ARCHIVE_INVALID")
    const flags = buffer.readUInt16LE(offset + 8)
    const method = buffer.readUInt16LE(offset + 10)
    const crc = buffer.readUInt32LE(offset + 16)
    const compressed = buffer.readUInt32LE(offset + 20)
    const uncompressed = buffer.readUInt32LE(offset + 24)
    const nameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    const external = buffer.readUInt32LE(offset + 38)
    const localOffset = buffer.readUInt32LE(offset + 42)
    const next = offset + 46 + nameLength + extraLength + commentLength
    if (
      next > buffer.length ||
      (flags & 0x0001) !== 0 ||
      !new Set([0, 8]).has(method) ||
      compressed === 0xffffffff ||
      uncompressed === 0xffffffff ||
      localOffset === 0xffffffff ||
      localOffset + 30 > centralOffset ||
      buffer.readUInt32LE(localOffset) !== 0x04034b50
    ) {
      throw new AcquisitionFailure("DOWNLOAD_ARCHIVE_INVALID")
    }
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8")
    const localNameLength = buffer.readUInt16LE(localOffset + 26)
    const localExtraLength = buffer.readUInt16LE(localOffset + 28)
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength
    const dataEnd = dataOffset + compressed
    const usesDescriptor = (flags & 0x0008) !== 0
    let recordEnd = dataEnd
    let descriptorMatches = true
    if (usesDescriptor) {
      let descriptorOffset = dataEnd
      if (descriptorOffset + 4 <= centralOffset && buffer.readUInt32LE(descriptorOffset) === 0x08074b50) descriptorOffset += 4
      descriptorMatches =
        descriptorOffset + 12 <= centralOffset &&
        buffer.readUInt32LE(descriptorOffset) === crc &&
        buffer.readUInt32LE(descriptorOffset + 4) === compressed &&
        buffer.readUInt32LE(descriptorOffset + 8) === uncompressed
      recordEnd = descriptorOffset + 12
    }
    if (
      name.length === 0 ||
      name.includes("\\") ||
      name.startsWith("/") ||
      name.split("/").some((part) => part === ".." || part === "") ||
      names.has(name) ||
      compressed > XLSX_LIMIT ||
      ((external >>> 16) & 0o170000) === 0o120000 ||
      buffer.readUInt16LE(localOffset + 6) !== flags ||
      buffer.readUInt16LE(localOffset + 8) !== method ||
      (!usesDescriptor && buffer.readUInt32LE(localOffset + 14) !== crc) ||
      (!usesDescriptor && buffer.readUInt32LE(localOffset + 18) !== compressed) ||
      (!usesDescriptor && buffer.readUInt32LE(localOffset + 22) !== uncompressed) ||
      (usesDescriptor && buffer.readUInt32LE(localOffset + 14) !== 0 && buffer.readUInt32LE(localOffset + 14) !== crc) ||
      (usesDescriptor && buffer.readUInt32LE(localOffset + 18) !== 0 && buffer.readUInt32LE(localOffset + 18) !== compressed) ||
      (usesDescriptor && buffer.readUInt32LE(localOffset + 22) !== 0 && buffer.readUInt32LE(localOffset + 22) !== uncompressed) ||
      !descriptorMatches ||
      localNameLength !== nameLength ||
      buffer.subarray(localOffset + 30, localOffset + 30 + localNameLength).toString("utf8") !== name ||
      recordEnd > centralOffset ||
      ranges.some((range) => localOffset < range.end && recordEnd > range.start)
    ) {
      throw new AcquisitionFailure("DOWNLOAD_ARCHIVE_INVALID")
    }
    compressedBytes += compressed
    uncompressedBytes += uncompressed
    if (
      compressedBytes > XLSX_LIMIT ||
      uncompressedBytes > ZIP_UNCOMPRESSED_LIMIT ||
      uncompressed > ZIP_UNCOMPRESSED_LIMIT - (uncompressedBytes - uncompressed)
    ) {
      throw new AcquisitionFailure("DOWNLOAD_ARCHIVE_INVALID")
    }
    const isXml = name.toLowerCase().endsWith(".xml") || name.toLowerCase().endsWith(".rels")
    if (isXml && xmlBytes + uncompressed > ZIP_XML_LIMIT) throw new AcquisitionFailure("DOWNLOAD_ARCHIVE_INVALID")
    const compressedData = buffer.subarray(dataOffset, dataEnd)
    let inflated: Buffer
    try {
      inflated = method === 0
        ? Buffer.from(compressedData)
        : inflateRawSync(compressedData, { maxOutputLength: Math.max(1, uncompressed) })
    } catch {
      throw new AcquisitionFailure("DOWNLOAD_ARCHIVE_INVALID")
    }
    if (
      inflated.byteLength !== uncompressed ||
      (method === 0 && compressed !== uncompressed) ||
      crc32(inflated) !== crc
    ) {
      throw new AcquisitionFailure("DOWNLOAD_ARCHIVE_INVALID")
    }
    if (isXml) xmlBytes += inflated.byteLength
    names.add(name)
    ranges.push({ start: localOffset, end: recordEnd })
    offset = next
  }
  if (offset !== centralOffset + centralSize) throw new AcquisitionFailure("DOWNLOAD_ARCHIVE_INVALID")
  for (const required of ["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml"]) {
    if (!names.has(required)) throw new AcquisitionFailure("DOWNLOAD_ARCHIVE_INVALID")
  }
  if (![...names].some((name) => /^xl\/worksheets\/sheet[^/]*\.xml$/i.test(name))) throw new AcquisitionFailure("DOWNLOAD_ARCHIVE_INVALID")
  return { entries: count, compressedBytes, uncompressedBytes, xmlBytes }
}

function readSemanticDigests(root: string): Readonly<Record<string, string>> {
  const checksums = JSON.parse(readFileSync(join(root, "evidence/checksums/15118998.checksums.json"), "utf8")) as Record<string, unknown>
  if (!isRecord(checksums["semantic_digests"])) throw new AcquisitionFailure("VALIDATION_FAILED")
  const values: Record<string, string> = {}
  for (const [key, value] of Object.entries(checksums["semantic_digests"])) {
    if (typeof value !== "string" || !SHA256.test(value)) throw new AcquisitionFailure("VALIDATION_FAILED")
    values[key] = value
  }
  if (Object.keys(values).length === 0) throw new AcquisitionFailure("VALIDATION_FAILED")
  return values
}

function defaultBuildCandidate(workbook: Uint8Array): GeneratedCandidate {
  const root = projectRoot()
  const buildRoot = mkdtempSync(join(tmpdir(), "academyinfo-refresh-build-"))
  try {
    cpSync(join(root, "dist/scripts"), join(buildRoot, "scripts"), { recursive: true, dereference: true })
    mkdirSync(join(buildRoot, "data/raw", DATASET_ID), { recursive: true, mode: 0o755 })
    writeFileSync(join(buildRoot, "package.json"), '{"name":"academyinfo-mcp","type":"module"}\n', { mode: 0o644 })
    symlinkSync(join(root, "node_modules"), join(buildRoot, "node_modules"), process.platform === "win32" ? "junction" : "dir")
    writeFileSync(join(buildRoot, "data/raw", DATASET_ID, "대학주요정보.xlsx"), workbook, { mode: 0o600 })
    const child = spawnSync(process.execPath, [join(buildRoot, "scripts/seed15118998.js")], {
      cwd: buildRoot,
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
      env: {
        PATH: process.env["PATH"] ?? "",
        SystemRoot: process.env["SystemRoot"] ?? "",
        TZ: "UTC",
        LANG: "C.UTF-8",
      },
    })
    if (child.status !== 0) throw new AcquisitionFailure("VALIDATION_FAILED")
    const semanticDigests = readSemanticDigests(buildRoot)
    const retained = mkdtempSync(join(tmpdir(), "academyinfo-refresh-candidate-"))
    try {
      for (const path of FIXED_CANDIDATE_PATHS) {
        const source = join(buildRoot, path)
        if (!existsSync(source) || !lstatSync(source).isFile()) throw new AcquisitionFailure("VALIDATION_FAILED")
        const destination = join(retained, path)
        mkdirSync(dirname(destination), { recursive: true, mode: 0o755 })
        copyFileSync(source, destination)
        chmodSync(destination, 0o644)
      }
      return { root: retained, semanticDigests }
    } catch (error) {
      rmSync(retained, { recursive: true, force: true })
      throw error
    }
  } finally {
    rmSync(buildRoot, { recursive: true, force: true })
  }
}

function prepareOutput(output: string): string {
  const root = realpathSync(projectRoot())
  const target = resolve(output)
  if (isWithin(root, target)) throw new Error("Output must be outside the repository")
  let ancestor = target
  while (!existsSync(ancestor)) {
    const parent = dirname(ancestor)
    if (parent === ancestor) throw new Error("Output parent is unavailable")
    ancestor = parent
  }
  const predictedTarget = resolve(realpathSync(ancestor), relative(ancestor, target))
  if (isWithin(root, predictedTarget)) throw new Error("Output must be outside the repository")
  if (existsSync(target)) {
    const stat = lstatSync(target)
    if (stat.isSymbolicLink() || !stat.isDirectory() || readdirSync(target).length !== 0) throw new Error("Output must be a new or empty regular directory")
  } else {
    mkdirSync(target, { recursive: true, mode: 0o755 })
  }
  const realTarget = realpathSync(target)
  if (isWithin(root, realTarget)) throw new Error("Output must be outside the repository")
  return realTarget
}

function auditPath(sourceSha: string): string {
  return `evidence/refresh/${DATASET_ID}.${sourceSha.slice(0, 12)}.audit.json`
}

function copyChangedCandidate(generated: GeneratedCandidate, output: string, audit: Record<string, unknown>): readonly { path: string; sha256: string }[] {
  const paths = [...FIXED_CANDIDATE_PATHS, auditPath(String(audit["source_sha256"]))]
  const auditDestination = join(generated.root, paths[paths.length - 1] as string)
  mkdirSync(dirname(auditDestination), { recursive: true, mode: 0o755 })
  writeFileSync(auditDestination, `${JSON.stringify(audit, null, 2)}\n`, { mode: 0o644 })
  const files: { path: string; sha256: string }[] = []
  for (const path of paths) {
    const source = join(generated.root, path)
    const destination = join(output, path)
    mkdirSync(dirname(destination), { recursive: true, mode: 0o755 })
    copyFileSync(source, destination)
    chmodSync(destination, 0o644)
    files.push({ path, sha256: sha256(readFileSync(destination)) })
  }
  return files
}

function currentSourceSha(): string | null {
  try {
    const value = JSON.parse(readFileSync(join(projectRoot(), "evidence/checksums/15118998.checksums.json"), "utf8")) as Record<string, unknown>
    return typeof value["source_file_checksum_sha256"] === "string" && SHA256.test(value["source_file_checksum_sha256"])
      ? value["source_file_checksum_sha256"]
      : null
  } catch {
    return null
  }
}

function reportWithDigest(report: Omit<ValidationReport, "report_digest_v1">): ValidationReport {
  return { ...report, report_digest_v1: sha256Jcs(report) }
}

function writeReport(output: string, report: ValidationReport): void {
  const path = join(output, REPORT_NAME)
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o644 })
  chmodSync(path, 0o644)
}

export async function acquireAndValidate(options: AcquisitionOptions, dependencies: AcquisitionDependencies = {}): Promise<ValidationReport> {
  if (!COMMIT.test(options.sourceCommit) || !SHA256.test(options.policyDigest)) throw new Error("Invalid immutable identity input")
  const canonical = safeUrl(options.canonicalPage)
  if (!reviewedCanonicalPage(canonical)) throw new AcquisitionFailure("PAGE_METADATA_INVALID")
  const producerRunId = options.producerRunId ?? process.env["GITHUB_RUN_ID"] ?? null
  if (producerRunId !== null && !/^[1-9]\d*$/.test(producerRunId)) throw new Error("Invalid producer run identity")
  const output = prepareOutput(options.output)
  const fetchImpl = dependencies.fetch ?? fetch
  const now = dependencies.now ?? (() => new Date().toISOString())
  const baseHost = officialHostBase(REVIEWED_SOURCE_PAGE.hostname)
  let pageHops: readonly RedirectHop[] = []
  let metadataFieldHashes: Record<string, string> = {}
  let metadataFingerprint: string | null = null
  let licenseObserved = false
  let download: Record<string, unknown> | null = null
  let generated: GeneratedCandidate | null = null
  try {
    const page = await boundedFetch(canonical, baseHost, PAGE_LIMIT, "PAGE_BODY_LIMIT", fetchImpl, "page")
    pageHops = page.hops
    const pageType = (page.response.headers.get("content-type") ?? "").toLowerCase()
    if (!pageType.startsWith("text/html") && !pageType.startsWith("application/xhtml+xml")) throw new AcquisitionFailure("PAGE_METADATA_INVALID")
    const html = new TextDecoder("utf-8", { fatal: true }).decode(page.body)
    licenseObserved = /공공누리|KOGL|제\s*1\s*유형/iu.test(html)
    if (!licenseObserved) throw new AcquisitionFailure("PAGE_METADATA_INVALID")
    const title = /<title[^>]*>([^<]*)<\/title>/iu.exec(html)?.[1]?.trim() ?? ""
    metadataFieldHashes = {
      page_body_sha256: sha256(page.body),
      page_title_sha256: sha256(title),
    }
    metadataFingerprint = sha256Jcs(metadataFieldHashes)
    const selected = selectDownloadUrl(html, page.finalUrl, baseHost)
    const acquired = await boundedFetch(selected, baseHost, XLSX_LIMIT, "DOWNLOAD_BODY_LIMIT", fetchImpl, "download")
    if (!contentTypeAllowed(acquired.response)) throw new AcquisitionFailure("DOWNLOAD_CONTENT_TYPE_MISMATCH")
    const zip = validateXlsxArchive(acquired.body)
    const sourceSha = sha256(acquired.body)
    download = {
      content_type: (acquired.response.headers.get("content-type") ?? "").split(";", 1)[0]?.toLowerCase() ?? "",
      size_bytes: acquired.body.byteLength,
      source_sha256: sourceSha,
      redirect_hops: acquired.hops,
      zip_entries: zip.entries,
      zip_compressed_bytes: zip.compressedBytes,
      zip_uncompressed_bytes: zip.uncompressedBytes,
      zip_xml_bytes: zip.xmlBytes,
    }
    generated = (dependencies.buildCandidate ?? defaultBuildCandidate)(acquired.body)
    const result: RefreshResult = currentSourceSha() === sourceSha ? "no_change" : "changed"
    const observedAt = now()
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(observedAt)) throw new AcquisitionFailure("VALIDATION_FAILED")
    const audit = {
      audit_schema_version: "refresh-audit.v1",
      dataset_id: DATASET_ID,
      source_sha256: sourceSha,
      metadata_fingerprint_v1: metadataFingerprint,
      semantic_digests: generated.semanticDigests,
      observed_at: observedAt,
    }
    const files = result === "changed" ? copyChangedCandidate(generated, output, audit) : []
    const report = reportWithDigest({
      report_schema_version: "validation-report.v1",
      producer_workflow: PRODUCER,
      producer_run_id: producerRunId,
      source_commit: options.sourceCommit,
      validation_policy_digest_v1: options.policyDigest,
      schema_versions: { report: "v1", refresh_audit: "v1", semantic_digest: "v1" },
      canonical_page_url: canonical.href,
      redirect_hops: pageHops,
      metadata_field_hashes: metadataFieldHashes,
      metadata_fingerprint_v1: metadataFingerprint,
      license_observation: { status: "pass", kind: "KOGL-1" },
      download,
      invariants: { origin: "pass", license: "pass", workbook: "pass", source_model: "pass", semantic_digest: "pass" },
      semantic_digests: generated.semanticDigests,
      files,
      sanitized: true,
      result,
      failure_code: null,
    })
    writeReport(output, report)
    return report
  } catch (error) {
    const code = error instanceof AcquisitionFailure ? error.code : "VALIDATION_FAILED"
    for (const entry of readdirSync(output)) rmSync(join(output, entry), { recursive: true, force: true })
    const report = reportWithDigest({
      report_schema_version: "validation-report.v1",
      producer_workflow: PRODUCER,
      producer_run_id: producerRunId,
      source_commit: options.sourceCommit,
      validation_policy_digest_v1: options.policyDigest,
      schema_versions: { report: "v1", refresh_audit: "v1", semantic_digest: "v1" },
      canonical_page_url: canonical.href,
      redirect_hops: pageHops,
      metadata_field_hashes: metadataFieldHashes,
      metadata_fingerprint_v1: metadataFingerprint,
      license_observation: { status: licenseObserved ? "pass" : "fail", kind: licenseObserved ? "KOGL-1" : null },
      download,
      invariants: { origin: "fail", license: licenseObserved ? "pass" : "fail", workbook: "fail", source_model: "fail", semantic_digest: "fail" },
      semantic_digests: {},
      files: [],
      sanitized: true,
      result: "failure",
      failure_code: code,
    })
    writeReport(output, report)
    return report
  } finally {
    if (generated !== null) rmSync(generated.root, { recursive: true, force: true })
  }
}

export function validateReportShape(value: unknown): value is ValidationReport {
  if (!isRecord(value) || !exactKeys(value, REPORT_KEYS)) return false
  const report = value as ValidationReport
  if (
    report.report_schema_version !== "validation-report.v1" ||
    report.producer_workflow !== PRODUCER ||
    !(report.producer_run_id === null || (typeof report.producer_run_id === "string" && /^[1-9]\d*$/.test(report.producer_run_id))) ||
    typeof report.source_commit !== "string" ||
    !COMMIT.test(report.source_commit) ||
    typeof report.validation_policy_digest_v1 !== "string" ||
    !SHA256.test(report.validation_policy_digest_v1) ||
    typeof report.canonical_page_url !== "string" ||
    PRIVATE_MATERIAL.test(JSON.stringify(report)) ||
    report.sanitized !== true ||
    !new Set(["changed", "no_change", "failure"]).has(String(report.result)) ||
    typeof report.report_digest_v1 !== "string" ||
    !SHA256.test(report.report_digest_v1) ||
    !Array.isArray(report.files) ||
    !Array.isArray(report.redirect_hops) ||
    !isRecord(report.schema_versions) ||
    !exactKeys(report.schema_versions, ["report", "refresh_audit", "semantic_digest"]) ||
    !isRecord(report.metadata_field_hashes) ||
    !isRecord(report.license_observation) ||
    !isRecord(report.invariants) ||
    !isRecord(report.semantic_digests)
  ) return false
  const { report_digest_v1: digest, ...projection } = report
  if (sha256Jcs(projection) !== digest) return false
  if (report.result === "changed") return report.failure_code === null && report.files.length === 7
  return report.files.length === 0 && (report.result === "no_change" ? report.failure_code === null : typeof report.failure_code === "string")
}

function parseArgs(argv: readonly string[]): AcquisitionOptions {
  const allowed = new Set(["--canonical-page", "--source-commit", "--policy-digest", "--output"])
  const values = new Map<string, string>()
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    const value = argv[index + 1]
    if (key === undefined || value === undefined || !allowed.has(key) || values.has(key)) throw new Error("Invalid arguments")
    values.set(key, value)
  }
  for (const key of allowed) if (!values.has(key)) throw new Error("Missing required argument")
  return {
    canonicalPage: values.get("--canonical-page") as string,
    sourceCommit: values.get("--source-commit") as string,
    policyDigest: values.get("--policy-digest") as string,
    output: values.get("--output") as string,
  }
}

const entryPoint = process.argv[1]
if (entryPoint !== undefined && resolve(fileURLToPath(import.meta.url)) === resolve(entryPoint)) {
  acquireAndValidate(parseArgs(process.argv.slice(2)))
    .then((report) => {
      process.stderr.write(`refresh-acquire-validate: ${String(report.result)}\n`)
      if (report.result === "failure") process.exitCode = 1
    })
    .catch(() => {
      process.stderr.write("refresh-acquire-validate: rejected\n")
      process.exitCode = 1
    })
}
