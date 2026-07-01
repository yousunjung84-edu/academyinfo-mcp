import pino, { type DestinationStream, type Logger } from "pino"

export function createRuntimeLogger(
  stderrStream: DestinationStream = process.stderr,
): Logger {
  return pino(
    {
      base: null,
    },
    stderrStream,
  )
}
