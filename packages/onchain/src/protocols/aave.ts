import { getPublicClient } from '../client.js';
import { mainnet } from 'viem/chains';

// Aave v3 Pool address — Ethereum mainnet
const AAVE_POOL = '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2' as const;

export async function getAaveUserData(userAddress: `0x${string}`) {
  const client = getPublicClient(mainnet);
  // getUserAccountData(address)
  const data = await client.readContract({
    address: AAVE_POOL,
    abi: [
      {
        name: 'getUserAccountData',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'user', type: 'address' }],
        outputs: [
          { name: 'totalCollateralBase', type: 'uint256' },
          { name: 'totalDebtBase', type: 'uint256' },
          { name: 'availableBorrowsBase', type: 'uint256' },
          { name: 'currentLiquidationThreshold', type: 'uint256' },
          { name: 'ltv', type: 'uint256' },
          { name: 'healthFactor', type: 'uint256' },
        ],
      },
    ] as const,
    functionName: 'getUserAccountData',
    args: [userAddress],
  });
  return data;
}
