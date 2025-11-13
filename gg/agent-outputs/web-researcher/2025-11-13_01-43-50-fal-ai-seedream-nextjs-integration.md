# fal.ai Seedream 4 Edit Integration with Next.js - Comprehensive Research

**Research Date:** November 13, 2025
**Model:** `fal-ai/bytedance/seedream/v4/edit`
**Use Case:** AI product photography for kids clothing - placing kid models wearing clothing in natural settings

---

## Executive Summary

fal.ai provides a robust, production-ready API for image generation and editing using the Seedream 4.0 Edit model. The platform offers:

- **Commercial Use Approved**: Fully licensed for commercial applications
- **Fast Generation**: 2K images in seconds, scalable to 4K
- **Cost-Effective**: $0.03 per image at 1024x1024 resolution
- **Queue-Based Architecture**: Built for handling batch operations up to 100 images
- **TypeScript SDK**: First-class Next.js support with built-in type safety
- **Webhook Support**: Asynchronous processing with automatic retries

The Seedream 4.0 Edit model is particularly well-suited for product photography use cases, with multi-image composition capabilities that allow placing clothing items on models in various settings.

---

## 1. Next.js Integration Guide

### 1.1 Installation & Setup

**Install Required Packages:**
```bash
npm install @fal-ai/client @fal-ai/server-proxy
```

**Environment Variables (.env.local):**
```bash
FAL_KEY="key_id:key_secret"
```

Create your API key at: https://fal.ai/dashboard/keys

### 1.2 Server-Side Proxy Setup (Required for Production)

The proxy protects your API key from client-side exposure while allowing direct client-side API calls.

**For App Router (app/api/fal/proxy/route.ts):**
```typescript
import { route } from "@fal-ai/server-proxy/nextjs";

export const { GET, POST } = route;
```

**For Pages Router (pages/api/fal/proxy.ts):**
```typescript
export { handler as default } from "@fal-ai/server-proxy/nextjs";
```

### 1.3 Client Configuration

**Configure in your root layout or main app file:**
```typescript
import { fal } from "@fal-ai/client";

// Configure to use server proxy (protects API key)
fal.config({
  proxyUrl: "/api/fal/proxy",
});
```

### 1.4 Custom Proxy Logic (Optional)

Add authentication, rate limiting, or analytics:

```typescript
import { route } from "@fal-ai/server-proxy/nextjs";

export const POST = async (req: Request) => {
  // Add custom logic here
  const user = await authenticate(req);

  // Apply rate limiting
  if (await isRateLimited(user.id)) {
    return new Response(JSON.stringify({ error: "Too many requests" }), {
      status: 429,
    });
  }

  // Log analytics
  await logRequest({
    userId: user.id,
    targetUrl: req.headers.get("x-fal-target-url"),
  });

  // Forward to fal.ai
  return route.POST(req);
};

export const GET = route.GET;
```

---

## 2. Seedream 4 Edit Model Documentation

### 2.1 Model Overview

**Model ID:** `fal-ai/bytedance/seedream/v4/edit`

**Key Capabilities:**
- **Multi-image composition**: Blend subjects, backgrounds, and style references coherently
- **Instructional editing**: Natural-language add/remove/replace/restyle operations
- **High-resolution output**: 2K standard, scalable to 4K (4096×4096)
- **Fast iteration**: Production-ready speeds for commercial workflows
- **Commercial license**: Approved for business use

### 2.2 Input Parameters

**Required Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `prompt` | `string` | Text prompt describing the desired edit |
| `image_urls` | `string[]` | Array of input image URLs (up to 10 images) |

**Optional Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `image_size` | `ImageSize \| Enum` | - | Output dimensions (see options below) |
| `num_images` | `integer` | `1` | Number of separate generations |
| `max_images` | `integer` | `1` | Max images per generation (for multi-image mode) |
| `seed` | `integer` | - | Random seed for reproducibility |
| `sync_mode` | `boolean` | `false` | Return as data URI (no history) |
| `enable_safety_checker` | `boolean` | `true` | Content moderation filter |
| `enhance_prompt_mode` | `"standard" \| "fast"` | `"standard"` | Prompt enhancement quality |

**Image Size Options:**
- Predefined: `square_hd`, `square`, `portrait_4_3`, `portrait_16_9`, `landscape_4_3`, `landscape_16_9`
- Auto-scaling: `auto`, `auto_2K`, `auto_4K`
- Custom dimensions:
  ```typescript
  {
    image_size: {
      width: 1024,
      height: 1024
    }
  }
  ```
  *Minimum total area: 921,600 pixels*

