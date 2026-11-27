/**
 * Normalizes an OA employee number / Meeting username for SSO matching (PRD §5):
 * trim Unicode whitespace, then case-fold with en-US lowercasing.
 */
export function normalizeEmployeeNo(value: string): string {
  return value.replace(/^\s+|\s+$/gu, '').toLocaleLowerCase('en-US');
}

export function employeeNosMatch(left: string, right: string): boolean {
  const a = normalizeEmployeeNo(left);
  const b = normalizeEmployeeNo(right);
  return a.length > 0 && a === b;
}
