import { BadRequestException, Injectable } from '@nestjs/common'
import type { TenantRequestHandler } from './tenant-request-handler'

/**
 * The handler for each type of tenant request. A feature module registers its handler when it
 * starts (onModuleInit), so the workflow needs no import of the features that use it.
 */
@Injectable()
export class TenantRequestHandlerRegistry {
  private readonly handlers = new Map<string, TenantRequestHandler>()

  register(handler: TenantRequestHandler): void {
    this.handlers.set(handler.type, handler)
  }

  /** The handler for a type. An unknown type is the caller's mistake, so a 400. */
  get(type: string): TenantRequestHandler {
    const handler = this.handlers.get(type)
    if (!handler) throw new BadRequestException(`Unknown request type ${type}`)
    return handler
  }

  /** The handler for a type, if one is registered. */
  find(type: string): TenantRequestHandler | undefined {
    return this.handlers.get(type)
  }

  all(): TenantRequestHandler[] {
    return [...this.handlers.values()]
  }
}
