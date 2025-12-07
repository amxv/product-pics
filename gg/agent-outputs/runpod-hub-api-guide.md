# RunPod Hub API Guide - Nano Banana Model
## Technical Implementation Reference

This guide documents the RunPod Hub API usage for the nano-banana-edit model, extracted from production code at `/Users/ashray/code/amxv/product-pics`.

---

## 1. Endpoint Details

### Base Configuration

```typescript
// From: src/lib/runpod.ts:4
const RUNPOD_ENDPOINT = 'https://api.runpod.ai/v2/nano-banana-edit';
const RUNPOD_API_KEY = process.env.RUNPOD_API_KEY!;
```

### Available Endpoints

| Operation | Method | Endpoint | Description |
|-----------|--------|----------|-------------|
| Submit Job | `POST` | `${RUNPOD_ENDPOINT}/run` | Submit image generation job |
| Check Status | `GET` | `${RUNPOD_ENDPOINT}/status/{jobId}` | Poll job status and results |
| Download Result | `GET` | `{resultUrl}` | Download generated image (URL from status response) |

### Authentication

**Method**: Bearer Token Authentication

```typescript
// From: src/lib/runpod.ts:17-18
headers: {
  'Authorization': `Bearer ${RUNPOD_API_KEY}`,
  'Content-Type': 'application/json',
}
```

**API Key Source**: Environment variable `RUNPOD_API_KEY`

---

## 2. Request Structure

### 2.1 Submit Job Request

**Endpoint**: `POST https://api.runpod.ai/v2/nano-banana-edit/run`

**Headers**:
```
Authorization: Bearer <YOUR_API_KEY>
Content-Type: application/json
```

**Request Body Schema**:
```typescript
// From: src/lib/types.ts:128-135
{
  input: {
    prompt: string;
    images: string[];  // Array of image URLs (publicly accessible)
    size: '1024*1024' | '1536*1536' | '2048*2048' | '4096*4096';
    enable_safety_checker?: boolean;
  }
}
```

**Example Request** (from `src/app/api/generate/submit/route.ts:171-176`):
```typescript
{
  input: {
    prompt: "A baby with a cute toy on a playground background, natural lighting, photorealistic",
    images: ["https://example.com/presigned-url-to-product-image.png"],
    size: "1024*1024",
    enable_safety_checker: true
  }
}
```

**Parameter Details**:
- `prompt`: Text description for image generation
- `images`: Array of publicly accessible image URLs (implementation uses presigned URLs with 24-hour expiry from Cloudflare R2)
- `size`: Output image dimensions. Implementation uses `'1024*1024'` consistently
- `enable_safety_checker`: Safety filter for generated content. Implementation sets to `true`

### 2.2 Check Status Request

**Endpoint**: `GET https://api.runpod.ai/v2/nano-banana-edit/status/{jobId}`

**Headers**:
```
Authorization: Bearer <YOUR_API_KEY>
```

**Path Parameters**:
- `jobId`: The job ID returned from submit job response

**Example** (from `src/lib/runpod.ts:45`):
```typescript
const response = await fetch(`${RUNPOD_ENDPOINT}/status/${jobId}`, {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${RUNPOD_API_KEY}`,
  },
});
```

### 2.3 Download Result Request

**Endpoint**: `GET {resultUrl}` (URL provided in completed status response)

**No special headers required** (from `src/lib/runpod.ts:74`):
```typescript
const response = await fetch(resultUrl);
const arrayBuffer = await response.arrayBuffer();
const imageBuffer = Buffer.from(arrayBuffer);
```

---

## 3. Response Structure

### 3.1 Submit Job Response

**Success Response** (from `src/lib/types.ts:137-140`):
```typescript
{
  id: string;        // Job ID for status polling
  status: 'IN_QUEUE';
}
```

**Example**:
```json
{
  "id": "abc123xyz",
  "status": "IN_QUEUE"
}
```

**Error Response** (from `src/lib/runpod.ts:23-25`):
- HTTP Status: Various (4xx, 5xx)
- Body: Error text (not JSON)
- Error handling: `RunPod API error (${response.status}): ${errorText}`

### 3.2 Status Check Response

**Response Schema** (from `src/lib/types.ts:143-150`):
```typescript
{
  id: string;
  status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  output?: {
    result: string;  // CDN URL to generated image (present when COMPLETED)
  };
  error?: string;    // Error message (present when FAILED)
}
```

**Status States**:

1. **IN_QUEUE**: Job queued, not yet processing
   ```json
   {
     "id": "abc123xyz",
     "status": "IN_QUEUE"
   }
   ```

2. **IN_PROGRESS**: Job actively processing
   ```json
   {
     "id": "abc123xyz",
     "status": "IN_PROGRESS"
   }
   ```

3. **COMPLETED**: Job successful, result ready
   ```json
   {
     "id": "abc123xyz",
     "status": "COMPLETED",
     "output": {
       "result": "https://cdn.runpod.ai/result/abc123xyz.png"
     }
   }
   ```

4. **FAILED**: Job failed with error
   ```json
   {
     "id": "abc123xyz",
     "status": "FAILED",
     "error": "Safety checker triggered"
   }
   ```

**Error Response**:
- HTTP Status: Various (4xx, 5xx)
- Body: Error text
- Error handling: `RunPod API error (${response.status}): ${errorText}`

### 3.3 Download Result Response

**Success**: Binary image data (PNG format in implementation)
**Error**: HTTP error status codes

---

## 4. General Guidelines

### 4.1 Polling Strategy

**Implementation Pattern** (from `src/app/api/generate/poll/[batchId]/route.ts`):

1. **Polling Frequency**: Client-side polling, no specified interval in backend code
2. **Timeout**: 30 minutes maximum processing time (line 63)
3. **Concurrency**: Maximum 10 concurrent status checks (line 147)

```typescript
// From: src/app/api/generate/poll/[batchId]/route.ts:62-65
const TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const processingStartTime = batch.updatedAt.getTime();
const elapsedMs = Date.now() - processingStartTime;

