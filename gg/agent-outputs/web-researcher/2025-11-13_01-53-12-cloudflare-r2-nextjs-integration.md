# Cloudflare R2 Integration with Next.js: Comprehensive Research

**Research Date:** 2025-11-13
**Focus:** Image storage solution for AI product picture generator (up to 100 images per batch, max 20MB each)

---

## Executive Summary

Cloudflare R2 is an excellent choice for your Next.js application with the following key advantages:
- **Free tier is sufficient** for initial development and moderate production use
- **Zero egress fees** - critical for serving images to users
- **S3-compatible API** - use familiar AWS SDK tools
- **Simple pricing** - $0.015/GB storage after free tier
- **Lifecycle policies** - automatic 30-day deletion is fully supported
- **Multipart uploads** - handles files up to 20MB easily (supports up to 5TB)

**Recommended Approach:** Server-side uploads via presigned URLs with Next.js App Router API routes.

---

## 1. Integration Setup

### 1.1 Prerequisites

Install required packages:

```bash
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

For large file uploads (optional):
```bash
npm install @aws-sdk/lib-storage
```

### 1.2 Create R2 Bucket

1. Navigate to Cloudflare Dashboard → R2
2. Click "Create Bucket"
3. Name your bucket (e.g., `product-images`)
4. Select region (use `auto` for optimal performance, or specify `eu` for European data residency)

### 1.3 Generate API Credentials

1. In R2 Dashboard, click "Manage R2 API Tokens"
2. Create API token with **"Admin Read & Write"** permissions
3. Save the following values:
   - **Account ID** (from dashboard URL)
   - **Access Key ID**
   - **Secret Access Key**
   - **Endpoint URL** format:
     - Standard: `https://{ACCOUNT_ID}.r2.cloudflarestorage.com`
     - EU region: `https://{ACCOUNT_ID}.eu.r2.cloudflarestorage.com`

### 1.4 Environment Variables

Create `.env.local`:

```bash
# Server-side only (never expose to client)
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key_id
R2_SECRET_ACCESS_KEY=your_secret_access_key
R2_BUCKET_NAME=product-images
R2_REGION=auto  # or 'eu' for EU region

# Client-side safe (optional - for public bucket URLs)
NEXT_PUBLIC_R2_PUBLIC_URL=https://your-custom-domain.com
NEXT_PUBLIC_R2_BUCKET_NAME=product-images
```

**Critical:** Server credentials (without `NEXT_PUBLIC_` prefix) are NEVER sent to the client.

### 1.5 R2 Client Configuration

Create `lib/r2-client.ts`:

```typescript
import { S3Client, HeadBucketCommand } from '@aws-sdk/client-s3';

const getR2Endpoint = () => {
  const accountId = process.env.R2_ACCOUNT_ID!;
  const region = process.env.R2_REGION || 'auto';

  // EU region requires different endpoint
  const isEuRegion = region === 'eu';

  return isEuRegion
    ? `https://${accountId}.eu.r2.cloudflarestorage.com`
    : `https://${accountId}.r2.cloudflarestorage.com`;
};

export const r2Client = new S3Client({
  region: 'auto',
  endpoint: getR2Endpoint(),
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: true, // Required for R2
});

export const R2_CONFIG = {
  bucketName: process.env.R2_BUCKET_NAME!,
  publicUrl: process.env.NEXT_PUBLIC_R2_PUBLIC_URL,
  maxFileSize: 20 * 1024 * 1024, // 20MB
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  presignedUrlExpiry: 300, // 5 minutes
} as const;

// Health check utility
export async function testR2Connection(): Promise<boolean> {
  try {
    await r2Client.send(new HeadBucketCommand({
      Bucket: R2_CONFIG.bucketName,
    }));
    return true;
  } catch (error) {
    console.error('R2 connection failed:', error);
    return false;
  }
}
```

---

## 2. Free Tier Limits & Sufficiency Analysis

### 2.1 Free Tier Allowances (Monthly)

| Resource | Free Tier | Your Use Case |
|----------|-----------|---------------|
| **Storage** | 10 GB | ~10,000 images @ 1MB each |
| **Class A Operations** (PUT, POST, LIST) | 1,000,000 | 100 images/batch × 100 batches/month = 10,000 uploads |
| **Class B Operations** (GET, SELECT) | 10,000,000 | ~3.3M image downloads @ $0 cost |
| **Egress (bandwidth)** | ∞ FREE | Unlimited downloads - zero cost |

### 2.2 Is Free Tier Sufficient?

**For your use case (100 images/batch, 20MB max, 30-day retention):**

✅ **Storage:** With 30-day deletion, you'll stay well under 10GB
- Worst case: 100 batches × 100 images × 1MB = 10GB
- With automatic deletion, average storage will be much lower

✅ **Class A Operations (Uploads):**
- 100 batches/month × 100 images = 10,000 operations
- Free tier covers **1 million** operations

✅ **Class B Operations (Downloads):**
- 1 million image views/month = 1M operations
- Free tier covers **10 million** operations

✅ **Egress:** Unlimited and always free

**Verdict:** Free tier is **more than sufficient** for initial launch and moderate production use.

### 2.3 Paid Tier Costs (After Free Tier)

If you exceed free tier:

```
Storage: $0.015/GB-month
Class A: $4.50/million operations
Class B: $0.36/million operations
Egress: $0 (always free)
```

**Example cost at scale:**
- 50GB storage: $0.60/month
- 5M uploads: $20/month
- 50M downloads: $14.40/month
- Egress: $0
- **Total: ~$35/month** (vs AWS S3: $500+/month with egress)

---

## 3. Upload Patterns: Client vs Server

### 3.1 Recommended: Server-Side Presigned URLs

**Architecture:**
1. Client requests presigned URL from your API route
2. Server generates presigned URL (authenticated, time-limited)
3. Client uploads directly to R2 using presigned URL
4. File never touches your server (saves bandwidth and processing)

**Advantages:**
- ✅ No file size limits (Next.js server actions limited to 1-2MB)
- ✅ Your secrets stay secure on server
- ✅ Direct upload to R2 (faster, no double-transfer)
- ✅ Fine-grained control and validation
- ✅ Audit logging and policy enforcement
- ✅ Works with Next.js App Router and Pages Router

**Implementation:**

Create `app/api/upload/presigned-url/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { r2Client, R2_CONFIG } from '@/lib/r2-client';
import { nanoid } from 'nanoid';

