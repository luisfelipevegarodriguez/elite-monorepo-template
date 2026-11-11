export const QUEUE_NAMES = {
  EMAIL: 'email',
  ONCHAIN_TX: 'onchain-tx',
  ANALYTICS: 'analytics',
} as const;

export type QueueName = typeof QUEUE_NAMES[keyof typeof QUEUE_NAMES];
