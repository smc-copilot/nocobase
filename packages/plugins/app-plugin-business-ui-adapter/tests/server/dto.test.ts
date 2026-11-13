import { describe, expect, it } from 'vitest';

import { serializeReceipt } from '../../server/dto.js';

describe('serializeReceipt', () => {
  it('emits camelCase and snake_case from one DTO', () => {
    const receipt = serializeReceipt({
      status: 'submitted',
      documentType: 'generic.request',
      recordId: 'REQ-1',
      formRef: 'generic.request.detail',
      schemaVersion: '1',
      recordVersion: 2,
      allowedActions: ['view_document', 'close'],
      interactionId: 'int-1',
      operationId: 'op-1',
      receiptSequence: 3,
    });

    expect(receipt.documentType).toBe(receipt.document_type);
    expect(receipt.recordId).toBe(receipt.record_id);
    expect(receipt.formRef).toBe(receipt.form_ref);
    expect(receipt.schemaVersion).toBe(receipt.schema_version);
    expect(receipt.recordVersion).toBe(receipt.record_version);
    expect(receipt.allowedActions).toEqual(receipt.allowed_actions);
    expect(receipt.interactionId).toBe(receipt.interaction_id);
    expect(receipt.record_id).toBe('REQ-1');
    expect(receipt.record_version).toBe(2);
    expect(receipt.operation_id).toBe('op-1');
    expect(receipt.receipt_sequence).toBe(3);
  });
});
