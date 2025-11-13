# Better Auth for Next.js: Comprehensive Implementation Guide

**Research Date:** November 13, 2025
**Focus:** Username/password authentication with better-auth in Next.js App Router

## Summary

Better Auth is a comprehensive, framework-agnostic authentication library for TypeScript that recently merged with Auth.js/NextAuth. It offers superior developer experience, built-in advanced features (2FA, organizations, rate limiting), and excellent type safety. For Next.js applications requiring username/password authentication with user-specific data storage, Better Auth provides a modern, production-ready solution with minimal configuration.

**Key Advantages:**
- Framework-agnostic with excellent Next.js integration
- Username plugin extends email/password auth seamlessly
- Built-in session management, rate limiting, and security features
- Database-agnostic (PostgreSQL, MySQL, SQLite) with ORM adapters (Prisma, Drizzle)
- Excellent TypeScript support with automatic type inference
- Production-ready with comprehensive security features

---

## 1. Setup Better Auth in Next.js App Router

### Installation

```bash
npm install better-auth
```

### Environment Variables

Create a `.env` file:

```env
# Required
BETTER_AUTH_SECRET=<generate-using-openssl-rand-base64-32>
BETTER_AUTH_URL=http://localhost:3000

# Database (example with PostgreSQL)
DATABASE_URL=postgresql://user:password@localhost:5432/mydb
```

**Important:** In production, `BETTER_AUTH_SECRET` is mandatory. Better Auth will throw an error if it's not set.

### Create Auth Instance

Create `lib/auth.ts`:

```typescript
import { betterAuth } from "better-auth";
import { Pool } from "pg"; // or your preferred database client
import { username } from "better-auth/plugins";

export const auth = betterAuth({
  database: new Pool({
    connectionString: process.env.DATABASE_URL,
  }),

  emailAndPassword: {
    enabled: true,
    autoSignIn: true, // Auto sign-in after signup (default: true)
  },

  plugins: [
    username(), // Adds username support
  ],
});
```

### Create API Route Handler

Create `/app/api/auth/[...all]/route.ts`:

```typescript
import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { GET, POST } = toNextJsHandler(auth.handler);
```

**Note:** Keep the path as `/api/auth/[...all]` unless you have specific reasons to change it.

---

## 2. Username & Password Authentication Configuration

### Server Configuration with Username Plugin

```typescript
import { betterAuth } from "better-auth";
import { username } from "better-auth/plugins";

export const auth = betterAuth({
  emailAndPassword: {
    enabled: true,
    // Optional: disable auto sign-in after signup
    autoSignIn: false,
  },

  plugins: [
    username({
      // Username constraints
      minUsernameLength: 3,
      maxUsernameLength: 30,

      // Custom validation
      usernameValidator: (username) => {
        // Return false to reject
        if (username === "admin" || username === "root") {
          return false;
        }
        // Default: only alphanumeric, underscores, and dots
        return /^[a-zA-Z0-9_.]+$/.test(username);
      },

      // Username normalization (default: lowercase)
      usernameNormalization: (username) => {
        return username.toLowerCase();
      },

      // Display username normalization (optional)
      displayUsernameNormalization: false, // or custom function

      // Validation order
      validationOrder: {
        username: "pre-normalization", // or "post-normalization"
        displayUsername: "pre-normalization",
      },
    }),
  ],
});
```

### Client Configuration

Create `lib/auth-client.ts`:

```typescript
import { createAuthClient } from "better-auth/react"; // Use /react for Next.js
import { usernameClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL, // Optional if same domain

  plugins: [
    usernameClient(),
  ],
});

// Export hooks for convenience
export const {
  useSession,
  signIn,
  signUp,
  signOut
} = authClient;
```

### Sign Up with Username

```typescript
const { data, error } = await authClient.signUp.email({
  email: "user@example.com",
  name: "John Doe",
  password: "securePassword123",
  username: "johndoe", // Required when username plugin is used
  displayUsername: "JohnDoe", // Optional
});
```

**Key Points:**
- `username`: Normalized and stored (e.g., lowercase)
- `displayUsername`: Preserved as entered by user
- Both fields are required when username plugin is active

### Sign In with Username

```typescript
const { data, error } = await authClient.signIn.username({
  username: "johndoe",
  password: "securePassword123",
});
```

