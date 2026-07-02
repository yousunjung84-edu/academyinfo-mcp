import { openDatabase, repositoryDatabaseError } from "./repository-db.js"
import { institutionRowSchema } from "./repository-schemas.js"
import type { SqliteDatabase } from "./repository-db.js"
import type { Institution, InstitutionSearchResult, RepositoryResult } from "./repository-types.js"

const maxSearchResults = 20

function allInstitutions(db: SqliteDatabase): readonly Institution[] {
  return db
    .prepare("SELECT * FROM institutions ORDER BY school_name, campus_name")
    .all()
    .map((row) => institutionRowSchema.parse(row))
}

function candidateData(
  candidates: readonly Institution[],
  totalMatched = candidates.length,
): Record<string, unknown> {
  return {
    candidates: candidates.map((candidate) => ({
      university_name: candidate.school_name,
      campus_name: candidate.campus_name,
      school_kind: candidate.school_kind,
      school_type: candidate.school_type,
      establishment_type: candidate.establishment_type,
      region_name: candidate.region_name,
    })),
    matched_count: totalMatched,
    returned_count: candidates.length,
    total_matched: totalMatched,
    truncated: totalMatched > candidates.length,
  }
}

export function searchInstitutions(query: string): RepositoryResult<InstitutionSearchResult> {
  const dbResult = openDatabase()

  if (!dbResult.ok) {
    return dbResult
  }

  try {
    const trimmed = query.trim()

    if (trimmed.length === 0) {
      return { ok: false, code: "ambiguous", data: candidateData([]) }
    }

    const institutions = allInstitutions(dbResult.value)
    const exactCombined = institutions.filter(
      (institution) => `${institution.school_name} ${institution.campus_name}` === trimmed,
    )
    const exactSchool = institutions.filter((institution) => institution.school_name === trimmed)
    const allMatches = exactCombined.length > 0
      ? exactCombined
      : exactSchool.length > 0
        ? exactSchool
        : institutions.filter((institution) => institution.school_name.includes(trimmed))
    const matches = allMatches.slice(0, maxSearchResults)

    if (allMatches.length === 0) {
      return { ok: false, code: "not_found", data: candidateData([]) }
    }

    return {
      ok: true,
      value: {
        matches,
        totalMatched: allMatches.length,
        truncated: allMatches.length > matches.length,
      },
    }
  } catch (error) {
    return repositoryDatabaseError(error)
  } finally {
    dbResult.value.close()
  }
}

export function resolveSingleInstitution(query: string): RepositoryResult<Institution> {
  const result = searchInstitutions(query)

  if (!result.ok) {
    return result
  }

  if (result.value.matches.length !== 1) {
    return {
      ok: false,
      code: "ambiguous",
      data: candidateData(result.value.matches, result.value.totalMatched),
    }
  }

  const institution = result.value.matches[0]
  return institution === undefined
    ? { ok: false, code: "not_found", data: candidateData([]) }
    : { ok: true, value: institution }
}
