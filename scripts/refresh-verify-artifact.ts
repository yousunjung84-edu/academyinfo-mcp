import { createHash } from "node:crypto"
import { lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs"
import { isAbsolute, join, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { sha256Jcs } from "../src/release-receipts.js"

import {
  FIXED_CANDIDATE_PATHS,
  REPORT_KEYS,
  validateReportShape,
  type RefreshResult,
  type RedirectHop,
  type ValidationReport,
} from "./refresh-acquire-validate.js"
import { sourceUrl } from "./seed15118998-config.js"

const REPORT_NAME = "validation-report.v1.json"
const SHA256 = /^[a-f0-9]{64}$/
const COMMIT = /^[a-f0-9]{40}$/
const AUDIT = /^evidence\/refresh\/15118998\.([a-f0-9]{12})\.audit\.json$/
const REVIEWED_SOURCE_PAGE = new URL(sourceUrl)
const REVIEWED_OFFICIAL_HOST = REVIEWED_SOURCE_PAGE.hostname.toLowerCase().replace(/^www\./u, "")
const PRIVATE_MATERIAL = /(?:15139279|file:\/\/|[?&](?:key|token|signature|x-amz-)|\/(?:Users|home)\/|[A-Za-z]:[\\/](?:Users|Documents and Settings)[\\/]|\\\\[^\\\r\n]+\\[^\\\r\n]+)/iu
const ARTIFACT_TOTAL_LIMIT = 512 * 1024 * 1024
const FAILURE_CODES = new Set([
  "PAGE_UNREACHABLE",
  "PAGE_HTTP_ERROR",
  "PAGE_BODY_LIMIT",
  "PAGE_METADATA_INVALID",
  "DOWNLOAD_LINK_MISSING",
  "DOWNLOAD_LINK_POLICY_REJECTED",
  "DOWNLOAD_REDIRECT_POLICY_REJECTED",
  "DOWNLOAD_UNREACHABLE",
  "DOWNLOAD_TIMEOUT",
  "DOWNLOAD_HTTP_ERROR",
  "DOWNLOAD_BODY_LIMIT",
  "DOWNLOAD_CONTENT_TYPE_MISMATCH",
  "DOWNLOAD_ARCHIVE_INVALID",
  "VALIDATION_FAILED",
])

export interface ArtifactVerificationOptions {
  readonly artifactRoot: string
  readonly producerWorkflow: string
  readonly producerRunId?: string
  readonly sourceCommit: string
  readonly policyDigest: string
  readonly expectedReportDigest?: string
  readonly requireResult?: RefreshResult
  readonly mode: "acquisition" | "writer"
}

export interface ArtifactVerification {
  readonly result: RefreshResult
  readonly sourceCommit: string
  readonly reportDigest: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

function reject(condition: unknown): asserts condition {
  if (!condition) throw new Error("Artifact verification rejected")
}

function isSafeMode(mode: number, directory: boolean): boolean {
  if ((mode & 0o022) !== 0) return false
  return directory || (mode & 0o111) === 0
}

function walkArtifact(root: string): { readonly files: readonly string[]; readonly directories: readonly string[] } {
  const rootStat = lstatSync(root)
  reject(rootStat.isDirectory() && !rootStat.isSymbolicLink() && isSafeMode(rootStat.mode, true))
  const realRoot = realpathSync(root)
  const files: string[] = []
  const directories: string[] = []
  let totalBytes = 0
  const contained = (path: string): boolean => {
    const rel = relative(realRoot, realpathSync(path))
    return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel))
  }
  const walk = (directory: string): void => {
    reject(contained(directory))
    for (const name of readdirSync(directory).sort()) {
      reject(name !== "." && name !== ".." && !name.includes("\0"))
      const full = join(directory, name)
      const stat = lstatSync(full)
      reject(!stat.isSymbolicLink() && contained(full))
      const path = relative(root, full).split(sep).join("/")
      reject(path !== "" && !path.startsWith("/") && !path.split("/").includes(".."))
      if (stat.isDirectory()) {
        reject(isSafeMode(stat.mode, true))
        directories.push(path)
        walk(full)
      } else {
        reject(stat.isFile() && isSafeMode(stat.mode, false) && stat.size <= 128 * 1024 * 1024)
        totalBytes += stat.size
        reject(totalBytes <= ARTIFACT_TOTAL_LIMIT)
        files.push(path)
      }
    }
  }
  walk(root)
  return { files, directories }
}

function validHop(value: unknown): value is RedirectHop {
  return (
    isRecord(value) &&
    exactKeys(value, ["host", "path", "status"]) &&
    typeof value["host"] === "string" &&
    value["host"].length <= 253 &&
    value["host"].split(".").every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(label)) &&
    typeof value["path"] === "string" &&
    value["path"].startsWith("/") &&
    !value["path"].includes("?") &&
    !value["path"].includes("#") &&
    Number.isInteger(value["status"]) &&
    Number(value["status"]) >= 200 &&
    Number(value["status"]) <= 399
  )
}
function validOfficialHop(value: unknown): value is RedirectHop {
  if (!validHop(value)) return false
  let url: URL
  try {
    url = new URL(`https://${value.host}${value.path}`)
  } catch {
    return false
  }
  const hostname = url.hostname.toLowerCase()
  return (
    url.protocol === "https:" &&
    url.username === "" &&
    url.password === "" &&
    url.port === "" &&
    url.search === "" &&
    url.hash === "" &&
    hostname === value.host &&
    url.pathname === value.path &&
    (hostname === REVIEWED_OFFICIAL_HOST || hostname.endsWith(`.${REVIEWED_OFFICIAL_HOST}`))
  )
}
function validOfficialHopChain(value: unknown, allowEmpty: boolean): value is RedirectHop[] {
  return (
    Array.isArray(value) &&
    (allowEmpty || value.length > 0) &&
    value.every(validOfficialHop) &&
    value.every((hop, index) => index === value.length - 1 ? hop.status === 200 : hop.status >= 300)
  )
}