### Check Username Availability

```typescript
const { data: response } = await authClient.isUsernameAvailable({
  username: "newusername",
});

if (response?.available) {
  console.log("Username is available");
}
```

---

## 3. Database Setup and Schema

### Supported Databases

Better Auth supports:
- **PostgreSQL** (recommended for production)
- **MySQL**
- **SQLite** (development/testing)
- **MongoDB** (with adapter)

### ORM Support

- **Prisma Adapter**
- **Drizzle ORM Adapter**
- **Built-in Kysely Adapter**
- **Custom Adapters** (can create your own)

### Prisma Setup (Recommended)

**Install Prisma:**

```bash
npm install prisma @prisma/client
npm install better-auth
npx prisma init
```

**Configure `lib/auth.ts` with Prisma:**

```typescript
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { PrismaClient } from "@prisma/client";
import { username } from "better-auth/plugins";

const prisma = new PrismaClient();

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql", // or "mysql", "sqlite"
  }),

  emailAndPassword: {
    enabled: true,
  },

  plugins: [
    username(),
  ],
});
```

### Generate Database Schema

Better Auth CLI automatically generates the required schema:

```bash
# Generate Prisma schema
npx @better-auth/cli generate

# Or run migration directly (for Kysely)
npx @better-auth/cli migrate
```

This creates/updates your schema with:
- `user` table
- `session` table
- `account` table
- `verification` table
- Additional fields for username plugin

**Run Prisma migration:**

```bash
npx prisma migrate dev --name init-better-auth
npx prisma generate
```

### Core Schema Structure

Better Auth requires these tables:

**User Table:**
- `id` (string, PK)
- `email` (string)
- `emailVerified` (boolean)
- `name` (string)
- `image` (string, optional)
- `createdAt` (datetime)
- `updatedAt` (datetime)
- `username` (string) - added by username plugin
- `displayUsername` (string) - added by username plugin

**Session Table:**
- `id` (string, PK)
- `userId` (string, FK)
- `token` (string)
- `expiresAt` (datetime)
- `ipAddress` (string, optional)
- `userAgent` (string, optional)
- `createdAt` (datetime)
- `updatedAt` (datetime)

**Account Table:**
- `id` (string, PK)
- `userId` (string, FK)
- `accountId` (string)
- `providerId` (string)
- `password` (string, optional) - for email/password
- `accessToken` (string, optional)
- `refreshToken` (string, optional)
- `accessTokenExpiresAt` (datetime, optional)
- `createdAt` (datetime)
- `updatedAt` (datetime)

**Verification Table:**
- `id` (string, PK)
- `identifier` (string)
- `value` (string)
- `expiresAt` (datetime)
- `createdAt` (datetime)
- `updatedAt` (datetime)

### Extending Schema with Custom Fields

Add custom fields to user table:

```typescript
export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),

  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "user",
        input: false, // Don't allow user to set this during signup
      },
      preferences: {
        type: "string", // Store JSON as string
        required: false,
      },
    },
  },

  emailAndPassword: { enabled: true },
  plugins: [username()],
});
```

After adding fields, regenerate schema:

```bash
npx @better-auth/cli generate
npx prisma migrate dev
```

---

## 4. Protecting API Routes and Pages

### Next.js Middleware (Optimistic Check)

Create `middleware.ts` at project root:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

export async function middleware(request: NextRequest) {
  const sessionCookie = getSessionCookie(request);

  // Optimistic check - MUST validate on server for security
  if (!sessionCookie) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/images/:path*"],
};
```

**⚠️ Security Warning:** `getSessionCookie` only checks cookie existence, not validity. Always validate sessions server-side.

### Protecting Server Components (Secure)

```typescript
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  // Secure session validation
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/sign-in");
  }

  return (
    <div>
      <h1>Welcome {session.user.name}</h1>
      <p>Username: {session.user.username}</p>
    </div>
  );
}
```

### Protecting API Routes

```typescript
// app/api/images/route.ts
import { auth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  // Validate session
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  // User is authenticated - process request
  const userId = session.user.id;

  // Your API logic here
  return NextResponse.json({ success: true });
}
```

### Server Actions with Cookie Handling

Better Auth provides `nextCookies` plugin for Server Actions:

```typescript
// lib/auth.ts
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { username } from "better-auth/plugins";

