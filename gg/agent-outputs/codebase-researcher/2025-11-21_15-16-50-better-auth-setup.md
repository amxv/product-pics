# Better-Auth Setup Research - Next.js App

## Analysis: Email and Password Authentication with Better-Auth

### Overview
This Next.js application uses better-auth (v1.3.34) for authentication with email/password credentials and username support. Public signup is disabled, and users must be created via an admin script. The auth system integrates with PostgreSQL via Drizzle ORM and provides session-based authentication with a 7-day expiration period.

---

## 1. Better-Auth Initialization and Configuration

### Entry Point: `/home/user/product-pics/src/lib/auth.ts`

The main auth instance is configured using the `betterAuth()` function:

**Lines 7-41:**
```typescript
export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.userTable,
      session: schema.sessionTable,
      account: schema.accountTable,
      verification: schema.verificationTable,
    },
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    disableSignUp: true,
    sendResetPassword: async () => {
      // Disabled - use admin script to reset passwords
    },
  },
  plugins: [
    username({
      minUsernameLength: 3,
      maxUsernameLength: 30,
      usernameValidator: (username: string) => {
        return /^[a-zA-Z0-9_.]+$/.test(username);
      },
    }),
  ],
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day (update session if older than 1 day)
  },
  secret: process.env.BETTER_AUTH_SECRET!,
  baseURL: process.env.BETTER_AUTH_URL!,
});
```

**Key Configuration Points:**

1. **Database Adapter** (`auth.ts:8-16`)
   - Uses Drizzle ORM with PostgreSQL
   - Maps to four schema tables: user, session, account, verification
   - Connection via `drizzle-orm/postgres-js`

2. **Email and Password Settings** (`auth.ts:17-24`)
   - Email/password authentication enabled
   - Email verification disabled (`requireEmailVerification: false`)
   - Public signup disabled (`disableSignUp: true`)
   - Password reset disabled (empty callback)

3. **Username Plugin** (`auth.ts:25-34`)
   - Validates username length: 3-30 characters
   - Pattern: alphanumeric + underscore + period
   - Regex: `/^[a-zA-Z0-9_.]+$/`

4. **Session Management** (`auth.ts:35-38`)
   - Sessions expire after 7 days (604,800 seconds)
   - Session updates if older than 1 day (86,400 seconds)

5. **Environment Variables** (`auth.ts:39-40`)
   - `BETTER_AUTH_SECRET`: Secret key for signing/encryption
   - `BETTER_AUTH_URL`: Base URL for the auth endpoints

---

## 2. Email and Password Authentication Setup

### Configuration Details

**Authentication Method:**
- Type: Username + Password (via the username plugin)
- Provider: `credential` (stored in `accountTable.providerId`)
- Password hashing: Uses `better-auth/crypto` hashPassword function

**Sign-Up Flow:**
- **Status:** Disabled
- **Configuration:** `disableSignUp: true` at `auth.ts:20`
- **Reason:** No public registration allowed; users must be created by admins

**Password Management:**
- Passwords are hashed using better-auth's built-in `hashPassword()` function
- Stored in `account.password` field in the database
- Reset functionality is disabled (empty callback at `auth.ts:21-23`)

---

## 3. User Registration/Signup Flow (Disabled)

### Public Signup Status

**Configuration:** Public signup is **DISABLED**
- Set via `disableSignUp: true` in `auth.ts:20`
- No sign-up page exists in the codebase
- No sign-up API endpoint is exposed

### Admin User Creation Mechanism

**Script Location:** `/home/user/product-pics/scripts/create-user.ts`

**Usage:**
```bash
bun scripts/create-user.ts <name> <email> <password> [username]
```

**Example:**
```bash
bun scripts/create-user.ts "John Doe" john@example.com password123
bun scripts/create-user.ts "John Doe" john@example.com password123 johndoe
```

**Implementation Details (`create-user.ts:14-81`):**

1. **Input Validation** (lines 22-31)
   - Checks if user with email already exists
   - Exits with error if duplicate email found

2. **Username Generation** (line 18)
   - Uses provided username or email prefix (before @)
   - Example: `john@example.com` → username: `john`

