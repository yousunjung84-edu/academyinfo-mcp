const YAML_MAPPING_KEY_AT =
  /((?:(?:&[^\s[\]{},]+|!<[^>]*>|![^\s[\]{},]+)[ \t]+)*)("(?:\\.|[^"\\])*"|'(?:''|[^'])*'|\*[^\s:[\]{},]+|[^\s:[\]{},#]+)[ \t]*:/uy

const YAML_SIMPLE_ESCAPES: Readonly<Record<string, string>> = {
  "0": "\0",
  " ": " ",
  '"': '"',
  "/": "/",
  "\\": "\\",
  "_": "\u00a0",
  a: "\u0007",
  b: "\b",
  e: "\u001b",
  f: "\f",
  L: "\u2028",
  n: "\n",
  N: "\u0085",
  P: "\u2029",
  r: "\r",
  t: "\t",
  v: "\v",
}

function decodeYamlDoubleQuotedKey(token: string): string | null {
  const value = token.slice(1, -1)
  let decoded = ""
  for (let index = 0; index < value.length;) {
    if (value[index] !== "\\") {
      decoded += value[index]
      index += 1
      continue
    }

    const escape = value[index + 1]
    if (escape === undefined) return null
    const width = escape === "x" ? 2 : escape === "u" ? 4 : escape === "U" ? 8 : 0
    if (width > 0) {
      const digits = value.slice(index + 2, index + 2 + width)
      if (digits.length !== width || !/^[0-9A-Fa-f]+$/u.test(digits)) return null
      const codePoint = Number.parseInt(digits, 16)
      if (codePoint > 0x10ffff) return null
      decoded += String.fromCodePoint(codePoint)
      index += width + 2
      continue
    }

    const replacement = YAML_SIMPLE_ESCAPES[escape]
    if (replacement === undefined) return null
    decoded += replacement
    index += 2
  }
  return decoded
}
function yamlCodeBeforeComment(line: string): string {
  let quote: '"' | "'" | null = null
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    if (quote === '"') {
      if (character === "\\") index += 1
      else if (character === '"') quote = null
      continue
    }
    if (quote === "'") {
      if (character !== "'") continue
      if (line[index + 1] === "'") index += 1
      else quote = null
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      continue
    }
    if (character === "#" && (index === 0 || /[ \t]/u.test(line[index - 1] ?? ""))) {
      return line.slice(0, index).trimEnd()
    }
  }
  return line
}

function hasSemanticActionKeyOrUnsupportedYamlKey(line: string): boolean {
  const blockPrefix = line.match(/^[ \t]*(?:-[ \t]+)?/u)?.[0] ?? ""
  const candidates = new Set<number>([blockPrefix.length])
  let quote: '"' | "'" | null = null
  let codeEnd = line.length

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    if (quote === '"') {
      if (character === "\\") index += 1
      else if (character === '"') quote = null
      continue
    }
    if (quote === "'") {
      if (character !== "'") continue
      if (line[index + 1] === "'") index += 1
      else quote = null
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      continue
    }
    if (character === "#" && (index === 0 || /[ \t]/u.test(line[index - 1] ?? ""))) {
      codeEnd = index
      break
    }
    if (character !== "{" && character !== "[" && character !== ",") continue
    let candidate = index + 1
    while (/[ \t]/u.test(line[candidate] ?? "")) candidate += 1
    candidates.add(candidate)
  }

  const source = line.slice(0, codeEnd)
  for (const candidate of candidates) {
    if (candidate >= codeEnd) continue
    if (source[candidate] === "?" && /[ \t]|^$/u.test(source[candidate + 1] ?? "")) return true

    YAML_MAPPING_KEY_AT.lastIndex = candidate
    const match = YAML_MAPPING_KEY_AT.exec(source)
    const properties = match?.[1] ?? ""
    const token = match?.[2]
    if (token === undefined) continue
    if (properties.includes("&") || properties.includes("!!merge") || token.startsWith("*")) return true

    const key = token.startsWith('"')
      ? decodeYamlDoubleQuotedKey(token)
      : token.startsWith("'")
        ? token.slice(1, -1).replaceAll("''", "'")
        : token
    if (token === "<<" || properties.includes("tag:yaml.org,2002:merge") || key === "uses") return true
  }
  return false
}

export interface SemanticActionKeyLine {
  readonly index: number
  readonly line: string
}

export function semanticActionKeyLines(source: string): SemanticActionKeyLine[] {
  const matches: SemanticActionKeyLine[] = []
  let blockScalarKeyIndent: number | null = null

  for (const [index, line] of source.replace(/\r\n?/gu, "\n").split("\n").entries()) {
    const indent = line.match(/^[ \t]*/u)?.[0].length ?? 0
    if (blockScalarKeyIndent !== null) {
      if (/^[ \t]*$/u.test(line) || indent > blockScalarKeyIndent) continue
      blockScalarKeyIndent = null
    }

    if (hasSemanticActionKeyOrUnsupportedYamlKey(line)) matches.push({ index, line })
    const structuralLine = yamlCodeBeforeComment(line)
    if (/(?:^|[?:-][ \t]+)[|>](?:(?:[1-9][+-]?)|(?:[+-][1-9]?))?[ \t]*$/u.test(structuralLine)) {
      const trimmed = line.slice(indent)
      const sequencePrefix = trimmed.match(/^-[ \t]+/u)?.[0]
      blockScalarKeyIndent =
        sequencePrefix !== undefined && !/^-[ \t]+[|>]/u.test(trimmed)
          ? indent + sequencePrefix.length
          : indent
    }
  }
  return matches
}
