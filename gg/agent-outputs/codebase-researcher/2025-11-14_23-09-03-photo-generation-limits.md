# Research: Photo Generation System and Limit Implementation

## Overview

This Next.js application generates product photos with models using RunPod's AI image generation service. The system uses a batch-based processing model where users upload product images, select demographic parameters, and the system generates photos of models wearing/using those products in various natural settings. Currently implements a per-batch limit of 100 images. This research analyzes the codebase to understand how to implement a lifetime 600-photo limit per account.

## Key Findings Summary

- **Current Limit**: 100 images per batch (enforced at upload time)
- **Database**: No existing tracking for lifetime photo generation counts per user
- **User Schema**: Basic user/account tables from better-auth, no limit-related fields
- **Enforcement Points**: Presigned URL generation and validation functions
- **Tracking Data**: All generated images linked to batches, batches linked to users

---

## 1. Photo Generation Batch Processing

### Entry Points

- **API Route**: `/src/app/api/generate/submit/route.ts:18` - POST endpoint for initiating batch generation
- **Batch Creation**: `/src/app/api/batches/route.ts:12` - POST endpoint for creating new batch
- **Status Polling**: `/src/app/api/generate/poll/[batchId]/route.ts:23` - GET endpoint for checking batch progress

### Core Implementation Flow

#### 1.1 Batch Creation (`/src/app/api/batches/route.ts`)

**Lines 36-47**: Creates initial batch record
```typescript
const batchId = nanoid();
await db.insert(batchTable).values({
  id: batchId,
  userId: session.user.id,
  demographic,
  ageRange,
  status: 'uploading',
  totalImages: 0,
  completedImages: 0,
  failedImages: 0,
});
```

- Batch starts in 'uploading' status
- User ID is linked to batch for ownership tracking
- Counters initialized to 0 (totalImages, completedImages, failedImages)

#### 1.2 Image Upload Process

**Presigned URL Generation** (`/src/app/api/upload/presigned-url/route.ts`)

- **Lines 68-72**: Counts existing images in batch to enforce 100-image limit
```typescript
const [{ count: imageCount }] = await db
  .select({ count: count() })
  .from(uploadedImageTable)
  .where(eq(uploadedImageTable.batchId, batchId));
```

- **Lines 74-80**: **ENFORCEMENT POINT** - Rejects if batch already has 100 images
```typescript
if (imageCount >= 100) {
  return NextResponse.json(
    { error: 'Batch has reached the maximum of 100 images' },
    { status: 400 }
  );
}
```

- **Lines 86-94**: Creates uploaded_image record with status 'pending'
- Returns presigned S3/R2 URL for client-side upload

**Upload Completion** (`/src/app/api/upload/complete/route.ts`)

- **Lines 85-105**: Updates uploaded_image status to 'uploaded' and increments batch totalImages count
```typescript
if (success) {
  const uploadUpdateResult = await db
    .update(uploadedImageTable)
    .set({ status: 'uploaded' })
    .where(
      and(
        eq(uploadedImageTable.id, uploadedImageId),
        eq(uploadedImageTable.status, 'pending')
      )
    )
    .returning();

  // Increment batch totalImages count only if status was actually updated
  if (uploadUpdateResult.length > 0) {
    await db
      .update(batchTable)
      .set({
        totalImages: sql`${batchTable.totalImages} + 1`,
      })
      .where(eq(batchTable.id, uploadedImage.batchId));
  }
}
```

#### 1.3 Generation Submission (`/src/app/api/generate/submit/route.ts`)

**Lines 65-71**: Verifies batch status is 'uploaded' before processing
```typescript
if (batch.status !== 'uploaded') {
  return NextResponse.json(
    { error: `Batch status must be "uploaded", current status: ${batch.status}` },
    { status: 400 }
  );
}
```

**Lines 74-101**: Fetches and validates uploaded images
- Filters images by status (uploaded, failed, pending)
- Rejects if no successfully uploaded images found

