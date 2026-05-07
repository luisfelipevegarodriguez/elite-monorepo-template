import { createPublicClient, createWalletClient, http, type Chain } from 'viem';
import { mainnet, base, optimism } from 'viem/chains';

export const SUPPORTED_CHAINS: Record<string, Chain> = { mainnet, base, optimism };

export function getPublicClient(chain: Chain = mainnet) {
  return createPublicClient({
    chain,
    transport: http(process.env.RPC_URL ?? undefined),
  });
}

export function createViemClient(chain: Chain = mainnet) {
  return createWalletClient({
    chain,
    transport: http(process.env.RPC_URL ?? undefined),
  });
}
