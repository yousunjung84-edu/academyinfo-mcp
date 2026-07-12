import { readFileSync } from "node:fs"
import { inflateRawSync } from "node:zlib"

const eocdSignature = 0x06054b50
const centralDirectorySignature = 0x02014b50
const localFileSignature = 0x04034b50

export type XlsxCell = {
  readonly worksheet_row: number
  readonly column_index: number
  readonly column_ref: string
  readonly raw_text: string
}

export type XlsxRow = {
  readonly rowNumber: number
  readonly values: readonly string[]
  readonly cells: readonly XlsxCell[]
}

export type XlsxSheet = {
  readonly sheetName: string
  readonly headerRowNumber: number
  readonly headers: readonly string[]
  readonly indexedHeaders: readonly XlsxCell[]
  readonly rows: readonly XlsxRow[]
  readonly blankRowsIgnored: number
}

type ZipEntry = {
  readonly name: string
  readonly data: Buffer
}

export function worksheetBlankV1(cell: Pick<XlsxCell, "raw_text"> | string | undefined): boolean {
  if (cell === undefined) {
    return true
  }

  const rawText = typeof cell === "string" ? cell : cell.raw_text
  return rawText.trim().length === 0
}

function columnReference(index: number, rowNumber: number): string {
  let value = index + 1
  let letters = ""

  while (value > 0) {
    const remainder = (value - 1) % 26
    letters = String.fromCharCode(65 + remainder) + letters
    value = Math.floor((value - 1) / 26)
  }

  return `${letters}${rowNumber}`
}
function decodeXmlText(value: string): string {
  return value.replace(
    /&(lt|gt|quot|apos|amp|#(?:[0-9]+|x[0-9A-Fa-f]+));/gu,
    (_match, entity: string) => {
      switch (entity) {
        case "lt": return "<"
        case "gt": return ">"
        case "quot": return "\""
        case "apos": return "'"
        case "amp": return "&"
        default: {
          const numeric = entity.slice(1)
          const codePoint = numeric.startsWith("x")
            ? Number.parseInt(numeric.slice(1), 16)
            : Number.parseInt(numeric, 10)
          return String.fromCodePoint(codePoint)
        }
      }
    },
  )
}

function readAttribute(attributes: string, name: string): string | undefined {
  const pattern = new RegExp(`(?:^|\\s)${name}=(?:"([^"]*)"|'([^']*)')`, "u")
  const match = pattern.exec(attributes)
  return match?.[1] ?? match?.[2]
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
    if (entries.has(entry.name)) {
      throw new Error(`Duplicate XLSX zip entry: ${entry.name}.`)
    }
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
const worksheetRelationshipTypes = new Set([
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet",
  "http://purl.oclc.org/ooxml/officeDocument/relationships/worksheet",
])

function safeWorksheetPartName(target: string): string {
  if (
    target.length === 0 ||
    target.includes("\\") ||
    target.includes("?") ||
    target.includes("#") ||
    target.startsWith("//")
  ) {
    throw new Error(`Unsafe XLSX worksheet relationship target: ${target || "empty"}.`)
  }

  let decodedTarget: string
  try {
    decodedTarget = decodeURIComponent(target)
  } catch {
    throw new Error(`Unsafe XLSX worksheet relationship target: ${target}.`)
  }

  if (
    decodedTarget.includes("?") ||
    decodedTarget.includes("#") ||
    decodedTarget.startsWith("//")
  ) {
    throw new Error(`Unsafe XLSX worksheet relationship target: ${target}.`)
  }

  const absolute = decodedTarget.startsWith("/")
  const targetSegments = (absolute ? decodedTarget.slice(1) : decodedTarget).split("/")
  if (
    targetSegments.some(
      (segment) =>
        segment.length === 0 ||
        segment === "." ||
        segment === ".." ||
        segment.includes(":") ||
        segment.includes("\\"),
    )
  ) {
    throw new Error(`Unsafe XLSX worksheet relationship target: ${target}.`)
  }

  return [...(absolute ? [] : ["xl"]), ...targetSegments].join("/")
}

function selectedWorksheet(
  workbookXml: string,
  relationshipsXml: string,
  expectedSheetName: string,
): { readonly sheetName: string; readonly partName: string } {
  const matchingSheets = [
    ...workbookXml.matchAll(/<(?:[A-Za-z_][\w.-]*:)?sheet\b([^>]*)\/?>/gu),
  ]
    .map((match) => match[1] ?? "")
    .filter(
      (attributes) =>
        decodeXmlText(readAttribute(attributes, "name") ?? "") === expectedSheetName,
    )

  if (matchingSheets.length !== 1) {
    throw new Error(
      `Expected sheet ${expectedSheetName} must occur exactly once; found ${matchingSheets.length}.`,
    )
  }

  const relationshipId = decodeXmlText(
    readAttribute(matchingSheets[0] ?? "", "r:id") ?? "",
  )
  if (relationshipId.length === 0) {
    throw new Error(`Expected sheet ${expectedSheetName} has no workbook relationship id.`)
  }

  const matchingRelationships = [
    ...relationshipsXml.matchAll(/<(?:[A-Za-z_][\w.-]*:)?Relationship\b([^>]*)\/?>/gu),
  ]
    .map((match) => match[1] ?? "")
    .filter(
      (attributes) => decodeXmlText(readAttribute(attributes, "Id") ?? "") === relationshipId,
    )

  if (matchingRelationships.length !== 1) {
    throw new Error(
      `Worksheet relationship ${relationshipId} must occur exactly once; found ${matchingRelationships.length}.`,
    )
  }

  const relationship = matchingRelationships[0] ?? ""
  const type = decodeXmlText(readAttribute(relationship, "Type") ?? "")
  const target = decodeXmlText(readAttribute(relationship, "Target") ?? "")
  const targetMode = readAttribute(relationship, "TargetMode")
  if (
    !worksheetRelationshipTypes.has(type) ||
    target.length === 0 ||
    (targetMode !== undefined && targetMode !== "Internal")
  ) {
    throw new Error(`Unsafe or invalid XLSX worksheet relationship ${relationshipId}.`)
  }

  return {
    sheetName: expectedSheetName,
    partName: safeWorksheetPartName(target),
  }
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

function parseCellReference(cellReference: string): {
  readonly columnIndex: number
  readonly rowNumber: number
} {
  const match = /^([A-Z]+)([1-9][0-9]*)$/u.exec(cellReference)

  if (match === null) {
    throw new Error(`Invalid XLSX cell reference: ${cellReference}.`)
  }

  let index = 0
  for (const char of match[1] ?? "") {
    index = index * 26 + char.charCodeAt(0) - 64
  }

  return { columnIndex: index - 1, rowNumber: Number(match[2]) }
}

function parseCellValue(cellXml: string, attributes: string, sharedStrings: readonly string[]): string {
  if (/<(?:[A-Za-z_][\w.-]*:)?f\b/u.test(cellXml)) {
    throw new Error("XLSX formulas are prohibited; cached formula values are not source authority.")
  }
  const type = readAttribute(attributes, "t")
  const rawValue = /<v>([\s\S]*?)<\/v>/u.exec(cellXml)?.[1]

  if (type === "s") {
    const sharedIndex = rawValue === undefined ? Number.NaN : Number(rawValue)
    const sharedValue = Number.isSafeInteger(sharedIndex) ? sharedStrings[sharedIndex] : undefined
    if (sharedValue === undefined) {
      throw new Error(`Invalid XLSX shared-string index: ${rawValue ?? "absent"}.`)
    }
    return sharedValue
  }

  if (type === "inlineStr") {
    return [...cellXml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gu)]
      .map((match) => decodeXmlText(match[1] ?? ""))
      .join("")
  }
  if (type !== undefined && type !== "n" && type !== "str") {
    throw new Error(`Unsupported XLSX cell semantic type: ${type}.`)
  }

  return decodeXmlText(rawValue ?? "")
}

function parseRows(sheetXml: string, sharedStrings: readonly string[]): readonly XlsxRow[] {
  const rows: XlsxRow[] = []
  const rowNumbers = new Set<number>()

  for (const rowMatch of sheetXml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/gu)) {
    const rowReference = readAttribute(rowMatch[1] ?? "", "r")
    if (rowReference === undefined) {
      throw new Error("XLSX worksheet row has no indexed reference.")
    }
    const rowNumber = Number(rowReference)

    if (!Number.isSafeInteger(rowNumber) || rowNumber <= 0 || rowNumbers.has(rowNumber)) {
      throw new Error(`Invalid or duplicate XLSX worksheet row index: ${rowNumber}.`)
    }
    rowNumbers.add(rowNumber)

    const values: string[] = []
    const cells: XlsxCell[] = []
    const columnIndexes = new Set<number>()

    for (const cellMatch of (rowMatch[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/gu)) {
      const attributes = cellMatch[1] ?? ""
      const reference = readAttribute(attributes, "r")

      if (reference === undefined) {
        throw new Error(`XLSX cell in worksheet row ${rowNumber} has no indexed reference.`)
      }

      const parsedReference = parseCellReference(reference)
      if (parsedReference.rowNumber !== rowNumber || columnIndexes.has(parsedReference.columnIndex)) {
        throw new Error(`Invalid or duplicate indexed XLSX cell: ${reference}.`)
      }
      columnIndexes.add(parsedReference.columnIndex)

      const rawText = parseCellValue(cellMatch[0], attributes, sharedStrings)
      values[parsedReference.columnIndex] = rawText
      cells.push({
        worksheet_row: rowNumber,
        column_index: parsedReference.columnIndex,
        column_ref: reference,
        raw_text: rawText,
      })
    }

    cells.sort((left, right) => left.column_index - right.column_index)
    rows.push({
      rowNumber,
      values: values.map((value) => value ?? ""),
      cells,
    })
  }

  rows.sort((left, right) => left.rowNumber - right.rowNumber)
  return rows
}

function worksheetRowIsBlank(row: XlsxRow): boolean {
  return row.cells.every((cell) => worksheetBlankV1(cell))
}

export function readXlsxSheet(filePath: string, expectedSheetName: string): XlsxSheet {
  const entries = readZipEntries(filePath)
  const workbookXml = requiredText(entries, "xl/workbook.xml")
  const selection = selectedWorksheet(
    workbookXml,
    requiredText(entries, "xl/_rels/workbook.xml.rels"),
    expectedSheetName,
  )
  const sheetName = selection.sheetName
  const sharedStringsData = entries.get("xl/sharedStrings.xml")
  const sharedStrings =
    sharedStringsData === undefined
      ? []
      : parseSharedStrings(sharedStringsData.toString("utf8"))
  const worksheetRows = parseRows(
    requiredText(entries, selection.partName),
    sharedStrings,
  )

  const headerRowIndex = worksheetRows.findIndex((row) => !worksheetRowIsBlank(row))
  const headerRow = headerRowIndex < 0 ? undefined : worksheetRows[headerRowIndex]
  if (headerRow === undefined) {
    throw new Error("XLSX sheet has no nonblank header row.")
  }

  const lastHeaderCell = [...headerRow.cells].reverse().find((cell) => !worksheetBlankV1(cell))
  const headerWidth = (lastHeaderCell?.column_index ?? -1) + 1
  const indexedHeaders: XlsxCell[] = []
  const headers: string[] = []

  for (let columnIndex = 0; columnIndex < headerWidth; columnIndex += 1) {
    const headerCell = headerRow.cells.find((cell) => cell.column_index === columnIndex)
    if (headerCell === undefined || worksheetBlankV1(headerCell)) {
      throw new Error(
        `Header row ${headerRow.rowNumber} has an absent or blank header at ${columnReference(columnIndex, headerRow.rowNumber)}.`,
      )
    }
    indexedHeaders.push(headerCell)
    headers.push(headerCell.raw_text)
  }
  const normalizedHeaders = headers.map((header) =>
    header.replace(/^\uFEFF/u, "").replaceAll("\r\n", "\n"),
  )

  const rows: XlsxRow[] = []
  for (const row of worksheetRows.slice(headerRowIndex + 1)) {
    if (worksheetRowIsBlank(row)) {
      continue
    }
    const normalizedCandidate = headers.map((_, columnIndex) =>
      (row.values[columnIndex] ?? "").replace(/^\uFEFF/u, "").replaceAll("\r\n", "\n"),
    )
    if (normalizedCandidate.every((value, index) => value === normalizedHeaders[index])) {
      throw new Error(`Worksheet contains a second header row at row ${row.rowNumber}.`)
    }

    const beyondHeader = row.cells.find(
      (cell) => cell.column_index >= headerWidth && !worksheetBlankV1(cell),
    )
    if (beyondHeader !== undefined) {
      throw new Error(
        `Nonblank cell ${beyondHeader.column_ref} is beyond the indexed header width ${headerWidth}.`,
      )
    }
    rows.push(row)
  }
  const lastRepresentedRow = worksheetRows.at(-1)?.rowNumber ?? headerRow.rowNumber
  const blankRowsIgnored = lastRepresentedRow - rows.length - 1

  return {
    sheetName,
    headerRowNumber: headerRow.rowNumber,
    headers,
    indexedHeaders,
    rows,
    blankRowsIgnored,
  }
}
