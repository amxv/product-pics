---
date: 2025-11-13 01:55:00
feature-slug: 001-ai-product-pics
---

# 001-ai-product-pics Codebase Research

This is a greenfield Next.js project for an AI-powered product picture generator. Since there is no existing codebase to research, this document focuses on the external dependencies, technologies, and architectural patterns discovered through web research that will inform the implementation.

## Summary

The AI Product Picture Generator will be built using Next.js 14+ with the App Router, leveraging three primary external services:

1. **RunPod Serverless with Seedream 4 Edit model** - AI image generation service for placing kid models wearing clothing items in natural settings
2. **better-auth** - Modern authentication library for username/password authentication
3. **Cloudflare R2** - S3-compatible object storage for uploaded and generated images with free tier and zero egress fees

All three technologies are production-ready, well-documented, and integrate seamlessly with Next.js. RunPod credits available for usage.

**Key Architecture Decisions:**
- Use presigned URLs for direct client-to-R2 uploads (bypasses server, handles 20MB files)
- Implement polling-based batch processing for RunPod (100 images per batch)
- Use better-auth username plugin for simple username/password authentication
- Generate zip files on-demand (no storage cost)
- 30-day automatic deletion via R2 lifecycle policies

## Detailed Findings

### RunPod Serverless API Integration

**Endpoint:** `https://api.runpod.ai/v2/seedream-v4-edit`

**Model:** ByteDance Seedream 4.0 Edit

The Seedream 4 Edit model is specifically designed for multi-image composition, making it ideal for product photography. It can take up to 10 images and intelligently combine them - perfect for placing clothing items on kid models in various natural settings.

**Key Capabilities:**
- Multi-image combination (up to 10 images per request)
- Natural-language editing instructions
- 1024×1024 to 4096×4096 resolution output
- Fast processing (seconds per image)
- Production-ready on RunPod infrastructure

**Pricing & Performance:**
- **$0.027 per megapixel** (slightly cheaper than fal.ai)
- 1024×1024 image = $0.0283 per image
- 100 images at 1024×1024 = **$2.83** per batch
- With 10% failure rate + 3 retries: ~$3.70 per batch
- **RunPod credits available for usage**

**API Pattern - Polling-Based Batch Processing:**

```typescript
// 1. Submit job to RunPod
const response = await fetch('https://api.runpod.ai/v2/seedream-v4-edit/run', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${RUNPOD_API_KEY}`,
  },
  body: JSON.stringify({
    input: {
      prompt: `Place ${ageRange} ${demographic} child model wearing clothing in ${setting}. Photorealistic commercial product photography.`,
      images: [modelImageUrl, clothingImageUrl],
      size: "1024*1024",
      enable_safety_checker: true,
    },
  }),
});

const { id: jobId } = await response.json();

// 2. Poll for status
const checkStatus = async (jobId: string) => {
  const statusResponse = await fetch(
    `https://api.runpod.ai/v2/seedream-v4-edit/status/${jobId}`,
    {
      headers: { 'Authorization': `Bearer ${RUNPOD_API_KEY}` },
    }
  );
  return await statusResponse.json();
};

// 3. Poll until complete
let status = await checkStatus(jobId);
while (status.status === 'IN_QUEUE' || status.status === 'IN_PROGRESS') {
  await new Promise(resolve => setTimeout(resolve, 2000)); // Poll every 2 seconds
  status = await checkStatus(jobId);
}