if (batch.status === 'processing' && elapsedMs > TIMEOUT_MS) {
  // Mark job as timed out
}
```

### 4.2 Retry Logic

**Automatic Retries** (from `src/app/api/generate/poll/[batchId]/route.ts:234-246`):

- **Max Retries**: 3 attempts
- **Retry Delays**: Exponential backoff
  - Attempt 1: 1 second delay
  - Attempt 2: 2 seconds delay
  - Attempt 3: 4 seconds delay
- **Retry Trigger**: `FAILED` status from RunPod

```typescript
// From: src/app/api/generate/poll/[batchId]/route.ts:21
const RETRY_DELAYS = [1000, 2000, 4000]; // 1s, 2s, 4s

// Retry implementation (simplified)
if (statusResponse.status === 'FAILED') {
  const currentRetryCount = generatedImage.retryCount;
  if (currentRetryCount < 3) {
    const delay = RETRY_DELAYS[currentRetryCount] || 4000;
    await new Promise(resolve => setTimeout(resolve, delay));
    // Resubmit job...
  }
}
```

**Manual Retry** (from `src/app/api/generate/retry/route.ts`):
- Resets retry count to 0
- Generates new prompt with random variety (0-5)
- Creates new temp image URL and resubmits

### 4.3 Concurrency Limits

**Submission Concurrency** (from `src/app/api/generate/submit/route.ts:117`):
```typescript
const limit = pLimit(10); // Max 10 concurrent operations
```

**Status Check Concurrency** (from `src/app/api/generate/poll/[batchId]/route.ts:147`):
```typescript
const limit = pLimit(10); // Max 10 concurrent status checks
```

**Rationale**: Prevents overwhelming RunPod API with too many simultaneous requests

### 4.4 Rate Limits

**Not explicitly documented in code**, but implementation uses:
- 10 concurrent requests maximum
- Sequential submission with p-limit queue

### 4.5 Error Handling Patterns

**API Errors** (from `src/lib/runpod.ts:23-35`):
```typescript
if (!response.ok) {
  const errorText = await response.text();
  throw new Error(`RunPod API error (${response.status}): ${errorText}`);
}

