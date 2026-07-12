import { createHash } from "node:crypto"
import { spawnSync } from "node:child_process"
import { deflateRawSync } from "node:zlib"
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { afterEach, describe, expect, it, vi } from "vitest"

import {
  FIXED_CANDIDATE_PATHS,
  REPORT_KEYS,
  acquireAndValidate,
  validateXlsxArchive,
} from "../scripts/refresh-acquire-validate.js"
import { sourceUrl } from "../scripts/seed15118998-config.js"
import { verifyArtifact } from "../scripts/refresh-verify-artifact.js"
import { sha256Jcs } from "../src/release-receipts.js"
import {
  buildCandidateEnvironment,
  assertNoPrivateLaneMaterial,
  containsPrivateMaterial,
  EXPECTED_EXPLORE_SCHEMA,
  genericStdioJourneyDigest,
  parsePublicVerifierArgs,
  readResponseBounded,
  sanitizeInstallLog,
  validateSolicitedJsonRpcResponse,
  validateProtocolClose,
  validateLaneReceipt,
  validateBundledQueryPayload,
  validateSha512Sri,
} from "../scripts/public-installed-verify.mjs"

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const A = "a".repeat(64)
const B = "b".repeat(64)
const C = "c".repeat(64)
const SOURCE_COMMIT = "1".repeat(40)
const POLICY = "2".repeat(64)
const PACKAGE_INTEGRITY = `sha512-${Buffer.alloc(64, 7).toString("base64")}`
const REVIEWED_SOURCE_PAGE = new URL(sourceUrl)
const REVIEWED_OFFICIAL_HOST = REVIEWED_SOURCE_PAGE.hostname.replace(/^www\./u, "")
const EXPECTED_APPROVER = "release-administrator"
const temporaryRoots: string[] = []

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "academyinfo-workflow-contract-"))
  temporaryRoots.push(root)
  return root
}

afterEach(() => {
  vi.restoreAllMocks()
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true })
  vi.useRealTimers()
})

function digest(bytes: string | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
}

function crc32(bytes: Uint8Array): number {
  let remainder = 0xffffffff
  for (const byte of bytes) {
    remainder ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      remainder = (remainder & 1) === 0 ? remainder >>> 1 : 0xedb88320 ^ (remainder >>> 1)
    }
  }
  return (remainder ^ 0xffffffff) >>> 0
}

function signedReport(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const metadata = { page_body_sha256: A, page_title_sha256: B }
  const projection: Record<string, unknown> = {
    report_schema_version: "validation-report.v1",
    producer_workflow: "Refresh acquisition and validation",
    producer_run_id: "17",
    source_commit: SOURCE_COMMIT,
    validation_policy_digest_v1: POLICY,
    schema_versions: { report: "v1", refresh_audit: "v1", semantic_digest: "v1" },
    canonical_page_url: sourceUrl,
    redirect_hops: [{ host: REVIEWED_SOURCE_PAGE.hostname, path: REVIEWED_SOURCE_PAGE.pathname, status: 200 }],
    metadata_field_hashes: metadata,
    metadata_fingerprint_v1: sha256Jcs(metadata),
    license_observation: { status: "pass", kind: "KOGL-1" },
    download: {
      content_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      size_bytes: 4096,
      source_sha256: A,
      redirect_hops: [{ host: `download.${REVIEWED_OFFICIAL_HOST}`, path: "/download/workbook.xlsx", status: 200 }],
      zip_entries: 4,
      zip_uncompressed_bytes: 8192,
      zip_xml_bytes: 4096,
      zip_compressed_bytes: 2048,
    },
    invariants: { origin: "pass", license: "pass", workbook: "pass", source_model: "pass", semantic_digest: "pass" },
    semantic_digests: { release_data_digest_v1: C },
    files: [],
    sanitized: true,
    result: "no_change",
    failure_code: null,
    ...overrides,
  }
  return { ...projection, report_digest_v1: sha256Jcs(projection) }
}

function writeReport(root: string, report: Record<string, unknown>): void {
  writeFileSync(join(root, "validation-report.v1.json"), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 })
}

function verifierOptions(root: string) {
  return {
    artifactRoot: root,
    producerWorkflow: "Refresh acquisition and validation",
    producerRunId: "17",
    sourceCommit: SOURCE_COMMIT,
    policyDigest: POLICY,
    mode: "writer" as const,
  }
}

function writeChangedArtifact(root: string): Record<string, unknown> {
  const paths = [...FIXED_CANDIDATE_PATHS, `evidence/refresh/15118998.${A.slice(0, 12)}.audit.json`]
  const files = paths.map((path, index) => {
    const body = `candidate-${index}\n`
    const destination = join(root, path)
    mkdirSync(dirname(destination), { recursive: true })
    writeFileSync(destination, body, { mode: 0o600 })
    return { path, sha256: digest(body) }
  })
  const report = signedReport({ result: "changed", files })
  writeReport(root, report)
  return report
}

function zip(entries: Readonly<Record<string, string>>, deflated = false): Buffer {
  const localParts: Buffer[] = []
  const centralParts: Buffer[] = []
  let localOffset = 0
  for (const [name, text] of Object.entries(entries)) {
    const nameBytes = Buffer.from(name)
    const plain = Buffer.from(text)
    const crc = crc32(plain)
    const data = deflated ? deflateRawSync(plain) : plain
    const method = deflated ? 8 : 0
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt32LE(crc, 14)
    local.writeUInt16LE(method, 8)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(plain.length, 22)
    local.writeUInt16LE(nameBytes.length, 26)
    localParts.push(local, nameBytes, data)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt32LE(crc, 16)
    central.writeUInt16LE(method, 10)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(plain.length, 24)
    central.writeUInt16LE(nameBytes.length, 28)
    central.writeUInt32LE(localOffset, 42)
    centralParts.push(central, nameBytes)
    localOffset += local.length + nameBytes.length + data.length
  }
  const directory = Buffer.concat(centralParts)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(Object.keys(entries).length, 8)
  end.writeUInt16LE(Object.keys(entries).length, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(localOffset, 16)
  return Buffer.concat([...localParts, directory, end])
}

const minimalWorkbookEntries = {
  "[Content_Types].xml": "<Types/>",
  "_rels/.rels": "<Relationships/>",
  "xl/workbook.xml": "<workbook/>",
  "xl/worksheets/sheet1.xml": "<worksheet/>",
}

describe("bounded refresh acquisition interface", () => {
  it("writes a closed sanitized failure artifact for an injected over-limit page", async () => {
    const output = temporaryRoot()
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(new Uint8Array(2 * 1024 * 1024 + 1), {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    )

    const report = await acquireAndValidate(
      {
        canonicalPage: sourceUrl,
        sourceCommit: SOURCE_COMMIT,
        policyDigest: POLICY,
        output,
        producerRunId: "17",
      },
      { fetch: fetchMock },
    )

    expect(report.result).toBe("failure")
    expect(report.failure_code).toBe("PAGE_BODY_LIMIT")
    expect(Object.keys(report).sort()).toEqual([...REPORT_KEYS].sort())
    expect(readFileSync(join(output, "validation-report.v1.json"), "utf8")).not.toContain(projectRoot)
    expect(
      verifyArtifact({
        ...verifierOptions(output),
        mode: "acquisition",
      }).result,
    ).toBe("failure")
  })

  it("rejects caller-selected alternate canonical page hosts and paths before fetch", async () => {
    const fetchMock = vi.fn<typeof fetch>()
    const reviewed = new URL(sourceUrl)
    const alternateHost = new URL(sourceUrl)
    alternateHost.hostname = `mirror.${reviewed.hostname}`
    const alternatePath = new URL(sourceUrl)
    alternatePath.pathname = `${reviewed.pathname}/alternate`

    for (const canonicalPage of [alternateHost.href, alternatePath.href]) {
      await expect(acquireAndValidate(
        {
          canonicalPage,
          sourceCommit: SOURCE_COMMIT,
          policyDigest: POLICY,
          output: temporaryRoot(),
        },
        { fetch: fetchMock },
      )).rejects.toThrow("PAGE_METADATA_INVALID")
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("refuses every repository output path before acquisition", async () => {
    await expect(
      acquireAndValidate({
        canonicalPage: sourceUrl,
        sourceCommit: SOURCE_COMMIT,
        policyDigest: POLICY,
        output: join(projectRoot, "candidate-output"),
      }),
    ).rejects.toThrow("outside the repository")
  })

  it("rejects a symlinked output parent whose real path enters the repository", async () => {
    const root = temporaryRoot()
    const alias = join(root, "repository-link")
    symlinkSync(projectRoot, alias, "dir")
    await expect(
      acquireAndValidate({
        canonicalPage: sourceUrl,
        sourceCommit: SOURCE_COMMIT,
        policyDigest: POLICY,
        output: join(alias, `escape-${digest(root).slice(0, 12)}`),
      }),
    ).rejects.toThrow("outside the repository")
  })

  it("times out a body that stops making progress after response headers", async () => {
    vi.useFakeTimers()
    const output = temporaryRoot()
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(new ReadableStream<Uint8Array>({ start() {} }), {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    )
    const pending = acquireAndValidate(
      {
        canonicalPage: sourceUrl,
        sourceCommit: SOURCE_COMMIT,
        policyDigest: POLICY,
        output,
      },
      { fetch: fetchMock },
    )
    await vi.advanceTimersByTimeAsync(5_001)
    await expect(pending).resolves.toMatchObject({ result: "failure", failure_code: "PAGE_UNREACHABLE" })
  })

  it("validates local and central ZIP sizes against capped actual inflation", () => {
    const valid = zip(minimalWorkbookEntries, true)
    expect(validateXlsxArchive(valid)).toMatchObject({
      entries: 4,
      compressedBytes: expect.any(Number),
      uncompressedBytes: expect.any(Number),
    })

    const metadataMismatch = Buffer.from(valid)
    const centralOffset = metadataMismatch.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]))
    metadataMismatch.writeUInt32LE(metadataMismatch.readUInt32LE(centralOffset + 20) + 1, centralOffset + 20)
    expect(() => validateXlsxArchive(metadataMismatch)).toThrow("DOWNLOAD_ARCHIVE_INVALID")

    const inflationMismatch = Buffer.from(valid)
    const inflationCentral = inflationMismatch.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]))
    inflationMismatch.writeUInt32LE(1, 22)
    inflationMismatch.writeUInt32LE(1, inflationCentral + 24)
    expect(() => validateXlsxArchive(inflationMismatch)).toThrow("DOWNLOAD_ARCHIVE_INVALID")
  })

  it("rejects corrupted ZIP payload with self-consistent forged CRC metadata", () => {
    const forgedCrc = zip(minimalWorkbookEntries)
    const forgedCentralOffset = forgedCrc.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]))
    const forgedNameLength = forgedCrc.readUInt16LE(26)
    const forgedExtraLength = forgedCrc.readUInt16LE(28)
    const forgedPayloadOffset = 30 + forgedNameLength + forgedExtraLength
    const forgedPayloadLength = forgedCrc.readUInt32LE(22)
    forgedCrc.writeUInt8(forgedCrc.readUInt8(forgedPayloadOffset) ^ 0x01, forgedPayloadOffset)
    const corruptedPayload = forgedCrc.subarray(forgedPayloadOffset, forgedPayloadOffset + forgedPayloadLength)
    const falseCrc = (crc32(corruptedPayload) + 1) >>> 0
    forgedCrc.writeUInt32LE(falseCrc, 14)
    forgedCrc.writeUInt32LE(falseCrc, forgedCentralOffset + 16)
    expect(forgedCrc.readUInt32LE(14)).toBe(forgedCrc.readUInt32LE(forgedCentralOffset + 16))
    expect(crc32(corruptedPayload)).not.toBe(falseCrc)
    expect(() => validateXlsxArchive(forgedCrc)).toThrow("DOWNLOAD_ARCHIVE_INVALID")
  })
})

