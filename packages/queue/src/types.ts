export type JobData = {
  email: { to: string; subject: string; body: string };
  'onchain-tx': { chainId: number; to: `0x${string}`; data: `0x${string}` };
  analytics: { event: string; userId: string; properties: Record<string, unknown> };
};

export type JobResult = {
  success: boolean;
  timestamp: string;
  data?: unknown;
};
