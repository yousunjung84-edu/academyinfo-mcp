import { lstatSync, readdirSync, readFileSync } from "node:fs"
import { join, relative, sep } from "node:path"

import {
  addFailure,
  projectRoot,
  TEXT_FILE_EXTENSIONS,
  type Failure,
} from "./package-check-config.js"

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/").toLowerCase()
}

function is15139279DataArtifactPath(normalizedPath: string): boolean {
  if (!normalizedPath.includes("15139279")) {
    return false
  }

  if (normalizedPath.endsWith(".md") || normalizedPath.endsWith(".txt")) {
    return false
  }

  return (
    normalizedPath.startsWith("data/") ||
    normalizedPath.includes("fixture") ||
    normalizedPath.includes("sample") ||
    /\.(?:sqlite|db|csv|xlsx|xls|json|jsonl|parquet|tsv)$/u.test(normalizedPath)
  )
}

export function isForbiddenArtifactPath(path: string): boolean {
  const normalizedPath = normalizePath(path)
  const pathSegments = normalizedPath.split("/")
  return (
    is15139279DataArtifactPath(normalizedPath) ||
    normalizedPath.includes(".insane-review/") ||
    normalizedPath.includes("data/raw/") ||
    normalizedPath.includes("data/external/") ||
    pathSegments.includes(".env") ||
    pathSegments.some((segment) => segment.startsWith(".env.")) ||
    pathSegments.includes(".npmrc") ||
    pathSegments.includes("service-account.json") ||
    normalizedPath.endsWith(".pem") ||
    normalizedPath.endsWith(".xlsx") ||
    normalizedPath.endsWith(".csv")
  )
}

function shouldSkipDirectory(name: string): boolean {
  return (
    name === "node_modules" ||
    name.startsWith("node_modules.") ||
    name === "dist" ||
    name === ".git" ||
    name === ".insane-review" ||
    name === ".omo" ||
    name === ".ultrawork"
  )
}

function isTextFile(path: string): boolean {
  return TEXT_FILE_EXTENSIONS.some((extension) => path.toLowerCase().endsWith(extension))
}

function shouldScanRegardlessOfSize(path: string): boolean {
  const normalizedPath = path.toLowerCase()
  return (
    normalizedPath.endsWith(".map") ||
    normalizedPath.endsWith(".json") ||
    normalizedPath.endsWith(".md") ||
    normalizedPath.endsWith(".txt")
  )
}

function collectFirstPartyFiles(directory: string): readonly string[] {
  const files: string[] = []

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && shouldSkipDirectory(entry.name)) {
      continue
    }

    const absolutePath = join(directory, entry.name)

    if (entry.isDirectory()) {
      files.push(...collectFirstPartyFiles(absolutePath))
    } else if (entry.isFile() && isTextFile(absolutePath)) {
      files.push(absolutePath)
    }
  }

  return files
}

function hasPrivateAbsolutePath(text: string): boolean {
  const windowsPrivatePath = /[A-Za-z]:[\\/][^\r\n"'`]*?(?:Users|Documents|내 드라이브)[\\/]/u
  const posixPrivatePath = /(?:\/Users\/|\/home\/)[^\s"'`]+/u
  return windowsPrivatePath.test(text) || posixPrivatePath.test(text)
}

function hasKeyLikeAssignment(text: string): boolean {
  const keyAssignment =
    /\b(?:api|service|secret|token|password|credential)[A-Z0-9_-]*\s*[:=]\s*["']?[A-Za-z0-9_./+=-]{12,}/iu
  return keyAssignment.test(text)
}

export function scanFirstPartyFiles(failures: Failure[]): void {
  for (const filePath of collectFirstPartyFiles(projectRoot)) {
    const relativePath = relative(projectRoot, filePath).split(sep).join("/")

    if (isForbiddenArtifactPath(relativePath)) {
      addFailure(failures, "forbidden_first_party_path", relativePath)
      continue
    }

    if (lstatSync(filePath).size > 1_000_000 && !shouldScanRegardlessOfSize(filePath)) {
      continue
    }

    const text = readFileSync(filePath, "utf8")

    if (hasPrivateAbsolutePath(text)) {
      addFailure(failures, "private_absolute_path", relativePath)
    }

    if (hasKeyLikeAssignment(text)) {
      addFailure(failures, "key_like_assignment", relativePath)
    }
  }
}