describe("closed refresh artifact verifier", () => {
  it("accepts a digest-bound no-change report and no candidate files", () => {
    const root = temporaryRoot()
    const report = signedReport()
    writeReport(root, report)

    expect(
      verifyArtifact({
        ...verifierOptions(root),
        expectedReportDigest: String(report.report_digest_v1),
        requireResult: "no_change",
      }),
    ).toEqual({
      result: "no_change",
      sourceCommit: SOURCE_COMMIT,
      reportDigest: report.report_digest_v1,
    })
  })

  it("rejects reports that substitute the reviewed artifact source endpoint", () => {
    const alternateHost = new URL(sourceUrl)
    alternateHost.hostname = `mirror.${alternateHost.hostname}`
    const alternatePath = new URL(sourceUrl)
    alternatePath.pathname = `${alternatePath.pathname}/alternate`

    for (const canonicalPage of [alternateHost.href, alternatePath.href]) {
      const root = temporaryRoot()
      writeReport(root, signedReport({ canonical_page_url: canonicalPage }))
      expect(() => verifyArtifact(verifierOptions(root))).toThrow("rejected")
    }
  })

  it("rejects self-selected, alternate-host, and query-bearing persisted redirect hops", () => {
    const initialHop = {
      host: REVIEWED_SOURCE_PAGE.hostname,
      path: REVIEWED_SOURCE_PAGE.pathname,
      status: 302,
    }
    const cases = [
      {
        redirect_hops: [{
          host: `mirror.${REVIEWED_SOURCE_PAGE.hostname}`,
          path: REVIEWED_SOURCE_PAGE.pathname,
          status: 200,
        }],
      },
      {
        redirect_hops: [
          initialHop,
          { host: "alternate.example.test", path: "/redirected", status: 200 },
        ],
      },
      {
        download: {
          ...(signedReport().download as Record<string, unknown>),
          redirect_hops: [{ host: "alternate.example.test", path: "/workbook.xlsx", status: 200 }],
        },
      },
      {
        download: {
          ...(signedReport().download as Record<string, unknown>),
          redirect_hops: [{
            host: `download.${REVIEWED_OFFICIAL_HOST}`,
            path: "/workbook.xlsx?source=override",
            status: 200,
          }],
        },
      },
    ]

    for (const overrides of cases) {
      const root = temporaryRoot()
      writeReport(root, signedReport(overrides))
      expect(() => verifyArtifact(verifierOptions(root))).toThrow("rejected")
    }
  })

  it("rejects hash forgery, extras, symlinks, and executable candidates", () => {
    const forged = temporaryRoot()
    const report = writeChangedArtifact(forged)
    const first = (report.files as { path: string }[])[0]
    writeFileSync(join(forged, first?.path ?? ""), "forged\n")
    expect(() => verifyArtifact(verifierOptions(forged))).toThrow("rejected")

    const extra = temporaryRoot()
    writeReport(extra, signedReport())
    writeFileSync(join(extra, "extra.json"), "{}\n")
    expect(() => verifyArtifact(verifierOptions(extra))).toThrow("rejected")

    const linked = temporaryRoot()
    writeReport(linked, signedReport())
    symlinkSync(join(linked, "validation-report.v1.json"), join(linked, "alias.json"))
    expect(() => verifyArtifact(verifierOptions(linked))).toThrow("rejected")

    const executable = temporaryRoot()
    writeChangedArtifact(executable)
    const executablePath = join(executable, FIXED_CANDIDATE_PATHS[0])
    chmodSync(executablePath, 0o700)
    expect(() => verifyArtifact(verifierOptions(executable))).toThrow("rejected")
  })

  it("rejects a signed traversal manifest without reading outside the artifact", () => {
    const root = temporaryRoot()
    const report = writeChangedArtifact(root)
    const files = [...(report.files as Record<string, unknown>[])]
    files[0] = { path: "../outside", sha256: A }
    writeReport(root, signedReport({ result: "changed", files }))
    expect(() => verifyArtifact(verifierOptions(root))).toThrow("rejected")
  })

  it("rejects Windows and UNC private paths in manifested candidate bytes", () => {
    const backslash = String.fromCharCode(92)
    const privatePaths = [
      ["C:", "Users", "alice", "secret.txt"].join(backslash),
      ["", "", "server", "alice", "secret.txt"].join(backslash),
    ]

    for (const privatePath of privatePaths) {
      const root = temporaryRoot()
      const report = writeChangedArtifact(root)
      const files = report.files as { path: string; sha256: string }[]
      const first = files[0] as { path: string; sha256: string }
      writeFileSync(join(root, first.path), privatePath, { mode: 0o600 })
      first.sha256 = digest(privatePath)
      writeReport(root, signedReport({ result: "changed", files }))
      expect(() => verifyArtifact(verifierOptions(root))).toThrow("rejected")
    }
  })
})

type ReceiptKind = "candidate-authorization" | "candidate" | "client"
const RECEIPT_POLICY_VERSIONS: Readonly<Record<ReceiptKind, readonly {
  readonly policy: string
  readonly version: string
}[]>> = {
  "candidate-authorization": [
    { policy: "backend", version: "v1" },
    { policy: "privacy", version: "v1" },
    { policy: "release", version: "v1" },
    { policy: "semantic", version: "v1" },
  ],
  candidate: [
    { policy: "backend", version: "v1" },
    { policy: "privacy", version: "v1" },
    { policy: "release", version: "v1" },
    { policy: "semantic", version: "v1" },
  ],
  client: [
    { policy: "actual-client", version: "v1" },
    { policy: "public-install", version: "v1" },
    { policy: "release", version: "v1" },
  ],
}