if (status.status === 'COMPLETED') {
  const imageUrl = status.output.result;
  // Download to R2 for long-term storage
}
```

**Input Parameters:**
- `prompt` (required): Text description of how to combine the images
- `images` (required): Array of image URLs (1-10 images)
- `size` (optional): Output dimensions as string (e.g., `"1024*1024"`, `"2048*2048"`)
  - Supported: `1024*1024`, `1536*1536`, `2048*2048`, `4096*4096`
- `enable_safety_checker` (optional): Content moderation (default: true)
- `enable_base64_output` (optional): Return base64 instead of URL (default: false)

**Response Statuses:**
- `IN_QUEUE`: Job waiting to be processed
- `IN_PROGRESS`: Job currently processing
- `COMPLETED`: Job finished successfully
- `FAILED`: Job failed (check error details)

**Prompt Structure for Kid Models:**
```
Place [age range] [demographic] child model from first image
wearing the clothing from second image in [setting description].
Photorealistic commercial product photography style.
Ensure clothing details, colors, and textures are preserved exactly.
```

**Example Prompt:**
```
Dress the 8-year-old child model in the t-shirt from the second image.
Place them on a colorful playground with swings and slides in the background.
Natural sunlight, candid photography style, ensure clothing colors and logo remain visible.
```

**Background Variety:**
- Playground, beach, park, backyard, sports field, urban plaza
- Random selection with no repeats until all options exhausted
- Each batch gets diverse settings automatically

**Error Handling:**
- Retry failed jobs up to 3 times with exponential backoff
- Track job IDs and status in database
- Timeout after 30 minutes per batch
- Handle `FAILED` status with detailed error logging

**No SDK Required:**
- Simple HTTP requests with fetch/axios
- Store API key in environment variable
- All API calls from server-side only (never expose key to client)

**Integration Points:**
- API wrapper: `/lib/runpod-client.ts` (handles requests and polling)
- Job submission: `/app/api/generate/submit/route.ts` (creates jobs)
- Status polling: `/app/api/generate/status/[jobId]/route.ts` (checks status)
- Database tracking for batch status and retry logic

**File Availability:**
Generated images are returned as URLs from RunPod CDN. These should be downloaded to R2 immediately for long-term storage (30-day retention policy).

---

### better-auth Authentication

**Purpose:** Username/password authentication with session management

better-auth is a modern, framework-agnostic authentication library that recently merged with Auth.js (NextAuth). It provides superior developer experience and built-in advanced features compared to traditional solutions.

**Why better-auth:**
- Framework-agnostic with excellent Next.js integration
- Native username/password support via plugin (no complex CredentialsProvider)
- Built-in session management, rate limiting, CSRF protection
- Automatic TypeScript type inference
- Database-agnostic (works with Prisma, Drizzle, Kysely)
- Active development (Auth.js team now maintains it)

**Core Setup Pattern:**

```typescript
// lib/auth.ts
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { username } from "better-auth/plugins";

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: { enabled: true },
  plugins: [
    username({
      minUsernameLength: 3,
      maxUsernameLength: 30,
      usernameValidator: (username) => /^[a-zA-Z0-9_.]+$/.test(username),
    }),
  ],
});
```

**Database Requirements:**
- 4 core tables: `user`, `session`, `account`, `verification`
- Auto-generated via CLI: `npx @better-auth/cli generate`
- Username plugin adds: `username` and `displayUsername` fields

**Session Management:**
- Cookie-based with HTTP-only, secure, sameSite flags
- Configurable expiration (default 7 days)
- Cookie cache reduces database calls (5-minute cache)
- Multi-device session tracking and revocation

**Route Protection Pattern:**

```typescript
// Server Component
const session = await auth.api.getSession({ headers: await headers() });
if (!session) redirect("/sign-in");

// API Route
const session = await auth.api.getSession({ headers: request.headers });
if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
```

**Client-Side Hooks:**
```typescript
const { data: session, isPending, error } = useSession();
await authClient.signUp.email({ email, name, password, username });
await authClient.signIn.username({ username, password });
await authClient.signOut();
```

**Security Features:**
- Built-in rate limiting (configurable window and max requests)
- CSRF protection (automatic)
- Secure cookie handling (httpOnly, sameSite, secure in production)
- Password hashing (automatic)
- Session token rotation

**Production Considerations:**
- Required env var: `BETTER_AUTH_SECRET` (generate with `openssl rand -base64 32`)
- Set `BETTER_AUTH_URL` to production domain
- Configure trusted origins for CORS if needed
- Connection pooling for database

---

### Cloudflare R2 Storage

**Purpose:** Store uploaded product images and AI-generated images with 30-day retention

Cloudflare R2 is an S3-compatible object storage service with zero egress fees, making it significantly more cost-effective than AWS S3 for serving images to users.

**Free Tier (Monthly):**
- 10 GB storage
- 1,000,000 Class A operations (PUT, POST, LIST)
- 10,000,000 Class B operations (GET, SELECT)
- **Unlimited egress bandwidth** (always free)

**Sufficiency Analysis:**
With 30-day automatic deletion and typical usage:
- Storage: ~10,000 images @ 1MB each = 10GB (at limit, but deletion keeps it manageable)
- Uploads: 100 images/batch × 100 batches = 10,000 operations (1% of free tier)
- Downloads: 3.3M image views per month within free tier
- **Verdict: Free tier is sufficient for initial deployment and moderate production use**

**Recommended Architecture: Presigned URLs**

Direct client-to-R2 uploads bypass Next.js server limitations (1-2MB for server actions):

```typescript
// 1. Client requests presigned URL from API route
const response = await fetch('/api/upload/presigned-url', {
  method: 'POST',
  body: JSON.stringify({ fileName, fileType, fileSize, batchId }),
});
const { presignedUrl, fileKey } = await response.json();

