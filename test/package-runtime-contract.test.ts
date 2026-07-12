import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import {
  collectPackageContractFailures,
  EXACT_PACKED_PACKAGE_FILES,
  hasExactPackedPackagePaths,
  PUBLISHED_DEPENDENCY_IDENTITIES,
  PUBLISHED_DEPENDENCY_NAMES,
  REQUIRED_PACKAGE_FILES,
  SELECTED_DATABASE_BACKEND,
  SUPPORTED_NODE_RANGE,
} from "../scripts/package-check-config.ts"
import { isForbiddenArtifactPath } from "../scripts/package-check-scan.ts"
import * as catalogSchemaExports from "../src/catalog-schema.ts"

const projectRoot = fileURLToPath(new URL("..", import.meta.url))

async function readJson(relativePath: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(join(projectRoot, relativePath), "utf8")) as Record<
    string,
    unknown
  >
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("expected object fixture")
  }
  return value as Record<string, unknown>
}

function catalogIndicatorRecords(catalog: Record<string, unknown>): Record<string, unknown>[] {
  if (!Array.isArray(catalog.indicators)) {
    throw new TypeError("expected catalog indicators fixture")
  }

  return catalog.indicators.map(asRecord)
}

function failureCodes(
  packageJson: Record<string, unknown>,
  packageLock: Record<string, unknown>,
): readonly string[] {
  return collectPackageContractFailures(packageJson, packageLock).map(({ code }) => code)
}

