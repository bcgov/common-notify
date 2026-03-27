# Notify API - Development Best Practices

This document outlines the development practices and conventions for contributing to the Notify API
project. Following these guidelines ensures consistency, quality, and maintainability across the
codebase.

---

## 1. Commit often

You're in your own branch, it doesn't matter if the code is in a broken state at the end of the day,
just commit your code.

## 2. Demo often

Demos are great to show work in progress, we shouldn't wait until tasks are completed. If there's
something worth demoing, even if a work in progress and not complete, it's still worthy of a demo.

## 3. Code Formatting & Style

### Prettier Configuration

All code must be formatted using **[Prettier](https://prettier.io/)** to maintain consistent code
style across the entire project. Prettier is an opinionated code formatter that handles all
formatting consistently, eliminating style debates.

**Editor Integration (VS Code - Recommended):**

To enable format-on-save, you need the Prettier extension:

1. **Install Prettier Extension:**
   - Open VS Code Extensions
   - Search for "Prettier - Code Formatter" by Prettier

2. **Configure Format-on-Save:**

Already setup, committed to GitHub.

**Current Project Setup:**

The project uses Prettier config at the root level. Configuration includes:

```javascript
// Root prettier configuration (shared by backend and frontend)
module.exports = {
  semi: true, // Use semicolons
  singleQuote: true, // Use single quotes
  trailingComma: 'es5', // Trailing commas for ES5 compatibility
  printWidth: 100, // Line width is 100 characters
  useTabs: false, // Use spaces, not tabs
  tabWidth: 2, // 2 spaces per indent
}
```

**ESLint:**

- **Prettier** for formatting (whitespace, line breaks, indentation)
- **ESLint** for code quality rules (naming, unused variables, imports)

### ESLint Rules

All code must pass ESLint validation.

**Check for issues:**

```bash
npm run lint            # Backend and frontend
npm run lint:fix        # Auto-fix issues where possible
```

**Configuration:**

- Shared ESLint configuration at root: `eslint-base.config.mjs`
- Backend config: `backend/eslint.config.mjs`
- Frontend config: `frontend/eslint.config.mjs`

---

## 4. Naming Conventions

Consistent naming makes code more readable and predictable. Follow these patterns:

### File Names

#### Backend Files

- **Services**: `{feature}.service.ts` (e.g., `users.service.ts`)
- **Controllers**: `{feature}.controller.ts` (e.g., `users.controller.ts`)
- **Modules**: `{feature}.module.ts` (e.g., `users.module.ts`)
- **DTOs**: `{action}-{entity}.dto.ts` (e.g., `create-user.dto.ts`, `update-user.dto.ts`)
- **Middleware**: `{functionality}.ts` with kebab-case (e.g., `req.res.logger.ts`, `prom.ts`)
- **Specs/Tests**: `{file}.spec.ts` (e.g., `users.service.spec.ts`)

#### Frontend Files

- **Components**: `{ComponentName}.tsx` (PascalCase, e.g., `Dashboard.tsx`)
- **Services**: `{feature}-service.ts` (kebab-case, e.g., `api-service.ts`)
- **Interfaces/Types**: `{Entity}.ts` or `{Entity}.interface.ts` (PascalCase, e.g., `UserDto.ts`)
- **Tests**: `__tests__/{ComponentName}.tsx` or `{file}.spec.ts`
- **Routes**: `{name}.tsx` (kebab-case route names become PascalCase files)

### Directory Names

- Use **singular, lowercase names** with hyphens for multi-word directories
- Examples: `users/`, `common/`, `middleware/`, `components/`, `services/`
- Exception: Test directories use `__tests__/` convention

### Variable & Function Names

#### Backend (TypeScript + NestJS)

```typescript
// Classes & interfaces: PascalCase
class UserService { }
interface UserDto { }

// Methods & properties: camelCase
async findUser(userId: number): Promise<UserDto> { }
private validateEmail(email: string): boolean { }

// Constants: SCREAMING_SNAKE_CASE
const MAX_RETRY_ATTEMPTS = 3
const DEFAULT_TIMEOUT_MS = 5000

// Private properties: prefix with underscore
private _cache: Map<string, any>

// NestJS decorators are clear and follow pattern
@Post('/')
@UseGuards(AuthGuard)
async create(@Body() dto: CreateUserDto): Promise<UserDto> { }
```

#### Frontend (React + TypeScript)

```typescript
// Components: PascalCase
function Dashboard() { }
const UserCard = () => <>...</>

// Hooks: camelCase with 'use' prefix
const useUserData = () => { }
const useApiClient = () => { }

// Variables & functions: camelCase
const userName = 'John'
const getUserById = (id: number) => { }

// State/Props: camelCase
const [isLoading, setIsLoading] = useState(false)
const { userData, onUpdate } = props
```

---

## 5. Type Management

### Shared Types

Create exportable, reusable types to avoid duplication across frontend and backend.

**Backend Type Definition:**

```typescript
// backend/src/users/dto/user.dto.ts
export interface UserDto {
  id: number
  name: string
  email: string
  createdAt: Date
}

export interface CreateUserDto {
  name: string
  email: string
}
```

**Frontend Type Definition:**

```typescript
// frontend/src/interfaces/UserDto.ts
export default interface UserDto {
  id: number
  name: string
  email: string
  createdAt: Date
}
```

**Best Practices:**

- Keep DTOs simple and aligned with Swagger/OpenAPI schema
- Use NestJS `PickType` for extending base DTOs:
  ```typescript
  export class CreateUserDto extends PickType(UserDto, ['name', 'email'] as const) {}
  ```
- Export interfaces from dedicated type files for easy discovery
- Document complex types with JSDoc comments
- Use discriminated unions for complex type scenarios

---

## 6. Local Development Workflow

### Setting Up Local Environment

**Prerequisites:**

- Docker and Docker Compose
- Git

**Initial Setup:**

```bash
# Clone repository
git clone https://github.com/bcgov/common-notify.git
cd common-notify

# Install dependencies for both backend and frontend
cd backend && npm install && cd ..
cd frontend && npm install && cd ..

```

### Running the Full Stack Locally

**Using Docker Compose:**

```bash
# From project root
docker-compose up

# Services will be available at:
# Frontend:  http://localhost:3000
# Backend:   http://localhost:3001 (health check)
# API:       http://localhost:3000/api  (proxied through Caddy)
```

### Environment Variables

**Never commit secrets to GitHub.** Always use `.env` files locally and document in `.env.example`.

**Backend .env.example:**

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/notify"

# Logging
LOG_LEVEL=debug

# API Configuration
API_PORT=3001
NODE_ENV=development

# External Services (add when needed)
# NOTIFICATION_SERVICE_URL=
# API_KEY=
```

**Frontend .env.example:**

```env
# Backend API
VITE_API_URL=http://localhost:3001/api

# Feature flags
VITE_FEATURE_NEW_DASHBOARD=false
```

**Before committing:**

1. Update `.env.example` with any new environment variables
2. Do NOT commit actual `.env` files (it's in the .ignore file so you won't be able to commit it
   even if you tried)
3. Communicate new variables to Nickhil so they can be added to Vault
4. Document the purpose of each variable in `.env.example` with comments

---

## 6. Testing Strategy

### Backend Testing

**Unit Tests (Vitest):**

- Write tests for every service method
- At minimum: happy path + error scenarios
- File location: `src/{feature}/{feature}.service.spec.ts`

```bash
npm run test              # Run all unit tests in watch mode
npm run test:cov          # Generate coverage report
```

**Example:**

```typescript
// users.service.spec.ts
describe('UsersService', () => {
  describe('create', () => {
    it('should create a user with valid email', async () => {
      const result = await service.create({
        name: 'John',
        email: 'john@example.com',
      })
      expect(result.id).toBeDefined()
      expect(result.email).toBe('john@example.com')
    })

    it('should throw error for duplicate email', async () => {
      await expect(service.create(dto)).rejects.toThrow()
    })
  })
})
```

**E2E Tests:**

- Test full request/response cycles
- Use Supertest for HTTP assertions
- File location: `test/app.e2e-spec.ts`

```bash
npm run test:e2e          # Run e2e tests
```

### Frontend Testing

**Unit & Component Tests (Vitest):**

- Test component rendering
- Test user interactions and state changes
- File location: `src/components/__tests__/{Component}.tsx` or `__tests__/{Component}.tsx`

```bash
npm run test:unit         # Run unit tests in watch mode
npm run test:cov          # Generate coverage report
```

**E2E Tests (Playwright):**

- Test complete user workflows
- Test cross-browser functionality
- File location: `e2e/**/*.spec.ts`

```bash
npm run test:e2e          # Run Playwright tests (if script exists)
# Or use: npx playwright test
```

**Example E2E Test:**

```typescript
// e2e/dashboard.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Dashboard', () => {
  test('should load and display user data', async ({ page }) => {
    await page.goto('http://localhost:3000')
    await expect(page.locator('h1')).toContainText('Dashboard')
    // Verify data is rendered
  })

  test('should handle API errors gracefully', async ({ page }) => {
    // Mock API error response via MSW or Playwright intercepts
    await expect(page.locator('[role="alert"]')).toContainText('Error')
  })
})
```

**Test Coverage Expectations:**

- Backend services: 80%+ coverage
- Frontend components: 70%+ coverage
- Critical paths: 100% coverage
- Report coverage before PR submission

---

## 7. API Communication

### Frontend to Backend Communication

**Caddy Proxy Setup:** All frontend requests to `/api/*` are automatically proxied to the backend:

```
Frontend request:  GET /api/users
                   ↓ (Caddy reverse proxy)
Backend service:   GET http://backend:3001/users
```

**Using the API Client:**

```typescript
// frontend/src/service/api-service.ts already configured
import apiService from './service/api-service'

// Make requests with automatic /api prefix
const users = await apiService.getAxiosInstance().get('/users')
const created = await apiService.getAxiosInstance().post('/users', userData)

// Handle interceptors (logging, error handling, etc.)
```

### External API Requests

Backend can make requests to external APIs (not through Caddy):

```typescript
// Backend: Direct external API calls
const externalResponse = await axios.get('https://external-api.gov.bc.ca/endpoint', {
  headers: {
    Authorization: `Bearer ${process.env.EXTERNAL_API_KEY}`,
  },
})
```

**Important:** Never expose external API keys in frontend code. Always proxy through backend.

---

## 8. Code Review & Pull Requests

### Before Requesting Review

**Verification Checklist:**

- [ ] All tests pass locally: `npm run test && npm run test:cov`
- [ ] Linting passes: `npm run lint`
- [ ] New environment variables documented in `.env.example`
- [ ] Changes communicated to Nickhil if deployment config needed
- [ ] Documentation updated in wiki if special setup required
- [ ] Verify deployment to dev completes
- [ ] Manual smoketest in dev environment
- [ ] All test pass in Github actions
- [ ] All GitHub actions pass

**PR Description Should Include:**

- What change was made and why
- Which Jira ticket this addresses (if applicable)
- Any breaking changes or migrations needed

### Code Review Process

**Everyone Reviews:**

- Code review is a shared responsibility
- Learn from each other through reviews
- If unsure about something, surface it for discussion

**As a Reviewer:**

- Check for:
  - Naming consistency
  - Type safety
  - Test coverage
  - Security concerns
  - Performance impact
  - Documentation updates
  - Errors in GitHub actions
  - Code quality issues identified in GitHub
  - Vulnerabilities identied in GitHub actions
  - Acceptance criteria pass via a manual test

**Addressing Feedback:**

- Respond to all comments
- Surface concerns/questions rather than forcing changes
- Mark conversations as resolved after addressing
- Request re-review when ready

### Jira Integration (Pending Access)

When configured:

- Branch name should include Jira ticket. Ideally, we should be able to create branches from Jira.
- Link PR to Jira ticket
- Use keywords in PR description: "fixes #TICKET-123"
- Update status on board: Move to "In Review" when requesting review
- Move to "Done" when merged

---

## 9. Documentation

### Wiki Documentation (Shared Responsibility)

Document the following:

**Setup & Environment:**

- How to set up the development environment
- Known issues and workarounds
- Anything of value to other team members

**Architecture Decisions:**

- Why specific technology was chosen
- Trade-offs and alternatives considered
- System design and data flow diagrams

**Special Procedures:**

- Any special configuration needed
- Custom scripts or utilities
- Build or deployment quirks

**API Documentation:**

- Endpoint descriptions (auto-generated from Swagger)
- Authentication requirements
- Rate limiting policies

**How to Update:**

- When you solve a non-obvious problem, document it
- Before starting on something complex, check if there's existing documentation
- Keep docs up-to-date as architecture evolves

### Inline Documentation

**JSDoc/TSDoc Comments:**

```typescript
/**
 * Creates a new user in the system.
 * @param user - The user data transfer object
 * @returns Promise<UserDto> - The created user with ID
 * @throws {BadRequestException} If email is already in use
 */
