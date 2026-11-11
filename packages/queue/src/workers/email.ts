import { createWorker } from '../queue.js';
import { QUEUE_NAMES } from '../constants.js';
import type { JobData, JobResult } from '../types.js';

export const emailWorker = createWorker<JobData['email'], JobResult>(
  QUEUE_NAMES.EMAIL,
  async (job) => {
    // Integra aquí Resend, SendGrid, etc.
    console.log(`Sending email to ${job.data.to}: ${job.data.subject}`);
    return { success: true, timestamp: new Date().toISOString() };
  },
);
