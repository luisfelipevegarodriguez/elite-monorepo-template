import { getPublicClient } from '../client.js';
import { mainnet } from 'viem/chains';

// Pendle v2 Router — Ethereum mainnet
const PENDLE_ROUTER = '0x888888888889758F76e7103c6CbF23ABbF58F946' as const;

// Pendle v2 Market ABI (subset)
const MARKET_ABI = [
  {
    name: 'readState',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'router', type: 'address' }],
    outputs: [
      { name: 'totalPt', type: 'int256' },
      { name: 'totalSy', type: 'int256' },
      { name: 'totalLp', type: 'uint256' },
      { name: 'treasury', type: 'address' },
      { name: 'scalarRoot', type: 'int256' },
      { name: 'expiry', type: 'uint256' },
      { name: 'lnFeeRateRoot', type: 'uint256' },
      { name: 'reserveFeePercent', type: 'uint256' },
      { name: 'lastLnImpliedRate', type: 'uint256' },
    ],
  },
  {
    name: 'expiry',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
] as const;

const PT_ABI = [
  {
    name: 'decimals',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint8' }],
  },
  {
    name: 'symbol',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'string' }],
  },
  {
    name: 'expiry',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'isExpired',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'bool' }],
  },
] as const;

export type PendleMarketState = {
  market: `0x${string}`;
  totalPt: bigint;
  totalSy: bigint;
  totalLp: bigint;
  expiry: Date;
  isExpired: boolean;
  impliedApy: number;
};

export type PendlePTInfo = {
  address: `0x${string}`;
  symbol: string;
  decimals: number;
  expiry: Date;
  isExpired: boolean;
};

/**
 * Lee el estado de un mercado Pendle v2
 * @param marketAddress - Dirección del mercado PT/SY/LP
 */
export async function getPendleMarketState(
  marketAddress: `0x${string}`,
): Promise<PendleMarketState> {
  const client = getPublicClient(mainnet);

  const state = await client.readContract({
    address: marketAddress,
    abi: MARKET_ABI,
    functionName: 'readState',
    args: [PENDLE_ROUTER],
  });

  const expiryTs = Number(state[5]) * 1000;
  const now = Date.now();

  // Calcular APY implícita desde lastLnImpliedRate (rate en formato ln)
  // impliedRate = e^(lastLnImpliedRate / 1e18) - 1
  const lnRate = Number(state[8]) / 1e18;
  const impliedApy = (Math.exp(lnRate) - 1) * 100;

  return {
    market: marketAddress,
    totalPt: state[0] < 0n ? -state[0] : state[0],
    totalSy: state[1] < 0n ? -state[1] : state[1],
    totalLp: state[2],
    expiry: new Date(expiryTs),
    isExpired: now > expiryTs,
    impliedApy,
  };
}

/**
 * Lee info de un token PT (Principal Token) de Pendle
 * @param ptAddress - Dirección del PT token
 */
export async function getPTPendleInfo(
  ptAddress: `0x${string}`,
): Promise<PendlePTInfo> {
  const client = getPublicClient(mainnet);

  const [symbol, decimals, expiry, isExpired] = await Promise.all([
    client.readContract({ address: ptAddress, abi: PT_ABI, functionName: 'symbol' }),
    client.readContract({ address: ptAddress, abi: PT_ABI, functionName: 'decimals' }),
    client.readContract({ address: ptAddress, abi: PT_ABI, functionName: 'expiry' }),
    client.readContract({ address: ptAddress, abi: PT_ABI, functionName: 'isExpired' }),
  ]);

  return {
    address: ptAddress,
    symbol,
    decimals,
    expiry: new Date(Number(expiry) * 1000),
    isExpired,
  };
}

/**
 * Mercados Pendle activos conocidos (mainnet)
 * Fuente: https://app.pendle.finance/trade/markets
 */
export const PENDLE_MARKETS = {
  // PT-eETH - 26 DEC 2025
  PT_EETH_DEC25: '0xF32e58F92e60f4b0A37a69b95d642A471365EAe8' as const,
  // PT-USDe - 27 MAR 2025
  PT_USDE_MAR25: '0x8A791620dd6260079BF849Dc5567aDC3F2FdC318' as const,
  // PT-sUSDe - 25 SEP 2025
  PT_SUSDE_SEP25: '0x107a2e3cD2BB9b32bB7D9dFB4f4b6Fc53F894Aa' as const,
} as const;
