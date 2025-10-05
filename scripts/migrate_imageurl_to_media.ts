// ts-node server/scripts/migrate_imageurl_to_media.ts
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const products = await prisma.product.findMany({
    where: { imageUrl: { not: null }, isDeleted: false },
    select: { id: true, imageUrl: true },
  });

  let moved = 0;
  for (const p of products) {
    const url = p.imageUrl as string;
    // Check if already exists in ProductMedia
    const exists = await prisma.productMedia.findFirst({ where: { productId: p.id, url } });
    if (exists) continue;
    const ext = (url || '').toLowerCase();
    const isImg = ['.png','.jpg','.jpeg','.gif','.webp','.bmp','.svg'].some((e) => ext.endsWith(e));
    await prisma.productMedia.create({
      data: {
        productId: p.id,
        url,
        kind: isImg ? 'IMAGE' : 'DOCUMENT',
      },
    });
    moved++;
  }

  console.log(`Done. Migrated ${moved} imageUrl entries to ProductMedia.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