describe("published package runtime contract", () => {
  it("keeps the closed catalog export and rejects ID/unit mutations", async () => {
    const canonicalCatalog = await readJson("data/seed/indicators.json")

    expect(Object.keys(catalogSchemaExports)).toEqual(["indicatorCatalogSchema"])
    expect(
      catalogSchemaExports.indicatorCatalogSchema.safeParse(canonicalCatalog).success,
    ).toBe(true)
    expect(
      catalogIndicatorRecords(canonicalCatalog).map(({ indicator_id, unit }) => ({
        indicator_id,
        unit,
      })),
    ).toEqual([
      { indicator_id: "competition_rate", unit: ":1" },
      { indicator_id: "fill_rate", unit: "%" },
      { indicator_id: "employment_rate", unit: "%" },
      { indicator_id: "scholarship_per_student", unit: "원" },
      { indicator_id: "avg_tuition", unit: "천원" },
    ])

    const wrongIdCatalog = structuredClone(canonicalCatalog)
    catalogIndicatorRecords(wrongIdCatalog)[0]!.indicator_id = "competition_ratio"
    expect(
      catalogSchemaExports.indicatorCatalogSchema.safeParse(wrongIdCatalog).success,
    ).toBe(false)

    const wrongUnitCatalog = structuredClone(canonicalCatalog)
    catalogIndicatorRecords(wrongUnitCatalog)[0]!.unit = "ratio"
    expect(
      catalogSchemaExports.indicatorCatalogSchema.safeParse(wrongUnitCatalog).success,
    ).toBe(false)

    const swappedPairCatalog = structuredClone(canonicalCatalog)
    const swappedPairIndicators = catalogIndicatorRecords(swappedPairCatalog)
    const firstPair = {
      indicator_id: swappedPairIndicators[0]!.indicator_id,
      unit: swappedPairIndicators[0]!.unit,
    }
    swappedPairIndicators[0]!.indicator_id = swappedPairIndicators[1]!.indicator_id
    swappedPairIndicators[0]!.unit = swappedPairIndicators[1]!.unit
    swappedPairIndicators[1]!.indicator_id = firstPair.indicator_id
    swappedPairIndicators[1]!.unit = firstPair.unit
    expect(catalogSchemaExports.indicatorCatalogSchema.safeParse(swappedPairCatalog).success).toBe(
      false,
    )

    const swappedUnitCatalog = structuredClone(canonicalCatalog)
    const swappedUnitIndicators = catalogIndicatorRecords(swappedUnitCatalog)
    const firstUnit = swappedUnitIndicators[0]!.unit
    swappedUnitIndicators[0]!.unit = swappedUnitIndicators[1]!.unit
    swappedUnitIndicators[1]!.unit = firstUnit
    expect(catalogSchemaExports.indicatorCatalogSchema.safeParse(swappedUnitCatalog).success).toBe(
      false,
    )
  })

  it("pins the package, lock root, installed identities, registry URLs, and integrities", async () => {
    const packageJson = await readJson("package.json")
    const packageLock = await readJson("package-lock.json")

    expect(collectPackageContractFailures(packageJson, packageLock)).toEqual([])
    expect(asRecord(packageJson.engines).node).toBe(SUPPORTED_NODE_RANGE)
    expect(asRecord(packageJson.dependencies)[SELECTED_DATABASE_BACKEND]).toBeDefined()

    const lockPackages = asRecord(packageLock.packages)
    for (const identity of Object.values(PUBLISHED_DEPENDENCY_IDENTITIES)) {
      expect(lockPackages[identity.lockPath]).toMatchObject({
        version: identity.version,
        resolved: identity.resolved,
        integrity: identity.integrity,
      })
    }
  })

  it("closes direct dependency keys in both package and lock root", async () => {
    const canonicalPackage = await readJson("package.json")
    const canonicalLock = await readJson("package-lock.json")
    expect(Object.keys(asRecord(canonicalPackage.dependencies)).sort()).toEqual(
      PUBLISHED_DEPENDENCY_NAMES,
    )
    expect(
      Object.keys(asRecord(asRecord(asRecord(canonicalLock.packages)[""]).dependencies)).sort(),
    ).toEqual(PUBLISHED_DEPENDENCY_NAMES)

    const extraPackageDependency = structuredClone(canonicalPackage)
    asRecord(extraPackageDependency.dependencies)["unexpected-runtime"] = "1.0.0"
    expect(failureCodes(extraPackageDependency, canonicalLock)).toContain(
      "published_dependency_keys",
    )

    const extraLockDependency = structuredClone(canonicalLock)
    asRecord(asRecord(asRecord(extraLockDependency.packages)[""]).dependencies)[
      "unexpected-runtime"
    ] = "1.0.0"
    expect(failureCodes(canonicalPackage, extraLockDependency)).toContain(
      "published_dependency_keys",
    )
  })

  it("uses a closed exact packed path manifest with no runtime prefix acceptance", () => {
    expect(EXACT_PACKED_PACKAGE_FILES.some((path) => path.includes("*"))).toBe(false)
    expect(hasExactPackedPackagePaths(EXACT_PACKED_PACKAGE_FILES)).toBe(true)
    expect(
      hasExactPackedPackagePaths([
        ...EXACT_PACKED_PACKAGE_FILES,
        "dist/src/accidental-private-runtime.js",
      ]),
    ).toBe(false)
    expect(
      hasExactPackedPackagePaths(
        EXACT_PACKED_PACKAGE_FILES.filter((path) => path !== "dist/src/index.js"),
      ),
    ).toBe(false)
  })

  it("rejects dependency ranges, alternate registries, changed integrities, and duplicate copies", async () => {
    const canonicalPackage = await readJson("package.json")
    const canonicalLock = await readJson("package-lock.json")

    const rangedPackage = structuredClone(canonicalPackage)
    asRecord(rangedPackage.dependencies)["@modelcontextprotocol/sdk"] = "^1.29.0"
    expect(failureCodes(rangedPackage, canonicalLock)).toContain("published_dependency_spec")

    const alternateRegistryLock = structuredClone(canonicalLock)
    const alternatePackages = asRecord(alternateRegistryLock.packages)
    asRecord(alternatePackages["node_modules/zod"]).resolved =
      "https://registry.example.invalid/zod/-/zod-4.4.3.tgz"
    expect(failureCodes(canonicalPackage, alternateRegistryLock)).toContain(
      "published_dependency_lock_identity",
    )

    const changedIntegrityLock = structuredClone(canonicalLock)
    const changedIntegrityPackages = asRecord(changedIntegrityLock.packages)
    asRecord(changedIntegrityPackages["node_modules/@modelcontextprotocol/sdk"]).integrity =
      "sha512-not-the-published-integrity"
    expect(failureCodes(canonicalPackage, changedIntegrityLock)).toContain(
      "published_dependency_lock_identity",
    )

    const duplicateZodLock = structuredClone(canonicalLock)
    const duplicatePackages = asRecord(duplicateZodLock.packages)
    duplicatePackages["node_modules/example/node_modules/zod"] = structuredClone(
      duplicatePackages["node_modules/zod"],
    )
    expect(failureCodes(canonicalPackage, duplicateZodLock)).toContain(
      "published_dependency_copies",
    )
  })

  it("rejects Node 24 support and dual or alternate database backends", async () => {
    const canonicalPackage = await readJson("package.json")
    const canonicalLock = await readJson("package-lock.json")

    const node24Package = structuredClone(canonicalPackage)
    asRecord(node24Package.engines).node = ">=22 <25"
    expect(failureCodes(node24Package, canonicalLock)).toContain("node_engine_contract")

    const dualBackendPackage = structuredClone(canonicalPackage)
    asRecord(dualBackendPackage.dependencies)["sql.js"] = "1.13.0"
    expect(failureCodes(dualBackendPackage, canonicalLock)).toContain(
      "database_backend_contract",
    )

    const alternateBackendPackage = structuredClone(canonicalPackage)
    const alternateDependencies = asRecord(alternateBackendPackage.dependencies)
    delete alternateDependencies["better-sqlite3"]
    alternateDependencies["sql.js"] = "1.13.0"
    expect(failureCodes(alternateBackendPackage, canonicalLock)).toContain(
      "database_backend_contract",
    )
  })

  it("requires the catalog in the exact allowlist and keeps forbidden artifacts excluded", async () => {
    const packageJson = await readJson("package.json")
    const packageLock = await readJson("package-lock.json")

    expect(packageJson.files).toEqual([...REQUIRED_PACKAGE_FILES])
    expect(REQUIRED_PACKAGE_FILES).toContain("data/seed/indicators.json")

    const missingCatalogPackage = structuredClone(packageJson)
    missingCatalogPackage.files = (missingCatalogPackage.files as unknown[]).filter(
      (path) => path !== "data/seed/indicators.json",
    )
    expect(failureCodes(missingCatalogPackage, packageLock)).toContain("package_paths_contract")
    expect(isForbiddenArtifactPath("data/raw/source.xlsx")).toBe(true)
    expect(isForbiddenArtifactPath("fixtures/15139279.json")).toBe(true)
    expect(isForbiddenArtifactPath(".env.production")).toBe(true)
    expect(isForbiddenArtifactPath("data/seed/indicators.json")).toBe(false)
  })
})

