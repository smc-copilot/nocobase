export interface OaPersonChip {
  fd_no: string;
  fd_name: string;
  fd_department: string;
}

export type OaPeopleSearchBy = 'name' | 'employeeNo';

export type OaPeopleSearchFn = (
  query: string,
  by?: OaPeopleSearchBy,
) => Promise<OaPersonChip[]>;

/** Chip / option label. Pass `nameMissing` when fd_name is empty so we never treat fd_no as a real name. */
export function oaPersonLabel(
  person: OaPersonChip,
  nameMissing = '姓名未提供',
): string {
  const name = person.fd_name.trim() || nameMissing;
  return person.fd_department
    ? `${name} (${person.fd_no}) ${person.fd_department}`
    : `${name} (${person.fd_no})`;
}

export function oaPersonChipText(
  person: OaPersonChip,
  nameMissing = '姓名未提供',
): string {
  return person.fd_name.trim() || `${nameMissing} (${person.fd_no})`;
}

export function uniqueOaPeople(rows: readonly OaPersonChip[]): OaPersonChip[] {
  const next = new Map<string, OaPersonChip>();
  for (const row of rows) {
    const fd_no = row.fd_no.trim();
    if (!fd_no || next.has(fd_no)) continue;
    next.set(fd_no, {
      fd_no,
      fd_name: row.fd_name.trim(),
      fd_department: row.fd_department.trim(),
    });
  }
  return [...next.values()];
}

export function oaPersonFrom(
  no: string | null | undefined,
  name?: string | null,
): OaPersonChip | null {
  const fd_no = no?.trim() ?? '';
  if (!fd_no) return null;
  return {
    fd_no,
    fd_name: name?.trim() ?? '',
    fd_department: '',
  };
}
