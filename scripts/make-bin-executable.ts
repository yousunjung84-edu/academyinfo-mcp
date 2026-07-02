import { chmodSync, existsSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

function findProjectRoot(startDirectory: string): string {
  let current = resolve(startDirectory)

  while (!existsSync(join(current, "package.json"))) {
    const parent = dirname(current)

    if (parent === current) {
      throw new Error("Could not locate project root package.json.")
    }

    current = parent
  }

  return current
}

const projectRoot = findProjectRoot(dirname(fileURLToPath(import.meta.url)))
const binPath = join(projectRoot, "dist", "src", "index.js")

if (!existsSync(binPath)) {
  throw new Error(`Package bin was not built: ${binPath}`)
}

chmodSync(binPath, 0o755)