3. **User Creation Process** (lines 34-50)
   - Generates unique user ID with `nanoid()`
   - Hashes password using `hashPassword()` from `better-auth/crypto`
   - Inserts into `userTable` with:
     - `emailVerified: true` (auto-verified for admin-created users)
     - `username` and `displayUsername` set
     - Timestamps: `createdAt` and `updatedAt`

4. **Account Creation** (lines 54-63)
   - Creates corresponding entry in `accountTable`
   - Sets `providerId: 'credential'` for password auth
   - Links account to user via `userId`
   - Stores hashed password in `password` field

**Security Note:** The script displays the plaintext password in console output for the admin to share with the user.

---

## 4. Sign-In Flow

### Entry Point: `/home/user/product-pics/src/app/(auth)/sign-in/page.tsx`

**Client-Side Sign-In Component:**

**Form Submission Handler (`sign-in/page.tsx:19-41`):**
```typescript
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  setError("");
  setIsLoading(true);

  try {
    const result = await authClient.signIn.username({
      username,
      password,
    });

    if (result.error) {
      setError(result.error.message || "Failed to sign in");
      setIsLoading(false);
      return;
    }

    router.push("/batches");
  } catch {
    setError("An unexpected error occurred");
    setIsLoading(false);
  }
};
```

**Sign-In Process:**

1. **User Input Collection** (lines 58-79)
   - Username field (type: text)
   - Password field (type: password)
   - Both required fields with disabled state during loading

2. **Authentication Call** (lines 25-28)
   - Uses `authClient.signIn.username()` method
   - Sends username and password to server
   - Managed by better-auth client SDK

3. **Error Handling** (lines 30-34, 37-40)
   - Displays error message from server if auth fails
   - Shows generic error for unexpected failures
   - Error displayed in red alert box (lines 53-57)

4. **Success Redirect** (line 36)
   - Redirects to `/batches` on successful authentication
   - Uses Next.js router for client-side navigation

**UI Layout:**
- Centered card layout via `(auth)/layout.tsx`
- Simple form with username/password fields
- Loading state with "Signing in..." text
- No signup link (removed as per recent commit: e695539)

---

## 5. Session Management

### Session Creation

**Server-Side Session Check (`src/app/(app)/layout.tsx:12-14`):**
```typescript
const session = await auth.api.getSession({
  headers: await headers(),
});
```

- Called on every protected page render
- Retrieves session from cookies
- Returns user data if valid session exists

### Session Storage

**Cookie Name:** `better-auth.session_token`

**Middleware Check (`src/middleware.ts:14`):**
```typescript
const sessionToken = request.cookies.get("better-auth.session_token");
```

**Session Properties:**
- Stored in HTTP-only cookie (managed by better-auth)
- Expiration: 7 days from creation
- Updated if older than 1 day (rolling session)
- Automatically sent with requests to protected routes

### Session Data Structure

Based on `sessionTable` schema (`db/schema.ts:30-41`):
```typescript
{
  id: string,           // Unique session ID
  userId: string,       // References user.id
  expiresAt: timestamp, // Expiration timestamp
  token: string,        // Unique session token (stored in cookie)
  ipAddress: string,    // Client IP address
  userAgent: string,    // Client user agent
  createdAt: timestamp,
  updatedAt: timestamp
}
```

### Session Validation

**Middleware Protection (`src/middleware.ts:8-22`):**
```typescript
const isProtectedRoute = pathname.startsWith("/batches") ||
                         pathname.startsWith("/batch/") ||
                         (pathname === "/" && !pathname.startsWith("/sign-in") && !pathname.startsWith("/sign-up"));

if (isProtectedRoute) {
  const sessionToken = request.cookies.get("better-auth.session_token");

  if (!sessionToken) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    return NextResponse.redirect(url);
  }
}
```

**Protected Routes:**
- `/batches` and `/batches/*`
- `/batch/*`
- Root path `/` (unless accessing sign-in/sign-up)

**Server-Side Validation (`src/app/(app)/layout.tsx:16-18`):**
```typescript
if (!session) {
  redirect("/sign-in");
}
```

