# Cloudflare R2 Integration Research - Next.js Product Pics App

**Generated:** 2025-11-21 15:16:15
**Research Focus:** Cloudflare R2 setup, presigned URLs, client-side uploads, and RunPod API integration

---

## Executive Summary

This Next.js application uses Cloudflare R2 (S3-compatible object storage) for storing both user-uploaded product images and AI-generated images from the RunPod API. The implementation features:

- **Direct client-side uploads** to R2 using presigned URLs
- **Server-side authentication** and authorization checks
- **Two-phase upload flow** with database tracking
- **Temporary image storage** for RunPod API processing
- **Automated cleanup** of temporary files
- **Multiple storage paths** for different image types (uploads, generated, temp)

---

## 1. Environment Configuration

### Required Environment Variables

The R2 integration requires the following environment variables (`src/lib/r2.ts:7-22`):

```typescript
// Required
R2_ACCOUNT_ID          // Cloudflare account ID
R2_ACCESS_KEY_ID       // R2 API access key
R2_SECRET_ACCESS_KEY   // R2 API secret key
R2_BUCKET_NAME         // R2 bucket name

// Optional
R2_PUBLIC_URL          // Public URL for R2 bucket (if using custom domain)
```

### Configuration Location

Environment variables are referenced in:
- **Core R2 client:** `src/lib/r2.ts`
- **All API routes** that interact with R2
- No `.env` file is committed to the repository (standard security practice)

---

## 2. Core R2 Configuration

### S3 Client Setup

**File:** `src/lib/r2.ts:5-19`

```typescript
import { S3Client } from '@aws-sdk/client-s3';
import { Agent } from 'https';

export const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: true, // Required for R2 compatibility
  requestHandler: {
    httpsAgent: new Agent({
      minVersion: 'TLSv1.2',
      maxVersion: 'TLSv1.3',
    }),
  },
});
```

**Key Configuration Details:**
- **Region:** `'auto'` - R2 automatically handles region routing
- **Endpoint:** Uses Cloudflare R2 endpoint format with account ID
- **Force Path Style:** `true` - Required for R2 compatibility with S3 SDK
- **TLS Configuration:** Custom HTTPS agent for macOS LibreSSL compatibility (lines 13-17)

### Storage Key Structure

**File:** `src/lib/r2.ts:24-38`

The application uses organized key prefixes for different image types:

```typescript
// Uploaded images: uploads/{userId}/{batchId}/{imageId}.png
function generateUploadKey(userId: string, batchId: string, imageId: string): string {
  return `uploads/${userId}/${batchId}/${imageId}.png`;
}

// Generated images: generated/{userId}/{batchId}/{imageId}.png
function generateGeneratedKey(userId: string, batchId: string, imageId: string): string {
  return `generated/${userId}/${batchId}/${imageId}.png`;
}

// Temporary images: temp/{randomId}.png
// Used for RunPod API processing, cleaned up after 24 hours
```

**Storage Organization:**
- `uploads/` - User-uploaded product images
- `generated/` - AI-generated images from RunPod
- `temp/` - Temporary images for RunPod processing (auto-cleaned)

### Public URL Support

**File:** `src/lib/r2.ts:40-50`

```typescript
function getPublicUrl(key: string): string | null {
  if (R2_PUBLIC_URL) {
    return `${R2_PUBLIC_URL}/${key}`;
  }
  return null;
}
```

If `R2_PUBLIC_URL` is configured, images can be accessed via public URLs. Otherwise, presigned URLs are used for access control.

---

## 3. Client-Side Direct Upload Flow

### Overview

The application implements a secure three-phase upload flow:

1. **Client requests presigned URL** from server
2. **Client uploads directly to R2** using presigned URL (bypassing Next.js server)
3. **Client notifies server** of completion for database tracking

### Phase 1: Request Presigned URL

**API Route:** `POST /api/upload/presigned-url`
**File:** `src/app/api/upload/presigned-url/route.ts`

