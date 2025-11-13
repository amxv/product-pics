#!/usr/bin/env tsx
import { db, userTable, accountTable } from '../db';
import { nanoid } from 'nanoid';
import { hashPassword } from 'better-auth/crypto';
import { eq } from 'drizzle-orm';

interface UserInput {
  name: string;
  email: string;
  password: string;
  username?: string;
}

async function createUser(input: UserInput) {
  const { name, email, password, username } = input;

  // Use email prefix as username if not provided
  const finalUsername = username || email.split('@')[0];

  try {
    // Check if user already exists
    const existingUser = await db
      .select()
      .from(userTable)
      .where(eq(userTable.email, email))
      .limit(1);

    if (existingUser.length > 0) {
      console.error('❌ Error: User with this email already exists');
      process.exit(1);
    }

    // Generate unique IDs
    const userId = nanoid();
    const accountId = nanoid();

    // Hash the password
    const hashedPassword = await hashPassword(password);

    // Create user
    await db.insert(userTable).values({
      id: userId,
      name,
      email,
      emailVerified: true,
      username: finalUsername,
      displayUsername: finalUsername,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    console.log('✓ User created successfully');

    // Create account with password
    await db.insert(accountTable).values({
      id: accountId,
      userId,
      accountId: email,
      providerId: 'credential',
      password: hashedPassword,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    console.log('✓ Account created successfully');
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📝 Account Details');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  Name:     ', name);
    console.log('  Email:    ', email);
    console.log('  Username: ', finalUsername);
    console.log('  Password: ', password);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n✅ You can now sign in at /sign-in\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating user:', error);
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length < 3) {
  console.log('Usage: bun scripts/create-user.ts <name> <email> <password> [username]');
  console.log('\nExample:');
  console.log('  bun scripts/create-user.ts "John Doe" john@example.com password123');
  console.log('  bun scripts/create-user.ts "John Doe" john@example.com password123 johndoe');
  process.exit(1);
}

const [name, email, password, username] = args;

createUser({ name, email, password, username });
