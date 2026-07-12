const plainDecimalPattern = /^[0-9]+(?:\.[0-9]+)?$/u
const groupedDecimalPattern = /^[1-9][0-9]{0,2}(?:,[0-9]{3})+(?:\.[0-9]+)?$/u

export type DecimalClassification =
  | {
      readonly kind: "missing"
      readonly marker: "empty" | "dash"
      readonly raw_text: string
      readonly trimmed_text: string
    }
  | {
      readonly kind: "numeric"
      readonly raw_text: string
      readonly trimmed_text: string
      readonly canonical_value: string
      readonly value: number
    }

export type DecimalRejectionReason = "invalid_grammar" | "not_finite" | "precision_loss"

export type DecimalParseResult =
  | DecimalClassification
  | {
      readonly kind: "invalid"
      readonly reason: DecimalRejectionReason
      readonly raw_text: string
      readonly trimmed_text: string
    }

function numberToPlainDecimal(value: number): string {
  if (value === 0) {
    return "0"
  }

  const shortest = value.toString()
  if (!/[eE]/u.test(shortest)) {
    return shortest
  }

  const match = /^([0-9]+)(?:\.([0-9]+))?[eE]([+-]?[0-9]+)$/u.exec(shortest)
  if (match === null) {
    throw new Error(`Unable to expand finite decimal Number ${shortest}.`)
  }

  const integer = match[1] ?? ""
  const fraction = match[2] ?? ""
  const exponent = Number(match[3])
  const digits = integer + fraction
  const decimalPosition = integer.length + exponent

  if (decimalPosition <= 0) {
    return `0.${"0".repeat(-decimalPosition)}${digits}`
  }
  if (decimalPosition >= digits.length) {
    return `${digits}${"0".repeat(decimalPosition - digits.length)}`
  }
  return `${digits.slice(0, decimalPosition)}.${digits.slice(decimalPosition)}`
}

function canonicalDecimal(trimmedText: string): string {
  const ungrouped = trimmedText.replaceAll(",", "")
  const [rawInteger = "", rawFraction] = ungrouped.split(".")
  const integer = rawInteger.replace(/^0+(?=[0-9])/u, "")
  const fraction = rawFraction?.replace(/0+$/u, "")

  if (fraction === undefined || fraction.length === 0) {
    return integer
  }
  return `${integer}.${fraction}`
}

export function parseDecimalCell(rawText: string): DecimalParseResult {
  const trimmedText = rawText.trim()

  if (trimmedText.length === 0) {
    return { kind: "missing", marker: "empty", raw_text: rawText, trimmed_text: trimmedText }
  }
  if (trimmedText === "-") {
    return { kind: "missing", marker: "dash", raw_text: rawText, trimmed_text: trimmedText }
  }
  if (!plainDecimalPattern.test(trimmedText) && !groupedDecimalPattern.test(trimmedText)) {
    return { kind: "invalid", reason: "invalid_grammar", raw_text: rawText, trimmed_text: trimmedText }
  }

  const canonicalValue = canonicalDecimal(trimmedText)
  const value = Number(canonicalValue)
  if (!Number.isFinite(value) || value < 0) {
    return { kind: "invalid", reason: "not_finite", raw_text: rawText, trimmed_text: trimmedText }
  }

  const shortestPlainDecimal = numberToPlainDecimal(value)
  if (
    shortestPlainDecimal !== canonicalValue ||
    Number(shortestPlainDecimal) !== value
  ) {
    return { kind: "invalid", reason: "precision_loss", raw_text: rawText, trimmed_text: trimmedText }
  }

  return {
    kind: "numeric",
    raw_text: rawText,
    trimmed_text: trimmedText,
    canonical_value: canonicalValue,
    value,
  }
}

export function classifyDecimalCell(rawText: string, location = "value"): DecimalClassification {
  const parsed = parseDecimalCell(rawText)
  if (parsed.kind === "invalid") {
    throw new Error(
      `NO-GO: ${location} has ${parsed.reason}: ${JSON.stringify(parsed.raw_text)}.`,
    )
  }
  return parsed
}
