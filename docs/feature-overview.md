# Product Pics Feature Overview

## Product Summary

Product Pics is an AI product photo generator built for kids clothing catalogs. It takes flat product shots, places child models into the scene, and returns polished lifestyle-style images that are ready for ecommerce use.

The product is optimized for batch work rather than one-off editing. A store owner can upload up to 100 clothing images at once, choose a demographic and age range, and let the system generate a full set of catalog-ready outputs with varied natural backgrounds.

## Core Workflow

1. Create a batch and choose:
   - demographic: `baby`, `boy`, or `girl`
   - age: single age or age range such as `5-8`
2. Upload product images directly to Cloudflare R2.
3. The system converts uploads to PNG and submits generation jobs to RunPod.
4. Each result places the clothing item on a child model in a varied outdoor or lifestyle setting.
5. Users monitor progress from the batch dashboard and download the final results as a zip archive.

## Key Capabilities

- Batch upload up to 100 product images at a time.
- Direct-to-R2 uploads using presigned URLs to avoid app-server upload bottlenecks.
- AI generation through RunPod with polling-based async job tracking.
- Demographic and age-based prompt construction for more relevant outputs.
- Diverse background assignment across each batch.
- Per-image retries for failed generations.
- Downloadable zip export with generated images and a summary report.
- Authenticated multi-user access with private per-user batch history.
- Automatic cleanup model built around temporary asset storage in Cloudflare R2.

## Technical Stack

- Next.js 16 + React 19
- better-auth for authentication
- Drizzle ORM + Postgres
- Cloudflare R2 for source and generated image storage
- RunPod `nano-banana-edit` endpoint for generation
- Sharp for image normalization and conversion

## Operational Notes

- Public self-signup is disabled in the current app flow.
- The product is designed around asynchronous batch generation rather than interactive editing.
- Generated outputs are packaged for bulk download, which fits marketplace and catalog workflows better than single-image UX.
