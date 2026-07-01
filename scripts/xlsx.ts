import { readFileSync } from "node:fs"
import { inflateRawSync } from "node:zlib"

const eocdSignature = 0x06054b50
const centralDirectorySignature = 0x02014b50
const localFileSignature = 0x04034b50

export type XlsxRow = {
  readonly rowNumber: number
  readonly values: readonly string[]
}

export type XlsxSheet = {
  readonly sheetName: string
  readonly headers: readonly string[]
  readonly rows: readonly XlsxRow[]
}

type ZipEntry = {
  readonly name: string
  readonly data: Buffer
}

function decodeXmlText(value: string): string {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&")
    .replace(/&#(\d+);/gu, (_match, code: string) => String.fromCodePoint(Number(code)))
}

function readAttribute(attributes: string, name: string): string | undefined {
  const pattern = new RegExp(`(?:^|\\s)${name}="([^"]*)"`, "u")
  return pattern.exec(attributes)?.[1]
}

function findEndOfCentralDirectory(archive: Buffer): number {
  const minimumOffset = Math.max(0, archive.length - 65_557)

  for (let offset = archive.length - 22; offset >= minimumOffset; offset -= 1) {
    if (archive.readUInt32LE(offset) === eocdSignature) {
      return offset
    }
  }

  throw new Error("XLSX zip end-of-central-directory record was not found.")
}

function inflateEntry(archive: Buffer, centralOffset: number): { readonly entry: ZipEntry; readonly next: number } {
  if (archive.readUInt32LE(centralOffset) !== centralDirectorySignature) {
    throw new Error("Invalid XLSX central directory entry.")
  }

  const compressionMethod = archive.readUInt16LE(centralOffset + 10)
  const compressedSize = archive.readUInt32LE(centralOffset + 20)
  const fileNameLength = archive.readUInt16LE(centralOffset + 28)
  const extraLength = archive.readUInt16LE(centralOffset + 30)
  const commentLength = archive.readUInt16LE(centralOffset + 32)
  const localHeaderOffset = archive.readUInt32LE(centralOffset + 42)
  const nameStart = centralOffset + 46
  const name = archive.subarray(nameStart, nameStart + fileNameLength).toString("utf8")
  const next = nameStart + fileNameLength + extraLength + commentLength

  if (archive.readUInt32LE(localHeaderOffset) !== localFileSignature) {
    throw new Error(`Invalid XLSX local file header for ${name}.`)
  }

  const localNameLength = archive.readUInt16LE(localHeaderOffset + 26)
  const localExtraLength = archive.readUInt16LE(localHeaderOffset + 28)
  const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength
  const compressed = archive.subarray(dataStart, dataStart + compressedSize)
  const data =
    compressionMethod === 0
      ? Buffer.from(compressed)
      : compressionMethod === 8
        ? inflateRawSync(compressed)
        : undefined

  if (data === undefined) {
    throw new Error(`Unsupported XLSX zip compression method ${compressionMethod} for ${name}.`)
  }

  return { entry: { name, data }, next }
}

function readZipEntries(filePath: string): ReadonlyMap<string, Buffer> {
  const archive = readFileSync(filePath)
  const eocdOffset = findEndOfCentralDirectory(archive)
  const entryCount = archive.readUInt16LE(eocdOffset + 10)
  let centralOffset = archive.readUInt32LE(eocdOffset + 16)
  const entries = new Map<string, Buffer>()

  for (let index = 0; index < entryCount; index += 1) {
    const { entry, next } = inflateEntry(archive, centralOffset)
    entries.set(entry.name, entry.data)
    centralOffset = next
  }

  return entries
}

function requiredText(entries: ReadonlyMap<string, Buffer>, name: string): string {
  const data = entries.get(name)

  if (data === undefined) {
    throw new Error(`Required XLSX entry missing: ${name}.`)
  }

  return data.toString("utf8")
}

function parseSharedStrings(xml: string): readonly string[] {
  const strings: string[] = []
  const itemPattern = /<si\b[^>]*>([\s\S]*?)<\/si>/gu

  for (const item of xml.matchAll(itemPattern)) {
    const body = item[1] ?? ""
    const parts = [...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gu)].map((match) =>
      decodeXmlText(match[1] ?? ""),
    )
    strings.push(parts.join(""))
  }

  return strings
}

function columnIndex(cellReference: string): number {
  const letters = cellReference.replace(/\d/gu, "")
  let index = 0

  for (const char of letters) {
    index = index * 26 + char.charCodeAt(0) - 64
  }

  return index - 1
}

function parseCellValue(cellXml: string, attributes: string, sharedStrings: readonly string[]): string {
  const type = readAttribute(attributes, "t")
  const rawValue = /<v>([\s\S]*?)<\/v>/u.exec(cellXml)?.[1]

  if (type === "s") {
    const sharedIndex = rawValue === undefined ? undefined : Number(rawValue)
    return sharedIndex === undefined ? "" : sharedStrings[sharedIndex] ?? ""
  }

  if (type === "inlineStr") {
    return decodeXmlText(/<t\b[^>]*>([\s\S]*?)<\/t>/u.exec(cellXml)?.[1] ?? "")
  }

  return decodeXmlText(rawValue ?? "")
}

function parseRows(sheetXml: string, sharedStrings: readonly string[]): readonly XlsxRow[] {
  const rows: XlsxRow[] = []

  for (const rowMatch of sheetXml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/gu)) {
    const rowNumber = Number(readAttribute(rowMatch[1] ?? "", "r") ?? rows.length + 1)
    const values: string[] = []

    for (const cellMatch of (rowMatch[2] ?? "").matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/gu)) {
      const attributes = cellMatch[1] ?? ""
      const reference = readAttribute(attributes, "r")

      if (reference === undefined) {
        continue
      }

      values[columnIndex(reference)] = parseCellValue(cellMatch[0], attributes, sharedStrings)
    }

    rows.push({ rowNumber, values: values.map((value) => value ?? "") })
  }

  return rows
}

function firstSheetName(workbookXml: string): string {
  const sheetAttributes = /<sheet\b([^>]*)\/?>/u.exec(workbookXml)?.[1] ?? ""
  return decodeXmlText(readAttribute(sheetAttributes, "name") ?? "NotVerified")
}

export function readXlsxSheet(filePath: string, expectedSheetName: string): XlsxSheet {
  const entries = readZipEntries(filePath)
  const sheetName = firstSheetName(requiredText(entries, "xl/workbook.xml"))
  const sharedStrings = parseSharedStrings(requiredText(entries, "xl/sharedStrings.xml"))
  const rows = parseRows(requiredText(entries, "xl/worksheets/sheet1.xml"), sharedStrings)
  const headerRow = rows[0]

  if (sheetName !== expectedSheetName) {
    throw new Error(`Expected sheet ${expectedSheetName}, found ${sheetName}.`)
  }

  if (headerRow === undefined) {
    throw new Error("XLSX sheet has no header row.")
  }

  return {
    sheetName,
    headers: headerRow.values,
    rows: rows.slice(1),
  }
}