function makeReceipt(kind: ReceiptKind): Record<string, unknown> {
  const previousLatest = "0.0.9"
  const predecessorCount = kind === "candidate-authorization" ? 0 : 1
  const commonPayload = {
    transition: kind,
    package_name: "academyinfo-mcp",
    package_version: "0.1.0",
    package_integrity: kind === "candidate-authorization" ? null : PACKAGE_INTEGRITY,
    previous_latest_version: previousLatest,
    predecessor_receipt_digests: [A, B].slice(0, predecessorCount),
    evidence_digests:
      kind === "candidate-authorization"
        ? [
            { kind: "backend-decision", digest: A },
            { kind: "release-data", digest: B },
            { kind: "source-revision", digest: C },
            { kind: "version-registry-state", digest: A },
          ]
        : kind === "candidate"
          ? [
              { kind: "authorization-receipt", digest: A },
              { kind: "registry-post-state", digest: B },
              { kind: "release-data", digest: C },
              { kind: "source-tarball", digest: A },
            ]
          : [
              { kind: "actual-claude-desktop", digest: A },
              { kind: "generic-stdio-journey", digest: B },
              { kind: "public-install-macos-arm64", digest: C },
              { kind: "public-install-ubuntu-glibc-x64", digest: A },
              { kind: "public-install-windows-x64", digest: B },
            ],
    run_id: "release-17",
    source_commit: SOURCE_COMMIT,
    policy_versions: RECEIPT_POLICY_VERSIONS[kind].map((entry) => ({ ...entry })),
  }
  if (kind === "candidate-authorization") {
    const payload = {
      schema_version: "release-transition-evidence-payload.v1",
      ...commonPayload,
      event_id: `source:v1:${A}`,
      prior_transition_digest: B,
      first_seen_at: "2026-07-11T00:00:00.000Z",
      deadline_at: "2026-07-18T00:00:00.000Z",
      source_sha256: C,
      release_data_digest_v1: A,
    }
    const payloadDigest = sha256Jcs(payload)
    const approvalProjection = {
      role: "administrator",
      identity: EXPECTED_APPROVER,
      approved_at: "2026-07-11T00:00:00.000Z",
      decision: kind,
      release_transition_evidence_digest_v1: payloadDigest,
    }
    const approval = { ...approvalProjection, attestation_digest: sha256Jcs(approvalProjection) }
    const projection = {
      receipt_schema_version: "release-transition-receipt.v1",
      release_transition_evidence_payload_v1: payload,
      release_transition_evidence_digest_v1: payloadDigest,
      approval,
    }
    return { ...projection, release_transition_receipt_digest_v1: sha256Jcs(projection) }
  }

  const payload = { schema_version: "release-evidence-payload.v1", ...commonPayload }
  const payloadDigest = sha256Jcs(payload)
  const approvalProjection = {
    role: "administrator",
    identity: EXPECTED_APPROVER,
    approved_at: "2026-07-11T00:00:00.000Z",
    decision: kind,
    evidence_payload_digest_v1: payloadDigest,
  }
  const approval = { ...approvalProjection, attestation_digest: sha256Jcs(approvalProjection) }
  const projection = {
    receipt_schema_version: `${kind}-receipt.v1`,
    evidence_payload_v1: payload,
    evidence_payload_digest_v1: payloadDigest,
    approval,
  }
  return { ...projection, receipt_digest_v1: sha256Jcs(projection) }
}

function resealReceipt(receipt: Record<string, unknown>): void {
  const payload = receipt.evidence_payload_v1 as Record<string, unknown>
  receipt.evidence_payload_digest_v1 = sha256Jcs(payload)
  const approval = receipt.approval as Record<string, unknown>
  approval.evidence_payload_digest_v1 = receipt.evidence_payload_digest_v1
  const { attestation_digest: _oldAttestation, ...approvalProjection } = approval
  approval.attestation_digest = sha256Jcs(approvalProjection)
  const { receipt_digest_v1: _oldReceipt, ...receiptProjection } = receipt
  receipt.receipt_digest_v1 = sha256Jcs(receiptProjection)
}

function resealModuleReceipt(receipt: Record<string, unknown>): void {
  const payload = receipt.release_transition_evidence_payload_v1 as Record<string, unknown>
  receipt.release_transition_evidence_digest_v1 = sha256Jcs(payload)
  const approval = receipt.approval as Record<string, unknown>
  approval.release_transition_evidence_digest_v1 = receipt.release_transition_evidence_digest_v1
  const { attestation_digest: _oldAttestation, ...approvalProjection } = approval
  approval.attestation_digest = sha256Jcs(approvalProjection)
  const { release_transition_receipt_digest_v1: _oldReceipt, ...receiptProjection } = receipt
  receipt.release_transition_receipt_digest_v1 = sha256Jcs(receiptProjection)
}

async function receiptModule(): Promise<{
  verifyReceipt: (receipt: unknown, options: Record<string, unknown>) => unknown
  parseJsonStrict: (text: string) => unknown
  validReceiptMode: (mode: number, platform?: NodeJS.Platform) => boolean,
}> {
  // The workflow executes this reviewed standalone ESM file before npm install.
  return import("../scripts/release-receipt-verify.mjs")
}
function receiptDigest(receipt: Record<string, unknown>): unknown {
  return receipt.receipt_digest_v1 ?? receipt.release_transition_receipt_digest_v1
}

function authorizationContextDigest(receipt: Record<string, unknown>): string {
  const payload = receipt.release_transition_evidence_payload_v1 as Record<string, unknown>
  return sha256Jcs({
    event_id: payload.event_id,
    prior_transition_digest: payload.prior_transition_digest,
    first_seen_at: payload.first_seen_at,
    deadline_at: payload.deadline_at,
    source_sha256: payload.source_sha256,
    release_data_digest_v1: payload.release_data_digest_v1,
  })
}

