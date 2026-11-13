/**
 * Receipt / interaction DTO serializer.
 *
 * Emits camelCase and snake_case from one object so the two shapes cannot drift
 * (PRD §10.5–§10.6, `prd/acceptance/contracts/dto-receipt-v11.md`).
 */

export interface SevenFieldCore {
  documentType: string;
  recordId: string;
  formRef: string;
  schemaVersion: string;
  recordVersion: number;
  allowedActions: readonly string[];
  interactionId: string;
}

export interface ReceiptResult {
  type: string;
  status: string;
  code: string;
  message: string;
  disclosable: boolean;
  safe_retry: boolean;
  idempotent: boolean;
  side_effect: boolean;
}

export interface ReceiptDtoInput extends SevenFieldCore {
  status: string;
  approvalStatus?: string;
  subjectSub?: string;
  operationId?: string;
  receiptSequence?: number;
  result?: ReceiptResult;
  navigation?: { form_ref: string; formRef?: string };
  summary?: Record<string, unknown>;
}

export type DualNamedReceipt = Record<string, unknown>;

const SEVEN: ReadonlyArray<readonly [keyof SevenFieldCore, string]> = [
  ['documentType', 'document_type'],
  ['recordId', 'record_id'],
  ['formRef', 'form_ref'],
  ['schemaVersion', 'schema_version'],
  ['recordVersion', 'record_version'],
  ['allowedActions', 'allowed_actions'],
  ['interactionId', 'interaction_id'],
];

/** Serialize the seven core fields (and optional receipt extras) with dual naming. */
export function serializeReceipt(input: ReceiptDtoInput): DualNamedReceipt {
  const out: DualNamedReceipt = {
    status: input.status,
    approval_status: input.approvalStatus ?? 'not_required',
    approvalStatus: input.approvalStatus ?? 'not_required',
  };

  for (const [camel, snake] of SEVEN) {
    const value = input[camel];
    out[camel] = value;
    out[snake] = value;
  }

  if (input.subjectSub !== undefined) {
    out.subject_sub = input.subjectSub;
    out.subjectSub = input.subjectSub;
  }
  if (input.operationId !== undefined) {
    out.operation_id = input.operationId;
    out.operationId = input.operationId;
  }
  if (input.receiptSequence !== undefined) {
    out.receipt_sequence = input.receiptSequence;
    out.receiptSequence = input.receiptSequence;
  }
  if (input.result !== undefined) {
    out.result = input.result;
  }
  if (input.navigation !== undefined) {
    out.navigation = {
      form_ref: input.navigation.form_ref,
      formRef: input.navigation.formRef ?? input.navigation.form_ref,
    };
  }
  if (input.summary !== undefined) {
    out.summary = input.summary;
  }

  return out;
}