**Lines 112-113**: Assigns random backgrounds from pool
```typescript
const backgrounds = assignBackgrounds(uploadedImages.length);
```

**Lines 117-241**: Processes each image with p-limit concurrency control (max 10 concurrent)
- Fetches image from R2 storage
- Converts to PNG format
- Uploads PNG to temporary location
- Generates presigned URL for temp image
- Creates AI prompt based on demographic, age range, and background
- Submits job to RunPod API
- Creates generated_image and runpod_job database records

**Lines 179-187**: Creates generated_image record with status 'processing'
```typescript
await db.insert(generatedImageTable).values({
  id: generatedImageId,
  batchId: batch.id,
  uploadedImageId: uploadedImage.id,
  status: 'processing',
  background,
  runpodJobId: null,
  retryCount: 0,
});
```

**Lines 265-272**: Updates batch status to 'processing' after all jobs submitted

#### 1.4 Polling and Completion (`/src/app/api/generate/poll/[batchId]/route.ts`)

**Lines 62-116**: Implements 30-minute timeout mechanism
- Checks elapsed time since processing started
- Marks timed-out jobs as failed
- Updates batch status to 'partial' or 'failed'

**Lines 118-144**: Returns early if no processing images

**Lines 146-366**: Polls RunPod status for each processing image (max 10 concurrent checks using p-limit)
- **COMPLETED**: Downloads result, uploads to R2, updates status, increments completedImages
- **FAILED**: Implements retry logic with exponential backoff (max 3 retries), increments failedImages
- **IN_QUEUE/IN_PROGRESS**: No action, continues polling

**Lines 173-227**: Handles completed jobs
```typescript
if (statusResponse.status === 'COMPLETED') {
  const imageBuffer = await downloadResult(resultUrl);
  const generatedKey = generateGeneratedKey(batch.userId, batchId, generatedImage.id);
  // Upload to R2
  await r2Client.send(putCommand);

  // Update generated_image status (only if still processing)
  await db.update(generatedImageTable).set({
    status: 'completed',
    r2Key: generatedKey,
    completedAt: new Date(),
  });

  // Increment batch completed count (atomic)
  await db.update(batchTable).set({
    completedImages: sql`${batchTable.completedImages} + 1`,
  });
}
```

**Lines 370-413**: Finalizes batch when all images complete
- Determines final status: 'completed', 'partial', or 'failed'
- Updates batch with final counts and completedAt timestamp

### Data Flow Summary

1. **Batch Creation** → `batchTable` record with userId
2. **Upload Request** → Count check → Create `uploadedImageTable` record (status: pending)
3. **Client Upload** → Update `uploadedImageTable` (status: uploaded) → Increment batch.totalImages
4. **Generation Submit** → Create `generatedImageTable` + `runpodJobTable` records → Update batch (status: processing)
5. **Polling Loop** → Check RunPod status → Download results → Update records → Increment counters
6. **Completion** → Update batch (status: completed/partial/failed, completedAt timestamp)

---

## 2. Current Per-Batch Limit (100 Images)

### Enforcement Location

**Primary Enforcement**: `/src/app/api/upload/presigned-url/route.ts:74-80`

```typescript
// Count existing images in batch
const [{ count: imageCount }] = await db
  .select({ count: count() })
  .from(uploadedImageTable)
  .where(eq(uploadedImageTable.batchId, batchId));

// Verify total images < 100
if (imageCount >= 100) {
  return NextResponse.json(
    { error: 'Batch has reached the maximum of 100 images' },
    { status: 400 }
  );
}
```

This is a **hardcoded check** - not using the validation function.

### Validation Function (Currently Unused)

**Location**: `/src/lib/validation.ts:108-112`

```typescript
/**
 * Validate batch image count is within limits
 * @param count - Number of images in batch
 * @param maxCount - Maximum allowed images (default: 100)
 * @throws AppError(400) if count exceeds limit
 */
export function validateBatchImageCount(count: number, maxCount: number = 100): void {
  if (count > maxCount) {
    throw createError.badRequest(ERROR_MESSAGES.BATCH_LIMIT_EXCEEDED);
  }
}
```