describe("acyclic release receipt verifier", () => {
  it("accepts each workflow receipt kind with exact identity and predecessor joins", async () => {
    const { verifyReceipt } = await receiptModule()
    for (const kind of ["candidate-authorization", "candidate", "client"] as const) {
      const receipt = makeReceipt(kind)
      const predecessors = kind === "candidate-authorization" ? {} : {
        expectedPredecessors: [A],
      }
      const previous = { previousLatest: "0.0.9" }
      expect(
        verifyReceipt(receipt, {
          kind,
          expectedDigest: receiptDigest(receipt),
          sourceCommit: SOURCE_COMMIT,
          packageName: "academyinfo-mcp",
          packageVersion: "0.1.0",
          expectedApprover: EXPECTED_APPROVER,
          ...(kind === "candidate-authorization"
            ? { authorizationContextDigest: authorizationContextDigest(receipt) }
            : { packageIntegrity: PACKAGE_INTEGRITY }),
          ...predecessors,
          ...previous,
        }),
      ).toEqual({ kind, receiptDigest: receiptDigest(receipt) })
    }
  })

  it("requires trusted caller authority and exact registry integrity", async () => {
    const { verifyReceipt } = await receiptModule()
    const receipt = makeReceipt("candidate")
    const options = {
      kind: "candidate",
      expectedDigest: receipt.receipt_digest_v1,
      expectedPredecessor: A,
      sourceCommit: SOURCE_COMMIT,
      packageName: "academyinfo-mcp",
      packageVersion: "0.1.0",
      packageIntegrity: PACKAGE_INTEGRITY,
      expectedApprover: EXPECTED_APPROVER,
      previousLatest: "0.0.9",
    }

    for (const kind of ["candidate-authorization", "candidate", "client"] as const) {
      const kindReceipt = makeReceipt(kind)
      const trustedOptions = {
        kind,
        expectedDigest: receiptDigest(kindReceipt),
        sourceCommit: SOURCE_COMMIT,
        packageName: "academyinfo-mcp",
        packageVersion: "0.1.0",
        expectedApprover: EXPECTED_APPROVER,
        ...(kind === "candidate-authorization"
          ? { authorizationContextDigest: authorizationContextDigest(kindReceipt) }
          : {
              packageIntegrity: PACKAGE_INTEGRITY,
              expectedPredecessors: [A],
            }),
        ...(kind === "candidate-authorization" || kind === "candidate" || kind === "client"
          ? { previousLatest: "0.0.9" }
          : {}),
      }
      expect(() => verifyReceipt(kindReceipt, { ...trustedOptions, expectedApprover: undefined })).toThrow("rejected")
      expect(() => verifyReceipt(kindReceipt, { ...trustedOptions, expectedApprover: "different-administrator" })).toThrow("rejected")
    }
    for (const unsafeApprover of ["", " administrator", "administrator\nforged", "a".repeat(129)]) {
      expect(() => verifyReceipt(receipt, { ...options, expectedApprover: unsafeApprover })).toThrow("rejected")
    }

    const forgedAuthority = structuredClone(receipt) as Record<string, unknown>
    ;(forgedAuthority.approval as Record<string, unknown>).identity = "attacker"
    resealReceipt(forgedAuthority)
    expect(() => verifyReceipt(forgedAuthority, {
      ...options,
      expectedDigest: forgedAuthority.receipt_digest_v1,
    })).toThrow("rejected")

    expect(() => verifyReceipt(receipt, { ...options, packageIntegrity: undefined })).toThrow("rejected")
    expect(() => verifyReceipt(receipt, {
      ...options,
      packageIntegrity: `sha512-${Buffer.alloc(64, 8).toString("base64")}`,
    })).toThrow("rejected")

    for (const malformedIntegrity of [
      null,
      "sha512-reviewed-package-integrity",
      `sha512-${Buffer.alloc(63, 7).toString("base64")}`,
      `sha256-${Buffer.alloc(64, 7).toString("base64")}`,
    ]) {
      const malformed = structuredClone(receipt) as Record<string, unknown>
      ;(malformed.evidence_payload_v1 as Record<string, unknown>).package_integrity = malformedIntegrity
      resealReceipt(malformed)
      expect(() => verifyReceipt(malformed, {
        ...options,
        expectedDigest: malformed.receipt_digest_v1,
      })).toThrow("rejected")
    }

    const omitted = structuredClone(receipt) as Record<string, unknown>
    delete (omitted.evidence_payload_v1 as Record<string, unknown>).package_integrity
    resealReceipt(omitted)
    expect(() => verifyReceipt(omitted, { ...options, expectedDigest: omitted.receipt_digest_v1 })).toThrow("rejected")
  })
  it("rejects resealed unknown evidence, policy, identifier, and private material", async () => {
    const { verifyReceipt } = await receiptModule()
    const receipt = makeReceipt("candidate")
    const options = {
      kind: "candidate",
      expectedDigest: receipt.receipt_digest_v1,
      expectedPredecessors: [A],
      sourceCommit: SOURCE_COMMIT,
      packageName: "academyinfo-mcp",
      packageVersion: "0.1.0",
      packageIntegrity: PACKAGE_INTEGRITY,
      expectedApprover: EXPECTED_APPROVER,
      previousLatest: "0.0.9",
    }
    const attacks: Array<(payload: Record<string, unknown>) => void> = [
      (payload) => {
        const evidence = payload.evidence_digests as Array<Record<string, unknown>>
        evidence[1] = { kind: "registry-unreviewed-state", digest: B }
      },
      (payload) => {
        payload.policy_versions = [{ policy: "unreviewed", version: "v1" }]
      },
      (payload) => {
        payload.run_id = "/private/var/folders/release"
      },
      (payload) => {
        payload.run_id = "token=secret"
      },
    ]

    for (const attack of attacks) {
      const substituted = structuredClone(receipt) as Record<string, unknown>
      attack(substituted.evidence_payload_v1 as Record<string, unknown>)
      resealReceipt(substituted)
      expect(() =>
        verifyReceipt(substituted, {
          ...options,
          expectedDigest: substituted.receipt_digest_v1,
        }),
      ).toThrow("rejected")
    }
  })

  it("selects the closed receipt shape from the requested kind", async () => {
    const { verifyReceipt } = await receiptModule()
    const authorization = makeReceipt("candidate-authorization")
    const options = {
      kind: "candidate-authorization",
      expectedDigest: receiptDigest(authorization),
      sourceCommit: SOURCE_COMMIT,
      packageName: "academyinfo-mcp",
      packageVersion: "0.1.0",
      expectedApprover: EXPECTED_APPROVER,
      authorizationContextDigest: authorizationContextDigest(authorization),
      previousLatest: "0.0.9",
    }

    const downgraded = makeReceipt("candidate")
    const downgradedPayload = downgraded.evidence_payload_v1 as Record<string, unknown>
    downgradedPayload.transition = "candidate-authorization"
    downgradedPayload.package_integrity = null
    downgradedPayload.predecessor_receipt_digests = []
    downgraded.receipt_schema_version = "candidate-authorization-receipt.v1"
    ;(downgraded.approval as Record<string, unknown>).decision = "candidate-authorization"
    resealReceipt(downgraded)
    expect(() => verifyReceipt(downgraded, {
      ...options,
      expectedDigest: downgraded.receipt_digest_v1,
    })).toThrow("rejected")

    const mixed = structuredClone(authorization) as Record<string, unknown>
    mixed.evidence_payload_v1 = downgraded.evidence_payload_v1
    resealModuleReceipt(mixed)
    expect(() => verifyReceipt(mixed, {
      ...options,
      expectedDigest: mixed.release_transition_receipt_digest_v1,
    })).toThrow("rejected")

    const nonNullIntegrity = structuredClone(authorization) as Record<string, unknown>
    ;(nonNullIntegrity.release_transition_evidence_payload_v1 as Record<string, unknown>).package_integrity = PACKAGE_INTEGRITY
    resealModuleReceipt(nonNullIntegrity)
    expect(() => verifyReceipt(nonNullIntegrity, {
      ...options,
      expectedDigest: nonNullIntegrity.release_transition_receipt_digest_v1,
    })).toThrow("rejected")
    expect(() => verifyReceipt(authorization, { ...options, packageIntegrity: PACKAGE_INTEGRITY })).toThrow("rejected")
    expect(() => verifyReceipt(authorization, { ...options, authorizationContextDigest: undefined })).toThrow("rejected")
    expect(() => verifyReceipt(authorization, { ...options, authorizationContextDigest: C })).toThrow("rejected")
  })

  it("rejects forged, extra-field, wrong-predecessor, and duplicate-key receipts", async () => {
    const { parseJsonStrict, verifyReceipt } = await receiptModule()
    const receipt = makeReceipt("client")
    const options = {
      kind: "client",
      expectedDigest: receipt.receipt_digest_v1,
      expectedPredecessor: A,
      sourceCommit: SOURCE_COMMIT,
      packageName: "academyinfo-mcp",
      packageVersion: "0.1.0",
      packageIntegrity: PACKAGE_INTEGRITY,
      expectedApprover: EXPECTED_APPROVER,
      previousLatest: "0.0.9",
    }

    const forged = structuredClone(receipt) as Record<string, unknown>
    ;(forged.evidence_payload_v1 as Record<string, unknown>).package_version = "0.1.1"
    expect(() => verifyReceipt(forged, options)).toThrow("rejected")
    expect(() => verifyReceipt(receipt, { ...options, expectedPredecessor: B })).toThrow("rejected")
    expect(() => verifyReceipt({ ...receipt, unreviewed: true }, options)).toThrow("rejected")
    expect(() => parseJsonStrict('{"receipt_schema_version":"client-receipt.v1","receipt_schema_version":"forged"}')).toThrow("rejected")

    const extraPredecessor = structuredClone(receipt) as Record<string, unknown>
    const payload = extraPredecessor.evidence_payload_v1 as Record<string, unknown>
    payload.predecessor_receipt_digests = [A, B]
    extraPredecessor.evidence_payload_digest_v1 = sha256Jcs(payload)
    const approval = extraPredecessor.approval as Record<string, unknown>
    approval.evidence_payload_digest_v1 = extraPredecessor.evidence_payload_digest_v1
    const { attestation_digest: _oldAttestation, ...approvalProjection } = approval
    approval.attestation_digest = sha256Jcs(approvalProjection)
    const { receipt_digest_v1: _oldReceipt, ...receiptProjection } = extraPredecessor
    extraPredecessor.receipt_digest_v1 = sha256Jcs(receiptProjection)
    expect(() => verifyReceipt(extraPredecessor, { ...options, expectedDigest: extraPredecessor.receipt_digest_v1 })).toThrow("rejected")
  })

  it("requires each supported transition predecessor and rejects arbitrary substitutions", async () => {
    const { verifyReceipt } = await receiptModule()
    for (const kind of ["candidate", "client"] as const) {
      const expectedPredecessors = [A]
      const receipt = makeReceipt(kind)
      const options = {
        kind,
        expectedDigest: receipt.receipt_digest_v1,
        expectedPredecessors,
        sourceCommit: SOURCE_COMMIT,
        packageName: "academyinfo-mcp",
        packageVersion: "0.1.0",
        packageIntegrity: PACKAGE_INTEGRITY,
        expectedApprover: EXPECTED_APPROVER,
      }
      expect(() => verifyReceipt(receipt, { ...options, expectedPredecessors: undefined })).toThrow("rejected")

      const substituted = structuredClone(receipt) as Record<string, unknown>
      const payload = substituted.evidence_payload_v1 as Record<string, unknown>
      payload.predecessor_receipt_digests = [C]
      resealReceipt(substituted)
      expect(() => verifyReceipt(substituted, { ...options, expectedDigest: substituted.receipt_digest_v1 })).toThrow("rejected")
    }
    const unsupported = makeReceipt("candidate")
    for (const kind of ["promotion", "rollback"]) {
      expect(() =>
        verifyReceipt(unsupported, {
          kind,
          expectedDigest: unsupported.receipt_digest_v1,
          expectedPredecessors: [A, B],
          sourceCommit: SOURCE_COMMIT,
          packageName: "academyinfo-mcp",
          packageVersion: "0.1.0",
          packageIntegrity: PACKAGE_INTEGRITY,
          expectedApprover: EXPECTED_APPROVER,
        }),
      ).toThrow("rejected")
    }
  })

  it("skips synthetic Windows mode bits without weakening POSIX mode checks", async () => {
    const { validReceiptMode } = await receiptModule()
    expect(validReceiptMode(0o100600, "linux")).toBe(true)
    expect(validReceiptMode(0o100700, "linux")).toBe(false)
    expect(validReceiptMode(0o100777, "darwin")).toBe(false)
    expect(validReceiptMode(0o100700, "win32")).toBe(true)
    expect(validReceiptMode(0o100777, "win32")).toBe(true)
  })
  it("rejects POSIX-executable, symlinked, and oversized receipt inputs before parsing", () => {
    const root = temporaryRoot()
    const receipt = makeReceipt("candidate")
    const receiptPath = join(root, "candidate.v1.json")
    writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o700 })
    const script = join(projectRoot, "scripts/release-receipt-verify.mjs")
    const args = [
      script,
      "--receipt",
      receiptPath,
      "--kind",
      "candidate",
      "--expected-digest",
      String(receipt.receipt_digest_v1),
      "--source-commit",
      SOURCE_COMMIT,
      "--package-name",
      "academyinfo-mcp",
      "--package-version",
      "0.1.0",
      "--package-integrity",
      PACKAGE_INTEGRITY,
      "--expected-approver",
      EXPECTED_APPROVER,
      "--expected-predecessor",
      A,
    ]
    expect(spawnSync(process.execPath, args).status).toBe(process.platform === "win32" ? 0 : 1)

    chmodSync(receiptPath, 0o600)
    expect(spawnSync(process.execPath, args).status).toBe(0)
    expect(spawnSync(process.execPath, [...args, "--expected-approver", EXPECTED_APPROVER]).status).toBe(1)
    const link = join(root, "linked-receipt.json")
    symlinkSync(receiptPath, link)
    const linkedArgs = [...args]
    linkedArgs[2] = link
    expect(spawnSync(process.execPath, linkedArgs).status).toBe(1)

    const oversized = join(root, "oversized.json")
    writeFileSync(oversized, " ".repeat(1024 * 1024 + 1), { mode: 0o600 })
    const oversizedArgs = [...args]
    oversizedArgs[2] = oversized
    expect(spawnSync(process.execPath, oversizedArgs).status).toBe(1)
    const empty = join(root, "empty.json")
    writeFileSync(empty, "", { mode: 0o600 })
    const emptyArgs = [...args]
    emptyArgs[2] = empty
    expect(spawnSync(process.execPath, emptyArgs).status).toBe(1)

    const directoryArgs = [...args]
    directoryArgs[2] = root
    expect(spawnSync(process.execPath, directoryArgs).status).toBe(1)
  })
})