// 2. Client uploads directly to R2
await fetch(presignedUrl, {
  method: 'PUT',
  body: file,
  headers: { 'Content-Type': file.type },
});
```

**File Organization Strategy:**
```
bucket/
├── uploads/{userId}/{batchId}/{date}/{uniqueId}.jpg    # User uploads
├── generated/{userId}/{batchId}/{uniqueId}.png         # AI-generated
└── temp/{uniqueId}.{ext}                               # Temporary (1-day lifecycle)
```

**Lifecycle Policies (30-day Automatic Deletion):**

Configure via dashboard, Wrangler CLI, or AWS SDK:
```typescript
LifecycleConfiguration: {
  Rules: [
    {
      ID: 'delete-uploads-after-30-days',
      Status: 'Enabled',
      Filter: { Prefix: 'uploads/' },
      Expiration: { Days: 30 },
    },
    {
      ID: 'delete-generated-after-30-days',
      Status: 'Enabled',
      Filter: { Prefix: 'generated/' },
      Expiration: { Days: 30 },
    },
  ],
}
```

**Objects deleted within 24 hours of expiration, deletion is free.**

**Zip Download Strategy: Generate On-Demand**

Do NOT store pre-generated zips:
- ❌ Doubles storage costs (original + zip)
- ❌ Wasted if never downloaded
- ✅ Generate when requested (zero storage cost)
- ✅ Always reflects current files

```typescript
// Server-side streaming with archiver
const archive = archiver('zip', { zlib: { level: 6 } });

for (const object of Contents) {
  const response = await r2Client.send(new GetObjectCommand({ Key: object.Key }));
  archive.append(response.Body, { name: fileName });
}

await archive.finalize();
```

**SDK Setup:**
```bash
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

**R2 Client Configuration:**
```typescript
import { S3Client } from '@aws-sdk/client-s3';

const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: true, // Required for R2
});
```

**CORS Configuration (Required for Presigned URLs):**
Must allow PUT and GET methods from your domain for client-side uploads via presigned URLs.

**Security Best Practices:**
- Never expose R2 credentials to client
- Presigned URLs expire in 5-15 minutes (configurable)
- Validate file type and size server-side before generating presigned URL
- Sanitize file names (use generated IDs, not user input)
- Store file metadata in database, not just R2

**Cost After Free Tier:**
- Storage: $0.015/GB-month
- Class A operations: $4.50/million
- Class B operations: $0.36/million
- Egress: $0 (always free)

Example at scale: 50GB storage + 5M uploads + 50M downloads = ~$35/month (vs AWS S3: $500+/month with egress fees)

---

## Code References

No existing code to reference (greenfield project).

---

## Architecture Insights

### Patterns and Design Decisions

**1. Polling-Based Asynchronous Processing**

For handling 100-image batches with RunPod:
- Submit all jobs to RunPod API and receive job IDs
- Store job IDs and batch associations in database
- Background worker polls for status updates every 2-5 seconds
- Update database as each job completes
- User can navigate away and return later (progress persists in database)
- Implement 30-minute timeout for entire batch

**Benefits:**
- Non-blocking (background worker handles polling)
- Handles long-running operations gracefully
- Simple to implement (no webhook endpoint setup)
- Scales to handle multiple concurrent batches
- Reliable (no missed webhooks, we control retry logic)

**Implementation Pattern:**
- Use a background job queue (BullMQ, Inngest, or cron jobs)
- Poll RunPod status endpoint for pending jobs
- Update database with results
- Notify user via UI refresh or Server-Sent Events

**2. Presigned URL Upload Pattern**

For 20MB image uploads:
- Client requests presigned URL from authenticated API route
- Server validates user, file type, and size
- Server generates time-limited presigned URL (5-15 min expiry)
- Client uploads directly to R2 (bypasses server)
- Client notifies server of completion via callback

**Benefits:**
- No file size limits (Next.js server actions limited to 1-2MB)
- Faster uploads (no double-transfer through server)
- Lower server load and bandwidth costs
- Works reliably with large files

**3. On-Demand Resource Generation**