**Authentication & Authorization (lines 18-66):**

```typescript
// 1. Validate session
const session = await auth.api.getSession({ headers: await headers() });
if (!session?.user) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

// 2. Validate request body (batchId, fileName, fileType, fileSize)
const validation = presignedUrlRequestSchema.safeParse(body);

// 3. Verify batch exists and user owns it
const [batch] = await db.select().from(batchTable)
  .where(eq(batchTable.id, batchId)).limit(1);

if (batch.userId !== session.user.id) {
  return NextResponse.json(
    { error: 'You do not have permission to upload to this batch' },
    { status: 403 }
  );
}

// 4. Verify batch status is "uploading"
if (batch.status !== 'uploading') {
  return NextResponse.json(
    { error: 'Batch is not in uploading state' },
    { status: 400 }
  );
}

// 5. Verify image count < 100
const [{ count: imageCount }] = await db.select({ count: count() })
  .from(uploadedImageTable)
  .where(eq(uploadedImageTable.batchId, batchId));

if (imageCount >= 100) {
  return NextResponse.json(
    { error: 'Batch has reached the maximum of 100 images' },
    { status: 400 }
  );
}
```

**Database Record Creation (lines 82-94):**

```typescript
// Generate unique image ID
const imageId = nanoid();

// Create uploaded_image record with status="pending"
await db.insert(uploadedImageTable).values({
  id: imageId,
  batchId,
  originalFilename: fileName,
  r2Key: generateUploadKey(session.user.id, batchId, imageId),
  fileSize,
  mimeType: fileType,
  status: 'pending', // Will be updated to 'uploaded' after client completes
});
```

**Presigned URL Generation (lines 96-108):**

```typescript
// Generate R2 key
const r2Key = generateUploadKey(session.user.id, batchId, imageId);

// Generate presigned PUT URL (15-minute expiry)
const command = new PutObjectCommand({
  Bucket: R2_BUCKET_NAME,
  Key: r2Key,
  ContentType: fileType,
});

const presignedUrl = await getSignedUrl(r2Client, command, {
  expiresIn: 900, // 15 minutes
});
```

**Response (lines 111-117):**

```typescript
return NextResponse.json({
  presignedUrl,        // URL for direct R2 upload
  uploadedImageId: imageId,
  r2Key,
  expiresIn: 900,
});
```

### Phase 2: Client-Side Upload to R2

**Client Component:** `src/components/batch/upload-zone.tsx`
**Upload Utility:** `src/lib/upload.ts`

**Upload Zone Component (lines 57-89):**

```typescript
const uploadFile = async (file: File) => {
  try {
    // Request presigned URL
    const presignedResponse = await fetch('/api/upload/presigned-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        batchId,
        fileName: file.name,
        fileType: file.type as SupportedFormat,
        fileSize: file.size,
      }),
    });

    const presignedData: PresignedUrlResponse = await presignedResponse.json();

    // Upload to R2 with retry logic
    await retryUpload(async () => {
      await uploadToR2(presignedData.presignedUrl, file, (progress) => {
        // Update progress state
        setFiles((prev) => {
          const updated = new Map(prev);
          const fileState = updated.get(file.name);
          if (fileState) {
            updated.set(file.name, { ...fileState, progress });
          }
          return updated;
        });
      });
    });

    // ... (Phase 3: Mark complete)
  } catch (error) {
    // Handle error
  }
};
```

**Direct R2 Upload with Progress Tracking (`src/lib/upload.ts:4-43`):**

```typescript
export async function uploadToR2(
  presignedUrl: string,
  file: File,
  onProgress?: (progress: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    // Track upload progress
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && onProgress) {
        const percentComplete = Math.round((event.loaded / event.total) * 100);
        onProgress(percentComplete);
      }
    });

    // Handle completion
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    });

    // Handle errors
    xhr.addEventListener('error', () => {
      reject(new Error('Network error during upload'));
    });

    // Send the file
    xhr.open('PUT', presignedUrl);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.send(file);
  });
}
```