**Note**: This validation function exists but is **NOT currently called** anywhere in the codebase.

### Error Message

**Location**: `/src/lib/errors.ts:38`

```typescript
BATCH_LIMIT_EXCEEDED: 'Batch size exceeds maximum of 100 images',
```

### Limit Value

The value `100` appears in:
- Presigned URL route (hardcoded): `/src/app/api/upload/presigned-url/route.ts:75`
- Validation function (default parameter): `/src/lib/validation.ts:108`
- Error message: `/src/lib/errors.ts:38`

---

## 3. Database Schema

### 3.1 User/Account Tables

**Location**: `/home/user/product-pics/db/schema.ts`

#### User Table (Lines 17-28)

```typescript
export const userTable = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  // Username plugin extension
  username: text('username').unique(),
  displayUsername: text('display_username'),
});
```

**Key Observations**:
- Uses better-auth standard schema
- **No fields for tracking photo generation limits**
- **No fields for counting total photos generated**
- Only basic user information and timestamps

#### Account Table (Lines 43-57)

```typescript
export const accountTable = pgTable('account', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => userTable.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  expiresAt: timestamp('expires_at'),
  password: text('password'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
```

**Key Observations**:
- Used for authentication provider data (OAuth, password, etc.)
- **No limit tracking fields**

### 3.2 Application Tables

#### Batch Table (Lines 72-99)

```typescript
export const batchTable = pgTable('batch', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => userTable.id, { onDelete: 'cascade' }),
  demographic: demographicEnum('demographic').notNull(),
  ageRange: text('age_range').notNull(),
  status: batchStatusEnum('status').notNull().default('uploading'),
  totalImages: integer('total_images').notNull().default(0),
  completedImages: integer('completed_images').notNull().default(0),
  failedImages: integer('failed_images').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  completedAt: timestamp('completed_at'),
}, (table) => ({
  userIdIdx: { name: 'batch_user_id_idx', columns: [table.userId] },
  statusIdx: { name: 'batch_status_idx', columns: [table.status] },
  createdAtIdx: { name: 'batch_created_at_idx', columns: [table.createdAt] },
}));
```

**Key Observations**:
- Links to userId (foreign key with cascade delete)
- Tracks per-batch counts: totalImages, completedImages, failedImages
- Has indexed userId column for efficient querying
- Status enum: 'uploading', 'uploaded', 'processing', 'completed', 'partial', 'failed'

#### Generated Image Table (Lines 120-149)

```typescript
export const generatedImageTable = pgTable('generated_image', {
  id: text('id').primaryKey(),
  batchId: text('batch_id')
    .notNull()
    .references(() => batchTable.id, { onDelete: 'cascade' }),
  uploadedImageId: text('uploaded_image_id')
    .notNull()
    .references(() => uploadedImageTable.id),
  r2Key: text('r2_key'),
  status: generationStatusEnum('status').notNull().default('pending'),
  retryCount: integer('retry_count').notNull().default(0),
  background: text('background'),
  runpodJobId: text('runpod_job_id'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  completedAt: timestamp('completed_at'),
}, (table) => ({
  batchIdIdx: { name: 'generated_image_batch_id_idx', columns: [table.batchId] },
  uploadedImageIdIdx: { name: 'generated_image_uploaded_image_id_idx', columns: [table.uploadedImageId] },
  statusIdx: { name: 'generated_image_status_idx', columns: [table.status] },
}));
```

**Key Observations**:
- Each generated image is linked to a batch (which is linked to a user)
- Status enum: 'pending', 'processing', 'completed', 'failed'
- Has completedAt timestamp to track when generation finished
- Indexed on batchId and status for efficient querying

### 3.3 Current Limit Tracking Capability

