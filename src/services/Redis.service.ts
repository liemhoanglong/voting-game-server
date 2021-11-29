import Redis = require('redis');

const { promisify } = require('util');

const redisClient = Redis.createClient({
  url: process.env.REDIS_URL,
});

export const getAsync = promisify(redisClient.get).bind(redisClient);

export const ttlAsync = promisify(redisClient.ttl).bind(redisClient);

export const setEx = (key: string, expiredTime: number, value: any) => redisClient.setex(key, expiredTime, value);

export const set = (key: string, value: any) => redisClient.set(key, value);

export const delItem = (key: string) => redisClient.del(key);

export const hdelItem = (key: string, field: string) => redisClient.hdel(key, field);

export const hgetAsync = promisify(redisClient.hget).bind(redisClient);

export const hvalsAsync = promisify(redisClient.hvals).bind(redisClient);

export const hgetallAsync = promisify(redisClient.hgetall).bind(redisClient);

export const hkeysAsync = promisify(redisClient.hkeys).bind(redisClient);

export const getKeysAsync = promisify(redisClient.keys).bind(redisClient);

export const hset = (key: string, field: string, value: any) => redisClient.hset(key, field, value);

export const hdel = (key: string, field: string) => redisClient.hdel(key, field);

// !Redis 4.0.0, HMSET is considered deprecated. Please prefer HSET in new code.
// export const hmset = (key: string, value: any) => redisClient.hmset(key, value);

export const hsetEx = (key: string, expiredTime: number) => redisClient.expire(key, expiredTime);
