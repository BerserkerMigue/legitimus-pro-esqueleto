/**
 * Gestor de Caché con Redis
 * ============================================================================
 * Proporciona una capa de caché para reducir costos de API y mejorar rendimiento
 * ============================================================================
 */

const crypto = require('crypto');

let redisClient = null;

/**
 * Inicializa la conexión a Redis
 * @returns {Promise<void>}
 */
async function initializeRedis() {
  try {
    const redis = require('redis');
    
    redisClient = redis.createClient({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      db: process.env.REDIS_DB || 0,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            console.error('[Cache] Máximo número de reintentos de Redis alcanzado');
            return new Error('Max retries exceeded');
          }
          return retries * 50;
        }
      }
    });

    redisClient.on('error', (err) => {
      console.error('[Cache] Error de Redis:', err);
    });

    redisClient.on('connect', () => {
      console.log('[Cache] ✅ Conectado a Redis');
    });

    redisClient.on('reconnecting', () => {
      console.log('[Cache] ⚠️ Reconectando a Redis...');
    });

    await redisClient.connect();
    console.log('[Cache] ✅ Redis inicializado correctamente');
  } catch (error) {
    console.warn('[Cache] ⚠️ No se pudo conectar a Redis. El caché estará deshabilitado:', error.message);
    redisClient = null;
  }
}

/**
 * Genera una clave de caché normalizada
 * @param {string} userId - ID del usuario
 * @param {string} question - Pregunta del usuario
 * @returns {string} Clave de caché
 */
function generateCacheKey(userId, question) {
  const normalized = question.toLowerCase().trim();
  const hash = crypto.createHash('sha256').update(normalized).digest('hex');
  return `cache:${userId}:${hash}`;
}

/**
 * Obtiene un valor del caché
 * @param {string} key - Clave del caché
 * @returns {Promise<any|null>} Valor en caché o null
 */
async function getFromCache(key) {
  if (!redisClient) return null;

  try {
    const cached = await redisClient.get(key);
    if (cached) {
      console.log(`[Cache] ✅ Hit para clave: ${key}`);
      return JSON.parse(cached);
    }
    console.log(`[Cache] ❌ Miss para clave: ${key}`);
    return null;
  } catch (error) {
    console.error('[Cache] Error obteniendo valor del caché:', error);
    return null;
  }
}

/**
 * Almacena un valor en el caché
 * @param {string} key - Clave del caché
 * @param {any} value - Valor a almacenar
 * @param {number} ttl - Tiempo de vida en segundos (default: 3600 = 1 hora)
 * @returns {Promise<boolean>} true si se almacenó correctamente
 */
async function setInCache(key, value, ttl = 3600) {
  if (!redisClient) return false;

  try {
    await redisClient.setEx(key, ttl, JSON.stringify(value));
    console.log(`[Cache] ✅ Valor almacenado en caché: ${key} (TTL: ${ttl}s)`);
    return true;
  } catch (error) {
    console.error('[Cache] Error almacenando valor en caché:', error);
    return false;
  }
}

/**
 * Elimina un valor del caché
 * @param {string} key - Clave del caché
 * @returns {Promise<boolean>} true si se eliminó correctamente
 */
async function deleteFromCache(key) {
  if (!redisClient) return false;

  try {
    await redisClient.del(key);
    console.log(`[Cache] ✅ Valor eliminado del caché: ${key}`);
    return true;
  } catch (error) {
    console.error('[Cache] Error eliminando valor del caché:', error);
    return false;
  }
}

/**
 * Limpia todo el caché de un usuario
 * @param {string} userId - ID del usuario
 * @returns {Promise<boolean>} true si se limpió correctamente
 */
async function clearUserCache(userId) {
  if (!redisClient) return false;

  try {
    const pattern = `cache:${userId}:*`;
    const keys = await redisClient.keys(pattern);
    
    if (keys.length > 0) {
      await redisClient.del(keys);
      console.log(`[Cache] ✅ Caché del usuario ${userId} limpiado (${keys.length} claves)`);
    }
    
    return true;
  } catch (error) {
    console.error('[Cache] Error limpiando caché del usuario:', error);
    return false;
  }
}

/**
 * Obtiene estadísticas del caché
 * @returns {Promise<object>} Estadísticas del caché
 */
async function getCacheStats() {
  if (!redisClient) {
    return {
      enabled: false,
      message: 'Redis no está disponible'
    };
  }

  try {
    const info = await redisClient.info('stats');
    const dbSize = await redisClient.dbSize();
    
    return {
      enabled: true,
      dbSize,
      info
    };
  } catch (error) {
    console.error('[Cache] Error obteniendo estadísticas:', error);
    return { enabled: true, error: error.message };
  }
}

/**
 * Cierra la conexión a Redis
 * @returns {Promise<void>}
 */
async function closeRedis() {
  if (redisClient) {
    try {
      await redisClient.quit();
      console.log('[Cache] ✅ Conexión a Redis cerrada');
    } catch (error) {
      console.error('[Cache] Error cerrando conexión a Redis:', error);
    }
  }
}

module.exports = {
  initializeRedis,
  generateCacheKey,
  getFromCache,
  setInCache,
  deleteFromCache,
  clearUserCache,
  getCacheStats,
  closeRedis
};
