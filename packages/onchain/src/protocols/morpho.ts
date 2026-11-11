import { getPublicClient } from '../client.js';
import { mainnet } from 'viem/chains';

// Morpho Blue — Ethereum mainnet
const MORPHO_BLUE = '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb' as const;

export async function getMorphoPosition(
  marketId: `0x${string}`,
  userAddress: `0x${string}`,
) {
  const client = getPublicClient(mainnet);
  const position = await client.readContract({
    address: MORPHO_BLUE,
    abi: [
      {
        name: 'position',
        type: 'function',
        stateMutability: 'view',
        inputs: [
          { name: 'id', type: 'bytes32' },
          { name: 'user', type: 'address' },
        ],
        outputs: [
          { name: 'supplyShares', type: 'uint256' },
          { name: 'borrowShares', type: 'uint128' },
          { name: 'collateral', type: 'uint128' },
        ],
      },
    ] as const,
    functionName: 'position',
    args: [marketId, userAddress],
  });
  return position;
}