For zip file downloads:
- Generate zips when requested, stream to client
- Don't store pre-generated zips
- Use `archiver` library for efficient streaming
- Support progressive download (starts immediately)

**Benefits:**
- Zero storage cost for zips
- Always current (reflects latest files)
- Scales better (no storage multiplication)
- No maintenance burden (no stale zips)

**4. Database as Source of Truth**

Store all metadata in database, not just R2:
- File paths, sizes, types, status
- Batch metadata and progress
- User associations
- Expiration timestamps
- Generation status and retry counts

**Benefits:**
- Fast queries (no R2 LIST operations)
- Enables user-specific views
- Audit trail and analytics
- Supports complex queries and filters

**5. Lifecycle-Based Retention**

30-day automatic deletion via R2 lifecycle policies:
- Set once at bucket level
- Applies to all future uploads
- Automatic, reliable, free
- No cron jobs or manual cleanup

**Benefits:**
- Hands-off (no code to maintain)
- Cost-effective (free deletion)
- Reliable (Cloudflare manages it)
- Compliant (automatic data retention policy)

### Technology Stack Synergies

**Next.js App Router + better-auth:**
- Server Components for authentication checks (zero client JS)
- API routes for job submission and status checking
- Middleware for optimistic redirects
- Server actions for simple mutations

**RunPod Polling + Background Workers:**
- Decouples request submission from result handling
- Custom retry logic with exponential backoff
- Progress tracking via database
- Background workers poll for job status updates

**R2 + Presigned URLs:**
- S3-compatible API (familiar tools)
- Zero egress fees (critical for image delivery)
- Presigned URLs enable direct uploads
- Lifecycle policies automate retention

### Scalability Considerations

**Initial Phase:**
- RunPod: Pay-as-you-go with existing credits (~$2.83/batch)
- better-auth: Self-hosted (database cost only)
- R2: Free tier covers 10GB storage, unlimited egress

**Growth Phase:**
- RunPod: Linear cost scaling ($0.0283/image)
- R2: $0.015/GB after 10GB (still much cheaper than S3)
- Database: May need connection pooling, read replicas
- better-auth: Add Redis for session caching (optional)
- Background workers: May need dedicated polling service

**Performance Optimization:**
- Compress images before upload (WebP format)
- Generate thumbnails for preview (smaller, faster)
- Cache file listings in database (avoid R2 LIST operations)
- Implement client-side caching for static assets
- Use CDN for serving generated images (R2 has built-in edge caching)

### Security Architecture

**Authentication Flow:**
1. User signs up with username/password (better-auth)
2. Session stored in HTTP-only cookie
3. All API routes validate session server-side
4. User ID associated with all uploaded/generated images

**Authorization Flow:**
1. Check session exists and is valid
2. Verify user owns the batch/file being accessed
3. Generate presigned URL with short expiry
4. Log access for audit trail

**Rate Limiting:**
- better-auth: Built-in rate limiting (10 requests/min default)
- API routes: Implement additional rate limiting per user
- RunPod: Serverless (scales automatically, monitor credits usage)
- R2: Within free tier limits (1M uploads, 10M downloads/month)

**Data Privacy:**
- Images automatically deleted after 30 days
- User can delete images manually (delete from R2 + database)
- No image analysis or logging beyond error tracking
- Presigned URLs expire quickly (no URL sharing after expiry)

---

## Web Research Documents

<web-research-documents>

### 1. RunPod Serverless API and Seedream 4 Edit Model

**Source:** RunPod documentation at `https://console.runpod.io/hub/playground/image/seedream-v4-edit`

**Purpose:** AI image generation service for placing kid models wearing clothing in natural settings

**Key Findings:**
- **Endpoint:** `https://api.runpod.ai/v2/seedream-v4-edit`
- **Model:** ByteDance Seedream 4.0 Edit
- **Pricing:** $0.027 per megapixel ($0.0283 per 1024×1024 image) - slightly cheaper than alternatives
- **Batch Processing:** Polling-based async processing with job ID tracking
- **Prompt Construction:** Natural language instructions for multi-image combination
- **Error Handling:** Custom retry logic with exponential backoff (up to 3 attempts)
- **Commercial Use:** Production-ready on RunPod infrastructure
- **No SDK Required:** Simple REST API with fetch/axios
- **Image Retention:** Generated images available from RunPod CDN (should download to R2 immediately)
- **Existing Credits:** RunPod credits available for usage