const LANE_TOOLS = [
  "list_sources",
  "list_indicators",
  "search_university",
  "get_university_metrics",
  "compare_universities",
  "explain_indicator",
  "validate_source_coverage",
  "explore_universities",
]
const BUILD_TRAPS = ["python", "python3", "node-gyp", "cc", "c++", "gcc", "g++", "clang", "clang++", "cl"]
const LANE_INTEGRITY = `sha512-${Buffer.alloc(64, 7).toString("base64")}`
const LANE_RUNTIMES = {
  "macos-arm64": {
    node: "22.17.0", node_major: 22, platform: "darwin",
    operating_system: "Darwin", architecture: "arm64", glibc_version_runtime: null,
  },
  "windows-x64": {
    node: "22.17.0", node_major: 22, platform: "win32",
    operating_system: "Windows_NT", architecture: "x64", glibc_version_runtime: null,
  },
  "ubuntu-glibc-x64": {
    node: "22.17.0", node_major: 22, platform: "linux",
    operating_system: "Linux", architecture: "x64", glibc_version_runtime: "2.39",
  },
} as const


function laneReceipt(
  query: unknown = { university_queries: ["전남대학교 본교"], indicators: ["competition_rate"] },
  sourceDatasetIds: unknown = ["15118998"],
  lane: keyof typeof LANE_RUNTIMES = "macos-arm64",
): Record<string, unknown> {
  const registryEvidence = {
    signatures: { available: false, count: 0, keyids: [], evidence_sha256: null },
    provenance: { available: false, attestation_url: null, evidence_sha256: null },
  }
  const identity = (name: string, version: string) => ({
    name,
    version,
    package_json_sha256: A,
    registry_tarball: "https://registry.npmjs.org/package/-/package.tgz",
    registry_integrity: LANE_INTEGRITY,
    lock_integrity: LANE_INTEGRITY,
    cached_tarball_integrity_verified: true,
    registry_evidence: registryEvidence,
  })
  const protocol = {
    initialize: { passed: true, protocol_version: "2024-11-05", server_name: "academyinfo-mcp", server_version: "0.1.0" },
    tools_list: {
      passed: true,
      names: LANE_TOOLS,
      explore_input_schema: EXPECTED_EXPLORE_SCHEMA,
    },
    bundled_query: { passed: true, tool: "explore_universities", status: "ok", query, source_dataset_ids: sourceDatasetIds },
    no_api_key: { passed: true, data_go_kr_service_key: "absent", academyinfo_service_key: "absent" },
    json_rpc_stdout: { passed: true, parsed_message_count: lane === "ubuntu-glibc-x64" ? 5 : 3, non_json_rpc_line_count: 0 },
    ubuntu_client_journey: lane === "ubuntu-glibc-x64" ? {
      passed: true,
      ambiguity_no_partial_data: true,
      exact_resolution: true,
      factual_comparison: true,
      indicator_explanation: true,
      no_ranking_or_recommendation: true,
    } : null,
  }
  const payload = {
    schema_version: "public-install-evidence-payload.v1",
    evidence_kind: "exact-public-registry-candidate-install",
    package_name: "academyinfo-mcp",
    package_version: "0.1.0",
    package_integrity: LANE_INTEGRITY,
    source_commit: SOURCE_COMMIT,
    candidate_receipt_digest: A,
    candidate_dist_tag: { name: "candidate", resolved_version: "0.1.0" },
    invocation: "npx -y academyinfo-mcp@0.1.0",
    registry: "https://registry.npmjs.org/",
    lane,
    runtime: { ...LANE_RUNTIMES[lane] },
    isolation: {
      fresh_home: true,
      fresh_npm_cache: true,
      fresh_working_directory: true,
      fresh_user_config: true,
      checkout_removed_before_install: true,
      local_artifact_reachable: false,
      local_or_unversioned_install_allowed: false,
    },
    build_traps: {
      active: true,
      names: BUILD_TRAPS,
      trap_sha256: Object.fromEntries(BUILD_TRAPS.map((name) => [name, B])),
      canary_proven: true,
      canary_evidence_sha256: C,
      canary_exit_code: 86,
      fired_during_install: false,
      compilation_observed: false,
    },
    installed_identities: {
      "academyinfo-mcp": identity("academyinfo-mcp", "0.1.0"),
      "@modelcontextprotocol/sdk": identity("@modelcontextprotocol/sdk", "1.29.0"),
      "better-sqlite3": identity("better-sqlite3", "11.10.0"),
      pino: identity("pino", "10.3.1"),
      zod: identity("zod", "4.4.3"),
    },
    protocol,
    generic_stdio_journey_digest_v1: genericStdioJourneyDigest(protocol),
    install_log: { level: "verbose", sanitized: true, sha256: A, byte_length: 10, line_count: 1, redaction_count: 0 },
    promotion_performed: false,
    public_evidence_complete: true,
    run_id: "17",
    observed_at: "2026-07-11T00:00:00.000Z",
  }
  const payloadDigest = sha256Jcs(payload)
  const projection = {
    receipt_schema_version: "public-install-lane-receipt.v1",
    public_install_evidence_payload_v1: payload,
    public_install_evidence_digest_v1: payloadDigest,
  }
  return { ...projection, receipt_digest_v1: sha256Jcs(projection) }
}
function resealLaneReceipt(receipt: Record<string, unknown>): void {
  const payload = receipt.public_install_evidence_payload_v1 as Record<string, unknown>
  const protocol = payload.protocol as Record<string, unknown>
  payload.generic_stdio_journey_digest_v1 = genericStdioJourneyDigest(protocol)
  receipt.public_install_evidence_digest_v1 = sha256Jcs(payload)
  const { receipt_digest_v1: _oldReceipt, ...projection } = receipt
  receipt.receipt_digest_v1 = sha256Jcs(projection)
}