export const auth = betterAuth({
  database: /* ... */,
  emailAndPassword: { enabled: true },

  plugins: [
    username(),
    nextCookies(), // Must be last in array
  ],
});
```

Now cookies are automatically set in Server Actions:

```typescript
"use server";
import { auth } from "@/lib/auth";

export async function signInAction(formData: FormData) {
  await auth.api.signInEmail({
    body: {
      email: formData.get("email") as string,
      password: formData.get("password") as string,
    },
  });

  // Cookies are automatically set
}
```

---

## 5. Client-Side Authentication Hooks and Patterns

### useSession Hook

The primary hook for accessing user session:

```typescript
"use client";
import { useSession } from "@/lib/auth-client";

export function UserProfile() {
  const {
    data: session,    // Session object with user and session data
    isPending,        // Loading state
    error,            // Error object
    refetch,          // Function to manually refetch session
  } = useSession();

  if (isPending) {
    return <div>Loading...</div>;
  }

  if (!session) {
    return <div>Not authenticated</div>;
  }

  return (
    <div>
      <h2>Welcome {session.user.name}</h2>
      <p>Username: @{session.user.username}</p>
      <p>Email: {session.user.email}</p>
    </div>
  );
}
```

### Sign Up Pattern

```typescript
"use client";
import { authClient } from "@/lib/auth-client";
import { useState } from "react";

export function SignUpForm() {
  const [error, setError] = useState<string | null>(null);

  const handleSignUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    const { data, error } = await authClient.signUp.email({
      email: formData.get("email") as string,
      name: formData.get("name") as string,
      password: formData.get("password") as string,
      username: formData.get("username") as string,
    }, {
      onRequest: () => {
        setError(null);
        // Show loading spinner
      },
      onSuccess: () => {
        // Redirect to dashboard
        window.location.href = "/dashboard";
      },
      onError: (ctx) => {
        setError(ctx.error.message);
      },
    });
  };

  return (
    <form onSubmit={handleSignUp}>
      {error && <div className="error">{error}</div>}
      <input name="email" type="email" required />
      <input name="name" type="text" required />
      <input name="username" type="text" required />
      <input name="password" type="password" required />
      <button type="submit">Sign Up</button>
    </form>
  );
}
```

### Sign In Pattern

```typescript
"use client";
import { authClient } from "@/lib/auth-client";

export function SignInForm() {
  const handleSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    const { data, error } = await authClient.signIn.username({
      username: formData.get("username") as string,
      password: formData.get("password") as string,
    });

    if (error) {
      alert(error.message);
    } else {
      window.location.href = "/dashboard";
    }
  };

  return (
    <form onSubmit={handleSignIn}>
      <input name="username" type="text" required />
      <input name="password" type="password" required />
      <button type="submit">Sign In</button>
    </form>
  );
}
```

### Sign Out

```typescript
"use client";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";

export function SignOutButton() {
  const router = useRouter();

  const handleSignOut = async () => {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          router.push("/");
        },
      },
    });
  };

  return <button onClick={handleSignOut}>Sign Out</button>;
}
```

---

## 6. Session Management and Token Handling

### Session Configuration

```typescript
export const auth = betterAuth({
  // ... other config

  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days (default)
    updateAge: 60 * 60 * 24,      // Update expiration every 1 day
    freshAge: 60 * 60 * 24,       // Session is "fresh" for 1 day

    // Optional: disable session refresh
    disableSessionRefresh: false,

    // Cookie cache for performance
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5 minutes in seconds
    },
  },
});
```

### Cookie-Based Sessions

Better Auth uses traditional cookie-based session management:
- Session token stored in HTTP-only cookie
- Cookie is automatically sent with every request
- Server validates session on each request

**Cookie Attributes:**
- `httpOnly: true` - Prevents XSS attacks
- `sameSite: "lax"` - CSRF protection
- `secure: true` - HTTPS only (in production)
- `path: "/"` - Available across entire site

### Session Caching

**Cookie Cache** reduces database calls:

```typescript
session: {
  cookieCache: {
    enabled: true,
    maxAge: 5 * 60, // Cache for 5 minutes
  },
}
```

Benefits:
- Reduces database load
- Faster session validation
- Similar to JWT access/refresh token pattern
- Cookie is signed to prevent tampering

**Force fresh session fetch:**

```typescript
// Client-side
const session = await authClient.getSession({
  query: {
    disableCookieCache: true,
  },
});