- Double validation: middleware + server component
- Ensures user has valid session before rendering

### Sign-Out Flow

**User Menu Component (`src/components/user-menu.tsx:26-29`):**
```typescript
const handleSignOut = async () => {
  await authClient.signOut();
  router.push("/sign-in");
};
```

- Calls `authClient.signOut()` to clear session
- Redirects to sign-in page
- Session cookie automatically cleared by better-auth

---

## 6. Database Schema for Users

### User Table (`db/schema.ts:17-28`)

```typescript
export const userTable = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  // Username plugin extension
  username: text('username').unique(),
  displayUsername: text('display_username'),
});
```

**Fields:**
- `id`: Primary key, text (nanoid)
- `name`: User's full name (required)
- `email`: Unique email address (required)
- `emailVerified`: Boolean flag (default: false, but set to true by admin script)
- `image`: Profile image URL (optional)
- `createdAt`: Timestamp of user creation
- `updatedAt`: Timestamp of last update
- `username`: Unique username for sign-in (optional, but required for username auth)
- `displayUsername`: Display name variant of username

### Session Table (`db/schema.ts:30-41`)

```typescript
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
```

**Fields:**
- `id`: Primary key
- `userId`: Foreign key to user table (cascade delete)
- `expiresAt`: Session expiration timestamp
- `token`: Unique session token (stored in cookie)
- `ipAddress`: Client IP for security tracking
- `userAgent`: Client browser/device info
- `createdAt`: Session creation time
- `updatedAt`: Last session update time

### Account Table (`db/schema.ts:43-57`)

```typescript
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
```

**Fields:**
- `id`: Primary key
- `userId`: Foreign key to user table (cascade delete)
- `accountId`: Account identifier (email for credentials)
- `providerId`: Auth provider ('credential' for email/password)
- `accessToken`: OAuth access token (null for credentials)
- `refreshToken`: OAuth refresh token (null for credentials)
- `idToken`: OAuth ID token (null for credentials)
- `expiresAt`: Token expiration (null for credentials)
- `password`: Hashed password (only for credential provider)
- `createdAt`: Account creation time
- `updatedAt`: Last account update time

### Verification Table (`db/schema.ts:59-66`)

```typescript
export const verificationTable = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
```

**Purpose:** Email verification tokens (currently unused since verification is disabled)

### Database Connection (`db/index.ts:1-10`)

```typescript
const connectionString = process.env.DATABASE_URL!;
const client = postgres(connectionString);
export const db = drizzle(client, { schema });
```

**Configuration:**
- Uses `postgres-js` driver
- Connection string from `DATABASE_URL` environment variable
- Drizzle ORM instance exported as `db`

---

## 7. API Routes for Authentication

### Catch-All Auth Route: `/home/user/product-pics/src/app/api/auth/[...all]/route.ts`

**Complete Implementation (lines 1-9):**
```typescript
import { auth } from "@/lib/auth";

export async function GET(request: Request) {
  return auth.handler(request);
}

export async function POST(request: Request) {
  return auth.handler(request);
}
```

**How It Works:**

1. **Dynamic Route Matching**
   - Path pattern: `/api/auth/*`
   - Catches all auth-related requests
   - Examples: `/api/auth/sign-in`, `/api/auth/sign-out`, `/api/auth/session`

2. **Request Handling**
   - Both GET and POST methods supported
   - Delegates to `auth.handler()` from better-auth
   - Handler automatically routes to appropriate auth endpoints

3. **Better-Auth Endpoints** (managed internally by better-auth)
   - `POST /api/auth/sign-in/username` - Username/password sign-in
   - `POST /api/auth/sign-out` - Sign out and clear session
   - `GET /api/auth/session` - Get current session
   - Additional endpoints for account management

**Client-Side Usage:**

The `authClient` automatically targets these endpoints:

```typescript
// From src/lib/auth-client.ts
export const authClient = createAuthClient({
  baseURL: typeof window !== "undefined"
    ? window.location.origin
    : process.env.NEXT_PUBLIC_BETTER_AUTH_URL || "http://localhost:3000",
  plugins: [usernameClient()],
});
```

