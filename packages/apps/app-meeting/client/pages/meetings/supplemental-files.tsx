import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import { useListData } from '#hooks/use-list-data';
import { useState, type ReactElement } from 'react';

interface SupplementalFile {
  id: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number;
  parseStatus: string;
  parseError: string | null;
  tencentSource: false;
}

function readFileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      resolve(
        result.includes(',') ? result.slice(result.indexOf(',') + 1) : result,
      );
    };
    reader.onerror = () => reject(new Error('read failed'));
    reader.readAsDataURL(file);
  });
}

export function SupplementalFilesPanel({
  meetingId,
  frozen,
}: {
  readonly meetingId: string;
  readonly frozen: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const request = useListData<{
    data: SupplementalFile[];
    meta: { total: number; totalBytes: number };
  }>(`meetings/${meetingId}/supplementalFiles`, { scopes: ['meetings'] });
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(true);
  const files = request.data?.data ?? [];
  const total = request.data?.meta.total ?? files.length;
  const totalBytes = request.data?.meta.totalBytes ?? 0;

  const fail = (error: unknown) => {
    toaster.show({
      type: 'error',
      title:
        error instanceof ApiClientError
          ? error.message
          : t('meetingOa.filesFailed'),
    });
  };

  return (
    <div>
      <Button
        type='button'
        variant='outline'
        className='justify-between'
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {t('meetingOa.filesTitle')} ·{' '}
        {t('meetingOa.filesCount', { count: total, bytes: totalBytes })}
      </Button>
      {open ? (
        <div className='mt-3 flex flex-col gap-3'>
          {frozen ? (
            <p className='text-sm text-muted-foreground'>
              {t('meetingOa.filesFrozen')}
            </p>
          ) : null}
          {request.error ? (
            <p className='text-sm text-destructive'>
              {t('meetings.unavailable')}
            </p>
          ) : null}
          <ul className='flex flex-col gap-2 text-sm'>
            {files.map((file) => (
              <li key={file.id} className='rounded border p-2'>
                <p className='font-medium'>{file.fileName}</p>
                <p className='text-muted-foreground'>
                  {file.sizeBytes} · {file.parseStatus}
                  {file.parseError ? ` · ${file.parseError}` : ''}
                </p>
                <div className='mt-2 flex flex-wrap gap-2'>
                  <Button
                    type='button'
                    size='sm'
                    variant='outline'
                    disabled={busy}
                    onClick={() => {
                      setBusy(true);
                      void api
                        .request<{
                          data: {
                            fileName: string;
                            mimeType: string | null;
                            contentBase64: string;
                          };
                        }>({
                          path: `meetings/${meetingId}/supplementalFiles/${file.id}/content`,
                        })
                        .then((result) => {
                          const bytes = Uint8Array.from(
                            atob(result.data.contentBase64),
                            (char) => char.charCodeAt(0),
                          );
                          const blob = new Blob([bytes], {
                            type: result.data.mimeType || 'text/plain',
                          });
                          const url = URL.createObjectURL(blob);
                          window.open(url, '_blank', 'noopener');
                        })
                        .catch(fail)
                        .finally(() => setBusy(false));
                    }}
                  >
                    {t('meetingOa.filesView')}
                  </Button>
                  <Button
                    type='button'
                    size='sm'
                    variant='outline'
                    disabled={busy || frozen}
                    onClick={() => {
                      setBusy(true);
                      void api
                        .request({
                          path: `meetings/${meetingId}/supplementalFiles/${file.id}/retry`,
                          method: 'POST',
                          json: {},
                        })
                        .then(() => request.reload())
                        .catch(fail)
                        .finally(() => setBusy(false));
                    }}
                  >
                    {t('meetingOa.filesRetry')}
                  </Button>
                  <Button
                    type='button'
                    size='sm'
                    variant='ghost'
                    disabled={busy || frozen}
                    onClick={() => {
                      if (!window.confirm(t('meetingOa.filesDeleteConfirm')))
                        return;
                      setBusy(true);
                      void api
                        .request({
                          path: `meetings/${meetingId}/supplementalFiles/${file.id}`,
                          method: 'DELETE',
                        })
                        .then(() => request.reload())
                        .catch(fail)
                        .finally(() => setBusy(false));
                    }}
                  >
                    {t('meetingOa.filesDelete')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <Input
            type='file'
            multiple
            disabled={busy || frozen}
            aria-label={t('meetingOa.filesUpload')}
            onChange={(event) => {
              const selected = [...(event.target.files ?? [])];
              event.target.value = '';
              if (!selected.length || frozen) return;
              setBusy(true);
              void (async () => {
                let succeeded = 0;
                let failed = 0;
                for (const file of selected) {
                  try {
                    const base64 = await readFileBase64(file);
                    await api.request({
                      path: `meetings/${meetingId}/supplementalFiles`,
                      method: 'POST',
                      json: {
                        fileName: file.name,
                        mimeType: file.type || null,
                        contentBase64: base64,
                      },
                    });
                    succeeded += 1;
                  } catch (error) {
                    failed += 1;
                    fail(error);
                  }
                }
                if (succeeded || failed) void request.reload();
              })().finally(() => setBusy(false));
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