**Retry Logic with Exponential Backoff (`src/lib/upload.ts:49-73`):**

```typescript
export async function retryUpload(
  fn: () => Promise<void>,
  maxRetries: number = 3
): Promise<void> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await fn();
      return; // Success - exit
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Upload failed');

      // Don't wait after last attempt
      if (attempt < maxRetries - 1) {
        // Exponential backoff: 1s, 2s, 4s
        const delayMs = Math.pow(2, attempt) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError || new Error('Upload failed after retries');
}
```

### Phase 3: Mark Upload Complete

**API Route:** `POST /api/upload/complete`
**File:** `src/app/api/upload/complete/route.ts`

**Request Validation (lines 19-42):**

```typescript
// Validate session
const session = await auth.api.getSession({ headers: await headers() });

// Parse request body
const { uploadedImageId, success, errorMessage } = validation.data;
```

**Database Update with Idempotency (lines 76-119):**

```typescript
// Check if already processed (idempotency)
if (uploadedImage.status !== 'pending') {
  return NextResponse.json(
    { success: true, message: 'Already processed' },
    { status: 200 }
  );
}

// Update uploaded_image status (only if still pending)
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
} else {
  // Mark as failed
  await db
    .update(uploadedImageTable)
    .set({
      status: 'failed',
      errorMessage: errorMessage || 'Upload failed',
    })
    .where(
      and(
        eq(uploadedImageTable.id, uploadedImageId),
        eq(uploadedImageTable.status, 'pending')
      )
    );
}
```

**Key Features:**
- **Idempotency:** Multiple calls with same data won't duplicate database updates
- **Atomic counters:** Using SQL increment to avoid race conditions
- **Conditional updates:** Only updates records still in 'pending' status

---

## 4. RunPod API Integration and Image Storage

### Overview

When generating AI images, the app:
1. Fetches uploaded images from R2
2. Converts them to PNG and stores in temp location
3. Generates presigned URLs for RunPod API access
4. Polls for completion and downloads results
5. Stores generated images in R2

### Submit Generation Job

**API Route:** `POST /api/generate/submit`
**File:** `src/app/api/generate/submit/route.ts`

**Image Processing and Temp Storage (lines 125-160):**

```typescript
// 8a. Fetch image from R2
const getCommand = new GetObjectCommand({
  Bucket: R2_BUCKET_NAME,
  Key: uploadedImage.r2Key,
});

const s3Response = await r2Client.send(getCommand);
const imageBuffer = Buffer.from(await s3Response.Body!.transformToByteArray());

// 8b. Convert to PNG
const pngBuffer = await convertToPNG(imageBuffer);

// 8c. Upload PNG to temp location
const tempKey = `temp/${nanoid()}.png`;
const putCommand = new PutObjectCommand({
  Bucket: R2_BUCKET_NAME,
  Key: tempKey,
  Body: pngBuffer,
  ContentType: 'image/png',
});
await r2Client.send(putCommand);

// 8d. Generate presigned GET URL for temp PNG (valid 24 hours)
const tempGetCommand = new GetObjectCommand({
  Bucket: R2_BUCKET_NAME,
  Key: tempKey,
});
const tempImageUrl = await getSignedUrl(r2Client, tempGetCommand, {
  expiresIn: 86400, // 24 hours
});
```

**RunPod Job Submission (lines 163-176):**

```typescript
// 8e. Generate prompt with variety index for diverse kid appearances
const prompt = generatePrompt(
  batch.demographic as Demographic,
  batch.ageRange,
  background,
  index // Use index to add variety
);

// 8f. Submit job to RunPod (only product image)
const runpodJobId = await submitJob({
  prompt,
  images: [tempImageUrl], // Presigned URL from R2
  size: '1024*1024',
  enable_safety_checker: true,
});
```

**Database Tracking (lines 178-204):**