**Base URL Logic:**
- Client-side: Uses current origin (`window.location.origin`)
- Server-side: Falls back to `NEXT_PUBLIC_BETTER_AUTH_URL` or localhost
- All requests automatically prefixed with `/api/auth/`

---

## 8. Client-Side Auth Hooks and Components

### Auth Client Configuration

**File:** `/home/user/product-pics/src/lib/auth-client.ts`

**Implementation (lines 1-9):**
```typescript
"use client";

import { createAuthClient } from "better-auth/react";
import { usernameClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: typeof window !== "undefined"
    ? window.location.origin
    : process.env.NEXT_PUBLIC_BETTER_AUTH_URL || "http://localhost:3000",
  plugins: [usernameClient()],
});
```

**Key Features:**
- Client-only (`"use client"` directive)
- Username plugin for username-based auth
- Dynamic base URL based on environment
- Provides methods: `signIn.username()`, `signOut()`, etc.

### Authentication Components

#### 1. Sign-In Page (`src/app/(auth)/sign-in/page.tsx`)

**Component Type:** Client Component
**Route:** `/sign-in`

**Key Features:**
- Form with username and password inputs (lines 58-79)
- Loading state management (line 17)
- Error display with visual feedback (lines 53-57)
- Uses `authClient.signIn.username()` for authentication (line 25)
- Redirects to `/batches` on success (line 36)

**State Management:**
```typescript
const [username, setUsername] = useState("");
const [password, setPassword] = useState("");
const [error, setError] = useState("");
const [isLoading, setIsLoading] = useState(false);
```

**No Built-in Hooks Used:**
- Does not use `useSession()` hook
- Manually calls `authClient.signIn.username()`
- Manages auth state via form submission

#### 2. User Menu Component (`src/components/user-menu.tsx`)

**Component Type:** Client Component
**Purpose:** Display logged-in user info and sign-out option

**Props Interface (lines 15-21):**
```typescript
interface UserMenuProps {
  user: {
    name: string;
    email: string;
    username?: string | null;
  };
}
```

**Features:**
- Dropdown menu with user avatar (lines 32-42)
- Displays user's name and username/email (lines 44-48)
- Sign-out functionality (lines 26-29)
- Uses `authClient.signOut()` method

**Sign-Out Implementation:**
```typescript
const handleSignOut = async () => {
  await authClient.signOut();
  router.push("/sign-in");
};
```

#### 3. App Layout (Protected Routes) (`src/app/(app)/layout.tsx`)

**Component Type:** Server Component
**Purpose:** Validate session and provide navigation

**Session Validation (lines 12-18):**
```typescript
const session = await auth.api.getSession({
  headers: await headers(),
});

if (!session) {
  redirect("/sign-in");
}
```

**Features:**
- Server-side session check on every render
- Redirects to sign-in if no session
- Passes session user data to `<UserMenu />` (line 38)
- Provides navigation header with branding (lines 22-40)

#### 4. Auth Layout (`src/app/(auth)/layout.tsx`)

**Component Type:** Server Component
**Purpose:** Provide centered layout for auth pages

**Simple Layout (lines 6-12):**
```typescript
return (
  <div className="flex min-h-screen items-center justify-center bg-gray-50">
    <div className="w-full max-w-md px-4">
      {children}
    </div>
  </div>
);
```

**No Authentication Logic:**
- Pure presentation component
- Centers auth forms on screen
- Used for sign-in page

### Available Client Methods

From `authClient` (better-auth/react):

1. **Sign In:**
   - `authClient.signIn.username({ username, password })`
   - Returns: `{ data, error }`

2. **Sign Out:**
   - `authClient.signOut()`
   - Clears session cookie and redirects

3. **Get Session (not used in this app):**
   - `authClient.useSession()` hook available but not implemented
   - App uses server-side session checks instead

---

## 9. Middleware and Route Protection

### Middleware Configuration

**File:** `/home/user/product-pics/src/middleware.ts`

**Route Matcher (lines 27-38):**
```typescript
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};
```