**What Exists**:
- Relationship chain: `generatedImageTable` → `batchTable` → `userTable`
- Per-batch counters: totalImages, completedImages, failedImages
- Timestamps: createdAt, updatedAt, completedAt

**What's Missing**:
- **No field on userTable for total photos generated**
- **No field on userTable for remaining photo quota**
- **No field on userTable for account limits**
- **No separate limit tracking table**

**How to Calculate Current Total** (requires query):
```sql
SELECT COUNT(*)
FROM generated_image gi
JOIN batch b ON gi.batch_id = b.id
WHERE b.user_id = ? AND gi.status = 'completed'
```

---

## 4. API Routes for Photo Generation

### 4.1 Batch Management

#### POST `/api/batches`
- **File**: `/src/app/api/batches/route.ts`
- **Purpose**: Create new batch
- **Input**: `{ demographic, ageRange }`
- **Output**: `{ batchId, demographic, ageRange }`
- **Validation**: Zod schema validation (`createBatchSchema`)
- **Database**: Inserts into batchTable with status 'uploading'

### 4.2 Upload Management

#### POST `/api/upload/presigned-url`
- **File**: `/src/app/api/upload/presigned-url/route.ts`
- **Purpose**: Generate presigned URL for client-side upload to R2
- **Input**: `{ batchId, fileName, fileType, fileSize }`
- **Limit Check**: **Line 74-80** - Enforces 100 image per batch limit
- **Validation**:
  - Session validation
  - Batch ownership
  - Batch status must be 'uploading'
  - File size max 20MB (enforced in Zod schema)
- **Database**: Creates uploadedImageTable record with status 'pending'
- **Output**: `{ presignedUrl, uploadedImageId, r2Key, expiresIn }`

#### POST `/api/upload/complete`
- **File**: `/src/app/api/upload/complete/route.ts`
- **Purpose**: Mark upload as complete after client uploads to R2
- **Input**: `{ uploadedImageId, success, errorMessage? }`
- **Database**:
  - Updates uploadedImageTable status to 'uploaded' or 'failed'
  - Increments batchTable.totalImages (only if status changed from pending)
- **Idempotency**: Checks if already processed (line 76-82)

### 4.3 Generation Management

#### POST `/api/generate/submit`
- **File**: `/src/app/api/generate/submit/route.ts`
- **Purpose**: Submit batch for generation to RunPod
- **Input**: `{ batchId }`
- **Validation**:
  - Session and batch ownership
  - Batch status must be 'uploaded'
  - At least one successfully uploaded image
- **Processing** (Lines 115-241):
  - Assigns backgrounds to images
  - Fetches each image from R2
  - Converts to PNG
  - Uploads temp PNG to R2
  - Generates AI prompt
  - Submits to RunPod API
  - Creates generatedImageTable and runpodJobTable records
- **Concurrency**: Uses p-limit (max 10 concurrent operations)
- **Error Handling**: Creates failed generatedImageTable records for submission failures
- **Database**: Updates batchTable status to 'processing'
- **Output**: `{ success, totalJobs, failedJobs }`

#### GET `/api/generate/poll/[batchId]`
- **File**: `/src/app/api/generate/poll/[batchId]/route.ts`
- **Purpose**: Check generation progress and update completed jobs
- **Validation**: Session, batch ownership
- **Processing**:
  - Implements 30-minute timeout (Lines 62-116)
  - Fetches all processing images
  - Polls RunPod status for each (max 10 concurrent, Lines 146-366)
  - Downloads completed images and uploads to R2
  - Implements retry logic with exponential backoff (max 3 retries)
  - Updates counters atomically
- **Output**: `BatchProgress { batchId, status, totalImages, completedImages, failedImages, processingImages }`
- **Finalization** (Lines 370-413): Updates batch status when all images complete

#### POST `/api/generate/retry`
- **File**: `/src/app/api/generate/retry/route.ts`
- **Purpose**: Retry failed image generations
- **Note**: Not read in detail, but exists for manual retry functionality

### 4.4 Download Management

