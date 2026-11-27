import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { AuthorizationContext } from '@nocobase/app-plugin-authorization/server';
import type { DatabaseConnection } from '@nocobase/db';
import {
  requireMeetingAction,
  requireReadableMeeting,
  requireUser,
  toIso,
} from './access.js';
import { MeetingOaError } from './oa/errors.js';
import {
  MEETING_OA_OPERATIONS,
  MEETING_SUPPLEMENTAL_FILES,
  type MeetingOaOperation,
  type MeetingSupplementalFile,
} from './resources.js';

export const SUPPLEMENTAL_FILE_MAX_BYTES = 100_000_000;
export const SUPPLEMENTAL_FILE_MAX_COUNT = 20;
export const SUPPLEMENTAL_MEETING_MAX_BYTES = 500_000_000;

export interface SupplementalFilePublic {
  id: string;
  meetingId: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number;
  contentHash: string;
  parseStatus: string;
  parseError: string | null;
  createdAt: string;
  tencentSource: false;
}

function parseText(
  fileName: string,
  bytes: Buffer,
): {
  parseStatus: string;
  parseError: string | null;
  parsedText: string | null;
} {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.txt') || lower.endsWith('.md')) {
    return {
      parseStatus: 'succeeded',
      parseError: null,
      parsedText: bytes.toString('utf8'),
    };
  }
  return {
    parseStatus: 'failed',
    parseError: 'SOURCE_FORMAT_UNSUPPORTED',
    parsedText: null,
  };
}

export class MeetingSupplementalFileService {
  constructor(
    private readonly connection: DatabaseConnection,
    private readonly authz: AuthorizationContext,
    private readonly userId: string | undefined,
    private readonly storageRoot: string,
  ) {}

  async list(meetingId: string): Promise<{
    data: SupplementalFilePublic[];
    meta: { total: number; totalBytes: number };
  }> {
    await requireReadableMeeting(this.connection, this.authz, meetingId);
    const rows = await this.connection
      .repository<MeetingSupplementalFile>(MEETING_SUPPLEMENTAL_FILES)
      .findMany({
        filter: { meetingId },
        sort: (sort) => sort.field('createdAt').asc(),
      });
    return {
      data: rows.map((row) => this.publicRow(row)),
      meta: {
        total: rows.length,
        totalBytes: rows.reduce((sum, row) => sum + row.sizeBytes, 0),
      },
    };
  }

  async upload(
    meetingId: string,
    input: { fileName: string; mimeType?: string | null; bytes: Buffer },
  ): Promise<SupplementalFilePublic> {
    await requireMeetingAction(this.authz, 'supplement');
    await requireReadableMeeting(this.connection, this.authz, meetingId);
    await this.assertUnlocked(meetingId);
    const userId = requireUser(this.userId);
    const fileName = path.basename(input.fileName).trim();
    if (!fileName) {
      throw new MeetingOaError(
        'OA_DRAFT_INVALID',
        'A file name is required.',
        'INVALID_ARGUMENT',
      );
    }
    if (input.bytes.byteLength > SUPPLEMENTAL_FILE_MAX_BYTES) {
      throw new MeetingOaError(
        'IMPORT_RECORDING_REJECTED',
        'The supplemental file exceeds 100,000,000 bytes.',
        'INVALID_ARGUMENT',
      );
    }
    const existing = await this.connection
      .repository<MeetingSupplementalFile>(MEETING_SUPPLEMENTAL_FILES)
      .findMany({ filter: { meetingId } });
    if (existing.length >= SUPPLEMENTAL_FILE_MAX_COUNT) {
      throw new MeetingOaError(
        'IMPORT_RECORDING_REJECTED',
        'A meeting may have at most 20 supplemental files.',
        'FAILED_PRECONDITION',
      );
    }
    const total =
      existing.reduce((sum, row) => sum + row.sizeBytes, 0) +
      input.bytes.byteLength;
    if (total > SUPPLEMENTAL_MEETING_MAX_BYTES) {
      throw new MeetingOaError(
        'IMPORT_RECORDING_REJECTED',
        'Supplemental files for this meeting exceed 500,000,000 bytes.',
        'FAILED_PRECONDITION',
      );
    }
    const contentHash = createHash('sha256').update(input.bytes).digest('hex');
    if (existing.some((row) => row.contentHash === contentHash)) {
      throw new MeetingOaError(
        'IMPORT_RECORDING_REJECTED',
        'Duplicate supplemental content is not stored.',
        'ALREADY_EXISTS',
      );
    }
    const id = randomUUID();
    const storageKey = path.join(meetingId, `${id}-${fileName}`);
    await mkdir(path.join(this.storageRoot, meetingId), { recursive: true });
    await writeFile(path.join(this.storageRoot, storageKey), input.bytes);
    const parsed = parseText(fileName, input.bytes);
    const now = new Date();
    await this.connection
      .repository<MeetingSupplementalFile>(MEETING_SUPPLEMENTAL_FILES)
      .createOne({
        values: {
          id,
          meetingId,
          fileName,
          mimeType: input.mimeType ?? null,
          sizeBytes: input.bytes.byteLength,
          contentHash,
          storageKey,
          parseStatus: parsed.parseStatus,
          parseError: parsed.parseError,
          parsedText: parsed.parsedText,
          uploadedBy: userId,
          createdAt: now,
          updatedAt: now,
        },
      });
    const row = await this.connection
      .repository<MeetingSupplementalFile>(MEETING_SUPPLEMENTAL_FILES)
      .findOne({ filter: { id } });
    return this.publicRow(row as MeetingSupplementalFile);
  }