// Server-side
const session = await auth.api.getSession({
  query: { disableCookieCache: true },
  headers: req.headers,
});
```

### Multi-Device Session Management

**List all sessions:**

```typescript
const sessions = await authClient.listSessions();
```

**Revoke specific session:**

```typescript
await authClient.revokeSession({
  token: "session-token-to-revoke",
});
```

**Revoke other sessions (keep current):**

```typescript
await authClient.revokeOtherSessions();
```

**Revoke all sessions:**

```typescript
await authClient.revokeSessions();
```

**Auto-revoke on password change:**

```typescript
await authClient.changePassword({
  currentPassword: "oldPassword",
  newPassword: "newPassword",
  revokeOtherSessions: true, // Sign out other devices
});
```

---

## 7. Production Deployment Best Practices

### Environment Variables

**Required:**
```env
# Production - MUST be set
BETTER_AUTH_SECRET=<strong-random-secret>
BETTER_AUTH_URL=https://yourdomain.com

# Database
DATABASE_URL=postgresql://user:password@host:5432/db
```

**Generate secure secret:**
```bash
openssl rand -base64 32
```

### Security Configuration

```typescript
export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,

  // Trust origins (if frontend is on different domain)
  trustedOrigins: [
    "https://yourdomain.com",
    "https://app.yourdomain.com",
  ],

  // Rate limiting
  rateLimit: {
    enabled: true,
    window: 60, // 60 seconds
    max: 10,    // 10 requests per window
  },

  // Advanced security
  advanced: {
    // Use Redis for secondary storage (sessions, rate limits)
    useSecureCookies: true, // Auto-enabled for https://
  },
});
```

### Database Best Practices

**Connection Pooling:**

```typescript
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,              // Maximum pool size
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

export const auth = betterAuth({
  database: pool,
  // ... other config
});
```

**Prisma Production:**

```typescript
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
});

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export { prisma };
```

### Vercel Deployment

**Environment Variables:**
1. Go to Vercel Project Settings → Environment Variables
2. Add all required env vars for Production, Preview, Development

**Important:**
- Set `BETTER_AUTH_URL` to your production domain
- Ensure `BETTER_AUTH_SECRET` is different for each environment
- Use Vercel Postgres or external PostgreSQL database

### Logging and Monitoring

```typescript
export const auth = betterAuth({
  // ... other config

  logger: {
    level: process.env.NODE_ENV === "production" ? "info" : "debug",
    disabled: false,
  },

  // Custom error handling
  onAPIError: async (error, request) => {
    console.error("Auth error:", error);
    // Send to error tracking service (Sentry, etc.)
  },
});
```

---

## 8. Migration and Setup Scripts

### CLI Commands

**Initialize Better Auth:**
```bash
npx @better-auth/cli init
```

**Generate schema for your ORM:**
```bash
# Generates Prisma/Drizzle schema or SQL file
npx @better-auth/cli generate
```

**Run migration (Kysely only):**
```bash
npx @better-auth/cli migrate
```

**With custom config path:**
```bash
npx @better-auth/cli generate --config ./src/lib/auth.ts
```

### Prisma Workflow

```bash
# 1. Install dependencies
npm install prisma @prisma/client better-auth

# 2. Initialize Prisma
npx prisma init

# 3. Configure auth and generate schema
npx @better-auth/cli generate

# 4. Create migration
npx prisma migrate dev --name init-better-auth

# 5. Generate Prisma Client
npx prisma generate
```

### Package.json Scripts

```json
{
  "scripts": {
    "db:generate": "npx @better-auth/cli generate",
    "db:migrate": "npx prisma migrate dev",
    "db:studio": "npx prisma studio",
    "db:push": "npx prisma db push"
  }
}
```

### Manual Schema Creation

If you prefer not to use the CLI, you can manually create tables. See the [Core Schema](#core-schema-structure) section for table definitions.

---

## 9. TypeScript Types and SDK Usage

### Type Inference

Better Auth provides excellent TypeScript support with automatic type inference:

**Server-side:**

```typescript
import { auth } from "@/lib/auth";