#### GET `/api/download/[batchId]`
- **File**: `/src/app/api/download/[batchId]/route.ts`
- **Purpose**: Download all generated images as a zip file
- **Note**: Not read in detail

#### GET `/api/images/view-url`
- **File**: `/src/app/api/images/view-url/route.ts`
- **Purpose**: Generate presigned URLs for viewing images
- **Note**: Not read in detail

---

## 5. User/Account Data Storage and Photo Tracking

### 5.1 Current User Data Location

**Authentication**: Uses better-auth library
- **Config**: `/src/lib/auth.ts` (not read in detail)
- **Client**: `/src/lib/auth-client.ts` (not read in detail)
- **Session Validation**: All API routes use `auth.api.getSession()` to get current user

**User Creation**:
- **Script**: `/home/user/product-pics/scripts/create-user.ts` (not read in detail)
- Public signup is disabled (noted in git commits)

### 5.2 How to Track Total Photos Generated

#### Option 1: Add Fields to User Table (Recommended)

**Add to userTable schema** (`db/schema.ts`):
```typescript
export const userTable = pgTable('user', {
  // ... existing fields ...
  totalPhotosGenerated: integer('total_photos_generated').notNull().default(0),
  photoGenerationLimit: integer('photo_generation_limit').notNull().default(600),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
```

**Update Locations**:
1. Increment `totalPhotosGenerated` in polling route when image completes
   - File: `/src/app/api/generate/poll/[batchId]/route.ts`
   - Line: After line 227 (after batch.completedImages increment)

2. Check `totalPhotosGenerated < photoGenerationLimit` in presigned URL route
   - File: `/src/app/api/upload/presigned-url/route.ts`
   - Line: Before line 68 (before batch image count)

**Pros**:
- Simple, denormalized counter
- Fast to check (single user record lookup)
- No joins required

**Cons**:
- Requires migration
- Counter could get out of sync if not updated atomically
- Difficult to audit/recalculate

#### Option 2: Calculate on Demand (Alternative)

**Query all completed images for user**:
```typescript
// In presigned URL route, before creating upload record
const [{ count: userTotalPhotos }] = await db
  .select({ count: count() })
  .from(generatedImageTable)
  .innerJoin(batchTable, eq(generatedImageTable.batchId, batchTable.id))
  .where(
    and(
      eq(batchTable.userId, session.user.id),
      eq(generatedImageTable.status, 'completed')
    )
  );

if (userTotalPhotos >= 600) {
  return NextResponse.json(
    { error: 'Account has reached the lifetime limit of 600 photos' },
    { status: 403 }
  );
}
```

**Pros**:
- No schema changes
- Always accurate (no sync issues)
- Easy to audit

**Cons**:
- Slower (requires join and count on every upload request)
- More database load
- Could be expensive for users with many batches

#### Option 3: Hybrid Approach (Best of Both)

**Add counter to user table + periodic recalculation**:
1. Add `totalPhotosGenerated` field to userTable
2. Increment atomically when images complete
3. Add validation check that compares counter to actual count periodically
4. Include repair mechanism if mismatch detected

### 5.3 Existing Data Structures for Tracking

**Type Definitions** (`/src/lib/types.ts`):

```typescript
export type User = InferSelectModel<typeof userTable>;
export type Batch = InferSelectModel<typeof batchTable>;
export type GeneratedImage = InferSelectModel<typeof generatedImageTable>;

export type BatchWithImages = Batch & {
  uploadedImages: UploadedImage[];
  generatedImages: (GeneratedImage & {
    uploadedImage: UploadedImage;
  })[];
};

export type BatchProgress = {
  batchId: string;
  status: BatchStatus;
  totalImages: number;
  completedImages: number;
  failedImages: number;
  processingImages: number;
};
```

**Currently NOT tracking**:
- User-level photo counts
- User-level limits
- Quota information

---

## 6. Suggested Implementation for 600-Photo Lifetime Limit

### 6.1 Database Schema Changes