**Protection Logic (lines 4-24):**
```typescript
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check if the request is for a protected route
  const isProtectedRoute = pathname.startsWith("/batches") ||
                           pathname.startsWith("/batch/") ||
                           (pathname === "/" && !pathname.startsWith("/sign-in") && !pathname.startsWith("/sign-up"));

  if (isProtectedRoute) {
    // Check for session cookie
    const sessionToken = request.cookies.get("better-auth.session_token");

    if (!sessionToken) {
      // Redirect to sign-in if no session cookie
      const url = request.nextUrl.clone();
      url.pathname = "/sign-in";
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}
```

**Protected Paths:**
- `/batches` - Batch listing page
- `/batch/*` - Individual batch pages
- `/` - Root redirect (unless accessing auth pages)

**Unprotected Paths:**
- `/sign-in` - Sign-in page
- `/api/*` - API routes (handled separately)
- `/_next/*` - Next.js internal files
- `/favicon.ico` - Favicon

**Cookie Check:**
- Looks for `better-auth.session_token` cookie
- Simple presence check (no validation)
- Full validation done in layout components

**Redirect Behavior:**
- Redirects to `/sign-in` if no session token
- Preserves original URL (could be enhanced to add redirect param)

---

## 10. Environment Variables Required

Based on code analysis:

### Required Environment Variables

1. **`BETTER_AUTH_SECRET`** (used in `src/lib/auth.ts:39`)
   - Purpose: Secret key for signing sessions and tokens
   - Type: String (should be long and random)
   - Example: Generate with `openssl rand -base64 32`

2. **`BETTER_AUTH_URL`** (used in `src/lib/auth.ts:40`)
   - Purpose: Base URL for auth endpoints
   - Type: URL string
   - Example: `http://localhost:3000` (dev) or `https://yourdomain.com` (prod)

3. **`DATABASE_URL`** (used in `db/index.ts:6`)
   - Purpose: PostgreSQL connection string
   - Type: PostgreSQL URI
   - Example: `postgresql://user:password@host:5432/database`

### Optional Environment Variables

4. **`NEXT_PUBLIC_BETTER_AUTH_URL`** (used in `src/lib/auth-client.ts:7`)
   - Purpose: Client-side fallback for auth URL
   - Type: URL string
   - Falls back to `window.location.origin` on client
   - Only needed for SSR or non-standard setups

---

## 11. Key Architectural Patterns

### 1. Server-First Authentication
- Session validation in both middleware and server components
- No client-side session hooks used
- Reduces client bundle size and improves security

### 2. Layered Protection
- **Layer 1:** Middleware cookie check (`middleware.ts:14`)
- **Layer 2:** Server component session validation (`(app)/layout.tsx:12-14`)
- Ensures no unauthorized access to protected pages

### 3. Admin-Only User Management
- Public signup disabled at framework level
- User creation via CLI script only
- Controlled user provisioning

### 4. Username-Based Auth
- Uses better-auth username plugin
- Email stored separately for communication
- Username is primary sign-in credential

### 5. Credential Provider Pattern
- All users use `credential` provider (not OAuth)
- Passwords hashed and stored in account table
- Single authentication method simplifies code

---

## 12. Data Flow Diagrams

### Sign-In Flow

```
1. User submits form
   └─> src/app/(auth)/sign-in/page.tsx:19

2. Call authClient.signIn.username()
   └─> src/lib/auth-client.ts:6

3. POST request to /api/auth/sign-in/username
   └─> Handled by src/app/api/auth/[...all]/route.ts:7

4. Better-auth handler validates credentials
   └─> Checks db via src/lib/auth.ts:7

5. Query account table for password hash
   └─> db/schema.ts:43 (accountTable)

6. If valid, create session
   └─> Insert into db/schema.ts:30 (sessionTable)

7. Set session cookie
   └─> Cookie: better-auth.session_token

8. Return success to client
   └─> Redirect to /batches (sign-in/page.tsx:36)
```

### Session Validation Flow

