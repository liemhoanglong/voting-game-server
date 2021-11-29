/* eslint-disable @typescript-eslint/no-unsafe-call */
import Redis from 'ioredis';
import { RedisPubSub } from 'graphql-redis-subscriptions';

export const pubsub = new RedisPubSub({
  publisher: new Redis(process.env.REDIS_PUBSUB_URL),
  subscriber: new Redis(process.env.REDIS_PUBSUB_URL),
});