**File**: `/home/user/product-pics/db/schema.ts`

**Add fields to userTable** (after line 28):
```typescript
export const userTable = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  // Username plugin extension
  username: text('username').unique(),
  displayUsername: text('display_username'),
  // Photo generation limits
  totalPhotosGenerated: integer('total_photos_generated').notNull().default(0),
  photoGenerationLimit: integer('photo_generation_limit').notNull().default(600),
});
```

**Create migration**:
```bash
npm run db:generate
npm run db:migrate
```

**Backfill existing users** (create script):
```typescript
// Update existing users with their actual counts
const users = await db.select().from(userTable);
for (const user of users) {
  const [{ count: totalPhotos }] = await db
    .select({ count: count() })
    .from(generatedImageTable)
    .innerJoin(batchTable, eq(generatedImageTable.batchId, batchTable.id))
    .where(
      and(
        eq(batchTable.userId, user.id),
        eq(generatedImageTable.status, 'completed')
      )
    );

  await db
    .update(userTable)
    .set({ totalPhotosGenerated: totalPhotos })
    .where(eq(userTable.id, user.id));
}
```

### 6.2 Error Message Addition

**File**: `/src/lib/errors.ts`

**Add new error message** (after line 38):
```typescript
export const ERROR_MESSAGES = {
  // ... existing messages ...
  BATCH_LIMIT_EXCEEDED: 'Batch size exceeds maximum of 100 images',
  ACCOUNT_LIMIT_EXCEEDED: 'Account has reached the lifetime limit of 600 photos',
  // ... rest of messages ...
} as const;
```

### 6.3 Validation Function Addition

**File**: `/src/lib/validation.ts`

**Add new validation function** (after line 112):
```typescript
/**
 * Validate user has not exceeded lifetime photo generation limit
 * @param user - The user object to check
 * @throws AppError(403) if user has exceeded limit
 */
export function validateAccountPhotoLimit(user: User): void {
  if (user.totalPhotosGenerated >= user.photoGenerationLimit) {
    throw createError.forbidden(
      `${ERROR_MESSAGES.ACCOUNT_LIMIT_EXCEEDED}. You have generated ${user.totalPhotosGenerated} out of ${user.photoGenerationLimit} allowed photos.`
    );
  }
}

/**
 * Validate that generating N more photos won't exceed account limit
 * @param user - The user object to check
 * @param additionalPhotos - Number of photos to generate
 * @throws AppError(403) if generating would exceed limit
 */
export function validateAccountPhotoCapacity(user: User, additionalPhotos: number): void {
  const projectedTotal = user.totalPhotosGenerated + additionalPhotos;
  if (projectedTotal > user.photoGenerationLimit) {
    const remaining = user.photoGenerationLimit - user.totalPhotosGenerated;
    throw createError.forbidden(
      `Cannot generate ${additionalPhotos} photos. You have ${remaining} photos remaining out of your ${user.photoGenerationLimit} lifetime limit.`
    );
  }
}
```

**Update type import** (line 7):
```typescript
import type { Batch, BatchStatus, User } from './types';
```

### 6.4 Type Definitions Update

**File**: `/src/lib/types.ts`

**Add user limit type** (after line 73):
```typescript
export type UserWithLimits = User & {
  remainingPhotos: number;
  photoUsagePercentage: number;
};
```

### 6.5 Enforcement at Upload Time

**File**: `/src/app/api/upload/presigned-url/route.ts`