  async retry(
    meetingId: string,
    fileId: string,
  ): Promise<SupplementalFilePublic> {
    await requireMeetingAction(this.authz, 'supplement');
    const row = await this.requireOwnFile(meetingId, fileId);
    const bytes = await readFile(path.join(this.storageRoot, row.storageKey));
    const parsed = parseText(row.fileName, bytes);
    await this.connection
      .repository<MeetingSupplementalFile>(MEETING_SUPPLEMENTAL_FILES)
      .updateOne({
        filter: { id: row.id },
        values: {
          parseStatus: parsed.parseStatus,
          parseError: parsed.parseError,
          parsedText: parsed.parsedText,
          updatedAt: new Date(),
        },
      });
    return this.get(meetingId, fileId);
  }

  async remove(meetingId: string, fileId: string): Promise<void> {
    await requireMeetingAction(this.authz, 'supplement');
    await this.assertUnlocked(meetingId);
    const row = await this.requireOwnFile(meetingId, fileId);
    if (row.uploadedBy !== requireUser(this.userId)) {
      throw new MeetingOaError(
        'ACCESS_DENIED',
        'Only the uploader can delete this supplemental file.',
        'PERMISSION_DENIED',
      );
    }
    await this.connection
      .repository<MeetingSupplementalFile>(MEETING_SUPPLEMENTAL_FILES)
      .deleteOne({ filter: { id: row.id } });
    try {
      await unlink(path.join(this.storageRoot, row.storageKey));
    } catch {
      // The database row is already gone.
    }
  }

  async readBytes(
    meetingId: string,
    fileId: string,
  ): Promise<{ fileName: string; mimeType: string | null; bytes: Buffer }> {
    await requireReadableMeeting(this.connection, this.authz, meetingId);
    const row = await this.requireOwnFile(meetingId, fileId);
    const bytes = await readFile(path.join(this.storageRoot, row.storageKey));
    return { fileName: row.fileName, mimeType: row.mimeType, bytes };
  }

  async get(
    meetingId: string,
    fileId: string,
  ): Promise<SupplementalFilePublic> {
    await requireReadableMeeting(this.connection, this.authz, meetingId);
    return this.publicRow(await this.requireOwnFile(meetingId, fileId));
  }

  private async requireOwnFile(
    meetingId: string,
    fileId: string,
  ): Promise<MeetingSupplementalFile> {
    const row = await this.connection
      .repository<MeetingSupplementalFile>(MEETING_SUPPLEMENTAL_FILES)
      .findOne({ filter: { id: fileId, meetingId } });
    if (!row) {
      throw new MeetingOaError(
        'ACCESS_DENIED',
        'This meeting is unavailable.',
        'PERMISSION_DENIED',
      );
    }
    return row;
  }

  private async assertUnlocked(meetingId: string): Promise<void> {
    const operation = await this.connection
      .repository<MeetingOaOperation>(MEETING_OA_OPERATIONS)
      .findOne({ filter: { meetingId } });
    if (operation) {
      throw new MeetingOaError(
        'OA_OPERATION_IMMUTABLE',
        'Supplemental files are read-only after an OA operation exists.',
        'FAILED_PRECONDITION',
      );
    }
  }

  private publicRow(row: MeetingSupplementalFile): SupplementalFilePublic {
    return {
      id: row.id,
      meetingId: row.meetingId,
      fileName: row.fileName,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      contentHash: row.contentHash,
      parseStatus: row.parseStatus,
      parseError: row.parseError,
      createdAt: toIso(row.createdAt) as string,
      tencentSource: false,
    };
  }
}
