import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// Create PostgreSQL connection
const connectionString = process.env.DATABASE_URL!;
const client = postgres(connectionString);

// Create Drizzle instance
export const db = drizzle(client, { schema });

// Export all schema tables for easy access
export {
  userTable,
  sessionTable,
  accountTable,
  verificationTable,
  batchTable,
  uploadedImageTable,
  generatedImageTable,
  runpodJobTable,
} from './schema';
