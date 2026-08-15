import type { RpcClient, RpcReceipt, RpcTransaction } from './rpc-client.js';

export type IV003Status = 'VERIFIED' | 'BLOCKED_WITH_REASON' | 'INCONCLUSIVE';
export type IV003Reason =
  | 'SOURCE_UNAVAILABLE'
  | 'RECEIPT_NOT_FOUND'
  | 'WRONG_CHAIN'
  | 'WRONG_RECIPIENT'
  | 'WRONG_VALUE'
  | 'TX_FAILED'
  | 'INSUFFICIENT_CONFIRMATIONS'
  | 'USER_BINDING_MISMATCH'
  | 'TRANSACTION_MISMATCH';

export interface ReceiptPolicy {
  expectedChainId: bigint;
  expectedRecipient: string;
  expectedValueWei: bigint;
  minConfirmations: bigint;
  expectedUserId: string;
  boundUserId: string;
  expectedFrom?: string;
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

  let chainId: string;
  let receipt: RpcReceipt | null;
  let transaction: RpcTransaction | null;
  let head: bigint;
  try {
    [chainId, receipt, transaction, head] = await Promise.all([
      rpc.getChainId(), rpc.getTransactionReceipt(txHash), rpc.getTransactionByHash(txHash), rpc.getBlockNumber(),
    ]);
  } catch {
    return { status: 'INCONCLUSIVE', reasonCode: 'SOURCE_UNAVAILABLE', txHash };
  }

  if (hexToBigInt(chainId) !== policy.expectedChainId) {
    return { status: 'BLOCKED_WITH_REASON', reasonCode: 'WRONG_CHAIN', txHash };
  }
  if (!receipt || !transaction) return { status: 'INCONCLUSIVE', reasonCode: 'RECEIPT_NOT_FOUND', txHash };
  if (normalize(transaction.hash) !== normalize(receipt.transactionHash)) {
    return { status: 'BLOCKED_WITH_REASON', reasonCode: 'TRANSACTION_MISMATCH', txHash };
  }
  if (receipt.status !== '0x1') return { status: 'BLOCKED_WITH_REASON', reasonCode: 'TX_FAILED', txHash };
  if (!receipt.to || normalize(receipt.to) !== normalize(policy.expectedRecipient)) {
    return { status: 'BLOCKED_WITH_REASON', reasonCode: 'WRONG_RECIPIENT', txHash };
  }
  if (hexToBigInt(transaction.value) !== policy.expectedValueWei) {
    return { status: 'BLOCKED_WITH_REASON', reasonCode: 'WRONG_VALUE', txHash };
  }
  if (policy.expectedFrom && normalize(transaction.from) !== normalize(policy.expectedFrom)) {
    return { status: 'BLOCKED_WITH_REASON', reasonCode: 'TRANSACTION_MISMATCH', txHash };
  }

  const confirmations = head - hexToBigInt(receipt.blockNumber);
  if (confirmations < policy.minConfirmations) {
    return { status: 'BLOCKED_WITH_REASON', reasonCode: 'INSUFFICIENT_CONFIRMATIONS', txHash, confirmations };
  }

  return { status: 'VERIFIED', reasonCode: null, txHash, confirmations };
}