// Catch and wrap errors
catch (error) {
  if (error instanceof Error) {
    throw new Error(`Failed to submit job to RunPod: ${error.message}`);
  }
  throw new Error('Failed to submit job to RunPod: Unknown error');
}
```

**Status Codes Handled**:
- `!response.ok`: Any non-2xx status triggers error
- Implementation treats all non-2xx as failures

---

## 5. Implementation Notes

### 5.1 Image URL Requirements

**Critical Gotcha** (from `src/app/api/generate/submit/route.ts:144-160`):

Images must be **publicly accessible URLs**. Implementation approach:
1. Convert product images to PNG format
2. Upload PNG to temporary cloud storage location
3. Generate presigned URL with 24-hour expiry
4. Pass presigned URL to RunPod

```typescript
// From: src/app/api/generate/submit/route.ts:158-160
const tempImageUrl = await getSignedUrl(r2Client, tempGetCommand, {
  expiresIn: 86400, // 24 hours
});
```

**Why?** RunPod needs to download the image from a public URL. Private/local files won't work.

### 5.2 Image Format

**Conversion Required** (from `src/app/api/generate/submit/route.ts:141`):
```typescript
const pngBuffer = await convertToPNG(imageBuffer);
```

Implementation converts all input images to PNG before submission. This ensures consistent format handling by the model.

### 5.3 Temporary Storage Cleanup

**Storage Pattern** (from `src/app/api/generate/submit/route.ts:144`):
```typescript
const tempKey = `temp/${nanoid()}.png`;
```

Implementation uses `temp/` prefix for uploaded PNGs. These should be cleaned up after job completion (cleanup logic not shown in provided code).

### 5.4 Result Download Timing

**Download on Complete** (from `src/app/api/generate/poll/[batchId]/route.ts:174-190`):

Results are downloaded immediately when status becomes `COMPLETED`:
```typescript
if (statusResponse.status === 'COMPLETED') {
  const resultUrl = statusResponse.output?.result;
  if (!resultUrl) {
    throw new Error('No result URL in completed job');
  }

  const imageBuffer = await downloadResult(resultUrl);
  // Upload to permanent storage...
}
```

**Why?** Result URLs may have limited lifetime. Download and store in your own storage immediately.

### 5.5 Safety Checker Considerations

**Always Enabled** (from `src/app/api/generate/submit/route.ts:175`):
```typescript
enable_safety_checker: true
```

When enabled, jobs can fail with `FAILED` status if content violates safety policies. Error message typically indicates "Safety checker triggered".

### 5.6 Status Response Validation

**Important Check** (from `src/app/api/generate/poll/[batchId]/route.ts:175-178`):
```typescript
const resultUrl = statusResponse.output?.result;
if (!resultUrl) {
  throw new Error('No result URL in completed job');
}
```

Always validate that `output.result` exists in `COMPLETED` status before attempting download.

### 5.7 Job Status Transitions

**Expected Flow**:
```
IN_QUEUE → IN_PROGRESS → COMPLETED
                        ↘ FAILED
```

Implementation handles all states:
- `IN_QUEUE`: Continue polling (no action)
- `IN_PROGRESS`: Continue polling (no action)
- `COMPLETED`: Download result, mark success
- `FAILED`: Retry or mark failed permanently

### 5.8 Timeout Handling

**30-Minute Hard Timeout** (from `src/app/api/generate/poll/[batchId]/route.ts:67-85`):

If job hasn't completed within 30 minutes of processing start:
1. All remaining processing images marked as failed
2. Error message: "Timeout: Generation exceeded 30 minutes"
3. Batch status updated to `partial` or `failed`

### 5.9 Database Schema Notes

**Job Tracking** (from `db/schema.ts:151-173`):

Implementation tracks RunPod jobs in separate table:
```typescript
export const runpodJobTable = pgTable('runpod_job', {
  id: text('id').primaryKey(),
  generatedImageId: text('generated_image_id').notNull(),
  jobId: text('job_id').notNull().unique(),  // RunPod job ID
  status: runpodJobStatusEnum('status').notNull().default('in_queue'),
  prompt: text('prompt').notNull(),
  background: text('background').notNull(),
  submittedAt: timestamp('submitted_at').notNull().defaultNow(),
  completedAt: timestamp('completed_at'),
  errorMessage: text('error_message'),
  resultUrl: text('result_url'),
});
```

Useful for:
- Debugging failed jobs
- Audit trail
- Prompt regeneration on retry

---

## 6. Complete Example Implementation

### 6.1 Submit and Poll Pattern

```typescript
import fetch from 'node-fetch';

// Configuration
const RUNPOD_ENDPOINT = 'https://api.runpod.ai/v2/nano-banana-edit';
const RUNPOD_API_KEY = process.env.RUNPOD_API_KEY!;

// Submit job
async function submitJob(prompt: string, imageUrls: string[]) {
  const response = await fetch(`${RUNPOD_ENDPOINT}/run`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RUNPOD_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: {
        prompt,
        images: imageUrls,
        size: '1024*1024',
        enable_safety_checker: true,
      }
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`RunPod API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data.id; // Job ID
}

// Poll status
async function pollJobStatus(jobId: string) {
  const response = await fetch(`${RUNPOD_ENDPOINT}/status/${jobId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${RUNPOD_API_KEY}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`RunPod API error (${response.status}): ${errorText}`);
  }

  return await response.json();
}