export async function POST(request: NextRequest) {
  try {
    // 1. Authentication check
    const userId = request.headers.get('x-user-id'); // Your auth method
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse and validate request
    const { fileName, fileType, fileSize, batchId } = await request.json();

    // Validate file type
    if (!R2_CONFIG.allowedMimeTypes.includes(fileType)) {
      return NextResponse.json(
        { error: 'Invalid file type. Allowed: JPEG, PNG, WEBP' },
        { status: 400 }
      );
    }

    // Validate file size
    if (fileSize > R2_CONFIG.maxFileSize) {
      return NextResponse.json(
        { error: `File too large. Max size: ${R2_CONFIG.maxFileSize / 1024 / 1024}MB` },
        { status: 400 }
      );
    }

    // 3. Generate unique file path
    const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const fileId = nanoid(10);
    const extension = fileName.split('.').pop();
    const fileKey = `uploads/${userId}/${batchId}/${timestamp}/${fileId}.${extension}`;

    // 4. Create presigned URL
    const command = new PutObjectCommand({
      Bucket: R2_CONFIG.bucketName,
      Key: fileKey,
      ContentType: fileType,
      ContentLength: fileSize,
      Metadata: {
        userId,
        batchId,
        originalFileName: fileName,
        uploadedAt: new Date().toISOString(),
      },
    });

    const presignedUrl = await getSignedUrl(r2Client, command, {
      expiresIn: R2_CONFIG.presignedUrlExpiry, // 5 minutes
    });

    // 5. Return presigned URL and metadata
    return NextResponse.json({
      presignedUrl,
      fileKey,
      fileUrl: R2_CONFIG.publicUrl
        ? `${R2_CONFIG.publicUrl}/${fileKey}`
        : null,
      expiresAt: Date.now() + R2_CONFIG.presignedUrlExpiry * 1000,
    });

  } catch (error) {
    console.error('Error generating presigned URL:', error);
    return NextResponse.json(
      { error: 'Failed to generate upload URL' },
      { status: 500 }
    );
  }
}
```

**Client-side upload:**

```typescript
// hooks/useFileUpload.ts
import { useState } from 'react';

interface UploadResult {
  success: boolean;
  fileUrl?: string;
  fileKey?: string;
  error?: string;
}

export function useFileUpload() {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const uploadFile = async (file: File, batchId: string): Promise<UploadResult> => {
    try {
      setIsUploading(true);

      // 1. Get presigned URL
      const response = await fetch('/api/upload/presigned-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
          batchId,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to get upload URL');
      }

      const { presignedUrl, fileKey, fileUrl } = await response.json();

      // 2. Upload directly to R2
      const uploadResponse = await fetch(presignedUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type,
          'Content-Length': file.size.toString(),
        },
      });

      if (!uploadResponse.ok) {
        throw new Error('Upload to R2 failed');
      }

      setIsUploading(false);
      return {
        success: true,
        fileUrl,
        fileKey,
      };

    } catch (error) {
      setIsUploading(false);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Upload failed',
      };
    }
  };

  return { uploadFile, isUploading, progress };
}
```

### 3.2 Alternative: Server-Side Upload (Not Recommended for Large Files)

Only use for small files (<5MB) or when you need to process the file server-side.

```typescript
// app/api/upload/route.ts
import { NextRequest } from 'next/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { r2Client, R2_CONFIG } from '@/lib/r2-client';

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get('file') as File;

  const buffer = Buffer.from(await file.arrayBuffer());

  await r2Client.send(new PutObjectCommand({
    Bucket: R2_CONFIG.bucketName,
    Key: `uploads/${file.name}`,
    Body: buffer,
    ContentType: file.type,
  }));

  return NextResponse.json({ success: true });
}

