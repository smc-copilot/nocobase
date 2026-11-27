import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  AttachmentPanel,
  type AttachmentFile,
} from '#components/attachment-list';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { StatusBadge } from '#components/status-badge';
import { useListData } from '#hooks/use-list-data';
import { useMemo, useState, type ReactElement } from 'react';
import { MeetingUnavailable } from './meeting-feedback.js';

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

function parseTone(status: string): 'success' | 'warning' | 'info' | 'neutral' {
  if (status === 'succeeded') return 'success';
  if (status === 'failed') return 'warning';
  if (status === 'pending') return 'info';
  return 'neutral';
}

export function SupplementalFilesPanel({
  meetingId,
  frozen,
}: {
  readonly meetingId: string;
  readonly frozen: boolean;
}): ReactElement {
  const { t, i18n } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const request = useListData<{
    data: SupplementalFile[];
    meta: { total: number; totalBytes: number };
  }>(`meetings/${meetingId}/supplementalFiles`, { scopes: ['meetings'] });
  const [uploading, setUploading] = useState<string[]>([]);
  const files = useMemo(() => request.data?.data ?? [], [request.data?.data]);
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

  const openContent = async (fileId: string) => {
    const result = await api.request<{
      data: {
        fileName: string;
        mimeType: string | null;
        contentBase64: string;
      };
    }>({
      path: `meetings/${meetingId}/supplementalFiles/${fileId}/content`,
    });
    const bytes = Uint8Array.from(atob(result.data.contentBase64), (char) =>
      char.charCodeAt(0),
    );
    const blob = new Blob([bytes], {
      type: result.data.mimeType || 'text/plain',
    });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener');
  };

  const panelFiles = useMemo<AttachmentFile[]>(
    () =>
      files.map((file) => ({
        id: file.id,
        name: file.fileName,
        size: file.sizeBytes,
        url: file.id,
        downloadUrl: file.id,
        image: false,
        canRemove: !frozen,
      })),
    [files, frozen],
  );

  const upload = async (picked: readonly File[]) => {
    if (!picked.length || frozen) return;
    setUploading(picked.map((file) => file.name));
    try {
      for (const file of picked) {
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
        } catch (error) {
          fail(error);
        }
      }
      void request.reload();
    } finally {
      setUploading([]);
    }
  };

  return (
    <div className='flex flex-col gap-3'>
      {frozen ? (
        <Alert>
          <AlertDescription>{t('meetingOa.filesFrozen')}</AlertDescription>
        </Alert>
      ) : null}
      {request.error ? (
        <MeetingUnavailable onRetry={() => request.reload()} />
      ) : null}
      <AttachmentPanel
        files={panelFiles}
        uploading={uploading}
        locale={i18n.language}
        hint={t('meetingOa.filesHint', { bytes: totalBytes })}
        labels={{
          title: t('meetingOa.filesTitle'),
          images: t('meetingOa.filesImages'),
          files: t('meetingOa.filesList'),
          pending: t('meetingOa.filesPending'),
          upload: t('meetingOa.filesUpload'),
          preview: t('meetingOa.filesPreview'),
          download: t('meetingOa.filesViewNamed'),
          remove: t('meetingOa.filesRemoveNamed'),
          uploading: t('meetingOa.filesUploading'),
          removeTitle: t('meetingOa.filesDeleteConfirm'),
          removeDescription: t('meetingOa.filesRemoveDescription'),
          removeConfirm: t('meetingOa.filesDelete'),
          cancel: t('meetingOa.taskDialogCancel'),
          previous: t('meetingOa.filesPrevious'),
          next: t('meetingOa.filesNext'),
        }}
        onUpload={
          frozen
            ? undefined
            : (picked) => {
                void upload(picked);
              }
        }
        onPreview={(_rows, index) => {
          const file = files[index];
          if (!file) return;
          void openContent(file.id).catch(fail);
        }}
        onDownload={(file) => {
          void openContent(file.id).catch(fail);
        }}
        onRemove={
          frozen
            ? undefined
            : async (file) => {
                try {
                  await api.request({
                    path: `meetings/${meetingId}/supplementalFiles/${file.id}`,
                    method: 'DELETE',
                  });
                  void request.reload();
                } catch (error) {
                  fail(error);
                  throw error;
                }
              }
        }
      />
      {files.some((file) => file.parseStatus !== 'succeeded') ? (
        <ul className='flex flex-col gap-2'>
          {files
            .filter((file) => file.parseStatus !== 'succeeded')
            .map((file) => (
              <li
                key={file.id}
                className='flex flex-wrap items-center justify-between gap-2 text-sm'
              >
                <div className='flex min-w-0 flex-wrap items-center gap-2'>
                  <span className='truncate'>{file.fileName}</span>
                  <StatusBadge tone={parseTone(file.parseStatus)} size='sm'>
                    {t(`meetingOa.parseStatus.${file.parseStatus}`, {
                      defaultValue: file.parseStatus,
                    })}
                  </StatusBadge>
                  {file.parseError ? (
                    <span className='text-muted-foreground'>
                      {file.parseError}
                    </span>
                  ) : null}
                </div>
                {frozen || file.parseStatus !== 'failed' ? null : (
                  <Button
                    type='button'
                    size='sm'
                    variant='outline'
                    onClick={() => {
                      void api
                        .request({
                          path: `meetings/${meetingId}/supplementalFiles/${file.id}/retry`,
                          method: 'POST',
                          json: {},
                        })
                        .then(() => request.reload())
                        .catch(fail);
                    }}
                  >
                    {t('meetingOa.filesRetry')}
                  </Button>
                )}
              </li>
            ))}
        </ul>
      ) : null}
    </div>
  );
}