**Add check before batch limit** (after line 66, before line 68):
```typescript
// Verify batch status is "uploading"
if (batch.status !== 'uploading') {
  return NextResponse.json(
    { error: 'Batch is not in uploading state' },
    { status: 400 }
  );
}

// NEW: Fetch user to check account limits
const [user] = await db
  .select()
  .from(userTable)
  .where(eq(userTable.id, session.user.id))
  .limit(1);

if (!user) {
  return NextResponse.json({ error: 'User not found' }, { status: 404 });
}

// NEW: Check account-level photo limit
if (user.totalPhotosGenerated >= user.photoGenerationLimit) {
  return NextResponse.json(
    {
      error: `Account has reached the lifetime limit of ${user.photoGenerationLimit} photos. You have generated ${user.totalPhotosGenerated} photos.`,
      code: 'ACCOUNT_LIMIT_EXCEEDED',
      details: {
        limit: user.photoGenerationLimit,
        used: user.totalPhotosGenerated,
        remaining: 0
      }
    },
    { status: 403 }
  );
}

// Count existing images in batch
const [{ count: imageCount }] = await db
  .select({ count: count() })
  .from(uploadedImageTable)
  .where(eq(uploadedImageTable.batchId, batchId));

// Verify total images < 100
if (imageCount >= 100) {
  return NextResponse.json(
    { error: 'Batch has reached the maximum of 100 images' },
    { status: 400 }
  );
}
```

**Add import** (after line 10):
```typescript
import { eq, count } from 'drizzle-orm';
import { userTable } from '../../../../../db/schema'; // Add userTable import
```

### 6.6 Increment Counter When Images Complete

**File**: `/src/app/api/generate/poll/[batchId]/route.ts`

**Update counter after successful completion** (after line 226):
```typescript
// Increment batch completed count (atomic)
await db
  .update(batchTable)
  .set({
    completedImages: sql`${batchTable.completedImages} + 1`,
  })
  .where(eq(batchTable.id, batchId));

// NEW: Increment user's total photos generated (atomic)
await db
  .update(userTable)
  .set({
    totalPhotosGenerated: sql`${userTable.totalPhotosGenerated} + 1`,
  })
  .where(eq(userTable.id, batch.userId));
```

**Add import** (after line 4):
```typescript
import { db, batchTable, generatedImageTable, runpodJobTable, uploadedImageTable, userTable } from '../../../../../../db';
```

### 6.7 Display Remaining Quota to Users

