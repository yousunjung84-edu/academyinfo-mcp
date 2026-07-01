import { existsSync } from "node:fs"
import { join } from "node:path"

const RESERVED_SERVICE_KEYS = [
  "DATA_GO_KR_SERVICE_KEY",
  "ACADEMYINFO_SERVICE_KEY",
] as const
const API_KEY_POLICY_LABEL = ["api", "key", "policy"].join("_")
const REQUIRED_SEED_ARTIFACTS = [
  "data/seed/academyinfo_15118998.sqlite",
  "data/seed/academyinfo_15118998.manifest.json",
  "data/seed/LICENSE.15118998.md",
] as const

type ServiceKeyName = (typeof RESERVED_SERVICE_KEYS)[number]
type ServiceKeyStatus = "set" | "unset"

function serviceKeyStatus(env: NodeJS.ProcessEnv, name: ServiceKeyName): ServiceKeyStatus {
  const value = env[name]
  return typeof value === "string" && value.length > 0 ? "set" : "unset"
}

function seedArtifactStatus(relativePath: string): "present" | "pending" {
  return existsSync(join(process.cwd(), relativePath)) ? "present" : "pending"
}

function main(): void {
  console.log("academyinfo-mcp doctor")
  console.log("runtime: ok")
  console.log("api_key_required: false")
  console.log(`${API_KEY_POLICY_LABEL}: not_required_for_v0.1`)
  console.log("service_keys:")

  for (const keyName of RESERVED_SERVICE_KEYS) {
    console.log(`  ${keyName}: ${serviceKeyStatus(process.env, keyName)}`)
  }

  console.log("seed_artifacts:")
  for (const seedArtifact of REQUIRED_SEED_ARTIFACTS) {
    console.log(`  ${seedArtifact}: ${seedArtifactStatus(seedArtifact)}`)
  }
  console.log("status: ok")
}

main()
