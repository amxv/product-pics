#!/usr/bin/env tsx
import { db, userTable, batchTable, generatedImageTable } from '../db';
import { eq, and, count } from 'drizzle-orm';

/**
 * Backfill script to update existing users with their actual photo generation counts
 * Run this once after adding the totalPhotosGenerated and photoGenerationLimit fields
 */
async function backfillUserPhotoCounts() {
  try {
    console.log('🔄 Starting backfill of user photo counts...\n');

    // Fetch all users
    const users = await db.select().from(userTable);

    console.log(`Found ${users.length} users to process\n`);

    let updatedCount = 0;
    let skippedCount = 0;

    // Process each user
    for (const user of users) {
      try {
        // Count completed photos for this user
        const [result] = await db
          .select({ count: count() })
          .from(generatedImageTable)
          .innerJoin(batchTable, eq(generatedImageTable.batchId, batchTable.id))
          .where(
            and(
              eq(batchTable.userId, user.id),
              eq(generatedImageTable.status, 'completed')
            )
          );

        const totalPhotos = result.count;

        // Only update if the count has changed
        if (totalPhotos !== user.totalPhotosGenerated) {
          await db
            .update(userTable)
            .set({ totalPhotosGenerated: totalPhotos })
            .where(eq(userTable.id, user.id));

          console.log(`✓ Updated user ${user.email}: ${totalPhotos} photos`);
          updatedCount++;
        } else {
          console.log(`- Skipped user ${user.email}: already accurate (${totalPhotos} photos)`);
          skippedCount++;
        }
      } catch (error) {
        console.error(`✗ Error processing user ${user.email}:`, error);
      }
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Backfill Summary');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`  Total users:    ${users.length}`);
    console.log(`  Updated:        ${updatedCount}`);
    console.log(`  Skipped:        ${skippedCount}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n✅ Backfill complete!\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Fatal error during backfill:', error);
    process.exit(1);
  }
}

// Run the backfill
backfillUserPhotoCounts();
