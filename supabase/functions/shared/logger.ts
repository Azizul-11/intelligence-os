type LogLevel =
  | "INFO"
  | "WARN"
  | "ERROR"
  | "DEBUG";

function log(
  level: LogLevel,
  message: string,
  meta?: unknown,
) {
  const timestamp = new Date().toISOString();

  console.log(
    JSON.stringify({
      timestamp,
      level,
      message,
      meta,
    }),
  );
}

export const logger = {
  info(message: string, meta?: unknown) {
    log("INFO", message, meta);
  },

  warn(message: string, meta?: unknown) {
    log("WARN", message, meta);
  },

  error(message: string, meta?: unknown) {
    log("ERROR", message, meta);
  },

  debug(message: string, meta?: unknown) {
    log("DEBUG", message, meta);
  },
};