function exactReviewedPageHop(value: unknown): value is RedirectHop {
  return (
    validOfficialHop(value) &&
    value.host === REVIEWED_SOURCE_PAGE.hostname.toLowerCase() &&
    value.path === REVIEWED_SOURCE_PAGE.pathname
  )
}

function validDigestRecord(value: unknown, allowEmpty: boolean): value is Record<string, string> {
  if (!isRecord(value)) return false
  const entries = Object.entries(value)
  return (allowEmpty || entries.length > 0) && entries.every(([key, digest]) => /^[a-z][a-z0-9_]*$/.test(key) && typeof digest === "string" && SHA256.test(digest))
}

function reviewedCanonicalPage(url: URL): boolean {
  return (
    url.protocol === "https:" &&
    url.username === "" &&
    url.password === "" &&
    url.search === "" &&
    url.hash === "" &&
    (url.port === "" || url.port === "443") &&
    url.hostname.toLowerCase() === REVIEWED_SOURCE_PAGE.hostname.toLowerCase() &&
    url.pathname === REVIEWED_SOURCE_PAGE.pathname
  )
}
function validatePersistedHopProvenance(value: unknown): void {
  reject(isRecord(value))
  let canonical: URL
  try {
    canonical = new URL(String(value["canonical_page_url"]))
  } catch {
    reject(false)
  }
  reject(reviewedCanonicalPage(canonical))
  const pageHops = value["redirect_hops"]
  reject(validOfficialHopChain(pageHops, true))
  if (pageHops.length > 0) reject(exactReviewedPageHop(pageHops[0]))

  const download = value["download"]
  reject(download === null || isRecord(download))
  if (isRecord(download)) {
    const downloadHops = download["redirect_hops"]
    reject(validOfficialHopChain(downloadHops, false))
  }
}