```typescript
// 8h. Create generated_image record
await db.insert(generatedImageTable).values({
  id: generatedImageId,
  batchId: batch.id,
  uploadedImageId: uploadedImage.id,
  status: 'processing',
  background,
  runpodJobId: null,
  retryCount: 0,
});

// 8i. Create runpod_job record
await db.insert(runpodJobTable).values({
  id: runpodJobRecordId,
  generatedImageId,
  jobId: runpodJobId,
  status: 'in_queue',
  prompt,
  background,
});
```

**Concurrency Control (line 117):**

```typescript
const limit = pLimit(10); // Max 10 concurrent operations
```

### Poll for Results and Store Generated Images

**API Route:** `GET /api/generate/poll/[batchId]`
**File:** `src/app/api/generate/poll/[batchId]/route.ts`

**Polling Processing Images (lines 119-144):**

```typescript
// 6. Fetch all processing images
const processingImages = await db
  .select()
  .from(generatedImageTable)
  .where(
    and(
      eq(generatedImageTable.batchId, batchId),
      eq(generatedImageTable.status, 'processing')
    )
  );

// 7. Poll RunPod status for each processing image (with concurrency limit)
const limit = pLimit(10); // Max 10 concurrent status checks
```

**Download and Store Generated Images (lines 173-227):**

```typescript
if (statusResponse.status === 'COMPLETED') {
  // Download result and upload to R2
  const resultUrl = statusResponse.output?.result;
  if (!resultUrl) {
    throw new Error('No result URL in completed job');
  }

  const imageBuffer = await downloadResult(resultUrl);

  // Upload to R2 at generated key
  const generatedKey = generateGeneratedKey(batch.userId, batchId, generatedImage.id);
  const putCommand = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: generatedKey,
    Body: imageBuffer,
    ContentType: 'image/png',
  });
  await r2Client.send(putCommand);

  // Update generated_image status (only if still processing)
  const statusUpdateResult = await db
    .update(generatedImageTable)
    .set({
      status: 'completed',
      r2Key: generatedKey,
      completedAt: new Date(),
    })
    .where(
      and(
        eq(generatedImageTable.id, generatedImage.id),
        eq(generatedImageTable.status, 'processing')
      )
    )
    .returning();

  // Only increment counter if status was actually updated
  if (statusUpdateResult.length > 0) {
    // Update runpod_job status
    await db
      .update(runpodJobTable)
      .set({
        status: 'completed',
        resultUrl,
        completedAt: new Date(),
      })
      .where(eq(runpodJobTable.id, runpodJob.id));

    // Increment batch completed count (atomic)
    await db
      .update(batchTable)
      .set({
        completedImages: sql`${batchTable.completedImages} + 1`,
      })
      .where(eq(batchTable.id, batchId));
  }
}
```

**RunPod API Client (`src/lib/runpod.ts`):**

```typescript
// Download result image from RunPod CDN
export async function downloadResult(resultUrl: string): Promise<Buffer> {
  try {
    const response = await fetch(resultUrl);

    if (!response.ok) {
      throw new Error(`Failed to download image (${response.status})`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to download result from RunPod CDN: ${error.message}`);
    }
    throw new Error('Failed to download result from RunPod CDN: Unknown error');
  }
}
```

### Retry Failed Generation Jobs

**API Route:** `POST /api/generate/retry`
**File:** `src/app/api/generate/retry/route.ts`

Similar process to initial submission (lines 88-191):
1. Fetch failed images from database
2. Reset status to 'processing'
3. Re-fetch original uploaded image from R2
4. Convert to PNG and upload to temp location
5. Generate new presigned URL
6. Resubmit to RunPod with new job ID
7. Update database with new job tracking

---

## 5. Image Viewing and Access

### Presigned View URLs

**API Route:** `POST /api/images/view-url`
**File:** `src/app/api/images/view-url/route.ts`

**Authorization Check (lines 39-48):**

```typescript
const { r2Key } = validation.data;

