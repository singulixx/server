import cron from 'node-cron';
import { prisma } from '../db.js';
import { importTransactionsMock, syncStockMock } from '../services/marketplace-mock.js';

export function scheduleJobs() {
  // Every 30 minutes: import (mock) transactions
  cron.schedule('*/30 * * * *', async () => {
    const channels = await prisma.channelAccount.findMany({ where: { active: true } });
    for (const ch of channels) {
      await importTransactionsMock(ch.id, 1);
      await syncStockMock(ch.id);
    }
  });
}
