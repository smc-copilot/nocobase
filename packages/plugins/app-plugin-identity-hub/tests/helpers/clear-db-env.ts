/** Drops agent-injected DB_* overrides before a test database is provisioned. */
export function clearDatabaseEnv(): void {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('DB_')) delete process.env[key];
  }
}

clearDatabaseEnv();
