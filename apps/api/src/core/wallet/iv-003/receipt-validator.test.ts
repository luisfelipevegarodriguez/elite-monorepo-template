import { describe, expect, it } from 'vitest';
import { verifyReceipt } from './receipt-validator.js';

const policy = {
  expectedChainId: 480n,
  expectedRecipient: '0xRecipient',
  expectedValueWei: 100n,
  minConfirmations: 12n,
  expectedUserId: 'user-1',
  boundUserId: 'user-1',
  expectedFrom: '0xSender',
};

function rpc(overrides: Record<string, unknown> = {}) {
  return {
    getChainId: async () => '0x1e0',
    getTransactionReceipt: async () => ({ transactionHash: '0xabc', blockNumber: '0x64', status: '0x1', from: '0xSender', to: '0xRecipient' }),
    getTransactionByHash: async () => ({ hash: '0xabc', from: '0xSender', to: '0xRecipient', value: '0x64' }),
    getBlockNumber: async () => 112n,
    ...overrides,
  } as never;
}

describe('IV-003 receipt falsification suite', () => {
  it('accepts a receipt only after all bindings and confirmations pass', async () => {
    const result = await verifyReceipt('0xabc', rpc(), policy);
    expect(result.status).toBe('VERIFIED');
    expect(result.confirmations).toBe(12n);
  });

  it('blocks wrong chain', async () => {
    const result = await verifyReceipt('0xabc', rpc({ getChainId: async () => '0x1' }), policy);
    expect(result.reasonCode).toBe('WRONG_CHAIN');
  });

  it('blocks wrong recipient', async () => {
    const result = await verifyReceipt('0xabc', rpc({ getTransactionReceipt: async () => ({ transactionHash: '0xabc', blockNumber: '0x64', status: '0x1', from: '0xSender', to: '0xOther' }) }), policy);
    expect(result.reasonCode).toBe('WRONG_RECIPIENT');
  });

  it('blocks wrong value', async () => {
    const result = await verifyReceipt('0xabc', rpc({ getTransactionByHash: async () => ({ hash: '0xabc', from: '0xSender', to: '0xRecipient', value: '0x65' }) }), policy);
    expect(result.reasonCode).toBe('WRONG_VALUE');
  });

  it('blocks failed transaction', async () => {
    const result = await verifyReceipt('0xabc', rpc({ getTransactionReceipt: async () => ({ transactionHash: '0xabc', blockNumber: '0x64', status: '0x0', from: '0xSender', to: '0xRecipient' }) }), policy);
    expect(result.reasonCode).toBe('TX_FAILED');
  });

  it('blocks insufficient confirmations', async () => {
    const result = await verifyReceipt('0xabc', rpc({ getBlockNumber: async () => 111n }), policy);
    expect(result.reasonCode).toBe('INSUFFICIENT_CONFIRMATIONS');
  });

  it('blocks a mismatched identity binding before RPC use', async () => {
    const result = await verifyReceipt('0xabc', rpc(), { ...policy, boundUserId: 'other-user' });
    expect(result.reasonCode).toBe('USER_BINDING_MISMATCH');
  });
});
