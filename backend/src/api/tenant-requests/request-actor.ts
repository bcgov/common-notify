import type { Request } from 'express'
import { JwtUserExtractor } from '../../common/utils/jwt-user-extractor'
import type { RequestActor } from './tenant-request-codes'

/** Who is making a change, from the request's token. */
export const actorOf = (req: Request): RequestActor => ({
  id: JwtUserExtractor.extractUser(req),
  name: JwtUserExtractor.extractDisplayName(req),
})