describe("Node 22 local-install evidence contract", () => {
  it("uses only Node 22 official OS lanes and clean lockfile installs", async () => {
    const workflow = await readFile(join(projectRoot, ".github/workflows/ci.yml"), "utf8")

    expect(workflow).toContain("os: [ubuntu-latest, macos-latest, windows-latest]")
    expect(workflow).toContain("node-version: 22")
    expect(workflow).not.toMatch(/node-version:\s*24/u)
    expect(workflow).not.toMatch(/node:\s*\[[^\]]*24/u)
    expect(workflow).toContain("- run: npm ci")
    expect(workflow).toContain("npm install --package-lock-only")
    expect(workflow).toContain("NODE_GYP_FORCE_PYTHON")
    expect(workflow).toContain("local-tarball evidence only")
    expect(workflow).not.toMatch(/^\s*npm publish\b/mu)
  })

  it("labels smoke output as local evidence and reports tools, schemas, and dependencies", async () => {
    const smoke = await readFile(join(projectRoot, "scripts/smoke-installed.mjs"), "utf8")

    expect(smoke).toContain('evidence_kind: "local_tarball_install_smoke"')
    expect(smoke).toContain("public_npm_acceptance: false")
    expect(smoke).toContain('"@modelcontextprotocol/sdk": "1.29.0"')
    expect(smoke).toContain('zod: "4.4.3"')
    expect(smoke).toContain('"explore_universities"')
    expect(smoke).toContain("inputSchema: tool.inputSchema")
    expect(smoke).not.toMatch(/console\.log\([^\n]*(?:bin|packageRoot|packageJsonPath)/u)
  })
})