// Note: Next.js App Router has upload size limits:
// - Server Actions: 1-2MB
// - API Routes: Configure in next.config.js
```

---

## 4. File Organization Strategies

### 4.1 Recommended Folder Structure

```
bucket-name/
├── uploads/              # User-uploaded product images
│   ├── {userId}/
│   │   ├── {batchId}/
│   │   │   ├── {date}/
│   │   │   │   ├── {uniqueId}.jpg
│   │   │   │   └── {uniqueId}.png
│   ├── temp/             # Temporary uploads (1-day lifecycle)
├── generated/            # AI-generated images
│   ├── {userId}/
│   │   ├── {batchId}/
│   │   │   ├── 1024x1024_{uniqueId}.png
│   │   │   └── thumbnail_{uniqueId}.webp
└── processed/            # Post-processed images
    └── {userId}/
        └── {batchId}/
```

**Path Generation Pattern:**

```typescript
// lib/path-generator.ts

export function generateUploadPath(
  userId: string,
  batchId: string,
  fileName: string,
  type: 'upload' | 'generated' | 'processed' = 'upload'
): string {
  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const uniqueId = nanoid(10);
  const extension = fileName.split('.').pop();

  return `${type}/${userId}/${batchId}/${date}/${uniqueId}.${extension}`;
}

// Example: "uploads/user123/batch456/2025-11-13/x8k9s2p1q3.jpg"
```

### 4.2 Key Naming Best Practices

✅ **DO:**
- Use consistent, hierarchical paths
- Include timestamps for sorting
- Use unique IDs to prevent collisions
- Keep file extensions accurate
- Use lowercase for consistency
- Limit special characters

❌ **DON'T:**
- Use user-provided filenames directly (security risk)
- Include PII in object keys
- Use sequential IDs (predictability risk)
- Exceed 1024 bytes total path length

---

## 5. Presigned URL Generation

### 5.1 Upload Presigned URLs (PUT)

Already covered in Section 3.1. Key points:

- **Expiry:** 5-15 minutes (balance security vs user experience)
- **Content-Type:** Must match actual upload
- **Content-Length:** Optional but recommended for validation
- **Metadata:** Add custom metadata for tracking

### 5.2 Download Presigned URLs (GET)

For secure, temporary access to private objects:

```typescript
// app/api/download/[fileKey]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { r2Client, R2_CONFIG } from '@/lib/r2-client';

export async function GET(
  request: NextRequest,
  { params }: { params: { fileKey: string } }
) {
  try {
    const fileKey = decodeURIComponent(params.fileKey);

    // Authorization check
    const userId = request.headers.get('x-user-id');
    if (!userId || !fileKey.startsWith(`uploads/${userId}/`)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Generate presigned download URL
    const command = new GetObjectCommand({
      Bucket: R2_CONFIG.bucketName,
      Key: fileKey,
    });

    const downloadUrl = await getSignedUrl(r2Client, command, {
      expiresIn: 3600, // 1 hour
    });

    return NextResponse.json({
      downloadUrl,
      expiresAt: Date.now() + 3600 * 1000,
    });

  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to generate download URL' },
      { status: 500 }
    );
  }
}
```

### 5.3 Presigned URL Security Considerations

**Best Practices:**
- ✅ Short expiration times (5-15 min for uploads, 1 hour for downloads)
- ✅ Validate user permissions before generating URLs
- ✅ Log URL generation for audit trails
- ✅ Use HTTPS only (R2 enforces this)
- ✅ Don't log or cache presigned URLs
- ✅ Regenerate URLs instead of reusing

**What Presigned URLs Expose:**
- ❌ Account ID (visible in URL)
- ❌ Bucket name (visible in URL)
- ❌ Object key/path (visible in URL)
- ✅ Credentials are NOT exposed (signed, not included)

---

## 6. Lifecycle Policies for 30-Day Automatic Deletion

### 6.1 Configuration via Dashboard

1. Navigate to R2 Dashboard → Select your bucket → Settings
2. Under "Object Lifecycle Rules", click "Add rule"
3. Configure:
   - **Rule ID:** `delete-after-30-days`
   - **Status:** Enabled
   - **Prefix:** `uploads/` (or specific path)
   - **Action:** Expiration
   - **Days:** 30

### 6.2 Configuration via Wrangler CLI

```bash
# Install wrangler
npm install -g wrangler

# Login
wrangler login

# Add lifecycle rule
wrangler r2 bucket lifecycle add <BUCKET_NAME> \
  --expiration-days 30 \
  --prefix "uploads/"
```

### 6.3 Configuration via AWS SDK

```typescript
import { PutBucketLifecycleConfigurationCommand } from '@aws-sdk/client-s3';
import { r2Client, R2_CONFIG } from '@/lib/r2-client';

