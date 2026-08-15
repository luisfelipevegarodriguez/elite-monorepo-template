import type { RpcClient, RpcReceipt } from './rpc-client.js';

export type IV003Status = 'VERIFIED' | 'BLOCKED_WITH_REASON' | 'INCONCLUSIVE';
export type IV003Reason =
  | 'SOURCE_UNAVAILABLE'
  | 'RECEIPT_NOT_FOUND'
  | 'WRONG_CHAIN'
  | 'WRONG_RECIPIENT'
  | 'WRONG_VALUE'
  | 'TX_FAILED'
  | 'INSUFFICIENT_CONFIRMATIONS'
  | 'USER_BINDING_MISMATCH';

export interface ReceiptPolicy {
  expectedChainId: bigint;
  expectedRecipient: string;
  expectedValueWei: bigint;
  minConfirmations: bigint;
  expectedUserId: string;
  boundUserId: string;
}

export interface ReceiptVerification {
  status: IV003Status;
  reasonCode: IV003Reason | null;
  txHash: string;
  confirmations?: bigint;
}

const normalize = (value: string): string => value.toLowerCase();
const hexToBigInt = (value: string): bigint => BigInt(value);

export async function verifyReceipt(
  txHash: string,
  rpc: RpcClient,
  policy: ReceiptPolicy,
): Promise<ReceiptVerification> {
  if (policy.expectedUserId !== policy.boundUserId) {
    return { status: 'BLOCKED_WITH_REASON', reasonCode: 'USER_BINDING_MISMATCH', txHash };
  }

  let receipt: RpcReceipt | null;
  let head: bigint;
  try {
    [receipt, head] = await Promise.all([rpc.getTransactionReceipt(txHash), rpc.getBlockNumber()]);
  } catch {
    return { status: 'INCONCLUSIVE', reasonCode: 'SOURCE_UNAVAILABLE', txHash };
  }

  if (!receipt) return { status: 'INCONCLUSIVE', reasonCode: 'RECEIPT_NOT_FOUND', txHash };
  if (receipt.status !== '0x1') return { status: 'BLOCKED_WITH_REASON', reasonCode: 'TX_FAILED', txHash };
  if (!receipt.to || normalize(receipt.to) !== normalize(policy.expectedRecipient)) {
    return { status: 'BLOCKED_WITH_REASON', reasonCode: 'WRONG_RECIPIENT', txHash };
  }
  if (receipt.value !== undefined && hexToBigInt(receipt.value) !== policy.expectedValueWei) {
    return { status: 'BLOCKED_WITH_REASON', reasonCode: 'WRONG_VALUE', txHash };
  }

  const confirmations = head - hexToBigInt(receipt.blockNumber);
  if (confirmations < policy.minConfirmations) {
    return { status: 'BLOCKED_WITH_REASON', reasonCode: 'INSUFFICIENT_CONFIRMATIONS', txHash, confirmations };
  }

  return { status: 'VERIFIED', reasonCode: null, txHash, confirmations };
}
