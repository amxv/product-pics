import { pgTable, text, timestamp, boolean, integer, pgEnum } from 'drizzle-orm/pg-core';

// ===========================
// Enums
// ===========================

export const demographicEnum = pgEnum('demographic', ['baby', 'boy', 'girl']);
export const batchStatusEnum = pgEnum('batch_status', ['uploading', 'uploaded', 'processing', 'completed', 'partial', 'failed']);
export const uploadStatusEnum = pgEnum('upload_status', ['pending', 'uploaded', 'failed']);
export const generationStatusEnum = pgEnum('generation_status', ['pending', 'processing', 'completed', 'failed']);
export const runpodJobStatusEnum = pgEnum('runpod_job_status', ['in_queue', 'in_progress', 'completed', 'failed']);

// ===========================
// better-auth Tables
// ===========================

export const userTable = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  // Username plugin extension
  username: text('username').notNull().unique(),
});

export const sessionTable = pgTable('session', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => userTable.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at').notNull(),
  token: text('token').notNull().unique(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

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

export const verificationTable = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ===========================
// Application Tables
// ===========================

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
  userIdIdx: {
    name: 'batch_user_id_idx',
    columns: [table.userId],
  },
  statusIdx: {
    name: 'batch_status_idx',
    columns: [table.status],
  },
  createdAtIdx: {
    name: 'batch_created_at_idx',
    columns: [table.createdAt],
  },
}));

export const uploadedImageTable = pgTable('uploaded_image', {
  id: text('id').primaryKey(),
  batchId: text('batch_id')
    .notNull()
    .references(() => batchTable.id, { onDelete: 'cascade' }),
  originalFilename: text('original_filename').notNull(),
  r2Key: text('r2_key').notNull().unique(),
  fileSize: integer('file_size').notNull(),
  mimeType: text('mime_type').notNull(),
  status: uploadStatusEnum('status').notNull().default('pending'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  batchIdIdx: {
    name: 'uploaded_image_batch_id_idx',
    columns: [table.batchId],
  },
}));

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
  batchIdIdx: {
    name: 'generated_image_batch_id_idx',
    columns: [table.batchId],
  },
  uploadedImageIdIdx: {
    name: 'generated_image_uploaded_image_id_idx',
    columns: [table.uploadedImageId],
  },
  statusIdx: {
    name: 'generated_image_status_idx',
    columns: [table.status],
  },
}));

export const runpodJobTable = pgTable('runpod_job', {
  id: text('id').primaryKey(),
  generatedImageId: text('generated_image_id')
    .notNull()
    .references(() => generatedImageTable.id),
  jobId: text('job_id').notNull().unique(),
  status: runpodJobStatusEnum('status').notNull().default('in_queue'),
  prompt: text('prompt').notNull(),
  background: text('background').notNull(),
  submittedAt: timestamp('submitted_at').notNull().defaultNow(),
  completedAt: timestamp('completed_at'),
  errorMessage: text('error_message'),
  resultUrl: text('result_url'),
}, (table) => ({
  generatedImageIdIdx: {
    name: 'runpod_job_generated_image_id_idx',
    columns: [table.generatedImageId],
  },
  statusIdx: {
    name: 'runpod_job_status_idx',
    columns: [table.status],
  },
}));