describe("shared public verifier fail-closed helpers", () => {
  it("rejects unknown, removed, and mode-incompatible flags", () => {
    expect(() => parsePublicVerifierArgs("lane", ["--unknown", "value"])).toThrow("mode-incompatible")
    expect(() => parsePublicVerifierArgs("lane", ["--lane-receipt", "macos-arm64=x"])).toThrow("mode-incompatible")
    expect(() => parsePublicVerifierArgs("client", ["--lane", "macos-arm64"])).toThrow("invalid verifier mode")
    expect(() => parsePublicVerifierArgs("client", ["--approver", "administrator"])).toThrow("invalid verifier mode")
    expect(() => parsePublicVerifierArgs("invalid", [])).toThrow("invalid verifier mode")
  })

  it("binds bundled query evidence to production comparison, explanation, and source identities", () => {
    const source = {
      dataset_id: "15118998",
      source_column: "신입생 경쟁률\n(2025,:1)",
      base_year: "2025",
      unit: ":1",
    }
    const payload = {
      status: "ok",
      tool: "explore_universities",
      data: {
        comparisons: [{
          university_name: "전남대학교",
          campus_name: "본교",
          missing_metrics: [],
          metrics: [{
            indicator: "competition_rate",
            source_column: source.source_column,
            base_year: source.base_year,
            unit: source.unit,
            source,
          }],
        }],
        indicator_explanations: [{
          indicator: "competition_rate",
          source_column: source.source_column,
          base_year: source.base_year,
          unit: source.unit,
          source,
        }],
      },
      query: { university_queries: ["전남대학교 본교"], indicators: ["competition_rate"] },
      sources: [source],
    }
    expect(validateBundledQueryPayload(payload)).toEqual({
      passed: true,
      tool: "explore_universities",
      status: "ok",
      query: { university_queries: ["전남대학교 본교"], indicators: ["competition_rate"] },
      source_dataset_ids: ["15118998"],
    })

    for (const query of [
      { university_queries: ["가천대학교 본교"], indicators: ["competition_rate"] },
      { university_queries: ["전남대학교 본교"], indicators: ["fill_rate"] },
      { university_queries: ["전남대학교 본교"], indicators: ["competition_rate"], extra: true },
    ]) {
      expect(() => validateBundledQueryPayload({ ...payload, query })).toThrow("query identity")
    }
    for (const data of [
      { comparisons: [], indicator_explanations: payload.data.indicator_explanations },
      { comparisons: [{}], indicator_explanations: payload.data.indicator_explanations },
      { comparisons: payload.data.comparisons, indicator_explanations: [] },
      { comparisons: payload.data.comparisons, indicator_explanations: [{}] },
    ]) {
      expect(() => validateBundledQueryPayload({ ...payload, data })).toThrow()
    }
    for (const sources of [
      [],
      [{ ...source, dataset_id: "15139279" }],
      [{ ...source }, { ...source }],
    ]) {
      expect(() => validateBundledQueryPayload({ ...payload, sources })).toThrow()
    }
    expect(() => validateBundledQueryPayload({
      ...payload,
      sources: [
        source,
        { ...source, source_column: "충원율\n(2025,%)", unit: "%" },
      ],
    })).not.toThrow()
  })

  it("finalizes protocol evidence only for a clean close with no trailing output or pending responses", () => {
    const clean = { settled: true, pendingResponseCount: 0, trailingStdout: "" }
    expect(() => validateProtocolClose(0, null, clean)).not.toThrow()
    for (const [code, signal, state] of [
      [null, "SIGTERM", clean],
      [1, null, clean],
      [0, null, { ...clean, settled: false }],
      [0, null, { ...clean, pendingResponseCount: 1 }],
      [0, null, { ...clean, trailingStdout: "{\"jsonrpc\":\"2.0\"}" }],
      [0, null, { ...clean, trailingStdout: "\uFFFD" }],
    ] as const) {
      expect(() => validateProtocolClose(code, signal, state)).toThrow()
    }
  })

  it("rejects sealed lane receipts with substituted query or dataset identity", () => {
    const expected = {
      version: "0.1.0",
      sourceCommit: SOURCE_COMMIT,
      candidateReceiptDigest: A,
      packageIntegrity: LANE_INTEGRITY,
    }
    for (const receipt of [
      laneReceipt({ university_queries: ["가천대학교 본교"], indicators: ["competition_rate"] }),
      laneReceipt(undefined, ["15139279"]),
      laneReceipt(undefined, [15118998]),
      laneReceipt(undefined, ["15118998", "15118998"]),
      laneReceipt(undefined, []),
    ]) {
      expect(() => validateLaneReceipt(
        receipt,
        expected,
        "macos-arm64",
        receipt.receipt_digest_v1,
      )).toThrow("bundled query provenance")
    }
  })
  it("rejects resealed protocol and lane runtime identity downgrades in every lane", () => {
    const expected = {
      version: "0.1.0",
      sourceCommit: SOURCE_COMMIT,
      candidateReceiptDigest: A,
      packageIntegrity: LANE_INTEGRITY,
    }
    const laneDowngrades = {
      "macos-arm64": {
        parsedMessageCount: 2,
        operatingSystem: "macOS",
        platform: "linux",
        architecture: "x64",
        glibcVersionRuntime: "2.39",
        lane: "windows-x64",
      },
      "windows-x64": {
        parsedMessageCount: 2,
        operatingSystem: "Windows",
        platform: "darwin",
        architecture: "arm64",
        glibcVersionRuntime: "2.39",
        lane: "macos-arm64",
      },
      "ubuntu-glibc-x64": {
        parsedMessageCount: 3,
        operatingSystem: "Ubuntu",
        platform: "darwin",
        architecture: "arm64",
        glibcVersionRuntime: null,
        lane: "macos-arm64",
      },
    } as const

    for (const lane of ["macos-arm64", "windows-x64", "ubuntu-glibc-x64"] as const) {
      const validReceipt = laneReceipt(undefined, undefined, lane)
      expect(validateLaneReceipt(
        validReceipt,
        expected,
        lane,
        validReceipt.receipt_digest_v1,
      )).toBe(validReceipt.receipt_digest_v1)

      const downgrade = laneDowngrades[lane]
      const mutations = [
        (payload: Record<string, any>) => { payload.protocol.initialize.protocol_version = "2024-10-07" },
        (payload: Record<string, any>) => { payload.protocol.initialize.server_version = "0.0.0" },
        (payload: Record<string, any>) => {
          payload.protocol.json_rpc_stdout.parsed_message_count = downgrade.parsedMessageCount
        },
        (payload: Record<string, any>) => { payload.runtime.node = "20.17.0" },
        (payload: Record<string, any>) => { payload.runtime.node_major = 20 },
        (payload: Record<string, any>) => {
          payload.runtime.operating_system = downgrade.operatingSystem
        },
        (payload: Record<string, any>) => { payload.runtime.platform = downgrade.platform },
        (payload: Record<string, any>) => {
          payload.runtime.architecture = downgrade.architecture
        },
        (payload: Record<string, any>) => {
          payload.runtime.glibc_version_runtime = downgrade.glibcVersionRuntime
        },
        (payload: Record<string, any>) => { payload.lane = downgrade.lane },
      ]

      for (const mutate of mutations) {
        const receipt = laneReceipt(undefined, undefined, lane)
        const payload = receipt.public_install_evidence_payload_v1 as Record<string, any>
        mutate(payload)
        resealLaneReceipt(receipt)
        expect(() => validateLaneReceipt(
          receipt,
          expected,
          lane,
          receipt.receipt_digest_v1,
        )).toThrow()
      }
    }
  })

  it("rejects resealed non-public tarballs and incoherent signature/provenance summaries", () => {
    const expected = {
      version: "0.1.0",
      sourceCommit: SOURCE_COMMIT,
      candidateReceiptDigest: A,
      packageIntegrity: LANE_INTEGRITY,
    }
    const mutateApplication = (
      mutate: (identity: Record<string, any>) => void,
    ): Record<string, unknown> => {
      const receipt = laneReceipt()
      const payload = receipt.public_install_evidence_payload_v1 as Record<string, any>
      mutate(payload.installed_identities["academyinfo-mcp"])
      resealLaneReceipt(receipt)
      return receipt
    }
    for (const tarball of [
      "https://user:pass@registry.npmjs.org/package/-/package.tgz",
      "https://registry.npmjs.org:443/package/-/package.tgz",
      "https://registry.npmjs.org/package/-/package.tgz?token=x",
      "https://registry.npmjs.org/package/-/package.tgz#fragment",
      "https://registry.npmjs.org.example.invalid/package/-/package.tgz",
    ]) {
      const receipt = mutateApplication((identity) => { identity.registry_tarball = tarball })
      expect(() => validateLaneReceipt(receipt, expected, "macos-arm64", receipt.receipt_digest_v1)).toThrow()
    }

    const evidenceMutations = [
      (evidence: Record<string, any>) => { evidence.signatures.available = true },
      (evidence: Record<string, any>) => {
        evidence.signatures = { available: true, count: 1, keyids: [], evidence_sha256: A }
      },
      (evidence: Record<string, any>) => {
        evidence.signatures = { available: true, count: 2, keyids: ["z", "a"], evidence_sha256: A }
      },
      (evidence: Record<string, any>) => {
        evidence.provenance = {
          available: true,
          attestation_url: "https://attestations.example.invalid/package@0.1.0",
          evidence_sha256: B,
        }
      },
      (evidence: Record<string, any>) => {
        evidence.provenance = {
          available: true,
          attestation_url: "https://registry.npmjs.org/-/npm/v1/attestations/package@0.1.0",
          evidence_sha256: null,
        }
      },
      (evidence: Record<string, any>) => {
        evidence.provenance = {
          available: false,
          attestation_url: "https://registry.npmjs.org/-/npm/v1/attestations/package@0.1.0",
          evidence_sha256: B,
        }
      },
    ]
    for (const mutate of evidenceMutations) {
      const receipt = mutateApplication((identity) => mutate(identity.registry_evidence))
      expect(() => validateLaneReceipt(receipt, expected, "macos-arm64", receipt.receipt_digest_v1)).toThrow()
    }

    const coherent = mutateApplication((identity) => {
      identity.registry_evidence = {
        signatures: { available: true, count: 1, keyids: ["keyid"], evidence_sha256: A },
        provenance: {
          available: true,
          attestation_url: "https://registry.npmjs.org/-/npm/v1/attestations/package@0.1.0",
          evidence_sha256: B,
        },
      }
    })
    expect(validateLaneReceipt(
      coherent,
      expected,
      "macos-arm64",
      coherent.receipt_digest_v1,
    )).toBe(coherent.receipt_digest_v1)
  })

  it("accepts only canonical 64-byte SHA-512 SRI", () => {
    expect(validateSha512Sri(PACKAGE_INTEGRITY)).toHaveLength(64)

    const noncanonical = `${PACKAGE_INTEGRITY.slice(0, -3)}z==`
    for (const integrity of [
      `sha512-${Buffer.alloc(63, 7).toString("base64")}`,
      noncanonical,
      PACKAGE_INTEGRITY.replace(/==$/u, ""),
    ]) {
      expect(() => validateSha512Sri(integrity)).toThrow("integrity")
      const receipt = laneReceipt()
      ;(receipt.public_install_evidence_payload_v1 as Record<string, unknown>).package_integrity = integrity
      expect(() => validateLaneReceipt(
        receipt,
        {
          version: "0.1.0",
          sourceCommit: SOURCE_COMMIT,
          candidateReceiptDigest: A,
          packageIntegrity: LANE_INTEGRITY,
        },
        "macos-arm64",
        receipt.receipt_digest_v1,
      )).toThrow("integrity")
    }
  })

  it("rejects nested candidate protocol secrets before lane receipt persistence", () => {
    const nestedCredential = ["nested", "sentinel", "credential"].join("-")
    const compromisedPayload = {
      protocol: {
        bundled_query: {
          response: {
            [["cred", "entials"].join("")]: nestedCredential,
          },
        },
      },
    }
    const compromisedReceipt = {
      receipt_schema_version: "public-install-lane-receipt.v1",
      public_install_evidence_payload_v1: compromisedPayload,
    }

    expect(() => assertNoPrivateLaneMaterial(compromisedPayload)).toThrow("private material")
    expect(() => assertNoPrivateLaneMaterial(compromisedReceipt)).toThrow("private material")
  })

  it("forwards only the minimal candidate environment and replaces every ambient temp sentinel", () => {
    const ambientCredential = ["credential", "sentinel"].join("-")
    const githubCredential = ["github", "pat", "sentinel"].join("_")
    const npmCredential = ["npm", "sentinel"].join("_")
    const npmAuthCredential = ["npm", "auth", "sentinel"].join("_")
    const freshCandidateTemp = temporaryRoot()
    const environment = buildCandidateEnvironment(
      {
        PATH: "/traps:/usr/bin",
        PYTHON: "/traps/python",
        npm_config_python: "/traps/python",
        npm_config_node_gyp: "/traps/node-gyp",
        CC: "/traps/cc",
        CXX: "/traps/c++",
        TMPDIR: "/ambient/tmpdir-sentinel",
        TMP: "C:\\ambient\\tmp-sentinel",
        TEMP: "C:\\ambient\\temp-sentinel",
        SystemRoot: "C:\\Windows",
        ComSpec: "C:\\Windows\\System32\\cmd.exe",
        PATHEXT: ".COM;.EXE;.BAT;.CMD",
        [["GITHUB", "TOKEN"].join("_")]: githubCredential,
        [["NPM", "TOKEN"].join("_")]: npmCredential,
        [["CI", "SECRET", "SENTINEL"].join("_")]: ambientCredential,
        GITHUB_WORKSPACE: "/repository/checkout",
        RUNNER_TEMP: "/runner/private-temp",
        HTTPS_PROXY: `https://${ambientCredential}@example.test`,
        NODE_OPTIONS: `--require=/${ambientCredential}.js`,
        ACADEMYINFO_DB_PATH: "/repository/secret.db",
        [["npm_config_//registry.npmjs.org/:_auth", "Token"].join("")]: npmAuthCredential,
      },
      {
        home: "/isolation/home",
        cache: "/isolation/cache",
        config: "/isolation/npmrc",
        trapLog: "/isolation/trap.log",
        temp: freshCandidateTemp,
      },
    )

    expect(environment).toMatchObject({
      PATH: "/traps:/usr/bin",
      HOME: "/isolation/home",
      USERPROFILE: "/isolation/home",
      BUILD_TRAP_LOG: "/isolation/trap.log",
      NPM_CONFIG_CACHE: "/isolation/cache",
      NPM_CONFIG_USERCONFIG: "/isolation/npmrc",
      NPM_CONFIG_REGISTRY: "https://registry.npmjs.org/",
      TZ: "UTC",
      LANG: "C.UTF-8",
      LC_ALL: "C.UTF-8",
      NO_COLOR: "1",
      SystemRoot: "C:\\Windows",
      ComSpec: "C:\\Windows\\System32\\cmd.exe",
      PATHEXT: ".COM;.EXE;.BAT;.CMD",
      TMPDIR: freshCandidateTemp,
      TMP: freshCandidateTemp,
      TEMP: freshCandidateTemp,
    })
    expect(Object.keys(environment).sort()).toEqual([
      "BUILD_TRAP_LOG",
      "CC",
      "CXX",
      "ComSpec",
      "HOME",
      "LANG",
      "LC_ALL",
      "NO_COLOR",
      "NPM_CONFIG_CACHE",
      "NPM_CONFIG_COLOR",
      "NPM_CONFIG_LOGLEVEL",
      "NPM_CONFIG_REGISTRY",
      "NPM_CONFIG_USERCONFIG",
      "PATH",
      "PATHEXT",
      "PYTHON",
      "SystemRoot",
      "TEMP",
      "TMP",
      "TMPDIR",
      "TZ",
      "USERPROFILE",
      "npm_config_cache",
      "npm_config_node_gyp",
      "npm_config_python",
      "npm_config_registry",
      "npm_config_userconfig",
    ].sort())
    for (const key of [
      "GITHUB_TOKEN",
      "NPM_TOKEN",
      "CI_SECRET_SENTINEL",
      "GITHUB_WORKSPACE",
      "RUNNER_TEMP",
      "HTTPS_PROXY",
      "NODE_OPTIONS",
      "ACADEMYINFO_DB_PATH",
      "npm_config_//registry.npmjs.org/:_authToken",
    ]) {
      expect(Object.hasOwn(environment, key)).toBe(false)
    }
    expect(new Set([environment.TMPDIR, environment.TMP, environment.TEMP])).toEqual(new Set([freshCandidateTemp]))
    expect(Object.values(environment)).not.toContain("/ambient/tmpdir-sentinel")
    expect(Object.values(environment)).not.toContain("C:\\ambient\\tmp-sentinel")
    expect(Object.values(environment)).not.toContain("C:\\ambient\\temp-sentinel")
  })

  it("detects and sanitizes POSIX, Windows, and UNC privacy material", () => {
    const slash = String.fromCharCode(47)
    const backslash = String.fromCharCode(92)
    const macosPath = ["", "Users", "alice", "private"].join(slash)
    const linuxPath = ["", "home", "alice", "private"].join(slash)
    const windowsPath = ["C:", "Users", "alice", "private"].join(backslash)
    const uncPath = ["", "", "server", "alice", "private"].join(backslash)
    const privateDarwinTemp = ["", "private", "var", "folders", "xx", "receipt"].join(slash)
    const tmpPath = ["", "tmp", "receipt"].join(slash)
    const windowsTemp = ["C:", "Temp", "receipt"].join(backslash)

    for (const value of [
      macosPath,
      linuxPath,
      windowsPath,
      uncPath,
      privateDarwinTemp,
      tmpPath,
      windowsTemp,
    ]) {
      expect(containsPrivateMaterial(value)).toBe(true)
    }
    const result = sanitizeInstallLog(
      `paths: ${macosPath} ${windowsPath} ${uncPath} token=secret`,
      [],
    )
    expect(containsPrivateMaterial(result.sanitized)).toBe(false)
    expect(result.sanitized).not.toContain("token=secret")
  })

  it("rejects nested secret keys and values in dynamic lane receipt JSON after digest substitution", () => {
    const expected = {
      version: "0.1.0",
      sourceCommit: SOURCE_COMMIT,
      candidateReceiptDigest: A,
      packageIntegrity: LANE_INTEGRITY,
    }
    const clean = laneReceipt()
    expect(validateLaneReceipt(clean, expected, "macos-arm64", clean.receipt_digest_v1)).toBe(clean.receipt_digest_v1)

    for (const query of [
      { university: { client_secret: "substituted" } },
      { university: { credentials: "substituted" } },
      { university: { authentication: "substituted" } },
      { university: { note: "token=substituted" } },
    ]) {
      const secretBearing = laneReceipt(query)
      expect(() => validateLaneReceipt(
        secretBearing,
        expected,
        "macos-arm64",
        secretBearing.receipt_digest_v1,
      )).toThrow("private material")
    }
  })

  it("caps registry bodies and times out stalled progress", async () => {
    const controller = new AbortController()
    await expect(
      readResponseBounded(new Response("four", { headers: { "content-length": "4" } }), 3, controller.signal),
    ).rejects.toThrow("safety limit")
    await expect(readResponseBounded(new Response("four"), 3, controller.signal)).rejects.toThrow("safety limit")

    vi.useFakeTimers()
    const stalled = readResponseBounded(
      new Response(new ReadableStream<Uint8Array>({ start() {} })),
      3,
      controller.signal,
    )
    const rejection = expect(stalled).rejects.toThrow("timed out")
    await vi.advanceTimersByTimeAsync(5_001)
    await rejection
  })

  it("accepts only ordered, unique, solicited JSON-RPC responses", () => {
    const state = {
      expectedResponseId: 1,
      pendingIds: new Set([1]),
      seenResponseIds: new Set<number>(),
    }
    expect(() => validateSolicitedJsonRpcResponse({ jsonrpc: "2.0", id: 1, result: {} }, state)).not.toThrow()
    expect(() => validateSolicitedJsonRpcResponse({ jsonrpc: "2.0", id: 2, result: {} }, state)).toThrow("out-of-order")
    expect(() => validateSolicitedJsonRpcResponse({ jsonrpc: "2.0", id: 1, result: {}, extra: true }, state)).toThrow("unsolicited")
    state.seenResponseIds.add(1)
    expect(() => validateSolicitedJsonRpcResponse({ jsonrpc: "2.0", id: 1, result: {} }, state)).toThrow("duplicate")
  })

  it("rejects extra fields in nested lane objects before trusting their values", () => {
    const payload = {
      schema_version: null,
      evidence_kind: null,
      package_name: null,
      package_version: null,
      package_integrity: null,
      source_commit: null,
      candidate_receipt_digest: null,
      candidate_dist_tag: {},
      invocation: null,
      registry: null,
      lane: null,
      runtime: {
        node: null,
        node_major: null,
        platform: null,
        operating_system: null,
        architecture: null,
        glibc_version_runtime: null,
        unreviewed: true,
      },
      isolation: {},
      build_traps: {},
      installed_identities: {},
      protocol: {},
      generic_stdio_journey_digest_v1: A,
      install_log: {},
      promotion_performed: null,
      public_evidence_complete: null,
      run_id: null,
      observed_at: null,
    }
    expect(() => validateLaneReceipt(
      {
        receipt_schema_version: "public-install-lane-receipt.v1",
        public_install_evidence_payload_v1: payload,
        public_install_evidence_digest_v1: A,
        receipt_digest_v1: B,
      },
      {},
      "macos-arm64",
      B,
    )).toThrow("runtime shape")
  })
})

