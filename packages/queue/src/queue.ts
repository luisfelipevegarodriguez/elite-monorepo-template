import { Queue, Worker, type Processor } from 'bullmq';
import IORedis from 'ioredis';

const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

export function createQueue<T>(name: string): Queue<T> {
  return new Queue<T>(name, { connection });
}

export function createWorker<T, R>(
  name: string,
  processor: Processor<T, R>,
  concurrency = 5,
): Worker<T, R> {
  return new Worker<T, R>(name, processor, { connection, concurrency });
}