// Verify the key belongs to the current user
if (!r2Key.startsWith(`uploads/${session.user.id}/`) &&
    !r2Key.startsWith(`generated/${session.user.id}/`)) {
  return NextResponse.json(
    { error: 'You do not have permission to access this image' },
    { status: 403 }
  );
}
```

**Presigned URL Generation (lines 50-58):**

```typescript
// Generate presigned GET URL (7-day expiry)
const command = new GetObjectCommand({
  Bucket: R2_BUCKET_NAME,
  Key: r2Key,
});

const presignedUrl = await getSignedUrl(r2Client, command, {
  expiresIn: 604800, // 7 days
});

return NextResponse.json({ url: presignedUrl }, { status: 200 });
```

---

## 6. Batch Download with ZIP

**File:** `src/lib/zip.ts`

### ZIP Creation Process

**Main Function (lines 177-315):**

```typescript
export async function createBatchZip(
  batchId: string,
  userId: string
): Promise<{ stream: archiver.Archiver; filename: string }> {
  // 1. Verify batch ownership and status
  // 2. Fetch all completed generated images
  // 3. Create archiver instance
  const archive = archiver('zip', {
    zlib: { level: 6 }, // Compression level (0-9)
  });

  // 4. Add each generated image to zip
  for (const generatedImage of completedImages) {
    // Fetch image from R2
    const getObjectCommand = new GetObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: generatedImage.r2Key!,
    });

    const response = await r2Client.send(getObjectCommand);
    const imageBuffer = await streamToBuffer(response.Body as Readable);

    // Append to archive
    archive.append(imageBuffer, { name: outputFilename });
  }

  // 5. Generate and append summary report
  const summaryReport = generateSummaryReport(batch, generatedImages, uploadedImages);
  archive.append(summaryReport, { name: 'SUMMARY.txt' });

  // 6. Finalize the archive
  archive.finalize();

  return { stream: archive, filename };
}
```

**Streaming to Client:** The archive stream is piped directly to the response in the download API route, avoiding memory issues with large batches.

---

## 7. Temporary File Cleanup

**File:** `src/lib/cleanup.ts`

### Automated Cleanup Function

```typescript
export async function cleanupTempImages(olderThanHours: number = 24): Promise<void> {
  try {
    const thresholdDate = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);

    // List all objects in temp/ prefix
    const listCommand = new ListObjectsV2Command({
      Bucket: R2_BUCKET_NAME,
      Prefix: 'temp/',
    });

    const listResponse = await r2Client.send(listCommand);

    // Filter objects older than threshold
    const objectsToDelete = listResponse.Contents.filter((obj) => {
      if (!obj.LastModified) return false;
      return obj.LastModified < thresholdDate;
    });

    // Delete in batches (max 1000 per batch for S3)
    const batchSize = 1000;
    for (let i = 0; i < objectsToDelete.length; i += batchSize) {
      const batch = objectsToDelete.slice(i, i + batchSize);

      const deleteCommand = new DeleteObjectsCommand({
        Bucket: R2_BUCKET_NAME,
        Delete: {
          Objects: batch.map((obj) => ({ Key: obj.Key })),
          Quiet: false,
        },
      });

      await r2Client.send(deleteCommand);
    }
  } catch (error) {
    logError('Cleanup failed', error);
    throw error;
  }
}
```

**Usage:**
- Can be called manually via script
- Can be triggered via cron job
- Can be exposed via API route for automated cleanup
- Default retention: 24 hours for temp files

---

## 8. Authentication and Authorization

### Middleware Protection

**File:** `src/middleware.ts`

```typescript
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check if the request is for a protected route
  const isProtectedRoute = pathname.startsWith("/batches") ||
                           pathname.startsWith("/batch/") ||
                           (pathname === "/" && !pathname.startsWith("/sign-in"));

  if (isProtectedRoute) {
    // Check for session cookie
    const sessionToken = request.cookies.get("better-auth.session_token");

    if (!sessionToken) {
      // Redirect to sign-in if no session cookie
      const url = request.nextUrl.clone();
      url.pathname = "/sign-in";
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}
```

**Middleware applies to all routes except:**
- API routes (`/api/*`)
- Static files (`/_next/static/*`)
- Image optimization (`/_next/image/*`)
- Favicon

### API Route Authentication

All R2-related API routes use the same authentication pattern:

```typescript
// Validate session
const session = await auth.api.getSession({
  headers: await headers(),
});

if (!session?.user) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

**better-auth** (v1.3.34) is used for session management:
- Session token stored in cookie: `better-auth.session_token`
- Server-side session validation on every API call
- User ID extracted from session for ownership verification

### Authorization Checks

**Batch Ownership Verification (pattern used across all routes):**

```typescript
// Fetch batch from database
const [batch] = await db
  .select()
  .from(batchTable)
  .where(eq(batchTable.id, batchId))
  .limit(1);

// Verify user owns batch
if (batch.userId !== session.user.id) {
  return NextResponse.json(
    { error: 'Forbidden: You do not own this batch' },
    { status: 403 }
  );
}
```

**R2 Key Verification (view-url route):**

```typescript
// Verify the key belongs to the current user
if (!r2Key.startsWith(`uploads/${session.user.id}/`) &&
    !r2Key.startsWith(`generated/${session.user.id}/`)) {
  return NextResponse.json(
    { error: 'You do not have permission to access this image' },
    { status: 403 }
  );
}
```

---

## 9. Dependencies

### AWS SDK Packages

**File:** `package.json:13-14`

```json
{
  "@aws-sdk/client-s3": "^3.930.0",
  "@aws-sdk/s3-request-presigner": "^3.930.0"
}
```

### Other Related Dependencies

```json
{
  "archiver": "^7.0.1",          // ZIP generation
  "nanoid": "^5.1.6",            // Unique ID generation
  "p-limit": "^7.2.0",           // Concurrency control
  "sharp": "^0.34.5",            // Image processing (PNG conversion)
  "drizzle-orm": "^0.44.7",      // Database ORM
  "better-auth": "^1.3.34",      // Authentication
  "zod": "^4.1.12"               // Schema validation
}
```

---

## 10. Key Patterns and Best Practices

### 1. Security

- **No direct R2 credentials exposed to client:** Only presigned URLs are sent to the browser
- **Time-limited URLs:** 15 minutes for uploads, 7 days for viewing, 24 hours for RunPod
- **User ID in storage keys:** Prevents unauthorized access to other users' images
- **Ownership verification:** Every API call verifies user owns the batch/image
- **Path-based authorization:** R2 key patterns enforce user isolation

### 2. Reliability

- **Exponential backoff retry logic:** Client retries failed uploads (1s, 2s, 4s delays)
- **Idempotent operations:** Database updates check current state before modifying
- **Atomic counters:** Using SQL `+=` to avoid race conditions
- **Status tracking:** Every image has clear status progression (pending → uploaded → processing → completed)
- **Error handling:** Comprehensive try-catch with logging throughout

### 3. Performance

- **Direct client uploads:** Bypasses Next.js server for large file transfers
- **Concurrency limits:** p-limit prevents overwhelming APIs (10 concurrent operations)
- **Streaming responses:** ZIP files streamed directly to client, avoiding memory issues
- **Temporary file cleanup:** Prevents unbounded storage growth

### 4. User Experience

- **Progress tracking:** Real-time upload progress via XMLHttpRequest events
- **Batch operations:** Multiple files uploaded sequentially with overall progress
- **Automatic retries:** Transparent retry on transient failures
- **Detailed error messages:** User-friendly error messages for all failure scenarios

---

## 11. Data Flow Diagrams

### Client-Side Upload Flow

```
┌─────────┐                    ┌──────────────┐                    ┌──────────┐
│ Browser │                    │  Next.js API │                    │    R2    │
└────┬────┘                    └──────┬───────┘                    └────┬─────┘
     │                                │                                  │
     │ 1. Request presigned URL       │                                  │
     ├───────────────────────────────>│                                  │
     │    POST /api/upload/presigned  │                                  │
     │    {batchId, fileName, ...}    │                                  │
     │                                │                                  │
     │                                │ 2. Create DB record (pending)    │
     │                                │                                  │
     │                                │ 3. Generate presigned URL        │
     │                                ├─────────────────────────────────>│
     │                                │    PutObjectCommand              │
     │                                │<─────────────────────────────────┤
     │                                │    presignedUrl                  │
     │                                │                                  │
     │ 4. Return presigned URL        │                                  │
     │<───────────────────────────────┤                                  │
     │    {presignedUrl, imageId}     │                                  │
     │                                │                                  │
     │ 5. Upload file directly to R2  │                                  │
     ├────────────────────────────────┴─────────────────────────────────>│
     │    PUT presignedUrl            │                                  │
     │    Body: File                  │                                  │
     │<───────────────────────────────┬─────────────────────────────────┤
     │    200 OK                      │                                  │
     │                                │                                  │
     │ 6. Notify completion           │                                  │
     ├───────────────────────────────>│                                  │
     │    POST /api/upload/complete   │                                  │
     │    {imageId, success: true}    │                                  │
     │                                │                                  │
     │                                │ 7. Update DB (uploaded)          │
     │                                │    Increment batch counter       │
     │                                │                                  │
     │ 8. Success                     │                                  │
     │<───────────────────────────────┤                                  │
     │                                │                                  │
```

### RunPod Generation Flow

```
┌──────────────┐         ┌────────────┐         ┌────────┐         ┌────────┐
│  Next.js API │         │     R2     │         │ RunPod │         │   DB   │
└──────┬───────┘         └─────┬──────┘         └───┬────┘         └───┬────┘
       │                       │                    │                   │
       │ 1. Fetch uploaded     │                    │                   │
       ├──────────────────────>│                    │                   │
       │    GetObjectCommand   │                    │                   │
       │<──────────────────────┤                    │                   │
       │    image buffer       │                    │                   │
       │                       │                    │                   │
       │ 2. Convert to PNG     │                    │                   │
       │    & upload to temp/  │                    │                   │
       ├──────────────────────>│                    │                   │
       │    PutObjectCommand   │                    │                   │
       │                       │                    │                   │
       │ 3. Generate presigned │                    │                   │
       │    GET URL (24h)      │                    │                   │
       ├──────────────────────>│                    │                   │
       │<──────────────────────┤                    │                   │
       │    tempImageUrl       │                    │                   │
       │                       │                    │                   │
       │ 4. Submit job         │                    │                   │
       ├────────────────────────┴───────────────────>│                   │
       │    POST /run          │                    │                   │
       │    {prompt, images: [tempImageUrl]}        │                   │
       │<───────────────────────┬───────────────────┤                   │
       │    {id: jobId}        │                    │                   │
       │                       │                    │                   │
       │ 5. Create DB records  │                    │                   │
       ├────────────────────────┴────────────────────┴──────────────────>│
       │    generated_image (processing)            │                   │
       │    runpod_job (in_queue)                   │                   │
       │                       │                    │                   │
       │ ... (polling) ...     │                    │                   │
       │                       │                    │                   │
       │ 6. Check status       │                    │                   │
       ├────────────────────────┴───────────────────>│                   │
       │    GET /status/{jobId}│                    │                   │
       │<───────────────────────┬───────────────────┤                   │
       │    {status: COMPLETED, output: {result}}   │                   │
       │                       │                    │                   │
       │ 7. Download result    │                    │                   │
       ├────────────────────────┴───────────────────>│                   │
       │    GET result URL     │                    │                   │
       │<───────────────────────┬───────────────────┤                   │
       │    image buffer       │                    │                   │
       │                       │                    │                   │
       │ 8. Upload to R2       │                    │                   │
       │    at generated/ key  │                    │                   │
       ├──────────────────────>│                    │                   │
       │    PutObjectCommand   │                    │                   │
       │                       │                    │                   │
       │ 9. Update DB          │                    │                   │
       ├────────────────────────┴────────────────────┴──────────────────>│
       │    status = completed │                    │                   │
       │    increment counter  │                    │                   │
       │                       │                    │                   │
```

---

## 12. File Reference Index

### Core R2 Files

| File | Purpose | Key Functions |
|------|---------|---------------|
| `src/lib/r2.ts` | R2 client config and utilities | `r2Client`, `generateUploadKey()`, `generateGeneratedKey()`, `getPublicUrl()` |
| `src/lib/upload.ts` | Client-side upload utilities | `uploadToR2()`, `retryUpload()` |
| `src/lib/cleanup.ts` | Temp file cleanup | `cleanupTempImages()` |
| `src/lib/zip.ts` | Batch download | `createBatchZip()`, `generateSummaryReport()` |

### API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/upload/presigned-url` | POST | Generate presigned URL for client upload |
| `/api/upload/complete` | POST | Mark upload as complete after client uploads |
| `/api/images/view-url` | POST | Generate presigned URL for viewing image |
| `/api/generate/submit` | POST | Submit batch for AI generation |
| `/api/generate/poll/[batchId]` | GET | Poll for generation progress and store results |
| `/api/generate/retry` | POST | Retry failed generation jobs |
| `/api/download/[batchId]` | GET | Download batch as ZIP file |

### Client Components

| Component | Purpose |
|-----------|---------|
| `src/components/batch/upload-zone.tsx` | Drag-and-drop upload interface with progress |
| `src/components/batch/upload-progress.tsx` | Individual file upload progress display |

### Supporting Libraries

| File | Purpose |
|------|---------|
| `src/lib/types.ts` | TypeScript type definitions and Zod schemas |
| `src/lib/runpod.ts` | RunPod API client |
| `src/lib/image.ts` | Image processing (PNG conversion) |
| `src/lib/auth.ts` | Authentication configuration |
| `src/middleware.ts` | Route protection middleware |

---

## 13. Environment Setup Checklist

To set up R2 integration in a new environment:

### 1. Cloudflare R2 Setup

- [ ] Create Cloudflare R2 bucket
- [ ] Note the Account ID
- [ ] Generate R2 API tokens (access key ID and secret)
- [ ] (Optional) Configure custom domain for public URLs

### 2. Environment Variables

Add to `.env.local`:

```bash
R2_ACCOUNT_ID=your_account_id_here
R2_ACCESS_KEY_ID=your_access_key_id_here
R2_SECRET_ACCESS_KEY=your_secret_access_key_here
R2_BUCKET_NAME=your_bucket_name_here

# Optional: if using custom domain for public access
R2_PUBLIC_URL=https://your-custom-domain.com
```

### 3. CORS Configuration

Configure R2 bucket CORS to allow client-side uploads:

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000", "https://your-production-domain.com"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

### 4. Dependencies

```bash
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

### 5. Test Upload Flow

1. Create a batch
2. Upload an image through the UI
3. Verify image appears in R2 bucket under `uploads/{userId}/{batchId}/`
4. Check database for correct status updates

---

## Conclusion

The Cloudflare R2 integration in this Next.js app demonstrates a production-ready implementation with:

- **Secure client-side uploads** using presigned URLs
- **Comprehensive authentication and authorization** at every layer
- **Robust error handling and retry logic** for reliability
- **Efficient storage organization** with clear key patterns
- **Seamless RunPod API integration** for AI image generation
- **Automated cleanup** of temporary files
- **Performance optimizations** including concurrency control and streaming

The architecture follows AWS S3 best practices while leveraging Cloudflare R2's cost-effective storage and S3-compatible API.