export async function setupLifecyclePolicy() {
  const command = new PutBucketLifecycleConfigurationCommand({
    Bucket: R2_CONFIG.bucketName,
    LifecycleConfiguration: {
      Rules: [
        {
          ID: 'delete-uploads-after-30-days',
          Status: 'Enabled',
          Filter: {
            Prefix: 'uploads/',
          },
          Expiration: {
            Days: 30,
          },
        },
        {
          ID: 'delete-generated-after-30-days',
          Status: 'Enabled',
          Filter: {
            Prefix: 'generated/',
          },
          Expiration: {
            Days: 30,
          },
        },
        {
          ID: 'abort-incomplete-multipart-uploads',
          Status: 'Enabled',
          AbortIncompleteMultipartUpload: {
            DaysAfterInitiation: 1,
          },
        },
      ],
    },
  });

  await r2Client.send(command);
}
```

### 6.4 Lifecycle Policy Behavior

**Important Notes:**
- Objects are typically deleted within **24 hours** of expiration
- Deletion is **free** (no Class A operation charges)
- Once deleted, objects are **not recoverable**
- The `x-amz-expiration` header shows when an object will expire
- Lifecycle rules take **up to 24 hours** to propagate

**Example Response Header:**
```
x-amz-expiration: expiry-date="Thu, 13 Dec 2025 00:00:00 GMT", rule-id="delete-after-30-days"
```

---

## 7. Zip File Generation Strategies

### 7.1 Recommendation: Generate On-Demand

**DO NOT store pre-generated zip files** for your use case. Here's why:

❌ **Storing Zips:**
- Doubles storage costs (original + zip)
- Zips also count toward 30-day lifecycle
- Wasted storage if user never downloads
- Must regenerate if any image changes

✅ **Generate on-demand:**
- Zero storage cost for zips
- Always fresh (reflects current files)
- Only generates when actually needed
- Scales better

### 7.2 On-Demand Zip Generation Implementation

**Option 1: Stream directly to client (recommended for <1GB)**

```typescript
// app/api/batch/[batchId]/download/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { r2Client, R2_CONFIG } from '@/lib/r2-client';
import archiver from 'archiver';
import { Readable } from 'stream';

