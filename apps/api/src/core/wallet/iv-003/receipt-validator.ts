import type { RpcClient, RpcLog, RpcReceipt, RpcTransaction } from './rpc-client.js';

export type IV003Status = 'VERIFIED' | 'BLOCKED_WITH_REASON' | 'INCONCLUSIVE';
export type IV003Reason =
  | 'SOURCE_UNAVAILABLE'
  | 'RECEIPT_NOT_FOUND'
  | 'WRONG_CHAIN'
  | 'WRONG_RECIPIENT'
  | 'WRONG_VALUE'
  | 'WRONG_TOKEN'
  | 'TX_FAILED'
  | 'INSUFFICIENT_CONFIRMATIONS'
  | 'USER_BINDING_MISMATCH'
  | 'TRANSACTION_MISMATCH'
  | 'REPLAY_DETECTED'
  | 'INVALID_TRANSACTION_HASH'
  | 'INTEGRITY_FAILURE';

export interface ReceiptPolicy {
  expectedChainId: bigint;
  expectedRecipient: string;
  expectedValueWei?: bigint;
  expectedTokenAddress?: string;
  expectedTokenAmount?: bigint;
  tokenDecimals?: number;
  minConfirmations: bigint;
  expectedUserId: string;
  boundUserId: string;
  expectedFrom?: string;
}

export interface TxLedger {
  has(txHash: string): Promise<boolean> | boolean;
  recordIfAbsent(entry: { txHash: string; userId: string; recordedAt: string }): Promise<boolean> | boolean;
}

export interface ReceiptVerification {
  status: IV003Status;
  reasonCode: IV003Reason | null;
  txHash: string;
  confirmations?: bigint;
}

const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const normalize = (value: string): string => value.toLowerCase();
const hexToBigInt = (value: string): bigint => BigInt(value);

function validHash(value: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}

function topicAddress(topic: string | undefined): string | null {
  if (!topic || !/^0x[0-9a-fA-F]{64}$/.test(topic)) return null;
  return `0x${topic.slice(-40)}`.toLowerCase();
}

function findTokenTransfer(receipt: RpcReceipt, policy: ReceiptPolicy): boolean {
  if (!policy.expectedTokenAddress || policy.expectedTokenAmount === undefined) return false;
  return receipt.logs.some((log) => {
    if (normalize(log.address) !== normalize(policy.expectedTokenAddress!)) return false;
    if (!log.topics?.[0] || normalize(log.topics[0]) !== TRANSFER_TOPIC) return false;
    const to = topicAddress(log.topics[2]);
    if (!to || to !== normalize(policy.expectedRecipient)) return false;
    if (!/^0x[0-9a-fA-F]*$/.test(log.data)) return false;
    return hexToBigInt(log.data) >= policy.expectedTokenAmount!;
  });
}

export async function verifyReceipt(
  txHash: string,
  rpc: RpcClient,
  policy: ReceiptPolicy,
  ledger?: TxLedger,
): Promise<ReceiptVerification> {
  if (!validHash(txHash)) return { status: 'BLOCKED_WITH_REASON', reasonCode: 'INVALID_TRANSACTION_HASH', txHash };
  if (policy.expectedUserId !== policy.boundUserId) {
    return { status: 'BLOCKED_WITH_REASON', reasonCode: 'USER_BINDING_MISMATCH', txHash };
  }
  if (ledger && await ledger.has(txHash)) {
    return { status: 'BLOCKED_WITH_REASON', reasonCode: 'REPLAY_DETECTED', txHash };
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

  if (hexToBigInt(chainId) !== policy.expectedChainId) return { status: 'BLOCKED_WITH_REASON', reasonCode: 'WRONG_CHAIN', txHash };
  if (!receipt || !transaction) return { status: 'INCONCLUSIVE', reasonCode: 'RECEIPT_NOT_FOUND', txHash };
  if (normalize(transaction.hash) !== normalize(receipt.transactionHash) || normalize(transaction.hash) !== normalize(txHash)) {
    return { status: 'BLOCKED_WITH_REASON', reasonCode: 'TRANSACTION_MISMATCH', txHash };
  }
  if (receipt.status !== '0x1') return { status: 'BLOCKED_WITH_REASON', reasonCode: 'TX_FAILED', txHash };

  const confirmations = head - hexToBigInt(receipt.blockNumber);
  if (confirmations < policy.minConfirmations) {
    return { status: 'BLOCKED_WITH_REASON', reasonCode: 'INSUFFICIENT_CONFIRMATIONS', txHash, confirmations };
  }

  if (policy.expectedTokenAddress !== undefined) {
    if (!findTokenTransfer(receipt, policy)) return { status: 'BLOCKED_WITH_REASON', reasonCode: 'WRONG_TOKEN', txHash, confirmations };
  } else {
    if (!receipt.to || normalize(receipt.to) !== normalize(policy.expectedRecipient)) {
      return { status: 'BLOCKED_WITH_REASON', reasonCode: 'WRONG_RECIPIENT', txHash, confirmations };
    }
    if (policy.expectedValueWei === undefined || hexToBigInt(transaction.value) < policy.expectedValueWei) {
      return { status: 'BLOCKED_WITH_REASON', reasonCode: 'WRONG_VALUE', txHash, confirmations };
    }
  }

  if (policy.expectedFrom && normalize(transaction.from) !== normalize(policy.expectedFrom)) {
    return { status: 'BLOCKED_WITH_REASON', reasonCode: 'TRANSACTION_MISMATCH', txHash, confirmations };
  }

  if (ledger) {
    const recorded = await ledger.recordIfAbsent({ txHash, userId: policy.expectedUserId, recordedAt: new Date().toISOString() });
    if (!recorded) return { status: 'BLOCKED_WITH_REASON', reasonCode: 'REPLAY_DETECTED', txHash, confirmations };
  }

  return { status: 'VERIFIED', reasonCode: null, txHash, confirmations };
}