### 2.3 Output Schema

**Successful Response:**
```typescript
{
  images: [
    {
      url: string;          // Download URL
      content_type: string; // MIME type
      file_name: string;    // Auto-generated name
      file_size: number;    // Bytes
      width: number;        // Pixels
      height: number;       // Pixels
    }
  ];
  seed: number;            // Seed used for generation
}
```

**File Availability:** Generated images are guaranteed to be available for **at least 7 days**.

---

## 3. Prompt Construction for Kid Models & Product Photography

### 3.1 Prompt Structure Formula

**Action + Object + Target Feature + Context**

For product photography with kid models:
```
Place [clothing item] from [image reference] on [subject description]
in [setting/background] with [lighting/atmosphere specifications]
```

### 3.2 Example Prompts for Kids Clothing

**Example 1: Basic Product Placement**
```
Dress the child model in the clothes from image 1. Place them on a playground
with bright natural sunlight, children playing in the background. Photorealistic,
commercial product photography style.
```

**Example 2: Multi-Image Composition**
```
Subject from img1 (child model), wearing the t-shirt from img2 and shorts from img3,
placed in a beach setting from img4. Golden hour lighting, soft shadows,
natural outdoor photography. Keep the clothing colors and details unchanged.
```

**Example 3: Age & Demographic Specification**
```
8-year-old child model wearing the outfit from image 2, standing in a
modern playground setting. Natural pose, candid photography style.
Ensure clothing texture and logo remain clearly visible.
```

**Example 4: Setting Variations**
```
Place the 6-year-old model in the clothing from image 1 in these settings:
[generates coordinated set]
- Beach scene with waves and sand
- Park with trees and grass
- Urban playground with colorful equipment
Maintain consistent lighting and model pose across all variations.
```

### 3.3 Best Practices for Product Photography Prompts

**1. Reference Preservation:**
```
"Keep clothing colors, textures, and branding exactly as shown in the reference image"
```

**2. Multi-Image Instructions:**
When using multiple input images, explicitly assign roles:
```
"Model from image 1, shirt from image 2, background from image 3, lighting style from image 4"
```

**3. Avoid Contradictions:**
❌ Bad: "realistic photo, oil painting style"
✅ Good: "photorealistic commercial product photography"

**4. Specify What to Preserve:**
```
"Maintain original clothing fit, keep all branding visible, preserve fabric texture details"
```

**5. Natural Settings for Kids:**
- Playgrounds (colorful, safe, energetic)
- Beaches (casual, vacation vibes)
- Parks (natural, family-friendly)
- Urban settings (modern, relatable)
- Indoor studios (professional, clean)

**6. Age-Appropriate Context:**
```
"Age 4-6 toddler", "7-9 elementary age child", "10-12 pre-teen"
```

**7. Group Coordination (for series):**
```
"Generate a series of images showing the same child in different poses on the playground"
```

### 3.4 Lighting & Atmosphere Specifications

**Outdoor Natural:**
```
"soft natural sunlight, golden hour warm tones, gentle shadows"
```

**Studio Professional:**
```
"soft box lighting, white backdrop, professional product photography"
```

**Lifestyle Casual:**
```
"overcast natural light, soft even illumination, candid moment"
```

---

## 4. Batch Processing Implementation

### 4.1 Queue-Based Architecture

fal.ai uses a queue system designed for batch operations. The recommended approach for processing 100 images:

**Option 1: Subscribe (Automatic Polling)**
```typescript
import { fal } from "@fal-ai/client";

async function processSingleImage(imageUrl: string, clothingUrl: string) {
  const result = await fal.subscribe("fal-ai/bytedance/seedream/v4/edit", {
    input: {
      prompt: `Place child model wearing clothing from second image in playground setting`,
      image_urls: [imageUrl, clothingUrl],
      image_size: { width: 1024, height: 1024 },
    },
    logs: true,
    onQueueUpdate: (update) => {
      if (update.status === "IN_PROGRESS") {
        console.log(`Processing: ${update.logs?.map(l => l.message).join(", ")}`);
      }
    },
  });

  return result.data;
}

// Batch processing with concurrency control
async function processBatch(items: Array<{image: string, clothing: string}>) {
  const CONCURRENT_LIMIT = 10; // Process 10 at a time
  const results = [];

  for (let i = 0; i < items.length; i += CONCURRENT_LIMIT) {
    const batch = items.slice(i, i + CONCURRENT_LIMIT);
    const batchResults = await Promise.all(
      batch.map(item => processSingleImage(item.image, item.clothing))
    );
    results.push(...batchResults);

    console.log(`Processed ${i + batch.length}/${items.length} images`);
  }

  return results;
}
```

