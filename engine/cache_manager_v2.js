/**
 * Cache Manager v2 - Integración con Redis para Responses API
 * ============================================================================
 * Proporciona caché para respuestas de OpenAI en modo Responses API
 * Reduce costos y mejora rendimiento en consultas repetidas
 * ============================================================================
 */

const crypto = require('crypto');

let redisClient = null;
let redisConnected = false;

/**
 * Inicializa la conexión a Redis
 * @returns {Promise<boolean>}
 */
async function initializeRedis() {
  try {
    const redis = require('redis');
    
    const redisHost = process.env.REDIS_HOST || 'localhost';
    const redisPort = process.env.REDIS_PORT || 6379;
    const redisPassword = process.env.REDIS_PASSWORD || null;
    const redisUrl = redisPassword 
      ? `redis://:${redisPassword}@${redisHost}:${redisPort}`
      : `redis://${redisHost}:${redisPort}`;
    
    console.log(`[Cache] Conectando a Redis: ${redisHost}:${redisPort}`);
    
    redisClient = redis.createClient({
      url: redisUrl,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            console.error('[Cache] ❌ Máximo número de reintentos de Redis alcanzado');
            return new Error('Max retries exceeded');
          }
          return retries * 50;
        }
      }
    });

    redisClient.on('error', (err) => {
      console.error('[Cache] ⚠️ Error de Redis:', err.message);
      redisConnected = false;
    });

    redisClient.on('connect', () => {
      console.log('[Cache] ✅ Conectado a Redis');
      redisConnected = true;
    });

    redisClient.on('reconnecting', () => {
      console.log('[Cache] 🔄 Reconectando a Redis...');
    });

    await redisClient.connect();
    redisConnected = true;
    console.log('[Cache] ✅ Redis inicializado correctamente');
    return true;
  } catch (error) {
    console.error('[Cache] ❌ Error inicializando Redis:', error.message);
    redisConnected = false;
    return false;
  }
}

/**
 * Genera una clave de caché basada en la pregunta y configuración
 * @param {string} question - La pregunta del usuario
 * @param {string} userId - ID del usuario
 * @param {object} config - Configuración del bot
 * @returns {string} Clave de caché
 */
function generateCacheKey(question, userId = 'anon', config = {}) {
  if (!question) return null;
  
  // Normalizar la pregunta (lowercase, trim, espacios múltiples)
  const normalized = question.toLowerCase().trim().replace(/\s+/g, ' ');
  
  // Crear hash de la pregunta + configuración relevante
  const configHash = crypto
    .createHash('sha256')
    .update(JSON.stringify({
      model: config.model || 'gpt-4.1',
      api_mode: config.api_mode || 'responses',
      enable_web_search: config.enable_web_search || false,
      enable_file_search: config.enable_file_search || false
    }))
    .digest('hex')
    .slice(0, 8);
  
  const questionHash = crypto
    .createHash('sha256')
    .update(normalized)
    .digest('hex')
    .slice(0, 16);
  
  return `cache:responses:${userId}:${configHash}:${questionHash}`;
}

/**
 * Obtiene una respuesta del caché
 * @param {string} question - La pregunta
 * @param {string} userId - ID del usuario
 * @param {object} config - Configuración del bot
 * @returns {Promise<object|null>} Respuesta en caché o null
 */
async function getFromCache(question, userId = 'anon', config = {}) {
  if (!redisConnected || !redisClient) {
    return null;
  }

  try {
    const key = generateCacheKey(question, userId, config);
    if (!key) return null;

    const cached = await redisClient.get(key);
    if (cached) {
      const data = JSON.parse(cached);
      console.log('[Cache] 🎯 HIT - Respuesta recuperada del caché');
      return data;
    }
    
    return null;
  } catch (error) {
    console.error('[Cache] ❌ Error obteniendo del caché:', error.message);
    return null;
  }
}

/**
 * Guarda una respuesta en el caché
 * @param {string} question - La pregunta
 * @param {object} response - La respuesta completa
 * @param {string} userId - ID del usuario
 * @param {object} config - Configuración del bot
 * @param {number} ttl - Tiempo de vida en segundos (default: 3600 = 1 hora)
 * @returns {Promise<boolean>}
 */
async function setInCache(question, response, userId = 'anon', config = {}, ttl = 3600) {
  if (!redisConnected || !redisClient) {
    return false;
  }

  try {
    const key = generateCacheKey(question, userId, config);
    if (!key) return false;

    const ttlSeconds = parseInt(process.env.REDIS_TTL || ttl);
    await redisClient.setEx(key, ttlSeconds, JSON.stringify(response));
    
    console.log(`[Cache] 💾 Respuesta guardada en caché (TTL: ${ttlSeconds}s)`);
    return true;
  } catch (error) {
    console.error('[Cache] ❌ Error guardando en caché:', error.message);
    return false;
  }
}

/**
 * Elimina una entrada del caché
 * @param {string} question - La pregunta
 * @param {string} userId - ID del usuario
 * @param {object} config - Configuración del bot
 * @returns {Promise<boolean>}
 */
async function deleteFromCache(question, userId = 'anon', config = {}) {
  if (!redisConnected || !redisClient) {
    return false;
  }

  try {
    const key = generateCacheKey(question, userId, config);
    if (!key) return false;

    await redisClient.del(key);
    console.log('[Cache] 🗑️ Entrada eliminada del caché');
    return true;
  } catch (error) {
    console.error('[Cache] ❌ Error eliminando del caché:', error.message);
    return false;
  }
}

/**
 * Limpia el caché de un usuario específico
 * @param {string} userId - ID del usuario
 * @returns {Promise<number>} Número de claves eliminadas
 */
async function clearUserCache(userId = 'anon') {
  if (!redisConnected || !redisClient) {
    return 0;
  }

  try {
    const pattern = `cache:responses:${userId}:*`;
    const keys = await redisClient.keys(pattern);
    
    if (keys.length > 0) {
      await redisClient.del(keys);
      console.log(`[Cache] 🗑️ Caché del usuario limpiado (${keys.length} entradas)`);
      return keys.length;
    }
    
    return 0;
  } catch (error) {
    console.error('[Cache] ❌ Error limpiando caché del usuario:', error.message);
    return 0;
  }
}

/**
 * Obtiene estadísticas del caché
 * @returns {Promise<object>}
 */
async function getCacheStats() {
  if (!redisConnected || !redisClient) {
    return { enabled: false, error: 'Redis no conectado' };
  }

  try {
    const info = await redisClient.info('stats');
    const keys = await redisClient.keys('cache:responses:*');
    
    return {
      enabled: true,
      connected: redisConnected,
      totalCacheKeys: keys.length,
      info: info
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
      redisConnected = false;
      console.log('[Cache] ✅ Conexión a Redis cerrada');
    } catch (error) {
      console.error('[Cache] Error cerrando conexión a Redis:', error);
    }
  }
}

/**
 * Verifica si Redis está conectado
 * @returns {boolean}
 */
function isConnected() {
  return redisConnected;
}

module.exports = {
  initializeRedis,
  generateCacheKey,
  getFromCache,
  setInCache,
  deleteFromCache,
  clearUserCache,
  getCacheStats,
  closeRedis,
  isConnected
};
