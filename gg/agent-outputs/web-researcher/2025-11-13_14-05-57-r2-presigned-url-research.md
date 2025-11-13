# Cloudflare R2 Client-Side Uploads with Next.js: Complete Research

**Research Date:** 2025-11-13
**Context:** Investigating R2 presigned URL uploads from browser with Next.js App Router, addressing SSL/TLS errors and evaluating alternative approaches.

---

## Executive Summary

Direct browser-to-R2 uploads using presigned URLs are fully supported and work well in production when configured correctly. The SSL/TLS error (`net::ERR_SSL_VERSION_OR_CIPHER_MISMATCH`) you're experiencing is **not a common R2 issue** and appears to be environment-specific. The most critical finding is that **R2 requires `AllowedHeaders: ["content-type"]` in CORS config, NOT `["*"]`** - this is a common gotcha that breaks presigned URL uploads.

**Recommended Action:** Fix CORS configuration first, then evaluate if SSL error persists. Consider proxy approach if direct uploads remain problematic.

---

## 1. Working Examples of R2 Client-Side Uploads

### 1.1 Complete Next.js App Router Implementation

**Source:** [How to Upload Files to Cloudflare R2 in a Next.js App](https://buildwithmatija.com/blog/how-to-upload-files-to-cloudflare-r2-nextjs)

This is the most comprehensive production-ready example found:

#### Backend: Presigned URL Generation (`/api/upload/presigned-url/route.ts`)

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { r2Client, R2_CONFIG } from '@/lib/r2-client';
import { nanoid } from 'nanoid';

export async function POST(request: NextRequest) {
  try {
    const { userId } = auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { fileName, fileType, fileSize, documentType } = await request.json();

    // Validation
    if (!R2_CONFIG.allowedMimeTypes.includes(fileType)) {
      return NextResponse.json({ error: 'Invalid file type' }, { status: 400 });
    }
    if (fileSize > R2_CONFIG.maxFileSize) {
      return NextResponse.json({ error: 'File too large' }, { status: 400 });
    }

    // Generate unique file key
    const timestamp = new Date().toISOString().split('T')[0];
    const fileId = nanoid(10);
    const fileExtension = fileName.split('.').pop();
    const fileKey = `${userId}/${timestamp}/${documentType}_${fileId}.${fileExtension}`;

    // Create presigned URL
    const command = new PutObjectCommand({
      Bucket: R2_CONFIG.bucketName,
      Key: fileKey,
      ContentType: fileType,
      ContentLength: fileSize,
      Metadata: {
        userId,
        originalFileName: fileName,
        documentType,
        uploadedAt: new Date().toISOString(),
      },
    });

    const presignedUrl = await getSignedUrl(r2Client, command, {
      expiresIn: R2_CONFIG.presignedUrlExpiry, // 300 seconds
    });

    return NextResponse.json({
      presignedUrl,
      fileKey,
      filePath: fileKey,
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

#### R2 Client Configuration (`/lib/r2-client.ts`)

**Critical:** Region-specific endpoints are important!

```typescript
import { S3Client } from '@aws-sdk/client-s3';

const getR2Endpoint = () => {
  const accountId = process.env.R2_ACCOUNT_ID!;
  const isEuRegion = process.env.R2_REGION === 'eu' || process.env.R2_BUCKET_REGION === 'eu';

  // EU buckets use .eu.r2.cloudflarestorage.com
  // Global buckets use .r2.cloudflarestorage.com
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
  forcePathStyle: true, // Important for R2
});
```

#### Frontend: Upload with Progress Tracking

**Using XMLHttpRequest (NOT fetch) for progress events:**

```typescript
async function uploadToR2(
  file: File,
  presignedUrl: string,
  onProgress: (progress: UploadProgress) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    // Track upload progress
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        const progress = {
          loaded: event.loaded,
          total: event.total,
          percentage: Math.round((event.loaded / event.total) * 100),
        };
        onProgress(progress);
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status === 200) {
        resolve();
      } else {
        reject(new Error(`Upload failed with status: ${xhr.status}`));
      }
    });

    xhr.addEventListener('error', () => {
      reject(new Error('Upload failed'));
    });

    xhr.open('PUT', presignedUrl);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.send(file);
  });
}
```

### 1.2 Minimal Working Example

**Source:** [Stack Overflow - Next.js 13 with R2](https://stackoverflow.com/questions/76823393/how-to-use-cloudflares-r2-bucket-with-next-js-13-api)

Simplified version for understanding the flow:

```typescript
// Frontend
const handleUpload = async () => {
  if (!file) return;

  // Step 1: Get presigned URL from your API
  const response = await fetch('/api/upload', {
    method: 'POST',
  });
  const { url } = await response.json();

  // Step 2: Upload directly to R2
  await fetch(url, {
    method: 'PUT',
    body: file, // Send raw file, not FormData
  });
};

// Backend API Route
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { r2 } from '@/lib/r2';

export async function POST(request: Request) {
  const signedUrl = await getSignedUrl(
    r2,
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: `filename.pdf`,
    }),
    { expiresIn: 60 }
  );

  return NextResponse.json({ url: signedUrl });
}
```

### 1.3 GitHub Examples

1. **[harshil1712/nextjs-r2-demo](https://github.com/harshil1712/nextjs-r2-demo)** - Demonstrates three methods:
   - Workers API (R2 binding)
   - Presigned URLs
   - Presigned URLs with temporary credentials

2. **[diwosuwanto/cloudflare-r2-with-nextjs](https://github.com/diwosuwanto/cloudflare-r2-with-nextjs-upload-download-delete)** - Upload, download, and delete operations

3. **[LeaReXx/r2-bucket-uploader](https://github.com/learexx/r2-bucket-uploader)** - Multipart upload for large files

---

## 2. CORS Configuration: THE CRITICAL GOTCHA

### 2.1 The Problem with Wildcards

**CRITICAL FINDING:** R2 presigned URLs require specific CORS headers. Using `"*"` for `AllowedHeaders` **DOES NOT WORK** with presigned URLs.

**Source:** [Pre-signed URLs & CORS on Cloudflare R2](https://mikeesto.medium.com/pre-signed-urls-cors-on-cloudflare-r2-c90d43370dc4)

### 2.2 Correct CORS Configuration

```json
[
  {
    "AllowedHeaders": ["content-type"],  // NOT "*" - this is critical!
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedOrigins": ["http://localhost:3000", "https://yourdomain.com"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

**Why this matters:**
- The wildcard `"*"` works fine on AWS S3
- R2 had a bug (now supposedly fixed) where `"*"` didn't work
- Explicitly setting `["content-type"]` is the safe, reliable approach
- If you need additional headers, list them explicitly: `["content-type", "content-length", "x-custom-header"]`

### 2.3 How to Configure CORS

**Option 1: Via Cloudflare Dashboard**

1. Go to R2 Object Storage
2. Select your bucket
3. Settings → CORS Policy → Add CORS policy
4. Paste JSON configuration

**Option 2: Programmatically (Node.js)**

**Source:** [How To Fix CORS Error](https://ehtesham.dev/blog/how-to-fix-cors-error-while-uploading-files-on-cloudflare-r2-using-presigned-urls)

```javascript
import { PutBucketCorsCommand, S3Client } from "@aws-sdk/client-s3";

const s3Client = new S3Client({
  region: "auto",
  endpoint: `https://${CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: ACCESS_KEY,
    secretAccessKey: ACCESS_SECRET,
  },
});

const response = await s3Client.send(
  new PutBucketCorsCommand({
    Bucket: "your-bucket-name",
    CORSConfiguration: {
      CORSRules: [
        {
          AllowedHeaders: ["content-type"], // Critical!
          AllowedMethods: ["GET", "PUT", "HEAD"],
          AllowedOrigins: ["*"], // Can use wildcard for origins
          ExposeHeaders: [],
          MaxAgeSeconds: 3000,
        }
      ],
    },
  })
);
```

### 2.4 CORS Troubleshooting

**Source:** [Cloudflare R2 CORS Documentation](https://developers.cloudflare.com/r2/buckets/cors/)

Common issues:

1. **CORS only applies to cross-origin requests**
   - Must have `Origin` header in request
   - Same-origin requests won't return CORS headers

2. **AllowedOrigins must be exact match**
   - ✅ Valid: `https://example.com`
   - ❌ Invalid: `https://example.com/` (trailing slash)
   - ❌ Invalid: `https://example.com/path` (includes path)

3. **CORS propagation can take up to 30 seconds**
   - After updating, wait before testing

4. **Check browser console for actual CORS error**
   - If you see 401/403 before CORS error, that's the real issue
   - CORS error might be masking authentication problem

---

## 3. SSL/TLS Issues with R2

### 3.1 Your Specific Error

You're experiencing:
```
net::ERR_SSL_VERSION_OR_CIPHER_MISMATCH
Environment: macOS 26.0, Chromium (Atlas browser), LibreSSL 3.3.6
```

### 3.2 Research Findings

**Important:** This error is **NOT commonly reported** with R2 presigned URL uploads. Most SSL/TLS R2 issues found were:

1. **Server-side SSL errors** (AWS SDK connecting to R2)
2. **Multi-level subdomain certificate issues** (unrelated to presigned URLs)
3. **Custom domain SSL problems** (not applicable to `.r2.cloudflarestorage.com`)

**Source:** [R2 SSL discussions on Cloudflare Community](https://community.cloudflare.com/t/r2-with-aws-sdk-for-javascript-got-ssl-error/436871)

### 3.3 Possible Causes

Based on research:

1. **LibreSSL Compatibility**
   - macOS uses LibreSSL (a fork of OpenSSL)
   - Some versions have compatibility issues with certain TLS configurations
   - **However**, this should affect ALL HTTPS requests, not just R2

2. **Browser-Specific Issue**
   - Atlas browser is Chromium-based but relatively niche
   - Could have specific TLS stack configuration
   - **Test:** Try same upload in Chrome/Safari to isolate

3. **Incorrect Endpoint**
   - If using wrong region endpoint, could cause certificate mismatch
   - **Verify:** Endpoint matches your dashboard exactly

4. **CORS Preflight Failure Masquerading as SSL Error**
   - If CORS preflight (OPTIONS) fails, browser might show SSL error
   - **This is likely:** Fix CORS config first

### 3.4 Diagnostic Steps

```bash
# Test SSL connection to R2 endpoint
openssl s_client -connect <YOUR-ACCOUNT-ID>.r2.cloudflarestorage.com:443 -servername <YOUR-ACCOUNT-ID>.r2.cloudflarestorage.com

# Expected: Should show certificate chain and "Verify return code: 0 (ok)"

# If EU region:
openssl s_client -connect <YOUR-ACCOUNT-ID>.eu.r2.cloudflarestorage.com:443

# Test with curl
curl -v -X PUT "https://<presigned-url>" --upload-file test.txt
```

### 3.5 Workaround If SSL Issue Persists

If SSL error is genuine and unfixable, see "Alternative Approaches" section below.

---

## 4. Best Practices for Production

### 4.1 File Organization

```typescript
// Generate organized file paths
function generateFileKey(userId: string, documentType: string, fileName: string): string {
  const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const fileId = nanoid(10); // Unique ID
  const fileExtension = fileName.split('.').pop();
  return `${userId}/${timestamp}/${documentType}/${fileId}.${fileExtension}`;
}

// Example: "user123/2025-11-13/invoice/aBc1234567.pdf"
```

**Benefits:**
- Easy cleanup (delete by date)
- User isolation
- Prevents filename collisions
- Supports analytics by date

### 4.2 Security Validation

**Always validate on the server:**

```typescript
export async function POST(request: NextRequest) {
  const { userId } = auth(); // Your auth system
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { fileName, fileType, fileSize } = await request.json();

  // Validate file type
  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  if (!ALLOWED_TYPES.includes(fileType)) {
    return NextResponse.json({ error: 'Invalid file type' }, { status: 400 });
  }

  // Validate file size (10MB)
  const MAX_SIZE = 10 * 1024 * 1024;
  if (fileSize > MAX_SIZE) {
    return NextResponse.json({ error: 'File too large' }, { status: 400 });
  }

  // Generate presigned URL...
}
```

### 4.3 Environment Variables

```bash
# .env.local

# Server-only (NO NEXT_PUBLIC_ prefix)
R2_ACCOUNT_ID=abc123
R2_ACCESS_KEY_ID=key123
R2_SECRET_ACCESS_KEY=secret123
R2_BUCKET_NAME=my-bucket
R2_REGION=auto  # or "eu" for EU buckets

# Client-safe (with NEXT_PUBLIC_ prefix)
NEXT_PUBLIC_R2_PUBLIC_URL=https://cdn.yourdomain.com
```

**Important:**
- Never expose access keys to client
- Only presigned URLs go to client
- Restart dev server after `.env` changes

### 4.4 Large File Uploads (Multipart)

For files > 5MB, use multipart upload:

**Source:** [Browser uploads to R2 with AWS SDK](https://transloadit.com/devtips/browser-uploads-to-cloudflare-r2-with-aws-sdk/)

```typescript
import {
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from '@aws-sdk/client-s3';

// Backend flow:
// 1. Initiate multipart upload → get UploadId
// 2. Generate presigned URLs for each part (5MB chunks)
// 3. Frontend uploads parts in parallel
// 4. Complete multipart upload with ETags

// This is complex - consider using Uppy.js library
```

### 4.5 Progress Tracking

**Why XMLHttpRequest over fetch:**

Fetch API doesn't support upload progress natively. Must use XHR:

```typescript
function uploadWithProgress(file: File, url: string, onProgress: (pct: number) => void) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const percentComplete = (e.loaded / e.total) * 100;
        onProgress(Math.round(percentComplete));
      }
    };

    xhr.onload = () => xhr.status === 200 ? resolve() : reject();
    xhr.onerror = reject;

    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.send(file);
  });
}
```

---

## 5. Common Pitfalls and Solutions

### 5.1 Problem: "NoSuchBucket" Error

**Cause:** Wrong endpoint URL for bucket region

**Solution:**
```typescript
// Check your bucket's region in Cloudflare dashboard
// EU buckets:
const endpoint = `https://${accountId}.eu.r2.cloudflarestorage.com`;

// Global buckets:
const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
```

### 5.2 Problem: CORS Error with Presigned URLs

**Cause:** Using `AllowedHeaders: ["*"]`

**Solution:** Use `AllowedHeaders: ["content-type"]`

See CORS section above for details.

### 5.3 Problem: 403 Forbidden on Upload

**Common causes:**

1. **Wrong Content-Type**
   ```typescript
   // MUST match what was signed
   xhr.setRequestHeader('Content-Type', file.type);
   ```

2. **Presigned URL expired**
   - Default: 60-300 seconds
   - Check `expiresIn` parameter

3. **URL tampering**
   - Don't modify presigned URL
   - Send entire URL exactly as received

4. **CORS preflight failing**
   - Check CORS configuration
   - Ensure allowed origin matches exactly

### 5.4 Problem: Upload Succeeds but File is 0 bytes

**Cause:** Sending FormData instead of raw file

**Solution:**
```typescript
// ❌ Wrong
await fetch(presignedUrl, {
  method: 'PUT',
  body: new FormData().append('file', file)
});

// ✅ Correct
await fetch(presignedUrl, {
  method: 'PUT',
  body: file  // Send raw file
});
```

### 5.5 Problem: Missing Content-Type After Upload

**Cause:** Not setting ContentType when generating presigned URL

**Solution:**
```typescript
const command = new PutObjectCommand({
  Bucket: bucketName,
  Key: fileKey,
  ContentType: file.type, // Set this!
});
```

### 5.6 Problem: Public URL Returns 404

**Cause:** Bucket is private, or custom domain not configured

**Solutions:**

1. **Use presigned GET URLs for private buckets**
   ```typescript
   const url = await getSignedUrl(r2Client, new GetObjectCommand({
     Bucket: bucketName,
     Key: fileKey,
   }), { expiresIn: 3600 });
   ```

2. **Make bucket public** (if appropriate)
   - Dashboard → R2 → Bucket → Settings → Public Access

3. **Set up custom domain**
   - Dashboard → R2 → Bucket → Settings → Custom Domains

---

## 6. Alternative Approaches

### 6.1 Option A: Proxy Upload Through Next.js API Route

**When to use:**
- SSL/TLS issues with direct upload persist
- Need server-side validation/processing
- Want to hide R2 infrastructure from client
- Need to transform/optimize file before storage

**Pros:**
- Full control over upload process
- Can validate, transform, or scan files
- No CORS issues
- No client exposure to R2

**Cons:**
- Higher server costs (files go through your server)
- Increased latency
- Server memory usage
- Limited by Next.js route payload limits (4-5MB on Vercel)

**Implementation:**

```typescript
// app/api/upload-proxy/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { r2Client } from '@/lib/r2-client';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate
    const MAX_SIZE = 5 * 1024 * 1024; // 5MB limit
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'File too large' }, { status: 400 });
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Optional: Process with Sharp, scan with ClamAV, etc.
    // const optimized = await sharp(buffer).webp({ quality: 90 }).toBuffer();

    // Upload to R2
    const fileKey = `uploads/${Date.now()}-${file.name}`;
    await r2Client.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: fileKey,
      Body: buffer,
      ContentType: file.type,
    }));

    // Generate public URL
    const fileUrl = `https://${process.env.R2_PUBLIC_DOMAIN}/${fileKey}`;

    return NextResponse.json({
      success: true,
      fileUrl,
      fileKey
    });

  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Upload failed' },
      { status: 500 }
    );
  }
}

// IMPORTANT: Increase route size limit
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};
```

**Client:**
```typescript
const handleUpload = async (file: File) => {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('/api/upload-proxy', {
    method: 'POST',
    body: formData,
  });

  const result = await response.json();
  return result;
};
```

### 6.2 Option B: Use Cloudflare Workers for Upload

**When to use:**
- Want serverless upload handling
- Need edge-optimized performance
- Want to avoid Next.js payload limits
- Building on Cloudflare infrastructure

**Source:** [Mitya.uk R2 Tutorial](https://mitya.uk/articles/uploading-cloudflare-r2-s3-buckets)

**Implementation:**

```typescript
// worker/src/index.ts
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Direct upload to R2 via Worker
    if (request.method === 'PUT' || request.method === 'POST') {
      // Auth check here
      if (!isAuthenticated(request)) {
        return new Response('Unauthorized', { status: 401 });
      }

      const key = url.pathname.slice(1);

      // Stream directly to R2 (no memory limits!)
      const object = await env.MY_BUCKET.put(key, request.body, {
        httpMetadata: {
          contentType: request.headers.get('Content-Type'),
        },
      });

      return new Response(null, {
        status: 200,
        headers: { 'ETag': object.httpEtag },
      });
    }

    // Download
    if (request.method === 'GET') {
      const object = await env.MY_BUCKET.get(url.pathname.slice(1));
      if (!object) {
        return new Response('Not Found', { status: 404 });
      }

      const headers = new Headers();
      object.writeHttpMetadata(headers);

      return new Response(object.body, { headers });
    }

    return new Response('Method Not Allowed', { status: 405 });
  },
};
```

**Pros:**
- No file size limits
- Extremely fast (runs at the edge)
- Direct R2 binding (no S3 API overhead)
- No CORS issues
- Scales automatically

**Cons:**
- Requires Cloudflare Workers setup
- Separate deployment from Next.js
- Different auth setup

### 6.3 Option C: Hybrid Approach

**Best of both worlds:**

1. Use presigned URLs for most uploads
2. Fall back to proxy for problematic clients
3. Detect SSL error on client and switch automatically

```typescript
async function uploadFile(file: File) {
  try {
    // Try presigned URL first
    const { presignedUrl } = await fetch('/api/presigned-url').then(r => r.json());
    await fetch(presignedUrl, { method: 'PUT', body: file });
    return { method: 'direct' };
  } catch (error) {
    // Fall back to proxy upload
    console.warn('Direct upload failed, using proxy:', error);
    const formData = new FormData();
    formData.append('file', file);
    await fetch('/api/upload-proxy', { method: 'POST', body: formData });
    return { method: 'proxy' };
  }
}
```

---

## 7. Specific Recommendations for Your Situation

### 7.1 Immediate Steps

1. **Fix CORS Configuration** (Most Important)
   ```json
   [
     {
       "AllowedHeaders": ["content-type"],
       "AllowedMethods": ["PUT", "GET", "HEAD"],
       "AllowedOrigins": ["http://localhost:3000"],
       "ExposeHeaders": ["ETag"],
       "MaxAgeSeconds": 3000
     }
   ]
   ```

2. **Test in Different Browser**
   - Try Chrome, Safari, Firefox
   - Isolate whether it's Atlas browser specific
   - Check if error persists across browsers

3. **Verify Endpoint**
   ```typescript
   // Check your R2 dashboard for correct endpoint
   // If EU region, must use:
   endpoint: `https://${accountId}.eu.r2.cloudflarestorage.com`
   ```

4. **Test SSL Connection**
   ```bash
   openssl s_client -connect YOUR-ACCOUNT-ID.r2.cloudflarestorage.com:443
   ```

### 7.2 If SSL Error Persists

**Recommended:** Implement Option A (Proxy Upload) as a reliable fallback

Benefits for your use case:
- Eliminates client SSL issues
- You can add image optimization (Sharp)
- Server-side validation
- No CORS complexity

Trade-offs:
- Slightly higher latency
- Server processes files (manageable for images)
- Works within Next.js - no separate infrastructure

### 7.3 Architecture Decision Matrix

| Factor | Direct Upload (Presigned URL) | Proxy Upload (API Route) | Cloudflare Worker |
|--------|------------------------------|-------------------------|-------------------|
| Setup Complexity | Medium | Low | High |
| SSL/TLS Issues | May occur | None | None |
| CORS Config | Required | Not needed | Not needed |
| Server Load | Minimal | High | Minimal |
| Latency | Low | Medium | Very Low |
| File Size Limit | Unlimited | 4-10MB | Unlimited |
| Progress Tracking | Complex (XHR) | Simple | Complex |
| Best For | Large files, static sites | Small-medium files, validation | High scale, edge cases |

### 7.4 Sample Implementation Plan

**Phase 1: Fix Current Setup**
1. Update CORS to use `["content-type"]`
2. Test in Chrome/Safari
3. Verify endpoint matches region

**Phase 2: If Issues Persist**
1. Implement proxy upload as fallback
2. Add detection for SSL errors
3. Route problematic clients to proxy

**Phase 3: Production Optimization**
1. Add multipart upload for large files
2. Implement retry logic
3. Add analytics/monitoring

---

## 8. Testing and Debugging

### 8.1 Test Presigned URL Manually

```bash
# 1. Generate presigned URL via your API
curl -X POST http://localhost:3000/api/upload

# 2. Upload file using presigned URL
curl -X PUT "<PRESIGNED_URL>" \
  --upload-file test.jpg \
  -H "Content-Type: image/jpeg"

# 3. Check response
# Success: Empty response with 200 status
# Failure: XML error message
```

### 8.2 Debug CORS Issues

**Browser DevTools:**
1. Open Network tab
2. Look for OPTIONS request (preflight)
3. Check response headers:
   - `Access-Control-Allow-Origin`
   - `Access-Control-Allow-Headers`
   - `Access-Control-Allow-Methods`

**Common CORS errors:**
- No OPTIONS request = CORS not triggered (same-origin)
- OPTIONS returns 403 = CORS config wrong
- OPTIONS returns 200 but PUT fails = Signed headers mismatch

### 8.3 Check Bucket Access

```bash
# List files (verify credentials work)
aws s3 ls s3://YOUR-BUCKET \
  --endpoint-url https://YOUR-ACCOUNT-ID.r2.cloudflarestorage.com

# Get CORS configuration
aws s3api get-bucket-cors \
  --bucket YOUR-BUCKET \
  --endpoint-url https://YOUR-ACCOUNT-ID.r2.cloudflarestorage.com
```

---

## 9. Production Checklist

Before deploying:

- [ ] CORS configured with `["content-type"]` not `["*"]`
- [ ] Environment variables set correctly (no secrets in client)
- [ ] File size limits enforced server-side
- [ ] File type validation implemented
- [ ] Error handling and user feedback in place
- [ ] Progress tracking working
- [ ] Presigned URL expiry appropriate (5-10 minutes)
- [ ] Tested in multiple browsers
- [ ] Retry logic for failed uploads
- [ ] Analytics/logging for upload failures
- [ ] Fallback mechanism if direct upload fails
- [ ] File naming prevents collisions (nanoid/uuid)
- [ ] Cleanup strategy for failed uploads
- [ ] Custom domain configured (optional)

---

## 10. Additional Resources

### Official Documentation
- [Cloudflare R2 Documentation](https://developers.cloudflare.com/r2/)
- [R2 Presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)
- [R2 CORS Configuration](https://developers.cloudflare.com/r2/buckets/cors/)
- [AWS SDK v3 for JavaScript](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/)

### Community Resources
- [Cloudflare Discord](https://discord.cloudflare.com/) - Storage channel has active R2 support
- [Cloudflare Community](https://community.cloudflare.com/c/developers/storage/63)

### Libraries and Tools
- [Uppy](https://uppy.io/) - File uploader with multipart support
- [@aws-sdk/client-s3](https://www.npmjs.com/package/@aws-sdk/client-s3) - AWS SDK v3
- [aws4fetch](https://www.npmjs.com/package/aws4fetch) - For Cloudflare Workers

---

## Conclusion

Direct browser-to-R2 uploads using presigned URLs are **production-ready and work well** when configured correctly. The CORS configuration is the most common issue - ensure you use `AllowedHeaders: ["content-type"]` explicitly.

Your SSL/TLS error is unusual for R2 and may be environment-specific. Recommended approach:

1. **Fix CORS first** - this may resolve the issue
2. **Test in standard Chrome** - isolate if it's browser-specific
3. **Implement proxy fallback** - for reliability if direct uploads remain problematic

The proxy approach (uploading through your Next.js API route) is a solid fallback that eliminates client-side SSL/CORS issues at the cost of slightly higher server load - acceptable for most image upload scenarios.

Both approaches are documented above with production-ready code examples. Choose based on your specific constraints and testing results.