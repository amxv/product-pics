---
date: 2025-11-13 01:22:41
feature-slug: 001-ai-product-pics
---

# Feature Specification: AI Product Picture Generator

An AI-powered tool that generates professional product photos for kids clothing by automatically placing kid models in natural settings. Store owners can batch upload product images, specify demographic parameters (baby/boy/girl and age range), and receive AI-generated photos with models in various backgrounds like playgrounds, beaches, and other natural environments. This eliminates the need for expensive photoshoots and manual one-by-one editing.

## 1. User Scenarios

### Primary User Story

Sarah runs an online kids clothing store with 2,000+ SKUs. She receives new inventory weekly but doesn't have the budget for professional photoshoots with child models. Currently, she uploads each product photo to ChatGPT one by one, asks it to add a kid model in a natural setting, waits for the result, downloads it, and repeats this process hundreds of times.

With this tool, Sarah uploads 100 t-shirt product photos at once, selects "Boy" as the demographic, enters age range "10-12", and clicks Generate. She waits approximately 5 minutes while the system processes all images. Each generated photo shows a boy aged 10-12 wearing the t-shirt in a different natural setting (playground, park, beach, backyard, sports field, etc.). Once complete, she downloads all 100 generated images in a single zip file and uploads them to her e-commerce store.

### Acceptance Scenarios

1. **Given** I have 50 baby onesie product photos, **When** I upload all images, select "Baby" demographic, enter age "6-12 months", and click Generate, **Then** the system processes all 50 images and provides generated photos showing babies wearing the onesies in various natural settings

2. **Given** I have uploaded images and started generation, **When** the processing is in progress, **Then** I can see the current status and know approximately how long until completion

3. **Given** generation has completed successfully, **When** I click Download, **Then** I receive a zip file containing all generated product photos with filenames that correspond to my original uploads

4. **Given** I upload images in mixed formats (JPG, PNG), **When** I generate the photos, **Then** the system processes all supported image formats successfully

5. **Given** I have specified an age range "5-8", **When** images are generated, **Then** each photo shows a kid model that appears to be within that age range

### Edge Cases

- What happens when an individual image fails to generate (API error, inappropriate content detected, etc.)? System retries up to 3 times, then skips and reports failure to user
- What happens if the user closes the browser during generation? Generation continues server-side, user can return and check status
- How are duplicate filenames handled in the zip download? Append numeric suffix (_1, _2, etc.)
- What happens if the user uploads non-image files or corrupted images? System validates and rejects during upload
- How does the system ensure diverse backgrounds across many images in a single batch? Random selection with no repeats until all options are used
- What happens if the fal.ai API is down or rate limits are hit? Display error message and allow retry later
- What happens if generation exceeds 30 minutes? System times out and reports partial results

## 2. Requirements

### Functional Requirements

#### Upload & Input
- **FR-001**: System MUST allow users to upload multiple product images simultaneously in a single batch
- **FR-002**: System MUST support JPG, PNG, WebP, and HEIC image formats
- **FR-003**: System MUST convert all uploaded images to PNG format before sending to fal.ai API
- **FR-004**: System MUST allow users to select one demographic option from: Baby, Boy, Girl
- **FR-005**: System MUST allow users to specify either a single age (e.g., "5") or an age range (e.g., "5-8")
- **FR-006**: System MUST limit batches to a maximum of 100 images
- **FR-007**: System MUST validate that each uploaded image is 20MB or less in file size

#### Image Generation
- **FR-008**: System MUST generate product photos using the fal.ai API with the seedream 4 edit model (fal-ai/bytedance/seedream/v4/edit)
- **FR-009**: System MUST generate all images at 1024x1024 resolution (square HD)
- **FR-010**: System MUST place a kid model matching the selected demographic and age in each generated photo
- **FR-011**: System MUST use a different natural setting/background for each image in the batch (playground, beach, park, backyard, sports field, etc.)
- **FR-012**: System MUST randomly select backgrounds to ensure variety across the batch
- **FR-013**: System MUST preserve the original product in each photo (the clothing item should be clearly visible on the model)
- **FR-014**: System MUST retry failed image generations up to 3 times before marking as failed
- **FR-015**: System MUST continue processing remaining images when individual images fail after retry attempts
- **FR-016**: System MUST timeout batch processing after 30 minutes and return partial results

