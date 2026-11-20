import { useApiClient, useToaster } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { ChevronDown, ChevronRight, Folder } from 'lucide-react';
import { useCallback, useMemo, useState, type ReactElement } from 'react';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Alert, AlertDescription, AlertTitle } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import { Label } from '#components/ui/label';
import { cn } from 'cn';
import { useSettingsData } from './hooks.js';

/** Keep the group tree and user list the same viewport height. */
const LIST_SCROLL_CLASS =
  'h-[70vh] max-h-[70vh] overflow-auto rounded-md border';

interface CasdoorUser {
  readonly id: string;
  readonly owner: string;
  readonly name: string;
  readonly displayName: string;
  readonly email: string;
  readonly groups: readonly string[];
  readonly isForbidden: boolean;
  readonly isDeleted: boolean;
}

interface CasdoorGroup {
  readonly id: string;
  readonly owner: string;
  readonly name: string;
  readonly displayName: string;
  readonly parentId: string;
  readonly parentName: string;
  readonly isTopGroup: boolean;
  readonly haveChildren: boolean;
  readonly type: string;
  readonly isEnabled: boolean;
}

interface CasdoorApplication {
  readonly name: string;
  readonly displayName: string;
  readonly organization: string;
  readonly owner: string;
}

interface ApplicationGrant {
  readonly applicationName: string;
  readonly permissionName: string;
  readonly source: 'direct' | 'inherited';
  readonly enforced: boolean;
  readonly viaGroups: readonly string[];
  readonly viaRoles: readonly string[];
  readonly viaUsers: readonly string[];
}