describe("workflow privacy alignment", () => {
  const verifierSource = readFileSync(
    join(projectRoot, "scripts/release-receipt-verify.mjs"),
    "utf8",
  )
  const workflows = [
    {
      name: "candidate release",
      source: readFileSync(join(projectRoot, ".github/workflows/candidate-release.yml"), "utf8"),
    },
    {
      name: "refresh acquisition",
      source: readFileSync(join(projectRoot, ".github/workflows/refresh-acquire-validate.yml"), "utf8"),
    },
  ] as const

  function privateMaterialLiteral(source: string): string {
    const matches = [...source.matchAll(/^\s*const PRIVATE_MATERIAL = (\/[^\r\n]+\/[a-z]+);?\s*$/gmu)]
    expect(matches).toHaveLength(1)
    return matches[0]?.[1] ?? ""
  }

  function compileRegexLiteral(literal: string): RegExp {
    const closingSlash = literal.lastIndexOf("/")
    expect(closingSlash).toBeGreaterThan(0)
    return new RegExp(literal.slice(1, closingSlash), literal.slice(closingSlash + 1))
  }

  it("keeps both inline guards identical to the release receipt verifier source of truth", () => {
    const canonicalLiteral = privateMaterialLiteral(verifierSource)

    for (const workflow of workflows) {
      expect(privateMaterialLiteral(workflow.source), workflow.name).toBe(canonicalLiteral)
      expect(
        workflow.source.match(/if \(PRIVATE_MATERIAL\.test\(serialized\)\)/g),
        workflow.name,
      ).toHaveLength(1)
      expect(workflow.source, workflow.name).toContain(
        "scripts/release-receipt-verify.mjs, the source of truth",
      )
    }

    expect(workflows[1].source).toMatch(/if \(\/15139279\/u\.test\(fullReportSerialized\)\)/)
  })
  it("excludes only exact prevalidated public URL fields from the canonical private scan", () => {
    expect(workflows[0].source).toContain("delete closedProvenanceForPrivacyScan.registry")
    expect(workflows[0].source).toContain("delete closedProofForPrivacyScan.registry")
    expect(workflows[1].source).toContain("delete reportForPrivacyScan.canonical_page_url")
    expect(workflows[1].source).toContain(
      "report.canonical_page_url !== process.env.CANONICAL_SOURCE_PAGE",
    )
  })

  it("covers adversarial private material categories in each workflow guard", () => {
    const slash = String.fromCharCode(47)
    const backslash = String.fromCharCode(92)
    const adversarialValues = [
      [
        "X-Goog-Signature URL",
        ["https:", slash, slash, "storage.googleapis.com", slash, "object?", "X-Goog-Signature", "=", "deadbeef"].join(""),
      ],
      ["Bearer authorization", ["Authorization: ", "Bearer", " abc_DEF-123=="].join("")],
      ["Basic authorization", ["Authorization: ", "Basic", " dXNlcjpwYXNz"].join("")],
      ["npm token prefix", ["npm", "_", "privateToken123"].join("")],
      ["GitHub token prefix", ["github", "_pat_", "privateToken123"].join("")],
      ["short GitHub token prefix", ["gh", "p_", "privateToken123"].join("")],
      ["Slack token prefix", ["xox", "b-", "privateToken123"].join("")],
      ["Windows private path", ["C:", backslash, "Users", backslash, "alice", backslash, "secret.txt"].join("")],
      ["UNC private path", [backslash, backslash, "server", backslash, "share", backslash, "secret.txt"].join("")],
      ["private path", ["", "private", "session", "secret.txt"].join(slash)],
      ["temporary path", ["", "tmp", "session", "secret.txt"].join(slash)],
      ["generic secret key-value", [["creden", "tial"].join(""), " = ", "private-value"].join("")],
    ] as const

    for (const workflow of workflows) {
      const guard = compileRegexLiteral(privateMaterialLiteral(workflow.source))
      for (const [category, value] of adversarialValues) {
        expect(guard.test(value), `${workflow.name}: ${category}`).toBe(true)
      }
    }
  })
})