export async function GET(
  request: NextRequest,
  { params }: { params: { batchId: string } }
) {
  try {
    const { batchId } = params;
    const userId = request.headers.get('x-user-id');

    // 1. List all objects in batch
    const listCommand = new ListObjectsV2Command({
      Bucket: R2_CONFIG.bucketName,
      Prefix: `uploads/${userId}/${batchId}/`,
    });

    const { Contents } = await r2Client.send(listCommand);

    if (!Contents || Contents.length === 0) {
      return NextResponse.json({ error: 'No files found' }, { status: 404 });
    }

    // 2. Create zip stream
    const archive = archiver('zip', {
      zlib: { level: 6 }, // Compression level (0-9)
    });

    // 3. Stream response
    const stream = new ReadableStream({
      async start(controller) {
        archive.on('data', (chunk) => controller.enqueue(chunk));
        archive.on('end', () => controller.close());
        archive.on('error', (err) => controller.error(err));

        // 4. Add files to zip
        for (const object of Contents) {
          const getCommand = new GetObjectCommand({
            Bucket: R2_CONFIG.bucketName,
            Key: object.Key,
          });

          const response = await r2Client.send(getCommand);
          const fileName = object.Key!.split('/').pop()!;

          // Convert R2 stream to Node stream
          const body = response.Body as Readable;
          archive.append(body, { name: fileName });
        }

        await archive.finalize();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="batch-${batchId}.zip"`,
      },
    });

  } catch (error) {
    console.error('Zip generation failed:', error);
    return NextResponse.json(
      { error: 'Failed to generate zip file' },
      { status: 500 }
    );
  }
}
```

**Install required package:**
```bash
npm install archiver
npm install -D @types/archiver
```

**Option 2: Client-side zip with JSZip (for small batches)**

```typescript
// Client-side implementation
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

async function downloadBatchAsZip(batchId: string) {
  // 1. Fetch list of files
  const response = await fetch(`/api/batch/${batchId}/files`);
  const { files } = await response.json();

  // 2. Create zip
  const zip = new JSZip();

  // 3. Download and add each file
  for (const file of files) {
    const imageResponse = await fetch(file.url);
    const imageBlob = await imageResponse.blob();
    zip.file(file.name, imageBlob);
  }

  // 4. Generate and download
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  saveAs(zipBlob, `batch-${batchId}.zip`);
}
```

**Install required packages:**
```bash
npm install jszip file-saver
npm install -D @types/jszip
```

### 7.3 Performance Considerations

**Server-side (archiver):**
- ✅ Handles large files (GB+)
- ✅ Streams directly (low memory)
- ✅ Works on any device
- ❌ Uses server resources
- ❌ Slower for users far from server

**Client-side (JSZip):**
- ✅ No server load
- ✅ Fast for nearby users
- ❌ Limited by browser memory (~1-2GB)
- ❌ Doesn't work on slow connections

**Recommendation:** Use server-side for >100 images or total size >500MB.

---

## 8. Best Practices for Next.js App Router Integration

### 8.1 Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── upload/
│   │   │   ├── presigned-url/
│   │   │   │   └── route.ts
│   │   │   └── batch/
│   │   │       └── route.ts
│   │   └── download/
│   │       └── [batchId]/
│   │           └── route.ts
│   └── dashboard/
│       └── page.tsx
├── lib/
│   ├── r2-client.ts       # R2 configuration
│   ├── path-generator.ts  # File path utilities
│   └── db.ts              # Database client
└── hooks/
    └── useFileUpload.ts   # Upload hook
```

### 8.2 TypeScript Types

```typescript
// types/upload.ts

export interface UploadMetadata {
  userId: string;
  batchId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  fileKey: string;
  uploadedAt: Date;
}

export interface PresignedUrlResponse {
  presignedUrl: string;
  fileKey: string;
  fileUrl: string | null;
  expiresAt: number;
}

export interface BatchRecord {
  id: string;
  userId: string;
  imageCount: number;
  totalSize: number;
  status: 'uploading' | 'processing' | 'completed' | 'failed';
  createdAt: Date;
  expiresAt: Date;
}
```

### 8.3 Database Integration

Store metadata in your database (e.g., Postgres, Neon):

```typescript
// lib/db.ts - Example with Drizzle ORM

import { pgTable, text, integer, timestamp, varchar } from 'drizzle-orm/pg-core';

export const images = pgTable('images', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  batchId: text('batch_id').notNull(),
  fileKey: text('file_key').notNull(), // R2 object key
  fileName: text('file_name').notNull(),
  fileSize: integer('file_size').notNull(),
  fileType: varchar('file_type', { length: 50 }).notNull(),
  status: varchar('status', { length: 20 }).default('uploaded'),
  uploadedAt: timestamp('uploaded_at').defaultNow(),
  expiresAt: timestamp('expires_at').notNull(), // 30 days from upload
});

export const batches = pgTable('batches', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  imageCount: integer('image_count').default(0),
  totalSize: integer('total_size').default(0),
  status: varchar('status', { length: 20 }).default('uploading'),
  createdAt: timestamp('created_at').defaultNow(),
  expiresAt: timestamp('expires_at').notNull(),
});
```

**After successful upload:**

```typescript
// app/api/upload/complete/route.ts
import { db, images } from '@/lib/db';

export async function POST(request: NextRequest) {
  const { fileKey, fileName, fileSize, fileType, batchId } = await request.json();

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  await db.insert(images).values({
    id: nanoid(),
    userId: request.headers.get('x-user-id')!,
    batchId,
    fileKey,
    fileName,
    fileSize,
    fileType,
    expiresAt,
  });

  return NextResponse.json({ success: true });
}
```

### 8.4 Error Handling

```typescript
// lib/r2-error-handler.ts

export function handleR2Error(error: any): { message: string; code: string } {
  if (error.name === 'NoSuchBucket') {
    return { message: 'Bucket does not exist', code: 'BUCKET_NOT_FOUND' };
  }

  if (error.name === 'NoSuchKey') {
    return { message: 'File not found', code: 'FILE_NOT_FOUND' };
  }

  if (error.name === 'InvalidAccessKeyId') {
    return { message: 'Invalid credentials', code: 'INVALID_CREDENTIALS' };
  }

  if (error.name === 'SignatureDoesNotMatch') {
    return { message: 'Authentication failed', code: 'AUTH_FAILED' };
  }

  if (error.name === 'AccessDenied') {
    return { message: 'Access denied', code: 'ACCESS_DENIED' };
  }

  if (error.code === 'RequestTimeout') {
    return { message: 'Upload timeout', code: 'TIMEOUT' };
  }

  return { message: 'Unknown error', code: 'UNKNOWN' };
}
```

---

## 9. CORS Configuration

### 9.1 When is CORS Required?

CORS is ONLY needed if:
- ✅ Client uploads directly to R2 using presigned URLs
- ✅ Client downloads from public R2 buckets via custom domain
- ✅ Browser makes requests to `*.r2.cloudflarestorage.com`

CORS is NOT needed if:
- ❌ All uploads go through your API routes
- ❌ Files are served via your domain (proxied)

### 9.2 Configure CORS via Dashboard

1. Navigate to R2 Dashboard → Select bucket → Settings
2. Under "CORS Policy", click "Add CORS policy"
3. Add this JSON:

```json
[
  {
    "AllowedOrigins": [
      "http://localhost:3000",
      "https://yourdomain.com"
    ],
    "AllowedMethods": [
      "GET",
      "PUT",
      "POST",
      "DELETE",
      "HEAD"
    ],
    "AllowedHeaders": [
      "*"
    ],
    "ExposeHeaders": [
      "ETag",
      "Content-Length",
      "x-amz-meta-*"
    ],
    "MaxAgeSeconds": 3600
  }
]
```

### 9.3 Configure CORS via AWS SDK

```typescript
import { PutBucketCorsCommand } from '@aws-sdk/client-s3';
import { r2Client, R2_CONFIG } from '@/lib/r2-client';

export async function setupCORS() {
  const command = new PutBucketCorsCommand({
    Bucket: R2_CONFIG.bucketName,
    CORSConfiguration: {
      CORSRules: [
        {
          AllowedOrigins: [
            'http://localhost:3000',
            'https://yourdomain.com',
          ],
          AllowedMethods: ['GET', 'PUT', 'POST', 'DELETE', 'HEAD'],
          AllowedHeaders: ['*'],
          ExposeHeaders: ['ETag', 'Content-Length'],
          MaxAgeSeconds: 3600,
        },
      ],
    },
  });

  await r2Client.send(command);
}
```

### 9.4 CORS Troubleshooting

**Common Issues:**

1. **"No 'Access-Control-Allow-Origin' header"**
   - Ensure CORS policy is saved
   - Wait 30 seconds for propagation
   - Check `AllowedOrigins` matches exactly (no trailing slash)

2. **"Method not allowed"**
   - Add method to `AllowedMethods`
   - For presigned uploads, include `PUT`

3. **"Header not allowed"**
   - Add custom headers to `AllowedHeaders`
   - Or use wildcard `"*"`

4. **Preflight fails**
   - Ensure `OPTIONS` requests work
   - Check `MaxAgeSeconds` isn't too short

**Valid Origin Format:**
```
✅ https://example.com
✅ http://localhost:3000
❌ https://example.com/  (trailing slash)
❌ https://example.com/path  (path included)
```

---

## 10. Multipart Upload for Large Files (>5MB)

### 10.1 When to Use Multipart

Your images are max 20MB, so multipart is **optional but recommended** for:
- Better upload reliability (resume on failure)
- Parallel chunk uploads (faster)
- Progress tracking
- Handles network interruptions

**Thresholds:**
- Files <5MB: Simple upload (single PUT)
- Files 5-100MB: Multipart recommended
- Files >100MB: Multipart required

### 10.2 Multipart Upload Requirements

- Minimum part size: **5MB** (except last part)
- Maximum part size: **5GB**
- Maximum parts: **10,000**
- All parts (except last) must be same size

### 10.3 Implementation with @aws-sdk/lib-storage

```typescript
// lib/multipart-upload.ts
import { Upload } from '@aws-sdk/lib-storage';
import { r2Client, R2_CONFIG } from './r2-client';

export async function uploadLargeFile(
  file: File,
  fileKey: string,
  onProgress?: (progress: number) => void
) {
  const upload = new Upload({
    client: r2Client,
    params: {
      Bucket: R2_CONFIG.bucketName,
      Key: fileKey,
      Body: file,
      ContentType: file.type,
    },
    // Optional: Configure chunk size (default 5MB)
    partSize: 5 * 1024 * 1024, // 5MB
    queueSize: 4, // Parallel uploads
  });

  // Track progress
  upload.on('httpUploadProgress', (progress) => {
    if (onProgress && progress.loaded && progress.total) {
      const percentage = (progress.loaded / progress.total) * 100;
      onProgress(percentage);
    }
  });

  const result = await upload.done();
  return result;
}
```

**Usage:**

```typescript
import { uploadLargeFile } from '@/lib/multipart-upload';

const handleUpload = async (file: File) => {
  const fileKey = `uploads/${userId}/${batchId}/${file.name}`;

  await uploadLargeFile(file, fileKey, (progress) => {
    console.log(`Upload progress: ${progress.toFixed(2)}%`);
  });
};
```

### 10.4 Manual Multipart Implementation

For custom control (e.g., via API routes):

```typescript
// app/api/upload/multipart/initiate/route.ts
import { CreateMultipartUploadCommand } from '@aws-sdk/client-s3';
import { r2Client, R2_CONFIG } from '@/lib/r2-client';

export async function POST(request: NextRequest) {
  const { fileKey, fileType } = await request.json();

  const command = new CreateMultipartUploadCommand({
    Bucket: R2_CONFIG.bucketName,
    Key: fileKey,
    ContentType: fileType,
  });

  const response = await r2Client.send(command);

  return NextResponse.json({
    uploadId: response.UploadId,
    fileKey,
  });
}

// app/api/upload/multipart/part/route.ts
import { UploadPartCommand } from '@aws-sdk/client-s3';

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const partNumber = parseInt(formData.get('partNumber') as string);
  const uploadId = formData.get('uploadId') as string;
  const fileKey = formData.get('fileKey') as string;
  const chunk = formData.get('chunk') as Blob;

  const command = new UploadPartCommand({
    Bucket: R2_CONFIG.bucketName,
    Key: fileKey,
    PartNumber: partNumber,
    UploadId: uploadId,
    Body: Buffer.from(await chunk.arrayBuffer()),
  });

  const response = await r2Client.send(command);

  return NextResponse.json({
    partNumber,
    eTag: response.ETag,
  });
}

// app/api/upload/multipart/complete/route.ts
import { CompleteMultipartUploadCommand } from '@aws-sdk/client-s3';

export async function POST(request: NextRequest) {
  const { uploadId, fileKey, parts } = await request.json();

  const command = new CompleteMultipartUploadCommand({
    Bucket: R2_CONFIG.bucketName,
    Key: fileKey,
    UploadId: uploadId,
    MultipartUpload: {
      Parts: parts, // [{ PartNumber: 1, ETag: "..." }, ...]
    },
  });

  const response = await r2Client.send(command);

  return NextResponse.json({
    location: response.Location,
    eTag: response.ETag,
  });
}
```

---

## 11. Cost Optimization Strategies

### 11.1 Stay Within Free Tier

**Storage optimization:**
- ✅ Automatic 30-day deletion (lifecycle policies)
- ✅ Compress images before upload (WebP format)
- ✅ Store thumbnails separately (smaller size)
- ✅ Delete failed uploads immediately

**Operation optimization:**
- ✅ Batch operations (list once, not per file)
- ✅ Cache file listings in your database
- ✅ Use HEAD requests instead of GET for metadata
- ✅ Implement client-side caching

**Example savings:**
```typescript
// ❌ Bad: Multiple LIST operations
for (const batchId of batchIds) {
  await listObjects(`uploads/${userId}/${batchId}/`); // 100 Class A ops
}

// ✅ Good: Single LIST operation
const allFiles = await listObjects(`uploads/${userId}/`); // 1 Class A op
const grouped = groupByBatch(allFiles);
```

### 11.2 Monitoring Usage

Create a usage dashboard:

```typescript
// app/api/usage/route.ts
import { ListObjectsV2Command, GetBucketLocationCommand } from '@aws-sdk/client-s3';
import { r2Client, R2_CONFIG } from '@/lib/r2-client';

export async function GET() {
  // List all objects
  const listCommand = new ListObjectsV2Command({
    Bucket: R2_CONFIG.bucketName,
  });

  const response = await r2Client.send(listCommand);

  // Calculate total storage
  const totalSize = response.Contents?.reduce(
    (sum, obj) => sum + (obj.Size || 0),
    0
  ) || 0;

  const totalObjects = response.Contents?.length || 0;

  return NextResponse.json({
    totalObjects,
    totalSize,
    totalSizeGB: (totalSize / 1024 / 1024 / 1024).toFixed(2),
    freeTierRemaining: Math.max(0, 10 - totalSize / 1024 / 1024 / 1024),
  });
}
```

### 11.3 Image Optimization

Reduce storage costs by optimizing images:

```typescript
import sharp from 'sharp';

// Optimize uploaded image
export async function optimizeImage(buffer: Buffer): Promise<Buffer> {
  return await sharp(buffer)
    .resize(1920, 1920, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 85 }) // WebP is 30% smaller than JPEG
    .toBuffer();
}

// Generate thumbnail
export async function generateThumbnail(buffer: Buffer): Promise<Buffer> {
  return await sharp(buffer)
    .resize(300, 300, { fit: 'cover' })
    .webp({ quality: 75 })
    .toBuffer();
}
```

**Savings example:**
- Original JPEG: 2MB
- Optimized WebP: 600KB (70% reduction)
- Thumbnail: 20KB
- **Total savings: 70% storage cost**

---

## 12. Common Pitfalls & Solutions

### 12.1 Region/Endpoint Issues

**Problem:** "NoSuchBucket" or connection errors

**Solution:** Verify endpoint matches bucket region

```typescript
// Check bucket region in R2 dashboard
// EU buckets: https://{accountId}.eu.r2.cloudflarestorage.com
// Others: https://{accountId}.r2.cloudflarestorage.com
```

### 12.2 Environment Variables Not Loading

**Problem:** `undefined` values for env vars

**Solution:**
- Restart dev server after changing `.env.local`
- Use `NEXT_PUBLIC_` prefix for client-side vars
- Never use server vars (without prefix) on client

```typescript
// ❌ Will be undefined on client
const accountId = process.env.R2_ACCOUNT_ID;

// ✅ Available on client
const accountId = process.env.NEXT_PUBLIC_R2_ACCOUNT_ID;
```

### 12.3 CORS Errors with Presigned URLs

**Problem:** CORS error when uploading via presigned URL

**Solution:**
- CORS must be configured on bucket
- Wait 30 seconds after configuring
- Ensure origin matches exactly (no trailing slash)
- Dashboard CORS only works for `r2.dev` domains
- Use Wrangler CLI for custom domain CORS

### 12.4 File Size Limits

**Problem:** 413 Request Entity Too Large

**Next.js limits:**
- Server Actions: 1-2MB default
- API Routes: configurable

**Solution:**

```javascript
// next.config.js
module.exports = {
  api: {
    bodyParser: {
      sizeLimit: '25mb',
    },
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '25mb',
    },
  },
};
```

Or use presigned URLs (bypasses Next.js entirely).

### 12.5 Presigned URL Expiration

**Problem:** URL expired before upload completed

**Solution:**
- Use appropriate expiry (5-15 minutes)
- Implement retry logic
- Show timer to user
- Regenerate URL if needed

```typescript
const expiresIn = 900; // 15 minutes
const expiresAt = Date.now() + expiresIn * 1000;