**Option 2: Submit + Webhook (Recommended for Large Batches)**
```typescript
import { fal } from "@fal-ai/client";

// Submit all requests to queue
async function submitBatch(items: Array<{image: string, clothing: string}>) {
  const requestIds = [];

  for (const item of items) {
    const { request_id } = await fal.queue.submit(
      "fal-ai/bytedance/seedream/v4/edit",
      {
        input: {
          prompt: `Place child model wearing clothing from second image in natural setting`,
          image_urls: [item.image, item.clothing],
          image_size: { width: 1024, height: 1024 },
        },
        webhookUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/fal`,
      }
    );

    requestIds.push({ requestId: request_id, itemId: item.id });
  }

  return requestIds;
}

// Webhook handler (app/api/webhooks/fal/route.ts)
export async function POST(req: Request) {
  const payload = await req.json();

  if (payload.status === "OK") {
    // Process successful result
    await saveResult({
      requestId: payload.request_id,
      images: payload.payload.images,
      seed: payload.payload.seed,
    });
  } else {
    // Handle error
    await logError({
      requestId: payload.request_id,
      error: payload.error,
      details: payload.payload,
    });
  }

  return new Response("OK", { status: 200 });
}
```

### 4.2 Rate Limits & Throughput

**No Explicit Rate Limits:** fal.ai uses a queue system that handles rate limiting automatically. However, best practices:

- **Recommended Concurrency:** 10-20 simultaneous requests
- **Queue Position Tracking:** Monitor via status endpoint
- **Webhook Retry Policy:** 10 retries over 2 hours

**Status Monitoring:**
```typescript
const status = await fal.queue.status("fal-ai/bytedance/seedream/v4/edit", {
  requestId: "request-id",
  logs: true,
});

// Status types: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED"
if (status.status === "IN_QUEUE") {
  console.log(`Queue position: ${status.queue_position}`);
}
```

### 4.3 Batch Processing Best Practices

**1. Database Tracking:**
```typescript
interface BatchJob {
  id: string;
  totalImages: number;
  processedImages: number;
  failedImages: number;
  status: "pending" | "processing" | "completed" | "failed";
  results: Array<{
    requestId: string;
    imageUrl?: string;
    error?: string;
  }>;
}
```

**2. Progress Tracking:**
```typescript
async function trackBatchProgress(batchId: string, onProgress: (progress: number) => void) {
  const job = await getBatchJob(batchId);
  const completedCount = job.processedImages + job.failedImages;
  const progress = (completedCount / job.totalImages) * 100;
  onProgress(progress);
}
```

**3. Cancellation Support:**
```typescript
async function cancelPendingRequests(batchId: string) {
  const job = await getBatchJob(batchId);

  for (const result of job.results) {
    if (!result.imageUrl && !result.error) {
      try {
        await fal.queue.cancel("fal-ai/bytedance/seedream/v4/edit", {
          requestId: result.requestId,
        });
      } catch (e) {
        // Request already started processing
        console.log(`Cannot cancel ${result.requestId}: already processing`);
      }
    }
  }
}
```

---

## 5. Pricing Model & Cost Analysis

### 5.1 Seedream V4 Pricing

**Per Image Cost:** $0.03 per image at 1MP (1024×1024)

**Resolution-Based Pricing:**
- 1024×1024 (1MP): $0.03
- 2048×2048 (4MP): $0.12 (4× cost)
- 4096×4096 (16MP): $0.48 (16× cost)

**Cost Formula:**
```
Cost = $0.03 × (width × height) / 1,048,576
```

### 5.2 Batch Processing Cost Examples

**100 Images at 1024×1024:**
```
100 images × $0.03 = $3.00
```

**100 Images at 2048×2048 (2K):**
```
100 images × $0.12 = $12.00
```

**With 3 Retries per Failed Image (10% failure rate):**
```
100 initial + (10 × 3 retries) = 130 total requests
130 × $0.03 = $3.90
```

### 5.3 Cost Optimization Strategies

**1. Start with 1024×1024, Upscale Later:**
- Generate at 1MP: $0.03/image
- Upscale selected images with external tool
- Total: ~$0.03-0.05 vs $0.12 for native 2K

**2. Batch Size Optimization:**
- Process in batches of 10-20 for monitoring
- Avoid processing all 100 simultaneously

**3. Prompt Caching:**
- Reuse successful prompts
- A/B test prompts on small batches first

**4. Error Handling:**
- Validate inputs before submission
- Reduces costly failed requests

### 5.4 Comparison to Alternatives

| Model | Price per 1MP | Speed | Quality |
|-------|--------------|-------|---------|
| Seedream V4 | $0.03 | Fast | High |
| Flux Kontext Pro | $0.04 | Fast | Very High |
| Nanobanana | $0.0398 | Fast | High |
| DALL-E 3 (1024²) | $0.04 | Medium | High |
| Midjourney | ~$0.08 | Medium | Very High |

**Seedream V4 is 25-60% cheaper than alternatives for 1MP images.**

---

## 6. Error Handling & Retry Strategies

### 6.1 Error Types & Handling

**Retryable Errors (check `X-Fal-Retryable` header):**

```typescript
interface FalError {
  detail: Array<{
    loc: string[];
    msg: string;
    type: string;
    url: string;
    ctx?: Record<string, any>;
    input?: any;
  }>;
}

