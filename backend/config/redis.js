const { createClient } = require("redis");

let client;
let connectionPromise;
let unavailableLogged = false;

const getRedisClient = async () => {
    if (!process.env.REDIS_URL) return null;
    if (!client) {
        client = createClient({ url: process.env.REDIS_URL, socket: { connectTimeout: 2000, reconnectStrategy: false } });
        client.on("error", error => {
            if (!unavailableLogged) {
                console.warn(`Redis unavailable; using memory cache: ${error.message}`);
                unavailableLogged = true;
            }
        });
    }
    if (!client.isOpen) {
        connectionPromise ||= client.connect().catch(() => null).finally(() => { connectionPromise = null; });
        await connectionPromise;
    }
    return client.isReady ? client : null;
};

const getCachedJson = async key => {
    const redis = await getRedisClient();
    if (!redis) return null;
    try {
        const value = await redis.get(key);
        return value ? JSON.parse(value) : null;
    } catch (error) {
        console.warn(`Redis cache read failed: ${error.message}`);
        return null;
    }
};

const setCachedJson = async (key, value, ttlSeconds) => {
    const redis = await getRedisClient();
    if (!redis) return false;
    try {
        await redis.set(key, JSON.stringify(value), { EX: ttlSeconds });
        return true;
    } catch (error) {
        console.warn(`Redis cache write failed: ${error.message}`);
        return false;
    }
};

const deleteCachedValue = async key => {
    const redis = await getRedisClient();
    if (!redis) return false;
    try {
        await redis.del(key);
        return true;
    } catch (error) {
        console.warn(`Redis cache delete failed: ${error.message}`);
        return false;
    }
};

module.exports = { getCachedJson, setCachedJson, deleteCachedValue };
