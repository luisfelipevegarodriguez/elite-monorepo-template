export interface RpcReceipt {
  transactionHash: string;
  blockNumber: string;
  status: string | null;
  from: string;
  to: string | null;
  blockHash?: string;
}

export interface RpcTransaction {
  hash: string;
  from: string;
  to: string | null;
  value: string;
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

  private async call<T>(method: string, params: unknown[]): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(this.rpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`RPC_HTTP_${response.status}`);
      const body = (await response.json()) as RpcResponse<T>;
      if (body.error) throw new Error(`RPC_${body.error.code}:${body.error.message}`);
      if (body.result === undefined) throw new Error('RPC_EMPTY_RESULT');
      return body.result;
    } finally {
      clearTimeout(timer);
    }
  }

  getChainId(): Promise<string> {
    return this.call<string>('eth_chainId', []);
  }

  getTransactionReceipt(txHash: string): Promise<RpcReceipt | null> {
    return this.call<RpcReceipt | null>('eth_getTransactionReceipt', [txHash]);
  }

  getTransactionByHash(txHash: string): Promise<RpcTransaction | null> {
    return this.call<RpcTransaction | null>('eth_getTransactionByHash', [txHash]);
  }

  async getBlockNumber(): Promise<bigint> {
    const value = await this.call<string>('eth_blockNumber', []);
    return BigInt(value);
  }
}