// Download result
async function downloadResult(resultUrl: string): Promise<Buffer> {
  const response = await fetch(resultUrl);

  if (!response.ok) {
    throw new Error(`Failed to download image (${response.status})`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// Complete workflow
async function generateImage(prompt: string, imageUrls: string[]) {
  // Submit job
  const jobId = await submitJob(prompt, imageUrls);
  console.log(`Job submitted: ${jobId}`);

  // Poll until complete
  const maxAttempts = 60; // 30 minutes @ 30s intervals
  const pollInterval = 30000; // 30 seconds

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const status = await pollJobStatus(jobId);
    console.log(`Status: ${status.status}`);

    if (status.status === 'COMPLETED') {
      if (!status.output?.result) {
        throw new Error('No result URL in completed job');
      }
      // Download result
      const imageBuffer = await downloadResult(status.output.result);
      console.log(`Image downloaded: ${imageBuffer.length} bytes`);
      return imageBuffer;
    }

    if (status.status === 'FAILED') {
      throw new Error(`Job failed: ${status.error || 'Unknown error'}`);
    }

    // Still processing, wait and retry
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  throw new Error('Job timed out after 30 minutes');
}

// Usage
(async () => {
  try {
    const imageBuffer = await generateImage(
      'A baby with a cute toy on a playground background',
      ['https://example.com/product-image.png']
    );
    // Save imageBuffer to file or upload to storage
  } catch (error) {
    console.error('Error:', error);
  }
})();
```

---

## 7. Model-Specific Parameters (Nano Banana)

### Supported Sizes

From `src/lib/types.ts:132`:
```typescript
size: '1024*1024' | '1536*1536' | '2048*2048' | '4096*4096';
```

**Production Usage**: Implementation consistently uses `'1024*1024'`

### Image Input

**Single Image**: Implementation always passes single image URL in array
```typescript
images: [tempImageUrl], // Only the product image
```

**Note**: Type definition allows array, but nano-banana-edit may only support single image input based on usage pattern.

### Safety Checker

**Enabled by Default**: Implementation always sets `enable_safety_checker: true`

When safety checker triggers:
- Job status: `FAILED`
- Error message typically indicates policy violation
- Can retry, but same content will likely fail again

---

## 8. Environment Setup

### Required Environment Variables

```bash
# From: src/lib/runpod.ts:5
RUNPOD_API_KEY=your_api_key_here
```

### Dependencies

```json
// For fetch (Node.js < 18)
{
  "dependencies": {
    "node-fetch": "^3.x.x"
  }
}
```

**Note**: Node.js 18+ has built-in fetch support

### Concurrency Control

```json
{
  "dependencies": {
    "p-limit": "^4.x.x"  // From implementation
  }
}
```

Usage:
```typescript
import pLimit from 'p-limit';
const limit = pLimit(10);
```

---

## 9. Common Issues and Solutions

### Issue 1: "No result URL in completed job"

**Cause**: Status response lacks `output.result` field despite `COMPLETED` status

**Solution**: Always validate result URL exists before download attempt
```typescript
if (!statusResponse.output?.result) {
  throw new Error('No result URL in completed job');
}
```

### Issue 2: Image URLs not accessible

**Cause**: RunPod cannot download images from private URLs

**Solution**: Use publicly accessible URLs or presigned URLs with sufficient expiry (24+ hours recommended)

### Issue 3: Jobs timing out

**Cause**: Processing takes longer than expected, or job stuck in queue

**Solution**:
- Implement 30-minute timeout
- Consider retry logic
- Check RunPod service status

### Issue 4: Safety checker failures

**Cause**: Generated content violates RunPod policies

**Solution**:
- Review prompt content
- Consider disabling safety checker if appropriate for your use case
- Retry with modified prompt

### Issue 5: Rate limiting

**Cause**: Too many concurrent requests

**Solution**: Use concurrency limiting (p-limit) to max 10 concurrent requests

---

## 10. Summary

### Quick Reference

| Aspect | Value |
|--------|-------|
| Base URL | `https://api.runpod.ai/v2/nano-banana-edit` |
| Auth Method | Bearer Token |
| Submit Endpoint | `POST /run` |
| Status Endpoint | `GET /status/{jobId}` |
| Recommended Poll Interval | 30 seconds |
| Max Timeout | 30 minutes |
| Max Retries | 3 attempts |
| Retry Delays | 1s, 2s, 4s (exponential) |
| Concurrency Limit | 10 concurrent requests |
| Image URL Expiry | 24+ hours recommended |
| Default Size | `1024*1024` |
| Safety Checker | Enabled by default |

### Key Takeaways

1. **Image URLs must be publicly accessible** - Use presigned URLs or CDN links
2. **Poll, don't wait** - Async processing requires polling for results
3. **Download results immediately** - Result URLs may have limited lifetime
4. **Implement timeouts** - 30-minute maximum processing time
5. **Handle retries gracefully** - Use exponential backoff for failed jobs
6. **Limit concurrency** - Max 10 concurrent operations to avoid rate limiting
7. **Validate responses** - Always check for required fields before proceeding

---

**Document Version**: 1.0
**Last Updated**: 2025-11-26
**Source Codebase**: `/Users/ashray/code/amxv/product-pics`
**Model**: nano-banana-edit
**API Version**: v2