// Show countdown
setInterval(() => {
  const remaining = Math.max(0, expiresAt - Date.now());
  if (remaining === 0) {
    alert('Upload link expired. Please refresh.');
  }
}, 1000);
```

---

## 13. Complete Working Example

### 13.1 Upload Flow

```typescript
// 1. User selects files
// components/ImageUploader.tsx

'use client';

import { useFileUpload } from '@/hooks/useFileUpload';

export function ImageUploader({ batchId }: { batchId: string }) {
  const { uploadFile, isUploading } = useFileUpload();

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);

    for (const file of files) {
      const result = await uploadFile(file, batchId);

      if (result.success) {
        console.log('Uploaded:', result.fileUrl);
      } else {
        console.error('Failed:', result.error);
      }
    }
  };

  return (
    <div>
      <input
        type="file"
        accept="image/*"
        multiple
        onChange={handleFiles}
        disabled={isUploading}
      />
      {isUploading && <p>Uploading...</p>}
    </div>
  );
}
```

### 13.2 Download Flow

```typescript
// app/dashboard/batches/[batchId]/page.tsx

export default async function BatchPage({
  params,
}: {
  params: { batchId: string };
}) {
  // Fetch batch metadata from database
  const batch = await db.query.batches.findFirst({
    where: eq(batches.id, params.batchId),
    with: {
      images: true,
    },
  });

  return (
    <div>
      <h1>Batch {batch.id}</h1>

      {/* Download all as zip */}
      <a href={`/api/batch/${batch.id}/download`} download>
        Download All as ZIP
      </a>

      {/* Individual images */}
      <div className="grid grid-cols-4 gap-4">
        {batch.images.map((image) => (
          <div key={image.id}>
            <img
              src={`/api/image/${image.fileKey}`}
              alt={image.fileName}
            />
            <a href={`/api/download/${image.fileKey}`}>Download</a>
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## 14. Security Checklist

- [ ] Never expose R2 credentials to client
- [ ] Use presigned URLs with short expiry (<15 min)
- [ ] Validate file types and sizes server-side
- [ ] Implement rate limiting on API routes
- [ ] Use user authentication before generating URLs
- [ ] Log all upload/download operations
- [ ] Sanitize file names (remove user input from keys)
- [ ] Implement CORS properly (don't use `*` in production)
- [ ] Use HTTPS only (R2 enforces this)
- [ ] Store file metadata in database (not just R2)
- [ ] Implement virus scanning for user uploads
- [ ] Set up CloudFlare Access for bucket protection

---

## 15. Production Deployment Checklist

**Before launch:**

- [ ] Configure lifecycle policies (30-day deletion)
- [ ] Set up CORS for production domain
- [ ] Configure custom domain for public access (optional)
- [ ] Set up monitoring and alerts
- [ ] Test multipart uploads with max file size (20MB)
- [ ] Test zip download with 100 images
- [ ] Verify presigned URL generation
- [ ] Test lifecycle deletion (manually trigger)
- [ ] Load test with concurrent uploads
- [ ] Set up error tracking (Sentry, etc.)
- [ ] Configure backup strategy (if needed)
- [ ] Document API endpoints
- [ ] Set up usage monitoring dashboard

**Environment variables:**
- [ ] Add all env vars to Vercel/hosting platform
- [ ] Verify region-specific endpoint
- [ ] Test connection in production

---

## 16. Recommended Tech Stack

```
Frontend:
- Next.js 14+ (App Router)
- TypeScript
- TailwindCSS + shadcn/ui

Backend:
- Next.js API Routes
- Drizzle ORM / Prisma
- PostgreSQL (Neon, Supabase, or Vercel Postgres)

R2 Integration:
- @aws-sdk/client-s3 v3
- @aws-sdk/s3-request-presigner
- @aws-sdk/lib-storage (for large files)

File Processing:
- sharp (image optimization)
- archiver (zip generation)
- jszip (client-side zip, optional)

Utilities:
- nanoid (unique IDs)
- date-fns (date handling)
- zod (validation)
```

---

## 17. Additional Resources

### Official Documentation
- [Cloudflare R2 Docs](https://developers.cloudflare.com/r2/)
- [R2 Pricing Calculator](https://r2-calculator.cloudflare.com/)
- [AWS SDK for JavaScript v3](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/)
- [S3 API Compatibility](https://developers.cloudflare.com/r2/api/s3/api/)

### Tutorials
- [How to Upload Files to Cloudflare R2 in Next.js](https://buildwithmatija.com/blog/how-to-upload-files-to-cloudflare-r2-nextjs)
- [Multipart Uploads to R2 + Workers](https://notjoemartinez.com/blog/cloudflare_r2_multipart_upload_s3sdk/)
- [Next.js File Upload Guide](https://www.pronextjs.dev/workshops/next-js-react-server-component-rsc-architecture-jbvxk/file-uploads-in-next-js-app-router-apps-vqozo)

### GitHub Examples
- [nextjs-r2-demo](https://github.com/harshil1712/nextjs-r2-demo)
- [cloudflare-r2-with-nextjs](https://github.com/diwosuwanto/cloudflare-r2-with-nextjs-upload-download-delete)
- [r2-bucket-uploader](https://github.com/datopian/r2-bucket-uploader)

### Community
- [Cloudflare Developer Discord](https://discord.cloudflare.com/)
- [Cloudflare Community Forum](https://community.cloudflare.com/)

---

## 18. Quick Start Summary

1. **Setup (5 min):**
   - Create R2 bucket
   - Generate API token
   - Add env variables

2. **Basic upload (15 min):**
   - Configure R2 client
   - Create presigned URL API route
   - Implement client-side upload

3. **Lifecycle policies (5 min):**
   - Add 30-day deletion rule via dashboard
   - Configure CORS if needed

4. **Database integration (10 min):**
   - Store file metadata after upload
   - Track batches and expiration

5. **Download/Zip (20 min):**
   - Implement batch download endpoint
   - Generate zip on-demand

**Total setup time: ~1 hour**

---

## Conclusion

Cloudflare R2 is an excellent choice for your AI product picture generator:

✅ **Free tier covers your use case** (10GB, 1M uploads, 10M downloads)
✅ **Zero egress fees** (massive savings vs AWS S3)
✅ **Simple integration** with Next.js App Router
✅ **Automatic 30-day deletion** via lifecycle policies
✅ **Presigned URLs** for secure, direct uploads
✅ **On-demand zip generation** (no storage cost)
✅ **Multipart support** for 20MB images
✅ **S3-compatible API** (familiar tools)

**Next Steps:**
1. Create R2 bucket and API token
2. Follow Section 1 for basic integration
3. Implement presigned URL upload (Section 3)
4. Configure lifecycle policies (Section 6)
5. Add zip download (Section 7)

Good luck with your project! 🚀
