import { redisKey } from '../common/redis/redis-namespace'

/** CHES email requests in flight across all pods (RedisConcurrencyLimiter). */
export const CHES_IN_FLIGHT_KEY = redisKey('ches:in-flight')
/** The circuit breaker in front of CHES (RedisCircuitBreaker); read by admin monitoring. */
export const CHES_CIRCUIT_KEY = redisKey('ches:circuit')
/** The circuit breaker in front of the SMS provider; read by admin monitoring. */
export const SMS_CIRCUIT_KEY = redisKey('sms:circuit')
