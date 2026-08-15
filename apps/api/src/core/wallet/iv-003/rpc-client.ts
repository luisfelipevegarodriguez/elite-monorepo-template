export interface RpcReceipt {
  transactionHash: string;
  blockNumber: string;
  status: string | null;
  from: string;
  to: string | null;
  value?: string;
  blockHash?: string;
}

interface RpcResponse<T> {
  jsonrpc: '2.0';
  id: number;
  result?: T;
  error?: { code: number; message: string };
}

export class RpcClient {
  constructor(private readonly rpcUrl: string, private readonly timeoutMs = 10_000) {
    if (!rpcUrl.startsWith('https://')) throw new Error('RPC_MUST_USE_HTTPS');
  }

  async getTransactionReceipt(txHash: string): Promise<RpcReceipt | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(this.rpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionReceipt', params: [txHash] }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`RPC_HTTP_${response.status}`);
      const body = (await response.json()) as RpcResponse<RpcReceipt>;
      if (body.error) throw new Error(`RPC_${body.error.code}:${body.error.message}`);
      return body.result ?? null;
    } finally {
      clearTimeout(timer);
    }
  }

  async getBlockNumber(): Promise<bigint> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(this.rpcUrl, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`RPC_HTTP_${response.status}`);
      const body = (await response.json()) as RpcResponse<string>;
      if (body.error || !body.result) throw new Error(body.error?.message ?? 'RPC_INVALID_BLOCK_NUMBER');
      return BigInt(body.result);
    } finally {
      clearTimeout(timer);
    }
  }
}