describe("privileged workflow job permissions", () => {
  const jobs = [
    ["promote-release.yml", "promote"],
    ["rollback-release.yml", "rollback"],
    ["client-evidence.yml", "ingest-actual-client-evidence"],
    ["public-candidate-verify.yml", "verify-public-candidate"],
  ] as const

  it.each(jobs)("%s grants %s only the inherited read permission explicitly", (file, jobName) => {
    const source = readFileSync(join(projectRoot, ".github/workflows", file), "utf8")
    const marker = `\n  ${jobName}:`
    const jobStart = source.indexOf(marker)

    expect(jobStart).toBeGreaterThan(0)
    const jobBlock = source.slice(jobStart)
    expect(jobBlock.match(/^    permissions:$/gmu)).toHaveLength(1)
    expect(jobBlock).toMatch(/^    permissions:\n      contents: read$/mu)
  })
})

describe("workflow package interfaces", () => {
  it("builds before both TypeScript workflow CLIs", () => {
    const pkg = JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf8")) as { scripts: Record<string, string> }
    expect(pkg.scripts["refresh:acquire-validate"]).toBe("npm run build && node dist/scripts/refresh-acquire-validate.js")
    expect(pkg.scripts["refresh:verify-artifact"]).toBe("npm run build && node dist/scripts/refresh-verify-artifact.js")
  })
})

describe("refresh workflow privilege and policy contracts", () => {
  const acquisitionWorkflow = readFileSync(
    join(projectRoot, ".github/workflows/refresh-acquire-validate.yml"),
    "utf8",
  )
  const writerWorkflow = readFileSync(
    join(projectRoot, ".github/workflows/refresh-write-pr.yml"),
    "utf8",
  )

  it("binds the exact canonical page and reviewed base policy with SHA-256/JCS in all lanes", () => {
    const bindingBlock =
      /const policyBindingJcs = JSON\.stringify\(\{\s*canonical_page_url: canonicalPage,\s*policy_digest: policyDigest,\s*\}\);/g
    expect(acquisitionWorkflow.match(bindingBlock)).toHaveLength(1)
    expect(writerWorkflow.match(bindingBlock)).toHaveLength(2)
    expect(acquisitionWorkflow.match(/--policy-digest "\$BOUND_SOURCE_POLICY_DIGEST"/g)).toHaveLength(2)
    expect(writerWorkflow.match(/--policy-digest "\$BOUND_SOURCE_POLICY_DIGEST"/g)).toHaveLength(2)
    expect(`${acquisitionWorkflow}\n${writerWorkflow}`).not.toMatch(
      /--policy-digest "\$SOURCE_POLICY_DIGEST"/,
    )
    expect(acquisitionWorkflow).toContain(
      "report.validation_policy_digest_v1 !== process.env.BOUND_SOURCE_POLICY_DIGEST",
    )
    expect(writerWorkflow).toContain(
      "report.validation_policy_digest_v1 !== process.env.BOUND_SOURCE_POLICY_DIGEST",
    )
    expect(acquisitionWorkflow).toContain(
      "report.canonical_page_url !== process.env.CANONICAL_SOURCE_PAGE",
    )
    expect(
      writerWorkflow.match(
        /report\.canonical_page_url !== process\.env\.CANONICAL_SOURCE_PAGE/g,
      ),
    ).toHaveLength(2)
  })

  it("reproduces one bound identity only for the same exact page and base policy", () => {
    const bind = (canonicalPage: string, policyDigest: string): string =>
      digest(JSON.stringify({
        canonical_page_url: canonicalPage,
        policy_digest: policyDigest,
      }))
    const reviewed = bind(sourceUrl, POLICY)

    expect(reviewed).toBe(sha256Jcs({
      canonical_page_url: sourceUrl,
      policy_digest: POLICY,
    }))
    expect(bind(sourceUrl, POLICY)).toBe(reviewed)
    expect(bind(`${sourceUrl}/substituted`, POLICY)).not.toBe(reviewed)
    expect(bind(sourceUrl, "3".repeat(64))).not.toBe(reviewed)
  })

  it("keeps write credentials out of checkout, install, verification, copying, and staging", () => {
    const writeJob = writerWorkflow.slice(writerWorkflow.indexOf("\n  write-pr:"))
    const finalStep = writeJob.indexOf(
      "      - name: Push one digest-bound branch and open or reuse one PR",
    )
    expect(finalStep).toBeGreaterThan(0)
    const beforeMutation = writeJob.slice(0, finalStep)
    const mutation = writeJob.slice(finalStep)

    expect(writeJob.match(/\$\{\{ github\.token \}\}/g)).toHaveLength(1)
    expect(beforeMutation).not.toContain("GH_TOKEN")
    expect(beforeMutation).not.toContain("${{ github.token }}")
    expect(beforeMutation).toContain("persist-credentials: false")
    expect(beforeMutation.match(/npm ci --ignore-scripts/g)).toHaveLength(1)
    expect(beforeMutation).toContain("npm run refresh:verify-artifact")
    expect(beforeMutation).toContain("copyFileSync(join(root, path), path)")
    expect(beforeMutation).toContain("git add --")
    expect(beforeMutation).toContain("git diff --cached --quiet")
    expect(mutation).not.toContain("git add --")
  })

  it("exposes authentication only in the terminal fixed-path mutation step", () => {
    const writeJob = writerWorkflow.slice(writerWorkflow.indexOf("\n  write-pr:"))
    const finalStep = writeJob.indexOf(
      "      - name: Push one digest-bound branch and open or reuse one PR",
    )
    const mutation = writeJob.slice(finalStep)

    expect(mutation).toMatch(/env:\s+GH_TOKEN: \$\{\{ github\.token \}\}/)
    expect(mutation).toContain("gh auth setup-git")
    expect(mutation.indexOf("gh auth setup-git")).toBeLessThan(mutation.indexOf("git push --force-with-lease"))
    expect(mutation).toContain("gh pr list")
    expect(mutation).toContain("gh pr create")
    expect(writerWorkflow).toContain(
      "verified-refresh-${{ github.event.workflow_run.id }}-${{ steps.report.outputs.report_digest }}",
    )
    expect(writerWorkflow).toContain(
      "verified-refresh-${{ github.event.workflow_run.id }}-${{ needs.inspect-read-only.outputs.report_digest }}",
    )

    for (const workflow of [acquisitionWorkflow, writerWorkflow]) {
      for (const [, ref] of workflow.matchAll(/uses: [^@\n]+@([^\s]+)/g)) {
        expect(ref).toMatch(/^[a-f0-9]{40}$/)
      }
    }
  })
})
