import type { Institution } from "./repository.js"

export function candidateForInstitution(institution: Institution): Record<string, unknown> {
  return {
    university_name: institution.school_name,
    campus_name: institution.campus_name,
    school_kind: institution.school_kind,
    school_type: institution.school_type,
    establishment_type: institution.establishment_type,
    region_name: institution.region_name,
  }
}

export function repositoryErrorData(
  code: string,
  message: string,
  extraData: Record<string, unknown>,
): Record<string, unknown> {
  return {
    error: { code, message },
    ...extraData,
  }
}