interface GroupTreeNode {
  readonly key: string;
  readonly label: string;
  readonly group?: CasdoorGroup;
  readonly groupName: string;
  readonly children: GroupTreeNode[];
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function directGrantIntersection(
  users: readonly CasdoorUser[],
  grantsByUser: ReadonlyMap<string, readonly ApplicationGrant[]>,
): ReadonlySet<string> {
  if (users.length === 0) return new Set();
  const sets = users.map((user) => {
    const grants = grantsByUser.get(user.id) ?? [];
    return new Set(
      grants
        .filter((grant) => grant.source === 'direct')
        .map((grant) => grant.applicationName),
    );
  });
  const intersection = new Set(sets[0]);
  for (const set of sets.slice(1)) {
    for (const name of [...intersection]) {
      if (!set.has(name)) intersection.delete(name);
    }
  }
  return intersection;
}

function collectGroupNames(node: GroupTreeNode): string[] {
  const names = [node.groupName];
  for (const child of node.children) {
    names.push(...collectGroupNames(child));
  }
  return [...new Set(names)];
}

function buildGroupTree(groups: readonly CasdoorGroup[]): GroupTreeNode[] {
  const byDisplay = new Map<string, CasdoorGroup[]>();
  for (const group of groups) {
    const key = group.displayName || group.name;
    const bucket = byDisplay.get(key) ?? [];
    bucket.push(group);
    byDisplay.set(key, bucket);
  }

  const resolveParent = (group: CasdoorGroup): CasdoorGroup | undefined => {
    const key = group.parentId || group.parentName;
    if (!key) return undefined;
    const candidates = byDisplay.get(key) ?? [];
    if (candidates.length === 1) return candidates[0];
    if (candidates.length > 1) {
      return candidates.find((item) => item.name === key) ?? candidates[0];
    }
    return groups.find((item) => item.name === key);
  };

  type MutableNode = {
    key: string;
    label: string;
    group?: CasdoorGroup;
    groupName: string;
    children: MutableNode[];
  };

  const nodes = new Map<string, MutableNode>();
  const ensureSynthetic = (label: string): MutableNode => {
    const key = `synthetic:${label}`;
    let node = nodes.get(key);
    if (!node) {
      node = { key, label, groupName: label, children: [] };
      nodes.set(key, node);
    }
    return node;
  };

  for (const group of groups) {
    nodes.set(group.id, {
      key: group.id,
      label: group.displayName || group.name,
      group,
      groupName: group.name,
      children: [],
    });
  }

  const attached = new Set<string>();
  for (const group of groups) {
    const node = nodes.get(group.id)!;
    const parent = resolveParent(group);
    if (parent && parent.id !== group.id) {
      nodes.get(parent.id)?.children.push(node);
      attached.add(group.id);
      continue;
    }
    const parentLabel = (group.parentId || group.parentName).trim();
    if (parentLabel && parentLabel !== group.displayName) {
      ensureSynthetic(parentLabel).children.push(node);
      attached.add(group.id);
    }
  }

  const roots: MutableNode[] = [];
  for (const group of groups) {
    if (!attached.has(group.id)) roots.push(nodes.get(group.id)!);
  }
  for (const node of nodes.values()) {
    if (node.key.startsWith('synthetic:') && node.children.length > 0) {
      roots.push(node);
    }
  }

  const sortTree = (list: MutableNode[]) => {
    list.sort((left, right) => left.label.localeCompare(right.label, 'zh'));
    for (const child of list) sortTree(child.children);
  };
  sortTree(roots);
  return roots;
}

function GroupTreeItem({
  node,
  depth,
  selectedKey,
  expanded,
  onToggle,
  onSelect,
}: {
  readonly node: GroupTreeNode;
  readonly depth: number;
  readonly selectedKey?: string;
  readonly expanded: ReadonlySet<string>;
  readonly onToggle: (key: string) => void;
  readonly onSelect: (node: GroupTreeNode) => void;
}): ReactElement {
  const hasChildren = node.children.length > 0;
  const isOpen = expanded.has(node.key);
  const selected = selectedKey === node.key;
  return (
    <li>
      <div
        className={cn(
          'flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-sm',
          selected ? 'bg-primary text-primary-foreground' : 'hover:bg-muted/70',
        )}
        style={{ paddingLeft: `${0.5 + depth * 0.85}rem` }}
      >
        <button
          type='button'
          className='inline-flex size-5 shrink-0 items-center justify-center'
          disabled={!hasChildren}
          onClick={(event) => {
            event.stopPropagation();
            if (hasChildren) onToggle(node.key);
          }}
          aria-label={isOpen ? 'Collapse' : 'Expand'}
        >
          {hasChildren ? (
            isOpen ? (
              <ChevronDown className='size-3.5' />
            ) : (
              <ChevronRight className='size-3.5' />
            )
          ) : (
            <span className='size-3.5' />
          )}
        </button>
        <button
          type='button'
          className='flex min-w-0 flex-1 items-center gap-2 text-left'
          onClick={() => onSelect(node)}
        >
          <Folder className='size-3.5 shrink-0 opacity-80' />
          <span className='truncate'>{node.label}</span>
        </button>
      </div>
      {hasChildren && isOpen ? (
        <ul>
          {node.children.map((child) => (
            <GroupTreeItem
              key={child.key}
              node={child}
              depth={depth + 1}
              selectedKey={selectedKey}
              expanded={expanded}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export default function PortalCasdoorGrantsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const canConfigure = useCan({
    resource: { type: 'settings', id: 'enterpriseAppPortal.casdoor' },
    action: 'configure',
  }).can;

  const groupsQuery = useSettingsData<{
    data: readonly CasdoorGroup[];
    meta: { total: number };
  }>('enterpriseAppPortal/admin/casdoor/groups');
  const appsQuery = useSettingsData<{
    data: readonly CasdoorApplication[];
    meta: { total: number };
  }>('enterpriseAppPortal/admin/casdoor/applications?page=1&pageSize=100');

  const groups = useMemo(
    () => groupsQuery.data?.data ?? [],
    [groupsQuery.data?.data],
  );
  const applications = useMemo(
    () => appsQuery.data?.data ?? [],
    [appsQuery.data?.data],
  );

  const [selectedNode, setSelectedNode] = useState<GroupTreeNode>();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [includeSubDepartments, setIncludeSubDepartments] = useState(false);
  const [onlyUnauthorized, setOnlyUnauthorized] = useState(false);
  const [displayNameQuery, setDisplayNameQuery] = useState('');
  const [allUsers, setAllUsers] = useState<readonly CasdoorUser[]>([]);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [grantsByUser, setGrantsByUser] = useState<
    ReadonlyMap<string, readonly ApplicationGrant[]>
  >(() => new Map());
  const [directEdit, setDirectEdit] = useState<{
    readonly selectionKey: string;
    readonly names: ReadonlySet<string>;
  }>();
  const [busy, setBusy] = useState<string>();
  const [actionError, setActionError] = useState<string>();

  const listError =
    groupsQuery.error instanceof Error
      ? groupsQuery.error.message
      : appsQuery.error instanceof Error
        ? appsQuery.error.message
        : undefined;
  const error = actionError ?? listError;

  const tree = useMemo(() => buildGroupTree(groups), [groups]);
  const effectiveExpanded = useMemo(() => {
    if (expanded.size > 0) return expanded;
    if (tree[0]) return new Set([tree[0].key]);
    return expanded;
  }, [expanded, tree]);

  const appLabel = useMemo(() => {
    const map = new Map<string, string>();
    for (const app of applications) {
      map.set(app.name, app.displayName || app.name);
    }
    return map;
  }, [applications]);

  const userHasAuthorizedApps = useCallback(
    (userId: string): boolean | undefined => {
      const grants = grantsByUser.get(userId);
      if (!grants) return undefined;
      return grants.some(
        (grant) => grant.enforced || grant.source === 'direct',
      );
    },
    [grantsByUser],
  );

  const visibleUsers = useMemo(() => {
    const needle = displayNameQuery.trim().toLowerCase();
    return allUsers.filter((user) => {
      if (onlyUnauthorized && userHasAuthorizedApps(user.id) !== false) {
        return false;
      }
      if (!needle) return true;
      const label = (user.displayName || user.name).toLowerCase();
      return label.includes(needle);
    });
  }, [allUsers, displayNameQuery, onlyUnauthorized, userHasAuthorizedApps]);

  const selectedUsers = useMemo(
    () => allUsers.filter((user) => selectedIds.has(user.id)),
    [allUsers, selectedIds],
  );

  const selectionKey = useMemo(
    () => [...selectedIds].sort().join('\0'),
    [selectedIds],
  );

  const baselineDirectNames = useMemo(
    () => directGrantIntersection(selectedUsers, grantsByUser),
    [selectedUsers, grantsByUser],
  );

  const directNames =
    directEdit?.selectionKey === selectionKey
      ? directEdit.names
      : baselineDirectNames;

  const allVisibleSelected =
    visibleUsers.length > 0 &&
    visibleUsers.every((user) => selectedIds.has(user.id));

  const fetchUsersForGroup = useCallback(
    async (groupName: string): Promise<readonly CasdoorUser[]> => {
      const collected: CasdoorUser[] = [];
      let page = 1;
      let total = Number.POSITIVE_INFINITY;
      while (collected.length < total && page <= 20) {
        const result = await api.request<{
          data: readonly CasdoorUser[];
          meta: { total: number };
        }>({
          path: 'enterpriseAppPortal/admin/casdoor/users',
          method: 'GET',
          query: { page, pageSize: 100, groupName },
        });
        const rows = result.data ?? [];
        collected.push(...rows);
        total = result.meta?.total ?? rows.length;
        if (rows.length === 0) break;
        page += 1;
      }
      return collected;
    },
    [api],
  );

  const fetchGrantsForUser = useCallback(
    async (user: CasdoorUser): Promise<readonly ApplicationGrant[]> => {
      const result = await api.request<{
        data: { grants: readonly ApplicationGrant[] };
      }>({
        path: `enterpriseAppPortal/admin/users/${encodeURIComponent(user.owner)}/${encodeURIComponent(user.name)}/applicationGrants`,
        method: 'GET',
      });
      return result.data?.grants ?? [];
    },
    [api],
  );

  const refreshGrantsForUsers = useCallback(
    async (users: readonly CasdoorUser[]) => {
      if (users.length === 0) return;
      const chunkSize = 5;
      const collected: { id: string; grants: readonly ApplicationGrant[] }[] =
        [];
      for (let index = 0; index < users.length; index += chunkSize) {
        const chunk = users.slice(index, index + chunkSize);
        const results = await Promise.all(
          chunk.map(async (user) => {
            try {
              return {
                id: user.id,
                grants: await fetchGrantsForUser(user),
              };
            } catch {
              return { id: user.id, grants: [] as ApplicationGrant[] };
            }
          }),
        );
        collected.push(...results);
      }
      setGrantsByUser((current) => {
        const next = new Map(current);
        for (const row of collected) next.set(row.id, row.grants);
        return next;
      });
    },
    [fetchGrantsForUser],
  );

  const loadUsersWithGrants = useCallback(
    async (node: GroupTreeNode, withChildren: boolean) => {
      setBusy('users');
      setActionError(undefined);
      try {
        const groupNames = withChildren
          ? collectGroupNames(node)
          : [node.groupName];
        const batches = await Promise.all(
          groupNames.map((groupName) => fetchUsersForGroup(groupName)),
        );
        const byId = new Map<string, CasdoorUser>();
        for (const batch of batches) {
          for (const user of batch) {
            if (!user.email?.trim()) continue;
            byId.set(user.id, user);
          }
        }
        const merged = [...byId.values()].sort((left, right) =>
          (left.displayName || left.name).localeCompare(
            right.displayName || right.name,
            'zh',
          ),
        );
        setAllUsers(merged);
        setDisplayNameQuery('');
        setSelectedIds(new Set());
        setDirectEdit(undefined);
        await refreshGrantsForUsers(merged);
      } catch (loadError) {
        setAllUsers([]);
        setActionError(errorMessage(loadError, t('portal.usersFailed')));
      } finally {
        setBusy(undefined);
      }
    },
    [fetchUsersForGroup, refreshGrantsForUsers, t],
  );

  const selectGroup = (node: GroupTreeNode) => {
    setSelectedNode(node);
    void loadUsersWithGrants(node, includeSubDepartments);
  };

  const toggleIncludeSubDepartments = (checked: boolean) => {
    setIncludeSubDepartments(checked);
    if (selectedNode) {
      void loadUsersWithGrants(selectedNode, checked);
    }
  };

  const toggleExpand = (key: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleUser = (userId: string, checked: boolean) => {
    setDirectEdit(undefined);
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(userId);
      else next.delete(userId);
      return next;
    });
  };

  const toggleVisibleUsers = (checked: boolean) => {
    setDirectEdit(undefined);
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const user of visibleUsers) {
        if (checked) next.add(user.id);
        else next.delete(user.id);
      }
      return next;
    });
  };

  const toggleDirect = (applicationName: string, checked: boolean) => {
    const next = new Set(directNames);
    if (checked) next.add(applicationName);
    else next.delete(applicationName);
    setDirectEdit({ selectionKey, names: next });
  };

  const ensureUnauthorizedGrants = () => {
    const missing = allUsers.filter((user) => !grantsByUser.has(user.id));
    if (missing.length > 0) void refreshGrantsForUsers(missing);
  };

  const save = async () => {
    if (selectedUsers.length === 0 || !canConfigure) return;
    setBusy('save');
    setActionError(undefined);
    try {
      const applicationNames = [...directNames];
      const nextMap = new Map(grantsByUser);
      for (const user of selectedUsers) {
        const result = await api.request<{
          data: { grants: readonly ApplicationGrant[] };
        }>({
          path: `enterpriseAppPortal/admin/users/${encodeURIComponent(user.owner)}/${encodeURIComponent(user.name)}/applicationGrants`,
          method: 'PUT',
          json: { applicationNames },
        });
        nextMap.set(user.id, result.data?.grants ?? []);
      }
      setGrantsByUser(nextMap);
      setDirectEdit(undefined);
      toaster.show({
        type: 'success',
        title:
          selectedUsers.length > 1
            ? t('portal.grantsBatchSaved', { count: selectedUsers.length })
            : t('portal.grantsSaved'),
      });
    } catch (saveError) {
      const message = errorMessage(saveError, t('portal.grantsFailed'));
      setActionError(message);
      toaster.show({ type: 'error', title: message });
    } finally {
      setBusy(undefined);
    }
  };

  const formatAuthorized = (userId: string): string => {
    const grants = grantsByUser.get(userId);
    if (!grants) return t('settings.loading');
    const names = grants
      .filter((grant) => grant.enforced || grant.source === 'direct')
      .map(
        (grant) => appLabel.get(grant.applicationName) ?? grant.applicationName,
      );
    return names.length > 0 ? names.join(', ') : '—';
  };

  const soleSelected =
    selectedUsers.length === 1 ? selectedUsers[0] : undefined;
  const grantPanelTitle =
    selectedUsers.length === 0
      ? t('portal.selectUser')
      : soleSelected
        ? t('portal.grantsFor', {
            name: soleSelected.displayName || soleSelected.name,
          })
        : t('portal.grantsBatchFor', { count: selectedUsers.length });

  return (
    <PageContainer className='space-y-6'>
      <PageHeader
        title={t('settings.portalCasdoorGrants')}
        description={t('settings.portalCasdoorGrantsDescription')}
      />
      <Alert>
        <AlertTitle>{t('portal.grantsHintTitle')}</AlertTitle>
        <AlertDescription>{t('portal.grantsHintBody')}</AlertDescription>
      </Alert>
      {error ? (
        <Alert variant='destructive'>
          <AlertTitle>{t('portal.connectionErrorTitle')}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className='grid gap-4 xl:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)_minmax(16rem,22rem)]'>
        <section className='space-y-3 rounded-lg border p-3'>
          <div className='flex items-center justify-between gap-2 px-1'>
            <h2 className='text-base font-medium'>{t('portal.groupTree')}</h2>
            <Button
              variant='outline'
              size='sm'
              disabled={busy !== undefined || groupsQuery.loading}
              onClick={() => groupsQuery.reload()}
            >
              {t('portal.refreshGroups')}
            </Button>
          </div>
          <div className={LIST_SCROLL_CLASS}>
            {tree.length === 0 ? (
              <p className='p-3 text-sm text-muted-foreground'>
                {groupsQuery.loading
                  ? t('settings.loading')
                  : t('portal.noGroups')}
              </p>
            ) : (
              <ul className='p-1'>
                {tree.map((node) => (
                  <GroupTreeItem
                    key={node.key}
                    node={node}
                    depth={0}
                    selectedKey={selectedNode?.key}
                    expanded={effectiveExpanded}
                    onToggle={toggleExpand}
                    onSelect={selectGroup}
                  />
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className='flex min-h-0 flex-col space-y-3 rounded-lg border p-4'>
          <div className='flex items-start justify-between gap-3'>
            <div>
              <h2 className='text-base font-medium'>
                {selectedNode ? selectedNode.label : t('portal.selectGroup')}
              </h2>
              {selectedNode ? (
                <p className='text-sm text-muted-foreground'>
                  {t('portal.memberCount', { count: visibleUsers.length })}
                  {selectedIds.size > 0
                    ? ` · ${t('portal.selectedCount', { count: selectedIds.size })}`
                    : ''}
                </p>
              ) : (
                <p className='text-sm text-muted-foreground'>
                  {t('portal.selectGroupHint')}
                </p>
              )}
            </div>
            {selectedNode ? (
              <div className='flex shrink-0 flex-col items-end gap-2 text-sm'>
                <label className='flex items-center gap-2'>
                  <input
                    type='checkbox'
                    checked={includeSubDepartments}
                    disabled={busy !== undefined}
                    onChange={(event) =>
                      toggleIncludeSubDepartments(event.target.checked)
                    }
                  />
                  {t('portal.includeSubDepartments')}
                </label>
                <label className='flex items-center gap-2'>
                  <input
                    type='checkbox'
                    checked={onlyUnauthorized}
                    disabled={busy !== undefined}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setOnlyUnauthorized(checked);
                      if (checked) ensureUnauthorizedGrants();
                    }}
                  />
                  {t('portal.onlyUnauthorized')}
                </label>
              </div>
            ) : null}
          </div>
          {selectedNode ? (
            <>
              <Input
                value={displayNameQuery}
                onChange={(event) => setDisplayNameQuery(event.target.value)}
                placeholder={t('portal.displayNameSearch')}
              />
              <div className={cn(LIST_SCROLL_CLASS, 'overflow-x-auto')}>
                <table className='w-full text-sm'>
                  <thead className='sticky top-0 z-10 bg-muted/95 text-left backdrop-blur'>
                    <tr>
                      <th className='w-10 p-3'>
                        <input
                          type='checkbox'
                          checked={allVisibleSelected}
                          disabled={visibleUsers.length === 0}
                          onChange={(event) =>
                            toggleVisibleUsers(event.target.checked)
                          }
                          aria-label={t('portal.selectAllVisible')}
                        />
                      </th>
                      <th className='p-3'>{t('portal.userName')}</th>
                      <th className='p-3'>{t('portal.displayName')}</th>
                      <th className='p-3'>{t('settings.email')}</th>
                      <th className='p-3'>{t('portal.authorizedApps')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleUsers.map((user) => {
                      const checked = selectedIds.has(user.id);
                      return (
                        <tr
                          key={user.id}
                          className={cn(
                            'border-t cursor-pointer',
                            checked ? 'bg-muted/60' : '',
                          )}
                          onClick={() => toggleUser(user.id, !checked)}
                        >
                          <td className='p-3'>
                            <input
                              type='checkbox'
                              checked={checked}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) =>
                                toggleUser(user.id, event.target.checked)
                              }
                            />
                          </td>
                          <td className='p-3 font-mono'>{user.name}</td>
                          <td className='p-3'>
                            {user.displayName || user.name}
                            {user.isForbidden || user.isDeleted
                              ? ` (${t('settings.disabled')})`
                              : ''}
                          </td>
                          <td className='p-3 break-all'>{user.email || '—'}</td>
                          <td className='p-3'>{formatAuthorized(user.id)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className={LIST_SCROLL_CLASS}>
              <p className='p-3 text-sm text-muted-foreground'>
                {t('portal.selectGroupHint')}
              </p>
            </div>
          )}
        </section>

        <section className='space-y-3 rounded-lg border p-4'>
          <div className='flex items-center justify-between gap-2'>
            <h2 className='text-base font-medium'>{grantPanelTitle}</h2>
            <Button
              disabled={
                selectedUsers.length === 0 ||
                !canConfigure ||
                busy !== undefined
              }
              onClick={() => void save()}
            >
              {t('settings.save')}
            </Button>
          </div>
          {!canConfigure ? (
            <p className='text-sm text-muted-foreground'>
              {t('portal.grantsReadOnly')}
            </p>
          ) : null}
          {selectedUsers.length > 1 ? (
            <p className='text-xs text-muted-foreground'>
              {t('portal.grantsBatchHint')}
            </p>
          ) : null}
          {selectedUsers.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              {t('portal.selectUserFromGroup')}
            </p>
          ) : (
            <ul className='space-y-2'>
              {applications.map((app) => {
                const checked = directNames.has(app.name);
                return (
                  <li
                    key={`${app.owner}/${app.name}`}
                    className='flex items-start gap-3 rounded-md border p-3'
                  >
                    <input
                      id={`grant-${app.name}`}
                      type='checkbox'
                      className='mt-1'
                      checked={checked}
                      disabled={!canConfigure || busy !== undefined}
                      onChange={(event) =>
                        toggleDirect(app.name, event.target.checked)
                      }
                    />
                    <div className='min-w-0 flex-1'>
                      <Label
                        htmlFor={`grant-${app.name}`}
                        className='font-medium'
                      >
                        {app.displayName || app.name}
                      </Label>
                      <p className='font-mono text-xs text-muted-foreground'>
                        {app.name}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </PageContainer>
  );
}