function validateClosedReport(report: ValidationReport): void {
  reject(exactKeys(report, REPORT_KEYS))
  reject(isRecord(report.schema_versions) && exactKeys(report.schema_versions, ["report", "refresh_audit", "semantic_digest"]))
  reject(report.schema_versions["report"] === "v1" && report.schema_versions["refresh_audit"] === "v1" && report.schema_versions["semantic_digest"] === "v1")
  const failure = report.result === "failure"
  reject(validOfficialHopChain(report.redirect_hops, failure) && report.redirect_hops.length <= 6)
  reject(isRecord(report.metadata_field_hashes))
  const metadataKeys = Object.keys(report.metadata_field_hashes)
  reject(
    (exactKeys(report.metadata_field_hashes, ["page_body_sha256", "page_title_sha256"]) &&
      Object.values(report.metadata_field_hashes).every((value) => typeof value === "string" && SHA256.test(value)) &&
      report.metadata_fingerprint_v1 === sha256Jcs(report.metadata_field_hashes)) ||
      (failure && metadataKeys.length === 0 && report.metadata_fingerprint_v1 === null),
  )
  reject(isRecord(report.license_observation) && exactKeys(report.license_observation, ["status", "kind"]))
  reject(
    (report.license_observation["status"] === "pass" && report.license_observation["kind"] === "KOGL-1") ||
      (report.result === "failure" && report.license_observation["status"] === "fail" && report.license_observation["kind"] === null),
  )
  reject(isRecord(report.invariants) && exactKeys(report.invariants, ["origin", "license", "workbook", "source_model", "semantic_digest"]))
  reject(Object.values(report.invariants).every((value) => value === "pass" || value === "fail"))
  reject(validDigestRecord(report.semantic_digests, report.result === "failure"))
  if (report.download === null) {
    reject(report.result === "failure")
  } else {
    reject(isRecord(report.download) && exactKeys(report.download, ["content_type", "size_bytes", "source_sha256", "redirect_hops", "zip_entries", "zip_compressed_bytes", "zip_uncompressed_bytes", "zip_xml_bytes"]))
    reject(
      typeof report.download["content_type"] === "string" &&
        new Set([
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/zip",
          "application/octet-stream",
        ]).has(report.download["content_type"]),
    )
    reject(Number.isSafeInteger(report.download["size_bytes"]) && Number(report.download["size_bytes"]) > 0 && Number(report.download["size_bytes"]) <= 64 * 1024 * 1024)
    reject(typeof report.download["source_sha256"] === "string" && SHA256.test(report.download["source_sha256"]))
    reject(validOfficialHopChain(report.download["redirect_hops"], false) && report.download["redirect_hops"].length <= 6)
    reject(Number.isSafeInteger(report.download["zip_entries"]) && Number(report.download["zip_entries"]) > 0 && Number(report.download["zip_entries"]) <= 10_000)
    reject(Number.isSafeInteger(report.download["zip_compressed_bytes"]) && Number(report.download["zip_compressed_bytes"]) >= 0 && Number(report.download["zip_compressed_bytes"]) <= Number(report.download["size_bytes"]))
    reject(Number.isSafeInteger(report.download["zip_uncompressed_bytes"]) && Number(report.download["zip_uncompressed_bytes"]) >= 0 && Number(report.download["zip_uncompressed_bytes"]) <= 256 * 1024 * 1024)
    reject(Number.isSafeInteger(report.download["zip_xml_bytes"]) && Number(report.download["zip_xml_bytes"]) >= 0 && Number(report.download["zip_xml_bytes"]) <= 64 * 1024 * 1024)
  }
  reject(Array.isArray(report.files))
  for (const entry of report.files) {
    reject(isRecord(entry) && exactKeys(entry, ["path", "sha256"]) && typeof entry["path"] === "string" && typeof entry["sha256"] === "string" && SHA256.test(entry["sha256"]))
  }
  if (report.result === "changed" || report.result === "no_change") {
    reject(report.failure_code === null && report.download !== null && Object.values(report.invariants).every((value) => value === "pass"))
  } else {
    reject(typeof report.failure_code === "string" && FAILURE_CODES.has(report.failure_code))
  }
  const canonical = new URL(String(report.canonical_page_url))
  reject(reviewedCanonicalPage(canonical))
  if (report.redirect_hops.length > 0) reject(exactReviewedPageHop(report.redirect_hops[0]))
  const serialized = JSON.stringify(report)
  reject(!PRIVATE_MATERIAL.test(serialized))
}


