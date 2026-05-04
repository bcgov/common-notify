# JWT User Extraction

## Overview

The `JwtUserExtractor` utility provides a centralized way to extract user identity information from incoming requests. This is essential for audit trails, activity logging, and tracking which user initiated actions in the system.

**Location:** `src/common/utils/jwt-user-extractor.ts`

## Extraction Order

The utility checks multiple sources in priority order:

1. **Kong Consumer Header** (`x-consumer-username`)
   - Added by the API Gateway after authentication
   - Highest priority
   - Used for service-to-service requests

2. **JWT Token Claims** (from Authorization header)
   - Extracted from Bearer token payload
   - Checked in order: `preferred_username` → `email` → `name` → `sub`
   - Standard Keycloak claims

3. **Fallback** → `'system'`
   - Used when no other source provides a user identifier
   - Indicates the action was not user-initiated

## Usage

### Basic Usage in Controllers

```typescript
import { JwtUserExtractor } from '../../common/utils/jwt-user-extractor'

@Post()
async createTemplate(
  @Body() createTemplateDto: CreateTemplateDto,
  @Req() req?: express.Request,
): Promise<TemplateResponseDto> {
  const user = JwtUserExtractor.extractUser(req)
  return this.templatesService.createTemplate(tenantId, createTemplateDto, user)
}
```

### Without Request Object

```typescript
// Defaults to 'system' if no request provided
const user = JwtUserExtractor.extractUser()
```

## Error Handling

The utility logs all exceptions for debugging and monitoring:

- **Invalid JWT Format** - Token doesn't have 3 parts (header.payload.signature)
- **Parse Failures** - JSON parsing errors in token payload
- **Missing Claims** - Token has no recognizable user identifier claims

All errors are logged but don't throw—the function gracefully falls back to `'system'`.

## Why Not Silent Failures?

Always log exceptions because:
- **Debugging** - Understand why user extraction failed
- **Monitoring** - Detect token format or configuration issues
- **Security** - Identify potential token tampering or corruption
- **Audit** - Track when and why user context couldn't be determined

## When to Use

Use `JwtUserExtractor.extractUser()` whenever you need to:
- Track which user triggered an action (for audit logs)
- Record user context in database records (e.g., `created_by`, `updated_by`)
- Log user activity for compliance or troubleshooting
- Pass user context to services that need it

## Testing

```typescript
describe('JwtUserExtractor', () => {
  it('should extract user from Kong header', () => {
    const mockReq = {
      headers: { 'x-consumer-username': 'john.doe' }
    } as any
    
    expect(JwtUserExtractor.extractUser(mockReq)).toBe('john.doe')
  })

  it('should extract user from JWT preferred_username claim', () => {
    const token = createMockJwt({ preferred_username: 'jane.smith' })
    const mockReq = {
      headers: { authorization: `Bearer ${token}` }
    } as any
    
    expect(JwtUserExtractor.extractUser(mockReq)).toBe('jane.smith')
  })

  it('should return system when no user found', () => {
    expect(JwtUserExtractor.extractUser()).toBe('system')
  })
})
```

## Future Considerations

- Consider adding support for additional identity sources (e.g., API keys)
- Could be extended to extract additional user metadata (roles, permissions)
- Potential caching layer if token parsing becomes a bottleneck