async function handleApiCall<T>(
  apiCall: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await apiCall();
    } catch (error: any) {
      lastError = error;

      // Check if retryable
      const isRetryable = error.response?.headers?.["x-fal-retryable"] === "true";

      if (!isRetryable || attempt === maxRetries) {
        throw error;
      }

      // Exponential backoff: 1s, 2s, 4s
      const delay = Math.pow(2, attempt) * 1000;
      console.log(`Retry ${attempt + 1}/${maxRetries} after ${delay}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}
```

### 6.2 Common Error Types

**1. Input Validation Errors (422 - Not Retryable):**

| Error Type | Description | Solution |
|------------|-------------|----------|
| `image_too_large` | Image exceeds max dimensions | Resize before upload |
| `image_too_small` | Image below min dimensions | Use higher resolution |
| `image_load_error` | Corrupted/unsupported format | Validate format (JPEG, PNG, WebP) |
| `file_download_error` | Cannot access URL | Ensure public URL, check CORS |
| `content_policy_violation` | Safety filter triggered | Revise prompt/image content |
| `sequence_too_long` | Too many image URLs | Max 10 images per request |

**2. Server Errors (500 - Potentially Retryable):**

| Error Type | Description | Solution |
|------------|-------------|----------|
| `internal_server_error` | Unexpected server issue | Retry with backoff |
| `generation_timeout` | Processing took too long | Simplify prompt, retry |
| `downstream_service_unavailable` | Partner API down | Retry, check status page |

### 6.3 Comprehensive Error Handler

```typescript
class FalApiClient {
  private maxRetries = 3;
  private timeout = 60000; // 60 seconds

  async generateImage(input: ImageInput): Promise<ImageOutput> {
    // Validate before sending
    this.validateInput(input);

    return this.withRetry(async () => {
      try {
        const result = await Promise.race([
          fal.subscribe("fal-ai/bytedance/seedream/v4/edit", {
            input: {
              prompt: input.prompt,
              image_urls: input.imageUrls,
              image_size: input.size,
            },
          }),
          this.timeoutPromise(this.timeout),
        ]);

        return this.processResult(result);
      } catch (error: any) {
        throw this.enhanceError(error);
      }
    });
  }

  private validateInput(input: ImageInput): void {
    if (!input.prompt || input.prompt.length < 3) {
      throw new Error("Prompt must be at least 3 characters");
    }

    if (!input.imageUrls || input.imageUrls.length === 0) {
      throw new Error("At least one image URL required");
    }

    if (input.imageUrls.length > 10) {
      throw new Error("Maximum 10 images allowed");
    }

    // Validate URLs
    input.imageUrls.forEach(url => {
      try {
        new URL(url);
      } catch {
        throw new Error(`Invalid URL: ${url}`);
      }
    });
  }

  private async withRetry<T>(
    fn: () => Promise<T>,
    retriesLeft = this.maxRetries
  ): Promise<T> {
    try {
      return await fn();
    } catch (error: any) {
      // Parse error type
      const errorType = error.body?.detail?.[0]?.type;
      const isRetryable = error.response?.headers?.["x-fal-retryable"] === "true";

      // Don't retry validation errors
      const nonRetryableErrors = [
        "content_policy_violation",
        "image_too_large",
        "image_too_small",
        "image_load_error",
        "file_download_error",
        "sequence_too_long",
      ];

      if (nonRetryableErrors.includes(errorType) || !isRetryable) {
        throw error;
      }

      if (retriesLeft <= 0) {
        throw new Error(`Max retries exceeded: ${error.message}`);
      }

      // Exponential backoff with jitter
      const baseDelay = Math.pow(2, this.maxRetries - retriesLeft) * 1000;
      const jitter = Math.random() * 1000;
      const delay = baseDelay + jitter;

      console.log(`Retrying in ${delay}ms (${retriesLeft} retries left)`);
      await new Promise(resolve => setTimeout(resolve, delay));

      return this.withRetry(fn, retriesLeft - 1);
    }
  }

  private timeoutPromise(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Request timeout")), ms);
    });
  }

  private enhanceError(error: any): Error {
    if (error.body?.detail) {
      const detail = error.body.detail[0];
      return new Error(
        `${detail.type}: ${detail.msg}` +
        (detail.ctx ? ` (${JSON.stringify(detail.ctx)})` : "")
      );
    }
    return error;
  }

  private processResult(result: any): ImageOutput {
    if (!result.data?.images || result.data.images.length === 0) {
      throw new Error("No images in response");
    }

    return {
      images: result.data.images,
      seed: result.data.seed,
      requestId: result.requestId,
    };
  }
}

// Usage
const client = new FalApiClient();

try {
  const result = await client.generateImage({
    prompt: "Child model wearing clothing from second image on playground",
    imageUrls: [modelImage, clothingImage],
    size: { width: 1024, height: 1024 },
  });

  console.log("Success:", result.images[0].url);
} catch (error) {
  console.error("Failed after retries:", error.message);
}
```

### 6.4 Error Monitoring & Alerts

```typescript
interface ErrorMetrics {
  totalRequests: number;
  failedRequests: number;
  errorsByType: Record<string, number>;
  retryCount: number;
}

class ErrorMonitor {
  private metrics: ErrorMetrics = {
    totalRequests: 0,
    failedRequests: 0,
    errorsByType: {},
    retryCount: 0,
  };

  trackRequest(): void {
    this.metrics.totalRequests++;
  }

  trackError(errorType: string, isRetry: boolean): void {
    if (!isRetry) {
      this.metrics.failedRequests++;
    } else {
      this.metrics.retryCount++;
    }

    this.metrics.errorsByType[errorType] =
      (this.metrics.errorsByType[errorType] || 0) + 1;

    // Alert if error rate exceeds threshold
    const errorRate = this.metrics.failedRequests / this.metrics.totalRequests;
    if (errorRate > 0.1) { // 10% error rate
      this.sendAlert(`High error rate: ${(errorRate * 100).toFixed(2)}%`);
    }
  }

  private async sendAlert(message: string): Promise<void> {
    // Implement alerting (Slack, email, etc.)
    console.error(`ALERT: ${message}`, this.metrics);
  }

  getMetrics(): ErrorMetrics {
    return { ...this.metrics };
  }
}
```

---

## 7. Best Practices & Production Patterns

### 7.1 API Key Security

**✅ DO:**
- Store API key in environment variables
- Use server-side proxy for all client requests
- Rotate keys periodically
- Create separate keys for dev/staging/prod

**❌ DON'T:**
- Hardcode API keys in code
- Expose keys in client-side JavaScript
- Share keys across multiple projects
- Commit keys to version control

### 7.2 Image URL Management

**File Upload to fal.ai Storage:**
```typescript
import { fal } from "@fal-ai/client";

// Upload file and get URL
const file = new File([imageBlob], "product.jpg", { type: "image/jpeg" });
const url = await fal.storage.upload(file);

// Use in request
const result = await fal.subscribe("fal-ai/bytedance/seedream/v4/edit", {
  input: {
    prompt: "...",
    image_urls: [url],
  },
});
```

**Alternative: Use Your Own CDN**
```typescript
// Upload to your S3/CloudFront/etc
const cdnUrl = await uploadToYourCDN(imageBlob);

// Ensure public access
const result = await fal.subscribe("fal-ai/bytedance/seedream/v4/edit", {
  input: {
    prompt: "...",
    image_urls: [cdnUrl], // Must be publicly accessible
  },
});
```

### 7.3 Request Deduplication

Avoid duplicate processing of identical requests:

```typescript
import crypto from "crypto";

function generateRequestHash(input: any): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex");
}

const requestCache = new Map<string, Promise<any>>();

async function deduplicatedRequest(input: any): Promise<any> {
  const hash = generateRequestHash(input);

  // Return existing promise if already processing
  if (requestCache.has(hash)) {
    console.log("Request already in progress, reusing...");
    return requestCache.get(hash);
  }

  // Create new request
  const promise = fal.subscribe("fal-ai/bytedance/seedream/v4/edit", {
    input,
  }).finally(() => {
    // Cleanup after completion
    requestCache.delete(hash);
  });

  requestCache.set(hash, promise);
  return promise;
}
```

### 7.4 Webhook Security

**Verify webhook signatures to prevent spoofing:**

```typescript
// app/api/webhooks/fal/route.ts
import { verifyWebhookSignature } from "@/lib/fal-webhook-verify";

export async function POST(req: Request) {
  const requestId = req.headers.get("x-fal-webhook-request-id");
  const userId = req.headers.get("x-fal-webhook-user-id");
  const timestamp = req.headers.get("x-fal-webhook-timestamp");
  const signature = req.headers.get("x-fal-webhook-signature");

  const body = await req.text();

  // Verify signature
  const isValid = await verifyWebhookSignature(
    requestId!,
    userId!,
    timestamp!,
    signature!,
    Buffer.from(body)
  );

  if (!isValid) {
    return new Response("Invalid signature", { status: 401 });
  }

  // Process webhook
  const payload = JSON.parse(body);
  await processWebhook(payload);

  return new Response("OK", { status: 200 });
}
```

### 7.5 Logging & Observability

```typescript
import { fal } from "@fal-ai/client";

async function generateImageWithLogging(input: any) {
  const startTime = Date.now();
  const requestMetadata = {
    timestamp: new Date().toISOString(),
    input: {
      prompt: input.prompt,
      imageCount: input.image_urls.length,
      size: input.image_size,
    },
  };

  console.log("Starting request", requestMetadata);

  try {
    const result = await fal.subscribe("fal-ai/bytedance/seedream/v4/edit", {
      input,
      logs: true,
      onQueueUpdate: (update) => {
        if (update.status === "IN_PROGRESS") {
          // Log model progress
          update.logs?.forEach(log => {
            console.log(`Model log: ${log.message}`);
          });
        }

        if (update.status === "IN_QUEUE") {
          console.log(`Queue position: ${update.queue_position}`);
        }
      },
    });

    const duration = Date.now() - startTime;

    console.log("Request completed", {
      ...requestMetadata,
      duration,
      requestId: result.requestId,
      outputImages: result.data.images.length,
      seed: result.data.seed,
    });

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;

    console.error("Request failed", {
      ...requestMetadata,
      duration,
      error: error instanceof Error ? error.message : String(error),
    });

    throw error;
  }
}
```

### 7.6 Performance Optimization

**1. Parallel Processing:**
```typescript
// Process multiple independent requests simultaneously
const results = await Promise.all([
  generateImage(input1),
  generateImage(input2),
  generateImage(input3),
]);
```

**2. Result Caching:**
```typescript
import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL);

async function getCachedOrGenerate(input: any): Promise<any> {
  const cacheKey = `seedream:${generateRequestHash(input)}`;

  // Check cache
  const cached = await redis.get(cacheKey);
  if (cached) {
    console.log("Cache hit");
    return JSON.parse(cached);
  }

  // Generate
  const result = await generateImage(input);

  // Cache for 24 hours
  await redis.setex(cacheKey, 86400, JSON.stringify(result));

  return result;
}
```

**3. Progressive Enhancement:**
```typescript
// Generate low-res preview first, then high-res
async function generateWithPreview(input: any) {
  // Quick preview at 512x512
  const preview = await fal.subscribe("fal-ai/bytedance/seedream/v4/edit", {
    input: {
      ...input,
      image_size: { width: 512, height: 512 },
    },
  });

  // Show preview to user immediately
  onPreviewReady(preview.data.images[0].url);

  // Generate full resolution
  const final = await fal.subscribe("fal-ai/bytedance/seedream/v4/edit", {
    input: {
      ...input,
      image_size: { width: 1024, height: 1024 },
      seed: preview.data.seed, // Use same seed for consistency
    },
  });

  return final;
}
```

---

## 8. Complete Code Examples

### 8.1 Single Image Generation

```typescript
// lib/fal-client.ts
import { fal } from "@fal-ai/client";

fal.config({
  proxyUrl: "/api/fal/proxy",
});

export interface GenerateProductImageInput {
  modelImageUrl: string;
  clothingImageUrl: string;
  setting: "playground" | "beach" | "park" | "urban";
  childAge: string; // e.g., "6-8 years old"
}

export async function generateProductImage(
  input: GenerateProductImageInput
) {
  const settingDescriptions = {
    playground: "colorful modern playground with slides and swings, bright sunny day",
    beach: "sandy beach with gentle waves, golden hour sunset lighting",
    park: "lush green park with trees, natural afternoon sunlight",
    urban: "modern urban plaza, contemporary architecture background",
  };

  const prompt = `
    Place ${input.childAge} child model from first image wearing the clothing
    from second image in ${settingDescriptions[input.setting]}.
    Photorealistic commercial product photography style.
    Ensure clothing details, colors, and textures are preserved exactly.
    Natural pose, genuine expression, professional quality.
  `.trim();

  const result = await fal.subscribe("fal-ai/bytedance/seedream/v4/edit", {
    input: {
      prompt,
      image_urls: [input.modelImageUrl, input.clothingImageUrl],
      image_size: { width: 1024, height: 1024 },
      enable_safety_checker: true,
    },
    logs: true,
    onQueueUpdate: (update) => {
      if (update.status === "IN_PROGRESS") {
        console.log("Processing:", update.logs?.map(l => l.message).join(", "));
      }
    },
  });

  return {
    imageUrl: result.data.images[0].url,
    seed: result.data.seed,
    requestId: result.requestId,
  };
}
```

### 8.2 Batch Processing with Database Tracking

```typescript
// lib/batch-processor.ts
import { fal } from "@fal-ai/client";
import { db } from "./db";

export interface BatchItem {
  id: string;
  modelImageUrl: string;
  clothingImageUrl: string;
  setting: string;
}

export async function processBatch(
  batchId: string,
  items: BatchItem[]
): Promise<void> {
  // Create batch record
  await db.batch.create({
    id: batchId,
    totalItems: items.length,
    status: "processing",
  });

  const CONCURRENCY = 10;
  const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/fal?batchId=${batchId}`;

  // Submit all to queue
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    const chunk = items.slice(i, i + CONCURRENCY);

    await Promise.all(
      chunk.map(async (item) => {
        try {
          const { request_id } = await fal.queue.submit(
            "fal-ai/bytedance/seedream/v4/edit",
            {
              input: {
                prompt: `Child model wearing clothing in ${item.setting} setting`,
                image_urls: [item.modelImageUrl, item.clothingImageUrl],
                image_size: { width: 1024, height: 1024 },
              },
              webhookUrl,
            }
          );

          // Track request
          await db.batchItem.create({
            batchId,
            itemId: item.id,
            requestId: request_id,
            status: "pending",
          });
        } catch (error) {
          await db.batchItem.create({
            batchId,
            itemId: item.id,
            status: "failed",
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      })
    );

    console.log(`Submitted ${i + chunk.length}/${items.length} items`);
  }
}

// app/api/webhooks/fal/route.ts
export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  const batchId = searchParams.get("batchId");

  const payload = await req.json();

  if (payload.status === "OK") {
    // Success
    await db.batchItem.update({
      where: { requestId: payload.request_id },
      data: {
        status: "completed",
        resultUrl: payload.payload.images[0].url,
        seed: payload.payload.seed,
      },
    });
  } else {
    // Error - check if should retry
    const item = await db.batchItem.findUnique({
      where: { requestId: payload.request_id },
    });

    if (item && item.retryCount < 3) {
      // Retry
      await retryFailedItem(item, batchId!);
    } else {
      // Max retries reached
      await db.batchItem.update({
        where: { requestId: payload.request_id },
        data: {
          status: "failed",
          error: payload.error,
        },
      });
    }
  }

  // Check if batch is complete
  await checkBatchCompletion(batchId!);

  return new Response("OK", { status: 200 });
}

async function checkBatchCompletion(batchId: string) {
  const items = await db.batchItem.findMany({
    where: { batchId },
  });

  const completed = items.every(
    item => item.status === "completed" || item.status === "failed"
  );

  if (completed) {
    await db.batch.update({
      where: { id: batchId },
      data: {
        status: "completed",
        completedAt: new Date(),
        successCount: items.filter(i => i.status === "completed").length,
        failedCount: items.filter(i => i.status === "failed").length,
      },
    });

    // Send notification
    await sendBatchCompletionEmail(batchId);
  }
}
```

### 8.3 Server Component with Streaming Updates

```typescript
// app/generate/page.tsx
"use client";

import { useState } from "react";
import { fal } from "@fal-ai/client";

export default function GeneratePage() {
  const [status, setStatus] = useState<string>("idle");
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [result, setResult] = useState<string | null>(null);

  async function generate() {
    setStatus("submitting");
    setLogs([]);

    try {
      const result = await fal.subscribe("fal-ai/bytedance/seedream/v4/edit", {
        input: {
          prompt: "Child model wearing clothing on playground",
          image_urls: [
            "/api/images/model.jpg",
            "/api/images/clothing.jpg",
          ],
          image_size: { width: 1024, height: 1024 },
        },
        logs: true,
        onQueueUpdate: (update) => {
          if (update.status === "IN_QUEUE") {
            setStatus("in-queue");
            setQueuePosition(update.queue_position);
          }

          if (update.status === "IN_PROGRESS") {
            setStatus("processing");
            setQueuePosition(null);

            if (update.logs) {
              setLogs(prev => [
                ...prev,
                ...update.logs!.map(log => log.message),
              ]);
            }
          }
        },
      });

      setStatus("completed");
      setResult(result.data.images[0].url);
    } catch (error) {
      setStatus("error");
      console.error(error);
    }
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Generate Product Image</h1>

      <button
        onClick={generate}
        disabled={status !== "idle" && status !== "completed"}
        className="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50"
      >
        Generate
      </button>

      <div className="mt-4">
        <p>Status: {status}</p>
        {queuePosition !== null && (
          <p>Queue Position: {queuePosition}</p>
        )}
      </div>

      {logs.length > 0 && (
        <div className="mt-4 p-4 bg-gray-100 rounded">
          <h3 className="font-semibold mb-2">Processing Logs:</h3>
          <ul className="space-y-1 text-sm font-mono">
            {logs.map((log, i) => (
              <li key={i}>{log}</li>
            ))}
          </ul>
        </div>
      )}

      {result && (
        <div className="mt-4">
          <h3 className="font-semibold mb-2">Result:</h3>
          <img src={result} alt="Generated" className="max-w-lg rounded" />
        </div>
      )}
    </div>
  );
}
```

---

## 9. Additional Resources

### 9.1 Official Documentation
- **fal.ai Homepage:** https://fal.ai
- **API Documentation:** https://docs.fal.ai
- **Next.js Integration:** https://docs.fal.ai/model-apis/integrations/nextjs
- **Seedream 4 Edit Model:** https://fal.ai/models/fal-ai/bytedance/seedream/v4/edit
- **JavaScript SDK Reference:** https://fal-ai.github.io/fal-js/reference

### 9.2 GitHub Repositories
- **fal-js Client:** https://github.com/fal-ai/fal-js
- **Next.js Demo App:** https://github.com/fal-ai/fal-js/tree/main/apps/demo-nextjs-app-router

### 9.3 Support
- **Discord Community:** https://discord.gg/fal-ai
- **Email Support:** support@fal.ai
- **API Status:** Check https://status.fal.ai

### 9.4 Related Models
- **Seedream V4 Text-to-Image:** `fal-ai/bytedance/seedream/v4/text-to-image`
- **FLUX.1 [dev]:** `fal-ai/flux/dev` (alternative high-quality model)
- **Nanobanana:** `fal-ai/nano-banana` (better face consistency)

---

## 10. Recommended Implementation Roadmap

### Phase 1: MVP (Week 1)
1. Set up Next.js project with fal.ai integration
2. Implement server proxy for API key protection
3. Create single image generation flow
4. Basic error handling and validation
5. Display results to user

### Phase 2: Batch Processing (Week 2)
1. Implement queue-based batch submission
2. Add database tracking for batch jobs
3. Create webhook endpoint for async updates
4. Build progress monitoring UI
5. Add retry logic for failed requests

### Phase 3: Production Hardening (Week 3)
1. Implement comprehensive error monitoring
2. Add request deduplication
3. Set up webhook signature verification
4. Create admin dashboard for batch management
5. Add cost tracking and alerts

### Phase 4: Optimization (Week 4)
1. Implement result caching
2. Add prompt template system
3. Create A/B testing for prompts
4. Optimize image upload/storage
5. Set up performance monitoring

---

## Conclusion

fal.ai with Seedream 4 Edit provides a production-ready solution for AI-powered product photography. The combination of:
- **Robust queue system** for batch processing
- **TypeScript SDK** with excellent Next.js integration
- **Competitive pricing** at $0.03 per 1MP image
- **Commercial licensing** for business use
- **Comprehensive error handling** and retry mechanisms

...makes it an ideal choice for your kids clothing product photography use case.

The model's multi-image composition capabilities allow precise control over placing clothing items on kid models in various natural settings, while maintaining product details and commercial photography quality.

**Estimated Monthly Cost for 3,000 Images:**
- 3,000 images × $0.03 = $90/month
- With 10% failure rate + 3 retries: ~$100/month
- CDN/storage costs: ~$10/month
- **Total: ~$110/month**

This research provides a complete foundation for implementing a production-grade AI product photography system using fal.ai and Seedream 4 Edit.