function isWithinRealRoot(root: string, path: string): boolean {
  const rel = relative(root, realpathSync(path))
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel))
}
export function verifyArtifact(options: ArtifactVerificationOptions): ArtifactVerification {
  reject(options.producerWorkflow === "Refresh acquisition and validation")
  reject(COMMIT.test(options.sourceCommit) && SHA256.test(options.policyDigest))
  reject(options.mode === "acquisition" || options.mode === "writer")
  if (options.producerRunId !== undefined) reject(/^[1-9]\d*$/.test(options.producerRunId))
  if (options.expectedReportDigest !== undefined) reject(SHA256.test(options.expectedReportDigest))
  const root = realpathSync(resolve(options.artifactRoot))
  const discovered = walkArtifact(root)
  reject(discovered.files.includes(REPORT_NAME))
  const reportPath = join(root, REPORT_NAME)
  reject(isWithinRealRoot(root, reportPath))
  const reportBytes = readFileSync(reportPath)
  reject(reportBytes.byteLength <= 1024 * 1024)
  const report = JSON.parse(reportBytes.toString("utf8")) as unknown
  validatePersistedHopProvenance(report)
  reject(validateReportShape(report))
  reject(reportBytes.equals(Buffer.from(`${JSON.stringify(report, null, 2)}\n`, "utf8")))
  validateClosedReport(report)
  reject(report.producer_workflow === options.producerWorkflow)
  reject(report.source_commit === options.sourceCommit)
  reject(report.validation_policy_digest_v1 === options.policyDigest)
  if (options.producerRunId !== undefined) reject(report.producer_run_id === options.producerRunId)
  if (options.expectedReportDigest !== undefined) reject(report.report_digest_v1 === options.expectedReportDigest)
  if (options.requireResult !== undefined) reject(report.result === options.requireResult)
  const entries = report.files as readonly Record<string, unknown>[]
  const manifested = new Map<string, string>()
  for (const entry of entries) {
    const path = String(entry["path"])
    reject(!manifested.has(path))
    reject(!isAbsolute(path) && !path.includes("\\") && !path.split("/").includes(".."))
    manifested.set(path, String(entry["sha256"]))
  }
  if (report.result === "changed") {
    reject(manifested.size === 7)
    for (const path of FIXED_CANDIDATE_PATHS) reject(manifested.has(path))
    const audits = [...manifested.keys()].filter((path) => AUDIT.test(path))
    reject(audits.length === 1)
    const download = report.download as Record<string, unknown>
    reject(AUDIT.exec(audits[0] as string)?.[1] === String(download["source_sha256"]).slice(0, 12))
  } else {
    reject(manifested.size === 0)
  }
  for (const [path, digest] of manifested) {
    const artifactPath = join(root, path)
    reject(isWithinRealRoot(root, artifactPath))
    const bytes = readFileSync(artifactPath)
    reject(createHash("sha256").update(bytes).digest("hex") === digest)
    reject(!PRIVATE_MATERIAL.test(bytes.toString("utf8")))
  }
  const expectedFiles = new Set([REPORT_NAME, ...manifested.keys()])
  reject(discovered.files.length === expectedFiles.size && discovered.files.every((path) => expectedFiles.has(path)))
  const expectedDirectories = new Set<string>()
  for (const path of manifested.keys()) {
    const parts = path.split("/")
    parts.pop()
    while (parts.length > 0) {
      expectedDirectories.add(parts.join("/"))
      parts.pop()
    }
  }
  reject(discovered.directories.length === expectedDirectories.size && discovered.directories.every((path) => expectedDirectories.has(path)))
  return {
    result: report.result as RefreshResult,
    sourceCommit: String(report.source_commit),
    reportDigest: String(report.report_digest_v1),
  }
}

function parseArgs(argv: readonly string[]): ArtifactVerificationOptions {
  const allowed = new Set([
    "--artifact-root",
    "--producer-workflow",
    "--producer-run-id",
    "--source-commit",
    "--policy-digest",
    "--expected-report-digest",
    "--require-result",
    "--mode",
  ])
  const values = new Map<string, string>()
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    const value = argv[index + 1]
    if (key === undefined || value === undefined || !allowed.has(key) || values.has(key)) throw new Error("Invalid arguments")
    values.set(key, value)
  }
  for (const key of ["--artifact-root", "--producer-workflow", "--source-commit", "--policy-digest", "--mode"]) {
    if (!values.has(key)) throw new Error("Missing required argument")
  }
  const mode = values.get("--mode")
  const requireResult = values.get("--require-result")
  if (mode !== "acquisition" && mode !== "writer") throw new Error("Invalid mode")
  if (requireResult !== undefined && !new Set(["changed", "no_change", "failure"]).has(requireResult)) throw new Error("Invalid required result")
  const parsed: ArtifactVerificationOptions = {
    artifactRoot: values.get("--artifact-root") as string,
    producerWorkflow: values.get("--producer-workflow") as string,
    sourceCommit: values.get("--source-commit") as string,
    policyDigest: values.get("--policy-digest") as string,
    mode,
  }
  return {
    ...parsed,
    ...(values.has("--producer-run-id") ? { producerRunId: values.get("--producer-run-id") as string } : {}),
    ...(values.has("--expected-report-digest") ? { expectedReportDigest: values.get("--expected-report-digest") as string } : {}),
    ...(requireResult === undefined ? {} : { requireResult: requireResult as RefreshResult }),
  }
}

const entryPoint = process.argv[1]
if (entryPoint !== undefined && resolve(fileURLToPath(import.meta.url)) === resolve(entryPoint)) {
  try {
    const result = verifyArtifact(parseArgs(process.argv.slice(2)))
    process.stderr.write(`refresh-verify-artifact: ${result.result}\n`)
  } catch {
    process.stderr.write("refresh-verify-artifact: rejected\n")
    process.exitCode = 1
  }
}