async create(user: CreateUserDto): Promise<UserDto> {
  // Implementation
}
```

**Why Comments:**

- Complex logic should be explained
- Business rules should be documented
- Gotchas and workarounds need explanation
- API requirements and constraints matter

### API Documentation with Swagger Decorators

All NestJS controllers must document endpoints using `@nestjs/swagger` decorators. Swagger
auto-generates OpenAPI documentation, making it easy for frontend developers and API consumers to
understand expected request/response formats.

**Example: Fully Documented Controller**

```typescript
import { Controller, Get, Post, Body, Param } from '@nestjs/common'
import {
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
  ApiBearerAuth,
  ApiTags,
} from '@nestjs/swagger'
import { UsersService } from './users.service'
import { CreateUserDto } from './dto/create-user.dto'
import { UserDto } from './dto/user.dto'

@ApiTags('Users')
@ApiBearerAuth()
@Controller('/users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new user' })
  @ApiBody({ type: CreateUserDto })
  @ApiResponse({
    status: 201,
    description: 'User created successfully',
    type: UserDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input or email already exists',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - valid JWT token required',
  })
  async create(@Body() createUserDto: CreateUserDto): Promise<UserDto> {
    return this.usersService.create(createUserDto)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID' })
  @ApiParam({ name: 'id', type: 'string', description: 'User UUID' })
  @ApiResponse({
    status: 200,
    description: 'User found',
    type: UserDto,
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  async findOne(@Param('id') id: string): Promise<UserDto> {
    return this.usersService.findOne(id)
  }

  @Get()
  @ApiOperation({ summary: 'List all users' })
  @ApiResponse({
    status: 200,
    description: 'List of users',
    type: [UserDto],
  })
  async findAll(): Promise<UserDto[]> {
    return this.usersService.findAll()
  }
}
```

**Common Decorators:**

| Decorator                                          | Purpose                           | Example                                        |
| -------------------------------------------------- | --------------------------------- | ---------------------------------------------- |
| `@ApiTags('Feature')`                              | Group endpoints by feature        | `@ApiTags('Users', 'Notifications')`           |
| `@ApiOperation({ summary, description })`          | Describe what endpoint does       | `@ApiOperation({ summary: 'Create user' })`    |
| `@ApiParam({ name, type, description })`           | Document path parameters          | `@ApiParam({ name: 'id', type: 'string' })`    |
| `@ApiQuery({ name, type, required, description })` | Document query parameters         | `@ApiQuery({ name: 'limit', type: 'number' })` |
| `@ApiBody({ type })`                               | Document request body             | `@ApiBody({ type: CreateUserDto })`            |
| `@ApiResponse({ status, description, type })`      | Document response for status code | `@ApiResponse({ status: 200, type: UserDto })` |
| `@ApiBearerAuth()`                                 | Mark endpoint as Auth-required    | `@ApiBearerAuth()`                             |
| `@ApiHeader({ name, description })`                | Document custom headers           | `@ApiHeader({ name: 'X-Tenant-ID' })`          |

**DTO Decorators for Type Inference:**

Use `class-validator` and `class-transformer` decorators on DTO properties. Swagger will read these:

```typescript
import { IsEmail, IsString, MinLength, IsOptional } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class CreateUserDto {
  @ApiProperty({
    example: 'john.doe@gov.bc.ca',
    description: 'User email address',
  })
  @IsEmail()
  email: string

  @ApiProperty({
    example: 'John Doe',
    description: 'Display name',
  })
  @IsString()
  @MinLength(1)
  displayName: string

  @ApiProperty({
    example: 'Optional bio',
    description: 'User bio',
    required: false,
  })
  @IsOptional()
  @IsString()
  bio?: string
}
```

**Best Practices:**

- ✅ **Document all public endpoints**: Every controller action should have `@ApiOperation` and
  `@ApiResponse`
- ✅ **Use descriptive summaries**: "Create user" instead of just "POST"
- ✅ **Include all response codes**: 200, 400, 401, 404, 500
- ✅ **Use meaningful descriptions**: Explain what each field is for in DTOs
- ✅ **Tag by feature**: Use `@ApiTags()` to group related endpoints
- ✅ **Document security**: Use `@ApiBearerAuth()` for protected endpoints
- ✅ **Provide examples**: Use `example` property in `@ApiProperty`
- ✅ **Document error scenarios**: Always include 400/401/404 responses

**Access Swagger UI:**

Run the backend and navigate to: `http://localhost:3001/api/docs`

The Swagger UI allows frontend developers to:

- View all endpoints and their descriptions
- Test endpoints with sample data
- Download OpenAPI spec for code generation
- Understand authentication requirements

---

## 10. Git Workflow

### Branching Strategy

**Branch Naming:**

```
feature/TICKET-123-brief-description  # New features
bugfix/TICKET-456-brief-description   # Bug fixes
chore/brief-description               # Dependencies, config changes
docs/brief-description                # Documentation updates
```

### Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) format, adapted for
Jira ticket tracking.

**Format:**

```
[TICKET-123] type(scope): brief summary (50 chars max)

Detailed explanation of changes:
- What changed and why
- Any side effects or breaking changes
- Related tickets or PRs

References: #123, TICKET-456
```

**Type/Scope Pattern (Conventional Commits):**

- `feat(scope)`: A new feature
- `fix(scope)`: A bug fix
- `docs(scope)`: Documentation only changes
- `style(scope)`: Code formatting changes (no functional change)
- `refactor(scope)`: Code refactoring (no functional change)
- `test(scope)`: Adding or updating tests
- `chore(scope)`: Dependency updates, tooling changes
- `perf(scope)`: Performance improvements

**Scope** = area affected (e.g., `users`, `api`, `notifications`, `database`)

**Example:**

```
[NOTIFY-45] feat(users): Add user creation endpoint

- Implement POST /users endpoint with validation
- Add CreateUserDto with email uniqueness check
- Create unit tests for users.service
- Add password hashing before storage

Fixes: NOTIFY-45
```

**Breaking Changes:**

Add `!` before the colon for breaking changes:

```
[NOTIFY-100] feat(api)!: Redesign notification response format

BREAKING CHANGE: The notification response structure has changed.
See migration guide in wiki for updating API clients.
```

### PR Workflow

1. Create feature branch from `main`
2. Make commits with clear messages
3. Verify locally before pushing
4. Push to remote and create PR
5. Add description and link Jira ticket
6. Update PR status on Jira to "In Review"
7. Wait for approvals and address feedback
8. Maintain PR branch (no commits while in review)
9. Squash and merge when approved
10. Delete branch (deleted automatically)

---

## 11. Security Practices

### Secret Management

- **NEVER** commit `.env` files with actual values
- **NEVER** hardcode API keys, passwords, database URLs
- **ALWAYS** use environment variables from OpenShift secrets (ideally Vault)
- **ALWAYS** add to `.env.example` with placeholder values

### Input Validation

```typescript
// Backend: Use NestJS validation decorators
import { IsEmail, IsString, Length } from 'class-validator'

export class CreateUserDto {
  @IsString()
  @Length(1, 255)
  name: string

  @IsEmail()
  email: string
}
```

### Authentication & Authorization

- Implement proper auth guards on protected endpoints (we'll have a jwt guard at least, and likely
  an api key guard, but I need to see how that will work with the api gateway)
- Always validate user permissions before operations

---

## 12. Performance Considerations

### Backend

- Use database indexes for frequently queried fields
- Pagination for large result sets

### Frontend

#### General Optimization

- Monitor performance via browser DevTools

#### Redux State Management

We'll be using Redux for state management, follow these best practices to avoid performance
degradation:

**Selector Memoization:**

```typescript
import { createSelector } from '@reduxjs/toolkit'

// Memoized selector, only re-renders if values actually change
const selectUserData = createSelector(
  (state) => state.users.id,
  (state) => state.users.name,
  (state) => state.users.email,
  (id, name, email) => ({ id, name, email }),
)
```

**Normalized State Shape:**

```typescript
// Flat/normalized structure for efficient updates
const state = {
  entities: {
    users: {
      '1': { id: '1', name: 'John' },
    },
    posts: {
      p1: { id: 'p1', title: 'Post 1', userId: '1' },
      p2: { id: 'p2', title: 'Post 2', userId: '1' },
    },
  },
}
```

**Component Subscription Strategy:**

```typescript
// BAD: Subscribes to entire state, re-renders on any change
const MyComponent = () => {
  const state = useSelector((state) => state)
  // Re-renders even if unrelated state changes
}

// GOOD: Subscribes only to needed data
const MyComponent = () => {
  const userId = useSelector((state) => state.users.currentUser)
  const userData = useSelector((state) => state.entities.users[userId])
  // Only re-renders if userId or userData changes
}
```

**Batch Updates with Redux Toolkit:**

```typescript
// GOOD: Redux Toolkit automatically batches updates
import { createSlice } from '@reduxjs/toolkit'

const userSlice = createSlice({
  name: 'users',
  initialState: { list: [] },
  reducers: {
    updateMultiple: (state, action) => {
      // Multiple mutations are automatically batched
      state.list = action.payload
      state.lastUpdated = new Date()
      state.isLoading = false
    },
  },
})
```

**Redux DevTools in Development:**

```typescript
// Enable Redux DevTools for performance monitoring
import { configureStore } from '@reduxjs/toolkit'

const store = configureStore({
  reducer: {
    users: usersReducer,
    posts: postsReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false, // Disable for non-serializable payloads
    }),
})
```

**Performance Monitoring:**

Use Redux DevTools to:

1. Monitor action dispatch frequency
2. Identify unnecessary state updates
3. Check for large payload sizes
4. Verify selector memoization effectiveness

**Best Practices Summary:**

- Use `createSelector` from Redux Toolkit for all derived state
- Keep state normalized and flat
- Subscribe only to needed slices of state
- Batch multiple updates in single actions
- Use `reselect` or Redux Toolkit selectors for memoization
- Avoid async operations in selectors
- Monitor with Redux DevTools in development

**Avoid:**

- Creating new objects in selectors (without memoization)
- Deeply nested state structures
- Subscribing to entire state tree
- Performing API calls in selectors
- Storing non-serializable data in Redux

---

## 13. Database Migrations with Flyway

Flyway manages database schema evolution reliably and safely. All database changes must go through
Flyway scripts.

### Overview

Flyway provides two types of migration scripts:

- **Versioned Scripts (V prefix)**: One-time migrations that run once and are never modified
  - Examples: CREATE TABLE, CREATE INDEX, ADD COLUMN
  - Cannot be changed once deployed
  - Numbered sequentially: `V1.0.0__initial_schema.sql`, `V1.0.1__add_users_table.sql`

- **Repeatable Scripts (R prefix)**: Re-executable migrations that run every deployment
  - Examples: CREATE OR REPLACE VIEW, CREATE OR REPLACE FUNCTION, PROCEDURES
  - Can be modified and will be re-executed if checksum changes
  - Format: `R__view_name.sql`, `R__function_name.sql`

**Reference:**
[Flyway Naming Conventions](https://flywaydb.org/documentation/concepts/migrations#naming)

### Versioned Script Naming Convention

**Format:** `V{major}.{minor}.{patch}__{description}.sql`

**Examples:**

```
V1.0.0__initial_schema.sql
V1.0.1__add_users_table.sql
V1.0.2__add_email_index_users.sql
V1.1.0__add_role_column_users.sql
V2.0.0__redesign_notifications_table.sql
```

**Version Numbering:**

- **MAJOR**: Breaking schema changes, significant restructuring
- **MINOR**: New tables, new columns, non-breaking additions
- **PATCH**: Fixes, index additions, constraint corrections

### Immutability Rule

**CRITICAL:** Once a versioned script (V-prefixed) is deployed to TEST or PROD, it can **NEVER be
modified**.

**If you need to change something:**

1. Create a **new** versioned migration with the changes
2. Example sequence:
   ```
   V1.0.1__create_users_table.sql       # Deployed - NEVER touch
   V1.0.2__fix_users_email_length.sql   # New migration to fix
   ```

**Why this matters:**

- Different environments have different schema states
- Modifying deployed scripts breaks migration history
- Creates inconsistency between environments
- Makes rollbacks and debugging impossible

### Team Communication Protocol

**When creating Flyway scripts for TEST/DEV:**

1. **Communicate**: Notify the team when you're creating new Flyway scripts
2. **Include**: What changes, which tables, any schema documentation
3. **Coordinate numbering**: If multiple PRs have scripts, coordinate version numbers to avoid
   conflicts
4. **Synchronize before merge**: Ensure version numbers don't conflict with other in-flight
   migrations

**Example Notification:**

```
Creating Flyway migration for PR #123:
- V1.2.0__add_notification_status_column.sql
- Adds 'status' column to notifications table
- Includes NOT NULL constraint with default 'pending'
- Coordinate renumbering if merged after other PRs
```

### Table Audit Columns (Metadata)

Every table must include consistent audit columns to track who created/modified records and when.
Audit tracking supports two scenarios:

1. **Frontend via JWT**: User authenticated with JWT token (user_id extracted from token)
2. **API via API Key**: Service-to-service authenticated with API key

All audit columns are required and must differentiate between user and API key origins for clear
audit trails.

**Standard Audit Column Names:**

```
create_user_id              -- User who created record (NULL if API key creation)
create_timestamp            -- When record was created (DEFAULT now(), NOT NULL)
create_api_key_id           -- API key that created record (NULL if user creation)
update_user_id              -- User who last updated (NULL if API key update)
update_utc_timestamp        -- When record was last updated (NULL until first update)
update_api_key_id           -- API key that last updated (NULL if user update)
```

**Multi-Tenant Support:**

Every table must include `tenant_id` to isolate data across tenants. Combined with tenant_id in
WHERE clauses, this prevents cross-tenant data leaks.

#### Scenario 1: User via Frontend (JWT)

When a user authenticates via JWT token and performs an action:

**UUID Generation:**

- Primary keys must use `UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `gen_random_uuid()` generates cryptographically random v4 UUIDs (no extension required)
- Prisma will automatically handle UUID generation for new records

```sql
-- Template: Record created by authenticated user via frontend
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,

  -- Business columns...

  -- Audit: Creation
  create_user_id UUID NOT NULL,           -- User from JWT token
  create_timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  create_api_key_id UUID,                 -- Always NULL for user creation

  -- Audit: Updates
  update_user_id UUID,                    -- User from JWT token (if updated)
  update_utc_timestamp TIMESTAMP WITH TIME ZONE,
  update_api_key_id UUID,                 -- Always NULL for user updates

  -- Constraints ensure data integrity
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (create_user_id) REFERENCES users(id),
  FOREIGN KEY (update_user_id) REFERENCES users(id),
  CHECK (create_api_key_id IS NULL),     -- User creation = no API key
  CHECK (update_api_key_id IS NULL)      -- User updates = no API key
);
```

**Backend (NestJS + Prisma) Implementation:**

```typescript
// Extract user_id from JWT in request interceptor or guard
@Post('/notifications')
@UseGuards(AuthGuard('jwt'))
async create(
  @Body() dto: CreateNotificationDto,
  @Request() req: any, // req.user contains decoded JWT
  @Query('tenant_id') tenantId: string   // UUID string
): Promise<NotificationDto> {
  return await this.prisma.notifications.create({
    data: {
      tenant_id: tenantId,                // UUID
      message: dto.message,
      create_user_id: req.user.id,        // From JWT (UUID)
      create_timestamp: new Date(),
      create_api_key_id: null,            // Explicitly NULL
    },
  });
}

// Update example
async update(
  notificationId: string,                 // UUID string
  tenantId: string,                       // UUID string
  dto: UpdateNotificationDto,
  userId: string                          // UUID string
): Promise<NotificationDto> {
  return await this.prisma.notifications.update({
    where: {
      id_tenant_id: { id: notificationId, tenant_id: tenantId }
    },
    data: {
      message: dto.message,
      update_user_id: userId,             // From JWT (UUID)
      update_utc_timestamp: new Date(),
      update_api_key_id: null,            // Explicitly NULL
    },
  });
}
```

#### Scenario 2: API via API Key

When external service uses API key for authentication:

```sql
-- Template: Record created by API key
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,

  -- Business columns
  message TEXT NOT NULL,

  -- Audit: Creation
  create_user_id UUID,                    -- Always NULL for API creation
  create_timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  create_api_key_id UUID NOT NULL,        -- API key that created

  -- Audit: Updates
  update_user_id UUID,                    -- Always NULL for API updates
  update_utc_timestamp TIMESTAMP WITH TIME ZONE,
  update_api_key_id UUID,                 -- API key that last updated (if updated)

  -- Constraints ensure data integrity
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (create_api_key_id) REFERENCES api_keys(id),
  FOREIGN KEY (update_api_key_id) REFERENCES api_keys(id),
  CHECK (create_user_id IS NULL),        -- API creation = no user
  CHECK (update_user_id IS NULL)         -- API updates = no user
);
```

**Backend (NestJS + Prisma) Implementation:**

```typescript
// Extract API key from Authorization header
@Post('/notifications')
@UseGuards(ApiKeyGuard)  // Custom guard validates API key
async create(
  @Body() dto: CreateNotificationDto,
  @Request() req: any, // req.apiKeyId set by ApiKeyGuard
  @Query('tenant_id') tenantId: string   // UUID string
): Promise<NotificationDto> {
  return await this.prisma.notifications.create({
    data: {
      tenant_id: tenantId,                // UUID
      message: dto.message,
      create_user_id: null,               // Explicitly NULL
      create_timestamp: new Date(),
      create_api_key_id: req.apiKeyId,    // From API key validation (UUID)
    },
  });
}

// Update example
async updateViaApi(
  notificationId: string,                 // UUID string
  tenantId: string,                       // UUID string
  dto: UpdateNotificationDto,
  apiKeyId: string                        // UUID string
): Promise<NotificationDto> {
  return await this.prisma.notifications.update({
    where: {
      id_tenant_id: { id: notificationId, tenant_id: tenantId }
    },
    data: {
      message: dto.message,
      update_user_id: null,               // Explicitly NULL
      update_utc_timestamp: new Date(),
      update_api_key_id: apiKeyId,        // From API key validation (UUID)
    },
  });
}
```

#### Querying Audit Information

**Query: Who created/updated this record?**

```sql
SELECT
  r.id,
  r.message,
  -- Created by user
  u1.name as created_by_user,
  u1.email as created_by_email,
  -- Created by API key
  ak1.name as created_by_api_key,
  ak1.client_id as created_by_client,
  r.create_timestamp,
  -- Updated by user
  u2.name as updated_by_user,
  -- Updated by API key
  ak2.name as updated_by_api_key,
  r.update_utc_timestamp
FROM notifications r
LEFT JOIN users u1 ON r.create_user_id = u1.id
LEFT JOIN api_keys ak1 ON r.create_api_key_id = ak1.id
LEFT JOIN users u2 ON r.update_user_id = u2.id
LEFT JOIN api_keys ak2 ON r.update_api_key_id = ak2.id
WHERE r.id = '550e8400-e29b-41d4-a716-446655440000'::uuid
  AND r.tenant_id = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'::uuid;
```

**Query: All changes made by specific user**

```sql
SELECT r.id, r.message, r.create_timestamp, r.update_utc_timestamp
FROM notifications r
WHERE r.tenant_id = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'::uuid
  AND (r.create_user_id = '550e8400-e29b-41d4-a716-446655440001'::uuid
       OR r.update_user_id = '550e8400-e29b-41d4-a716-446655440001'::uuid)
ORDER BY r.update_utc_timestamp DESC NULLS LAST;
```

**Query: All changes made via specific API key**

```sql
SELECT r.id, r.message, r.create_timestamp, r.update_utc_timestamp
FROM notifications r
WHERE r.tenant_id = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'::uuid
  AND (r.create_api_key_id = '650e8400-e29b-41d4-a716-446655440000'::uuid
       OR r.update_api_key_id = '650e8400-e29b-41d4-a716-446655440000'::uuid)
ORDER BY r.update_utc_timestamp DESC NULLS LAST;
```

**Audit Column Standards:**

| Column                 | Type              | Nullable             | Notes                                        |
| ---------------------- | ----------------- | -------------------- | -------------------------------------------- |
| `create_user_id`       | UUID              | Only if API created  | Set at creation; never changes               |
| `create_timestamp`     | TIMESTAMP WITH TZ | No                   | Always required; defaults to `now()`         |
| `create_api_key_id`    | UUID              | Only if user created | Set at creation; never changes               |
| `update_user_id`       | UUID              | Yes                  | Set on updates by users only                 |
| `update_utc_timestamp` | TIMESTAMP WITH TZ | Yes                  | Set on every update; NULL until first update |
| `update_api_key_id`    | UUID              | Yes                  | Set on updates by API keys only              |
| `tenant_id`            | UUID              | No                   | Foreign key to tenants; isolation required   |

### Timestamp Standards

Always use **TIMESTAMP WITH TIME ZONE** (or `timestamptz`) for all timestamps:

```sql
-- ✅ CORRECT
created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
updated_at TIMESTAMP WITH TIME ZONE

-- ❌ WRONG - loses timezone info
created_at TIMESTAMP NOT NULL
created_at DATE                           -- date-only, no time
```

**Why timezone is critical:**

- BC Government spans multiple time zones
- Audit trails must reflect exact moment in standard time (UTC)
- Prevents ambiguity during daylight savings transitions
- Essential for compliance and security logs

**Querying with timezone awareness:**

```sql
-- Convert to specific timezone for display
SELECT
  id,
  created_at AT TIME ZONE 'America/Vancouver' as local_created_at
FROM users
ORDER BY created_at DESC
```

### Commenting Tables and Columns

**All tables and columns must have comments** explaining their purpose. This improves documentation
and is essential for team knowledge transfer.

**Add comments in migration:**

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  create_user_id UUID NOT NULL,
  create_timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Table-level comment
COMMENT ON TABLE users IS
  'System users for authentication and authorization.
   Stores user profile information.';

-- Column-level comments
COMMENT ON COLUMN users.id IS 'Unique identifier (UUID v4, auto-generated)';
COMMENT ON COLUMN users.tenant_id IS 'Owning tenant (required for multi-tenancy)';
COMMENT ON COLUMN users.email IS 'User email for login (must be unique)';
COMMENT ON COLUMN users.name IS 'Display name (optional)';
COMMENT ON COLUMN users.create_user_id IS 'User who created this record (UUID)';
COMMENT ON COLUMN users.create_timestamp IS 'UTC timestamp when user record was created';
```

**Update comments in future migrations:**

```sql
-- Add comment to existing column
COMMENT ON COLUMN users.name IS 'Display name (required for new users)';

-- Add comment to new column
ALTER TABLE users ADD COLUMN phone_number VARCHAR(20);
COMMENT ON COLUMN users.phone_number IS 'Optional contact phone number (E.164 format)';

-- Add comment to new UUID column
ALTER TABLE users ADD COLUMN manager_id UUID;
COMMENT ON COLUMN users.manager_id IS 'UUID reference to user supervisor (optional)';
```

### Repeatable Script Pattern

For views, functions, and procedures that evolve over time:

**Naming:** `R__{type}_{name}.sql`

**Examples:**

```
R__view_active_users.sql
R__function_notify_users.sql
R__procedure_archive_old_records.sql
```

**Template:**

```sql
-- Repeatable script - safe to modify and re-run
CREATE OR REPLACE VIEW active_users AS
SELECT
  id,
  tenant_id,
  name,
  email,
  create_timestamp
FROM users
WHERE deleted_at IS NULL
ORDER BY create_timestamp DESC;

COMMENT ON VIEW active_users IS
  'View of non-deleted users for reporting and queries';
```

### Migration Best Practices

**1. Keep scripts focused**

- One logical change per script
- Don't mix table creation with index creation in separate concerns
- Exception: indexes created in same script as table creation are acceptable

**2. Test locally first**

```bash
# Test Flyway migration before committing
# Ensure Postgres is running locally via docker-compose
npm run prisma-generate  # Update Prisma client
```

## 14. Deployment Readiness

### Pre-Deployment Checklist

- [ ] All tests passing with good coverage
- [ ] Code review completed and approved
- [ ] Documentation updated
- [ ] Database migrations tested on TEST environment
- [ ] Environment variables configured in OpenShift
- [ ] No secrets committed to repository
- [ ] Version bumped appropriately (if applicable)
- [ ] Performance impact assessed
- [ ] Security review completed if needed

### Deployment Process

1. Merge PR to `main`
2. GitHub Actions triggers deployment pipeline
3. Build docker images and run tests
4. Deploy to DEV automatically
5. Deploy to TEST (manual trigger or auto)
6. TEST environment verification
7. Deploy to PROD (manual approval required)

---

## Questions & Clarifications

When in doubt:

1. Check existing code for patterns
2. Ask in team chat or PR comments
3. Pair with team member for complex decisions
4. Document the decision for future reference

This is a shared journey—we learn together and improve as a team!
