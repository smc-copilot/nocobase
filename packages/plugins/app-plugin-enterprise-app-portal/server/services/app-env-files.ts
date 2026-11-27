import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Reads application `.env` / `.env.local` the same way standalone scope does.
 * Credential lookups must not rely on `process.env` alone: dotenv values are
 * loaded into the app scope and are not automatically copied into the process.
 */
export function readAppEnvFiles(
  directories: readonly string[],
): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const directory of directories) {
    for (const name of ['.env', '.env.local'] as const) {
      const filePath = path.join(directory, name);
      if (!existsSync(filePath)) continue;
      Object.assign(merged, parseDotenv(readFileSync(filePath, 'utf8')));
    }
  }
  return merged;
}

/** File values first; non-empty process values win. */
export function mergeAppEnvWithProcess(
  fileEnv: Readonly<Record<string, string>>,
  processEnv: Readonly<Record<string, string | undefined>> = process.env,
): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...fileEnv };
  for (const [key, value] of Object.entries(processEnv)) {
    if (value !== undefined && value !== '') env[key] = value;
  }
  return env;
}

function parseDotenv(text: string): Record<string, string> {
  const output: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(
      /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*(.*?)\s*$/,
    );
    if (!match) continue;
    let value = match[2];
    const quote = value[0];
    if (
      (quote === '"' || quote === "'") &&
      value.endsWith(quote) &&
      value.length >= 2
    ) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, '');
    }
    output[match[1]] = value.replace(/\\n/g, '\n').replace(/\\r/g, '\r');
  }
  return output;
}