```
1. User navigates to protected route
   └─> e.g., /batches

2. Middleware checks for cookie
   └─> src/middleware.ts:14

3. If no cookie, redirect to /sign-in
   └─> src/middleware.ts:18-20

4. Layout calls auth.api.getSession()
   └─> src/app/(app)/layout.tsx:12

5. Better-auth validates session token
   └─> Queries sessionTable (db/schema.ts:30)

6. If invalid/expired, redirect to /sign-in
   └─> src/app/(app)/layout.tsx:16-18

7. If valid, render page with user data
   └─> Pass session.user to UserMenu (layout.tsx:38)
```

### Admin User Creation Flow

```
1. Admin runs CLI command
   └─> bun scripts/create-user.ts <args>

2. Check for existing user
   └─> scripts/create-user.ts:22-26

3. Hash password
   └─> scripts/create-user.ts:38 (better-auth/crypto)

4. Insert into userTable
   └─> scripts/create-user.ts:41-50

5. Insert into accountTable with hashed password
   └─> scripts/create-user.ts:55-63

6. Display credentials to admin
   └─> scripts/create-user.ts:66-74
```

---

## 13. Security Features

### Password Security
- Passwords hashed with better-auth's `hashPassword()` function
- Uses industry-standard hashing (bcrypt/argon2)
- Passwords never stored in plaintext
- No password reset functionality (admin must recreate user)

### Session Security
- HTTP-only cookies (managed by better-auth)
- CSRF protection built into better-auth
- IP address and user agent tracking (`sessionTable` lines 37-38)
- 7-day expiration with 1-day rolling update
- Session token is unique and unpredictable

### Email Verification
- Currently disabled (`requireEmailVerification: false`)
- Admin-created users auto-verified (`emailVerified: true`)
- Reduces friction for internal tools

### Username Validation
- Strict regex pattern: `/^[a-zA-Z0-9_.]+$/`
- Length constraints: 3-30 characters
- Prevents injection attacks and special characters
- Enforced at plugin level (`auth.ts:30-32`)

### Route Protection
- Middleware prevents unauthorized access
- Server-side validation prevents bypass
- No client-side only checks

---

## 14. Summary

### Current Authentication State

**Enabled Features:**
- Email/password authentication via username
- Session-based auth with 7-day expiration
- Username plugin for sign-in
- Admin user creation script
- Route protection via middleware + server components
- Sign-out functionality

**Disabled Features:**
- Public signup (requires admin intervention)
- Email verification (admin-created users auto-verified)
- Password reset (must contact admin)
- OAuth providers (only credential provider)

**Tech Stack:**
- better-auth v1.3.34
- Drizzle ORM with PostgreSQL
- Next.js 16 App Router
- Server-first authentication pattern

### File Reference Quick List

**Core Auth Files:**
- `src/lib/auth.ts` - Server-side auth configuration
- `src/lib/auth-client.ts` - Client-side auth SDK
- `src/app/api/auth/[...all]/route.ts` - Auth API handler

**Pages & Layouts:**
- `src/app/(auth)/sign-in/page.tsx` - Sign-in form
- `src/app/(auth)/layout.tsx` - Auth page layout
- `src/app/(app)/layout.tsx` - Protected app layout

**Database:**
- `db/schema.ts` - User, session, account, verification tables
- `db/index.ts` - Database connection

**Security:**
- `src/middleware.ts` - Route protection

**Components:**
- `src/components/user-menu.tsx` - User dropdown with sign-out

**Admin Tools:**
- `scripts/create-user.ts` - CLI user creation script

### Environment Setup Checklist

To run this auth system:

1. Set environment variables:
   - `DATABASE_URL` - PostgreSQL connection string
   - `BETTER_AUTH_SECRET` - Random secret key
   - `BETTER_AUTH_URL` - Application base URL

2. Run database migrations:
   - `bunx drizzle-kit generate`
   - `bunx drizzle-kit migrate`

3. Create initial admin user:
   - `bun scripts/create-user.ts "Admin" admin@example.com password123`

4. Start the application:
   - `bun run dev`

5. Sign in at:
   - `http://localhost:3000/sign-in`

---

## End of Research Report
