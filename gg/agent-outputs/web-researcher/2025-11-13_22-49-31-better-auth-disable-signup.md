# Better Auth: Disabling Public Signup While Keeping Authentication Enabled

## Summary

Better Auth provides multiple ways to disable public signup/registration while keeping email/password authentication enabled for existing users. The primary method is using the `disableSignUp` configuration option in the `emailAndPassword` settings. Additionally, you can use hooks, disable specific endpoints, and configure social providers separately.

---

## Detailed Findings

### 1. Primary Method: `emailAndPassword.disableSignUp`

**Source**: [Options Reference | Better Auth](https://www.better-auth.com/docs/reference/options)

The official and recommended way to disable email/password signup is through the `emailAndPassword.disableSignUp` configuration option.

#### Configuration

```typescript
import { betterAuth } from "better-auth";

export const auth = betterAuth({
  emailAndPassword: {
    enabled: true,           // Enable email/password authentication
    disableSignUp: true,     // Disable new user registration
    // ... other options
  },
});
```

#### Property Details

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `enabled` | `boolean` | `false` | Enable email and password authentication |
| `disableSignUp` | `boolean` | `false` | Disable email and password sign up |
| `requireEmailVerification` | `boolean` | `false` | Require email verification before a session can be created |
| `minPasswordLength` | `number` | `8` | Minimum password length |
| `maxPasswordLength` | `number` | `128` | Maximum password length |
| `autoSignIn` | `boolean` | `true` | Automatically sign in the user after sign up |

#### Key Points

- When `disableSignUp: true`, the `/sign-up/email` endpoint will reject new registration attempts
- Existing users can still sign in using `/sign-in/email` endpoint
- This setting only affects email/password signup, not social providers (configured separately)
- **This feature was added in response to [Issue #1142](https://github.com/better-auth/better-auth/issues/1142)**

---

### 2. Alternative Method: Using Hooks

**Source**: [Hooks | Better Auth](https://www.better-auth.com/docs/concepts/hooks)

For more granular control or dynamic signup blocking, you can use before hooks to intercept and block signup requests.

#### Using Before Hooks

```typescript
import { betterAuth } from "better-auth";
import { createAuthMiddleware, APIError } from "better-auth/api";

export const auth = betterAuth({
  emailAndPassword: {
    enabled: true,
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      // Block all signup attempts
      if (ctx.path === "/sign-up/email") {
        throw new APIError("BAD_REQUEST", {
          message: "Registration is currently disabled",
        });
      }
    }),
  },
});
```

#### Dynamic Signup Control

**Source**: [GitHub Issue #1142 Comment](https://github.com/better-auth/better-auth/issues/1142#issuecomment-2691292915)

```typescript
import { betterAuth } from "better-auth";
import { createAuthMiddleware, APIError } from "better-auth/api";

export const auth = betterAuth({
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      // Dynamically check if registrations are allowed
      const allowRegistrations = await getAllowRegistration(); // Your custom function

      if (ctx.path === "/sign-up/email" && !allowRegistrations) {
        throw new APIError("BAD_REQUEST", {
          message: "Registration is currently not allowed",
        });
      }
    }),
  },
});
```

#### Advanced: Email Domain Restriction

**Source**: [Hooks Documentation](https://www.better-auth.com/docs/concepts/hooks#example-enforce-email-domain-restriction)

```typescript
export const auth = betterAuth({
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/sign-up/email") {
        if (!ctx.body?.email.endsWith("@example.com")) {
          throw new APIError("BAD_REQUEST", {
            message: "Email must end with @example.com",
          });
        }
      }
    }),
  },
});
```

---

### 3. Using `disabledPaths` Option

**Source**: [Options Reference](https://www.better-auth.com/docs/reference/options#disabledpaths)

You can completely disable specific authentication endpoints using the `disabledPaths` option.

```typescript
import { betterAuth } from "better-auth";

export const auth = betterAuth({
  emailAndPassword: {
    enabled: true,
  },
  disabledPaths: ["/sign-up/email"],
});
```

**Note**: This completely removes the endpoint from the API. Use `disableSignUp` instead if you want better error messages.

---

### 4. Admin-Only User Creation

**Source**: [Admin Plugin Documentation](https://www.better-auth.com/docs/plugins/admin)

When public signup is disabled, admins can still create users programmatically using the Admin plugin.

#### Server-Side Configuration

```typescript
import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";

export const auth = betterAuth({
  emailAndPassword: {
    enabled: true,
    disableSignUp: true, // Disable public signup
  },
  plugins: [
    admin({
      defaultRole: "user",
    }),
  ],
});
```

#### Creating Users as Admin (Server-Side)

```typescript
// Server-side code
const newUser = await auth.api.createUser({
  body: {
    email: "user@example.com",
    password: "secure-password",
    name: "John Doe",
    role: "user",
    data: {
      customField: "customValue"
    },
  },
});
```

#### Creating Users as Admin (Client-Side)

```typescript
import { createAuthClient } from "better-auth/client";
import { adminClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [
    adminClient(),
  ],
});

// In your component/page (must be authenticated as admin)
const { data: newUser, error } = await authClient.admin.createUser({
  email: "user@example.com",
  password: "secure-password",
  name: "John Doe",
  role: "user",
  data: { customField: "customValue" },
});
```

#### Admin Authorization

Admins are identified by:
1. Users with the `admin` role in the database
2. User IDs listed in the `adminUserIds` configuration option

```typescript
admin({
  adminUserIds: ["user_id_1", "user_id_2"], // These users are always admins
  defaultRole: "user", // New users created by admins get this role by default
})
```

---

### 5. Disabling Social Provider Signup

**Source**: [OAuth Documentation](https://www.better-auth.com/docs/concepts/oauth), [GitHub Issue #1142](https://github.com/better-auth/better-auth/issues/1142)

Social providers (Google, GitHub, etc.) have separate configuration options to disable signup.

#### Option 1: `disableSignUp` (Per Provider)

```typescript
import { betterAuth } from "better-auth";

export const auth = betterAuth({
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
      disableSignUp: true, // Only allow existing users to sign in
    },
    github: {
      clientId: process.env.GITHUB_CLIENT_ID as string,
      clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
      disableSignUp: true,
    },
  },
});
```

#### Option 2: `disableImplicitSignUp` (More Flexible)

**Source**: [GitHub Issue Comment](https://github.com/better-auth/better-auth/issues/1142#issuecomment-3166045135)

```typescript
export const auth = betterAuth({
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
      disableImplicitSignUp: true, // Disable automatic signup
    },
  },
});
```

When `disableImplicitSignUp: true`, you need to explicitly request signup on the client:

```typescript
// Sign in (existing users only)
await authClient.signIn.social({
  provider: "google",
  callbackURL: "/dashboard",
});

// Sign up (create new user)
await authClient.signIn.social({
  provider: "google",
  callbackURL: "/dashboard",
  requestSignUp: true, // Explicitly allow signup
});
```

This gives you programmatic control over when signup is allowed.

---

### 6. Disabling Social Signup with Hooks

**Source**: [GitHub Issue #1142 Comment](https://github.com/better-auth/better-auth/issues/1142#issuecomment-2691326523)

For dynamic control over social provider signup:

```typescript
import { betterAuth } from "better-auth";
import { createAuthMiddleware, APIError } from "better-auth/api";

export const auth = betterAuth({
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/callback/:id") {
        const allowRegistrations = await getAllowRegistration();

        if (!allowRegistrations) {
          // Check if user exists, if not, block signup
          // Note: You'll need to implement user existence check
          throw new APIError("BAD_REQUEST", {
            message: "Registration is currently not allowed",
          });
        }
      }
    }),
  },
});
```

**Note**: With social providers in the callback, you don't have direct access to user information in the `ctx` object, making this approach more complex. The `disableSignUp` or `disableImplicitSignUp` options are recommended instead.

---

## Best Practices

### 1. Use Official Configuration Options

**Recommended Approach:**
```typescript
export const auth = betterAuth({
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
      disableSignUp: true,
    },
  },
  plugins: [
    admin({
      adminUserIds: [process.env.ADMIN_USER_ID as string],
    }),
  ],
});
```

This approach:
- Uses official configuration options
- Provides clear error messages to users
- Works consistently across different authentication methods
- Allows admins to create users via the Admin plugin

### 2. Security Considerations

**Important**: Even with signup disabled, consider these security measures:

1. **Rate Limiting**: Prevent brute force attempts on sign-in endpoints
   ```typescript
   rateLimit: {
     enabled: true,
     window: 10, // seconds
     max: 5, // max requests per window
   }
   ```

2. **Email Verification**: Require email verification for added security
   ```typescript
   emailAndPassword: {
     enabled: true,
     disableSignUp: true,
     requireEmailVerification: true,
   }
   ```

3. **Strong Passwords**: Enforce password requirements
   ```typescript
   emailAndPassword: {
     enabled: true,
     disableSignUp: true,
     minPasswordLength: 12,
     maxPasswordLength: 128,
   }
   ```

### 3. Provide Clear User Feedback

When signup is disabled, ensure your UI:
- Removes or disables signup buttons/forms
- Displays clear messaging about registration being closed
- Provides contact information for users who need accounts

### 4. Admin User Creation Workflow

When public signup is disabled, implement an admin workflow:

1. **Admin Dashboard**: Create a protected admin page for user management
2. **User Creation Form**: Build a form that calls `authClient.admin.createUser()`
3. **Email Notification**: Send welcome emails to newly created users with temporary passwords or password reset links
4. **Password Reset Flow**: Ensure users can reset their passwords using the built-in reset password functionality

Example admin user creation workflow:

```typescript
// Admin page component
async function createNewUser(email: string, name: string) {
  // Generate a temporary password
  const tempPassword = generateSecurePassword();

  // Create user
  const { data: user, error } = await authClient.admin.createUser({
    email,
    name,
    password: tempPassword,
    role: "user",
  });

  if (error) {
    console.error("Failed to create user:", error);
    return;
  }

  // Send welcome email with password reset link
  await sendWelcomeEmail({
    to: email,
    resetPasswordUrl: `${baseUrl}/reset-password`,
  });
}
```

---

## Common Patterns and Examples

### Pattern 1: Invite-Only Registration

**Source**: [GitHub Discussion](https://www.answeroverflow.com/m/1354120448371196047)

Disable public signup and use invitation codes:

```typescript
export const auth = betterAuth({
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/sign-up/email") {
        const inviteCode = ctx.body?.inviteCode;

        // Validate invite code
        const isValidInvite = await validateInviteCode(inviteCode);

        if (!isValidInvite) {
          throw new APIError("UNAUTHORIZED", {
            message: "Valid invitation code required",
          });
        }
      }
    }),
  },
});
```

### Pattern 2: Waitlist-Based Registration

Toggle signup based on waitlist status:

```typescript
export const auth = betterAuth({
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/sign-up/email") {
        const email = ctx.body?.email;

        // Check if user is on approved waitlist
        const isApproved = await checkWaitlistStatus(email);

        if (!isApproved) {
          throw new APIError("FORBIDDEN", {
            message: "Please join our waitlist first",
          });
        }
      }
    }),
  },
});
```

### Pattern 3: Time-Based Registration Windows

Enable/disable signup during specific time periods:

```typescript
export const auth = betterAuth({
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/sign-up/email") {
        const now = new Date();
        const registrationStart = new Date("2025-01-01");
        const registrationEnd = new Date("2025-01-31");

        if (now < registrationStart || now > registrationEnd) {
          throw new APIError("FORBIDDEN", {
            message: "Registration is only open from Jan 1-31, 2025",
          });
        }
      }
    }),
  },
});
```

---

## Additional Configuration Options

### Related Options from `emailAndPassword` Config

```typescript
emailAndPassword: {
  enabled: boolean;                    // Enable email/password auth (default: false)
  disableSignUp: boolean;              // Disable signup (default: false)
  requireEmailVerification: boolean;   // Require email verification (default: false)
  minPasswordLength: number;           // Min password length (default: 8)
  maxPasswordLength: number;           // Max password length (default: 128)
  autoSignIn: boolean;                 // Auto sign in after signup (default: true)
  sendResetPassword: async (data) => void;  // Password reset email sender
  resetPasswordTokenExpiresIn: number; // Reset token expiry in seconds (default: 3600)
}
```

### Email Verification Options

```typescript
emailVerification: {
  sendVerificationEmail: async ({ user, url, token }) => {
    // Send verification email
  },
  sendOnSignUp: boolean;               // Send on signup (default: false)
  sendOnSignIn: boolean;               // Send on signin (default: false)
  autoSignInAfterVerification: boolean; // Auto signin after verify (default: false)
  expiresIn: number;                   // Token expiry in seconds (default: 3600)
}
```

---

## Gaps or Limitations

### 1. Social Provider Callback Access

**Issue**: When using hooks to control social provider signup, you cannot directly access user information (email, profile data) in the `/callback/:id` endpoint context.

**Workaround**: Use the `disableSignUp` or `disableImplicitSignUp` provider options instead of hooks for social providers.

### 2. OAuth Providers Always Create Sessions

Even with `disableSignUp: true`, if a user somehow gets past the check, OAuth providers may create a session. This is by design in OAuth flows.

**Recommendation**: Use `disableImplicitSignUp` for more explicit control.

### 3. Dynamic Configuration

The `disableSignUp` option is static at server initialization. To dynamically enable/disable signup:
- Use hooks with database/cache-based feature flags
- Implement custom middleware
- Use environment variables with server restarts

---

## Official Documentation References

1. **Options Reference**: https://www.better-auth.com/docs/reference/options
   - Complete list of all configuration options

2. **Email & Password Authentication**: https://www.better-auth.com/docs/authentication/email-password
   - Detailed guide on email/password authentication

3. **Admin Plugin**: https://www.better-auth.com/docs/plugins/admin
   - Admin functionality including user creation

4. **Hooks**: https://www.better-auth.com/docs/concepts/hooks
   - Request lifecycle hooks for custom logic

5. **OAuth**: https://www.better-auth.com/docs/concepts/oauth
   - Social provider configuration

6. **GitHub Issue #1142**: https://github.com/better-auth/better-auth/issues/1142
   - Original feature request and community discussion

---

## Quick Reference: Configuration Comparison

| Method | Use Case | Pros | Cons |
|--------|----------|------|------|
| `emailAndPassword.disableSignUp: true` | Disable email/password signup | Official, clean, clear errors | Static configuration |
| `hooks` with `APIError` | Dynamic signup control | Flexible, conditional logic | More complex, requires maintenance |
| `disabledPaths: ["/sign-up/email"]` | Completely remove endpoint | Simple | No custom error messages |
| `socialProviders.*.disableSignUp` | Disable social signup | Official, per-provider | Static configuration |
| `socialProviders.*.disableImplicitSignUp` | Explicit signup control | Client-side control | Requires client-side changes |

---

## Conclusion

Better Auth provides robust options for disabling public signup while maintaining authentication for existing users. The recommended approach is:

1. **For email/password**: Use `emailAndPassword.disableSignUp: true`
2. **For social providers**: Use `disableSignUp: true` per provider
3. **For admin user creation**: Use the Admin plugin's `createUser` function
4. **For dynamic control**: Implement hooks with feature flags/database checks

This configuration ensures a secure, maintainable authentication system with admin-controlled user creation.
