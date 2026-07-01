import { z } from "zod"

const reservedKeyEnvSchema = z
  .object({
    ACADEMYINFO_SERVICE_KEY: z.string().optional(),
    DATA_GO_KR_SERVICE_KEY: z.string().optional(),
  })
  .passthrough()

type ServiceKeyStatus = "set" | "unset"

export type ReservedServiceKeyState = {
  readonly status: ServiceKeyStatus
}

export type AcademyinfoConfig = {
  readonly serviceKeys: {
    readonly academyInfo: ReservedServiceKeyState
    readonly dataGoKr: ReservedServiceKeyState
  }
}

function serviceKeyStatus(value: string | undefined): ReservedServiceKeyState {
  return { status: value?.trim() === "" || value === undefined ? "unset" : "set" }
}

export function loadConfig(
  env: Record<string, string | undefined> = process.env,
): AcademyinfoConfig {
  const parsedEnv = reservedKeyEnvSchema.parse(env)

  return {
    serviceKeys: {
      academyInfo: serviceKeyStatus(parsedEnv.ACADEMYINFO_SERVICE_KEY),
      dataGoKr: serviceKeyStatus(parsedEnv.DATA_GO_KR_SERVICE_KEY),
    },
  }
}