#### Progress & Status
- **FR-017**: System MUST display generation progress to the user while processing
- **FR-018**: System MUST show real-time count of completed vs. total images
- **FR-019**: System MUST allow users to navigate away and return to check batch status
- **FR-020**: System MUST notify users when generation is complete
- **FR-021**: System MUST display a summary of successful and failed images after completion

#### Download & Output
- **FR-022**: System MUST package all successfully generated images into a single zip file for download
- **FR-023**: System MUST name generated images as: [original_filename]_generated.png
- **FR-024**: System MUST handle duplicate filenames by appending numeric suffixes (_1, _2, etc.)
- **FR-025**: System MUST provide generated images in PNG format (as returned by fal.ai API)
- **FR-026**: System MUST include a summary report in the zip file listing successful and failed images

#### Data & Storage
- **FR-027**: System MUST store uploaded images for 30 days after upload
- **FR-028**: System MUST store generated images for 30 days after generation
- **FR-029**: System MUST use Cloudflare R2 (free tier) for image storage
- **FR-030**: System MUST require user authentication via username and password using better-auth
- **FR-031**: System MUST automatically delete images older than 30 days
- **FR-032**: System MUST allow users to access their previous batches and download results within the 30-day retention period

#### Error Handling
- **FR-033**: System MUST validate uploaded files are images before processing
- **FR-034**: System MUST reject files larger than 20MB with a clear error message
- **FR-035**: System MUST reject batches exceeding 100 images with a clear error message
- **FR-036**: System MUST display clear error messages when uploads fail
- **FR-037**: System MUST handle fal.ai API failures gracefully
- **FR-038**: System MUST provide partial results when some images succeed and others fail
- **FR-039**: System MUST report all failed images to the user with failure reasons

#### Performance & Scale
- **FR-040**: System MUST process batches according to fal.ai API processing times
- **FR-041**: System MUST support single-user operation (one batch processing at a time per user)
- **FR-042**: System MUST have no rate limiting or usage quotas

### Non-Functional Requirements
- **NFR-001**: System MUST be usable on all modern browsers (Chrome, Firefox, Safari, Edge)
- **NFR-002**: System MUST be fully functional on mobile devices with responsive design
- **NFR-003**: System MUST provide the service free of charge
- **NFR-004**: System MUST use better-auth for authentication with username and password

## 3. Key Entities

### Product Image
- Represents an original product photo uploaded by the store owner
- Contains the product (clothing item) on a plain/studio background
- Has a filename and format
- Part of a generation batch

### Generation Batch
- A collection of product images uploaded together
- Has demographic settings (baby/boy/girl)
- Has age specification (single age or range)
- Has a status (uploading, processing, complete, failed)
- Produces a collection of generated images
- Relationship: One batch contains many product images, produces many generated images

### Generated Image
- An AI-generated photo showing a kid model wearing the product
- Includes a randomly selected natural setting/background
- Corresponds to one original product image
- Has a filename that relates to the original product image
- Part of a generation batch output

### Background/Setting
- Represents a type of natural environment (playground, beach, park, etc.)
- Used to provide variety in generated images
- Randomly assigned to each image in a batch

### Store Owner/User
- Authenticated user with username and password (via better-auth)
- Uses the tool to generate product photos for their kids clothing store
- Uploads batches of product images (up to 100 per batch)
- Specifies demographic and age parameters for each batch
- Downloads generated results within 30-day retention period
- Can access previous batches and their generated results
- Has no usage limits or quotas
- Uses the service free of charge

### Batch History
- Stores information about all batches created by a user
- Contains batch metadata (creation date, status, demographic settings, age parameters)
- Links to both uploaded and generated images
- Allows users to review and download previous work
- Automatically removes entries older than 30 days