// Infer user type
export type User = typeof auth.$Infer.Session.user;

// Infer session type
export type Session = typeof auth.$Infer.Session;
```

**Client-side:**

```typescript
import { authClient } from "@/lib/auth-client";

// Infer types from client
export type User = typeof authClient.$Infer.Session.user;
export type Session = typeof authClient.$Infer.Session;
```

### Custom Fields Type Inference

When you add custom fields, they're automatically inferred:

```typescript
// lib/auth.ts
export const auth = betterAuth({
  user: {
    additionalFields: {
      role: { type: "string", defaultValue: "user" },
      bio: { type: "string", required: false },
    },
  },
  plugins: [username()],
});

// Automatically available in your code:
const session = await auth.api.getSession({ headers });
if (session) {
  const role = session.user.role;       // TypeScript knows this exists
  const username = session.user.username; // From username plugin
  const bio = session.user.bio;          // Optional field
}
```

### Client-Side Type Inference

```typescript
// lib/auth-client.ts
import { createAuthClient } from "better-auth/react";
import { usernameClient } from "better-auth/client/plugins";
import { inferAdditionalFields } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [
    usernameClient(),
    inferAdditionalFields({
      user: {
        role: { type: "string" },
        bio: { type: "string" },
      },
    }),
  ],
});

// Usage in components
const { data: session } = useSession();
if (session) {
  const role = session.user.role;  // Fully typed
}
```

### Plugin Type Inference

Plugins automatically extend types:

```typescript
import { betterAuth } from "better-auth";
import { username, twoFactor } from "better-auth/plugins";

export const auth = betterAuth({
  plugins: [username(), twoFactor()],
});

// Types are automatically extended
const session = await auth.api.getSession({ headers });
if (session) {
  session.user.username;        // From username plugin
  session.user.twoFactorEnabled; // From twoFactor plugin
}
```

### Error Handling with Types

```typescript
const { data, error } = await authClient.signIn.username({
  username: "test",
  password: "password",
});