**Integration Notes:**
- No proxy needed - API calls from server-side only
- API wrapper: `lib/runpod-client.ts` for job submission and polling
- Job submission endpoint: `app/api/generate/submit/route.ts`
- Status polling endpoint: `app/api/generate/status/[jobId]/route.ts`
- Background worker polls for status every 2-5 seconds
- Database tracking for job IDs, batch status, and progress
- Retry logic for failed jobs (up to 3 attempts)
- 30-minute timeout for entire batch processing
- Background diversity achieved through random setting selection

**API Format:**
- Input: `{ prompt, images[], size, enable_safety_checker }`
- Output: `{ id: jobId }` for submission, `{ status, output: { result } }` for status
- Statuses: `IN_QUEUE`, `IN_PROGRESS`, `COMPLETED`, `FAILED`

**Implementation Timeline:** 4 weeks recommended (MVP → Batch → Hardening → Optimization)

---

### 2. better-auth Authentication

**Research Document:** `gg/agent-outputs/web-researcher/2025-11-13_01-48-47-better-auth-nextjs-research.md`

**Purpose:** Username/password authentication with session management for user-specific data access

**Key Findings:**
- **Why better-auth:** Modern alternative to NextAuth with superior DX, Auth.js recently merged into it
- **Username Plugin:** Native support for username/password (no complex CredentialsProvider)
- **Database Support:** Prisma, Drizzle, Kysely adapters (works with PostgreSQL, MySQL, SQLite)
- **Session Management:** Cookie-based with caching (5-min cookie cache reduces DB load)
- **TypeScript:** Automatic type inference for user fields and custom fields
- **Security:** Built-in rate limiting, CSRF protection, secure cookies, session revocation
- **Setup:** Simple 3-step process (install → configure → add API route)
- **CLI Tools:** `@better-auth/cli` for schema generation and migrations
- **Production Ready:** Used in production by many companies

**Integration Notes:**
- API route: `app/api/auth/[...all]/route.ts` (handles all auth operations)
- Client setup: `lib/auth-client.ts` with `useSession` hook
- Server validation: `auth.api.getSession({ headers })` for protected routes
- Middleware: Optimistic checks (must validate server-side for security)
- Database schema: 4 core tables auto-generated by CLI
- Environment: `BETTER_AUTH_SECRET` (required), `BETTER_AUTH_URL` (production domain)

**Comparison:** Superior to NextAuth for new projects (better DX, built-in features). More flexible than Clerk (self-hosted, no vendor lock-in).

---

### 3. Cloudflare R2 Storage

**Research Document:** `gg/agent-outputs/web-researcher/2025-11-13_01-53-12-cloudflare-r2-nextjs-integration.md`

**Purpose:** Image storage with 30-day automatic deletion and zero egress fees

**Key Findings:**
- **Free Tier:** 10GB storage, 1M uploads, 10M downloads, unlimited egress (sufficient for this use case)
- **S3 Compatible:** Use AWS SDK v3 for JavaScript (`@aws-sdk/client-s3`)
- **Presigned URLs:** Recommended for uploads (bypasses Next.js 1-2MB limit, handles 20MB files)
- **Lifecycle Policies:** Native support for automatic 30-day deletion (configure once, works forever)
- **Multipart Uploads:** Supported for large files (5MB+ parts, up to 5TB total)
- **CORS:** Required for direct client uploads via presigned URLs
- **Zip Generation:** On-demand generation recommended (zero storage cost vs storing pre-generated)
- **Cost After Free Tier:** $0.015/GB storage, $0 egress (vs AWS S3: $0.09/GB storage + egress fees)

**Integration Notes:**
- Client: `S3Client` with R2 endpoint (`https://{accountId}.r2.cloudflarestorage.com`)
- Upload flow: Client requests presigned URL → uploads directly to R2 → notifies server
- Download flow: Server generates presigned GET URL → client downloads
- Zip flow: Server streams zip on-demand using `archiver` library
- File organization: `uploads/{userId}/{batchId}/{date}/{uniqueId}.ext`
- Database tracking: Store file metadata (keys, sizes, types) for fast queries
- Lifecycle: Configure via dashboard, Wrangler CLI, or AWS SDK (30-day expiration)
- Security: Never expose credentials, validate server-side, short presigned URL expiry (5-15 min)

**Best Practices:**
- Use presigned URLs for uploads >5MB
- Generate zips on-demand (don't store)
- Compress images to WebP (30% smaller)
- Cache file listings in database
- Monitor usage via R2 dashboard

</web-research-documents>