**Create new API endpoint**: `/src/app/api/user/quota/route.ts`
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db, userTable } from '../../../../db';
import { eq } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [user] = await db
      .select({
        totalPhotosGenerated: userTable.totalPhotosGenerated,
        photoGenerationLimit: userTable.photoGenerationLimit,
      })
      .from(userTable)
      .where(eq(userTable.id, session.user.id))
      .limit(1);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const remaining = user.photoGenerationLimit - user.totalPhotosGenerated;
    const usagePercentage = Math.round(
      (user.totalPhotosGenerated / user.photoGenerationLimit) * 100
    );

    return NextResponse.json({
      totalGenerated: user.totalPhotosGenerated,
      limit: user.photoGenerationLimit,
      remaining,
      usagePercentage,
    });
  } catch (error) {
    console.error('Error fetching user quota:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

**Add UI component to display quota** (could be in header, dashboard, or batch form):
```typescript
// Example usage in batch form or layout
const { data: quota } = useSWR('/api/user/quota');

// Display: "Photos remaining: 450 / 600 (75% used)"
```

### 6.8 Admin Override Capability

**Add to user creation script** (`/home/user/product-pics/scripts/create-user.ts`):
```typescript
// Allow setting custom limits for specific users
const photoLimit = parseInt(process.env.PHOTO_LIMIT || '600');

await db.insert(userTable).values({
  // ... other fields ...
  photoGenerationLimit: photoLimit,
  totalPhotosGenerated: 0,
});
```

---

## 7. Implementation Checklist

### Phase 1: Database Setup
- [ ] Add `totalPhotosGenerated` and `photoGenerationLimit` fields to userTable schema
- [ ] Generate and run database migration
- [ ] Create backfill script to populate existing users' counts
- [ ] Run backfill script on production data

### Phase 2: Backend Updates
- [ ] Add `ACCOUNT_LIMIT_EXCEEDED` error message to errors.ts
- [ ] Add validation functions to validation.ts
- [ ] Update presigned-url route to check account limit
- [ ] Update polling route to increment user counter
- [ ] Create quota API endpoint
- [ ] Update user creation script to set default limits

### Phase 3: Testing
- [ ] Test account limit enforcement at upload time
- [ ] Test counter increment on successful generation
- [ ] Test quota API endpoint
- [ ] Test with user at exactly 600 photos
- [ ] Test with user approaching limit (e.g., 595 photos, trying to upload 10)
- [ ] Test error messages and response codes
- [ ] Test atomic counter updates under concurrent requests

### Phase 4: UI Updates
- [ ] Add quota display component
- [ ] Update batch form to show remaining photos
- [ ] Add warning when approaching limit
- [ ] Update error handling to show account limit errors
- [ ] Add "upgrade account" messaging when limit reached (if applicable)

### Phase 5: Monitoring
- [ ] Add logging for limit violations
- [ ] Create admin dashboard to view user quotas
- [ ] Add metrics for quota usage patterns
- [ ] Set up alerts for users reaching limits

---

## 8. Additional Considerations

### 8.1 Edge Cases to Handle

1. **Concurrent Uploads**:
   - User might upload to multiple batches simultaneously
   - Use database transactions or atomic operations
   - Consider checking limit at batch submission time (not just upload time)

2. **Failed Generations**:
   - Should failed images count against the limit?
   - Current recommendation: Only count completed images
   - Implementation already uses `status = 'completed'` check

3. **Deleted Batches**:
   - If user deletes a batch, should their counter decrease?
   - Current recommendation: No - limit is lifetime generation count
   - Alternative: Track "active" vs "deleted" photos separately

4. **Retry Logic**:
   - Retried images should not increment counter multiple times
   - Current polling route only increments on first completion (status check prevents double-increment)

5. **Partial Batches**:
   - User uploads 100 images but only 50 complete successfully
   - Only the 50 completed images should count against limit
   - Current implementation handles this correctly

### 8.2 Performance Optimization

1. **Cache User Limits**:
   - Consider caching user quota in session or Redis
   - Invalidate on counter updates
   - Reduces database queries on every upload

2. **Batch Counter Updates**:
   - Could update user counter in bulk after entire batch completes
   - Trade-off: Less accurate during generation, but fewer DB writes
   - Current recommendation: Update per-image for accuracy

3. **Read Replicas**:
   - Quota checks can use read replicas
   - Counter increments must use primary database

### 8.3 Future Enhancements

1. **Tiered Limits**:
   - Different limits for different user tiers
   - Add `userTier` field to userTable
   - Map tier to limit in application logic

2. **Time-Based Limits**:
   - Monthly quota that resets
   - Add `quotaResetAt` timestamp
   - Track `photosThisMonth` separately

3. **Audit Trail**:
   - Create `user_quota_history` table
   - Log quota changes with timestamps
   - Enable quota usage analysis

4. **Proactive Notifications**:
   - Email user at 80%, 90%, 95% of limit
   - Show warning in UI before hitting limit

---

## Summary

The current implementation has a solid foundation for adding a lifetime account limit:

1. **Current State**: Only enforces 100 images per batch at upload time
2. **Database**: No user-level limit tracking exists yet
3. **Data Relationships**: Can easily query total completed images per user
4. **Best Approach**: Add counter fields to userTable, increment on completion, check at upload
5. **Enforcement Points**:
   - Primary: Presigned URL generation (before upload)
   - Secondary: Generation submission (before processing batch)
6. **Key Files to Modify**:
   - `/home/user/product-pics/db/schema.ts` - Add fields
   - `/src/lib/errors.ts` - Add error message
   - `/src/lib/validation.ts` - Add validation functions
   - `/src/app/api/upload/presigned-url/route.ts` - Check limit
   - `/src/app/api/generate/poll/[batchId]/route.ts` - Increment counter
   - Create `/src/app/api/user/quota/route.ts` - Display quota

The implementation is straightforward and follows existing patterns in the codebase.