if (error) {
  // Error has typed code property
  switch (error.code) {
    case "USER_NOT_FOUND":
      console.log("User doesn't exist");
      break;
    case "INVALID_PASSWORD":
      console.log("Wrong password");
      break;
    default:
      console.log("Unknown error");
  }
}
```

---

## 10. Comparison with Alternatives

### Better Auth vs NextAuth (Auth.js)

| Feature | Better Auth | NextAuth/Auth.js |
|---------|-------------|------------------|
| **Framework Support** | Framework-agnostic | Next.js focused |
| **TypeScript** | Excellent, automatic inference | Good, requires manual types |
| **Username/Password** | Built-in plugin, simple | CredentialsProvider (complex) |
| **2FA** | Built-in plugin | Requires custom implementation |
| **Rate Limiting** | Built-in | Not included |
| **Organizations** | Built-in plugin | Not included |
| **Session Management** | Cookie-based with caching | JWT or database |
| **Developer Experience** | Excellent, intuitive API | Good, but complex config |
| **Setup Complexity** | Low | Medium-High |
| **Documentation** | Comprehensive, modern | Good but scattered |
| **Plugin Ecosystem** | Growing, well-designed | Limited |
| **Database Adapters** | Multiple (Prisma, Drizzle, Kysely) | Multiple (Prisma, Drizzle) |
| **Production Ready** | Yes | Yes |
| **Community** | Growing rapidly | Large, established |
| **Maintenance** | Active (Auth.js now maintained by Better Auth team) | Auth.js merged with Better Auth |

**Recent Development:** Auth.js (formerly NextAuth) is now maintained by the Better Auth team, signaling Better Auth as the future direction.

### Why Choose Better Auth?

**✅ Choose Better Auth if you want:**
- Modern, intuitive API
- Built-in advanced features (2FA, organizations, etc.)
- Excellent TypeScript support out of the box
- Framework flexibility
- Username/password auth without complexity
- Better developer experience
- Active development and modern codebase

**⚠️ Consider NextAuth if:**
- You have existing NextAuth implementation
- Need stability of established solution (though Auth.js → Better Auth)
- Large community is critical (though Better Auth community is growing)

### Better Auth vs Clerk

| Feature | Better Auth | Clerk |
|---------|-------------|-------|
| **Hosting** | Self-hosted | Managed service |
| **Pricing** | Free (open-source) | Free tier + paid plans |
| **Data Ownership** | Full control | Clerk controls data |
| **Customization** | Complete | Limited |
| **UI Components** | DIY or shadcn/ui | Pre-built, branded |
| **Setup Time** | Medium | Fast |
| **Vendor Lock-in** | None | High |
| **Cost at Scale** | No additional cost | Can be expensive |

**✅ Choose Better Auth if:**
- Want full control over data
- Need complete customization
- Want to avoid vendor lock-in
- Budget-conscious at scale

**✅ Choose Clerk if:**
- Want managed authentication
- Need to ship very quickly
- Prefer pre-built UI components
- Willing to pay for convenience

---

## Implementation Checklist

### Basic Setup
- [ ] Install `better-auth`
- [ ] Set up environment variables (`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`)
- [ ] Create auth instance in `lib/auth.ts`
- [ ] Add username plugin
- [ ] Create API route handler at `/app/api/auth/[...all]/route.ts`
- [ ] Create client instance in `lib/auth-client.ts`

### Database
- [ ] Choose database (PostgreSQL recommended)
- [ ] Install database client or ORM (Prisma recommended)
- [ ] Configure database connection
- [ ] Run `npx @better-auth/cli generate`
- [ ] Run database migrations
- [ ] Verify tables created

### Authentication Features
- [ ] Implement sign-up form with username
- [ ] Implement sign-in form (username/password)
- [ ] Add username availability check
- [ ] Implement sign-out functionality
- [ ] Add `useSession` hook to layouts/components

### Route Protection
- [ ] Create middleware for optimistic redirects
- [ ] Add session validation to protected pages
- [ ] Add authentication to API routes
- [ ] Test protected routes without auth
- [ ] Configure `nextCookies` plugin for server actions

### User Experience
- [ ] Display user info in UI (name, username, email)
- [ ] Show loading states during auth operations
- [ ] Handle and display auth errors gracefully
- [ ] Add session management UI (list devices, revoke sessions)
- [ ] Implement "Remember me" functionality if needed

### Production
- [ ] Set production `BETTER_AUTH_SECRET`
- [ ] Configure production `BETTER_AUTH_URL`
- [ ] Set up database connection pooling
- [ ] Enable rate limiting
- [ ] Configure CORS/trusted origins
- [ ] Test authentication flows in production
- [ ] Set up error monitoring
- [ ] Configure logging

---

## Additional Resources

### Official Documentation
- **Better Auth Docs:** https://www.better-auth.com/docs
- **Next.js Integration:** https://www.better-auth.com/docs/integrations/next
- **Username Plugin:** https://www.better-auth.com/docs/plugins/username
- **Database Setup:** https://www.better-auth.com/docs/concepts/database
- **Prisma Guide:** https://www.prisma.io/docs/guides/betterauth-nextjs

### Community Examples
- **Next.js Example:** https://www.better-auth.com/docs/examples/next-js
- **GitHub Examples:** https://github.com/better-auth/better-auth/tree/main/examples
- **Community Templates:** Search GitHub for "better-auth nextjs"

### Migration Guides
- **From NextAuth:** https://www.better-auth.com/docs/guides/next-auth-migration-guide
- **From Auth0:** https://www.better-auth.com/docs/guides/auth0-migration-guide

### Key Blog Posts
- "Better Auth vs NextAuth" - Better Stack Community
- "Is Better Auth the key to solving authentication headaches?" - LogRocket
- "Auth.js is now part of Better Auth" - Better Auth Blog

---

## Conclusion

Better Auth provides a modern, production-ready authentication solution for Next.js applications. Its excellent TypeScript support, intuitive API, and built-in advanced features make it superior to traditional solutions like NextAuth for new projects. The username plugin seamlessly extends email/password authentication, and the framework-agnostic design ensures flexibility as your application evolves.

For your use case (username/password auth with user-specific data), Better Auth offers:
- Simple setup with minimal configuration
- Secure session management out of the box
- Easy route protection patterns
- Excellent developer experience
- Production-ready security features
- Full control over your data and authentication flow

The recent merger of Auth.js into Better Auth further validates Better Auth as the future of authentication for TypeScript applications.
