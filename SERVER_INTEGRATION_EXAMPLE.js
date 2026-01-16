/**
 * EJEMPLO DE INTEGRACIÓN DE MEJORAS EN server.js
 * ============================================================================
 * Este archivo muestra cómo integrar las mejoras en el server.js existente
 * SIN romper la funcionalidad actual.
 * ============================================================================
 */

require('dotenv').config();

const fs = require('fs');
const nodePath = require('path');
const crypto = require('crypto');
const express = require('express');
const fileUpload = require('express-fileupload');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const helmet = require('helmet'); // NUEVO: Seguridad HTTP
const compression = require('compression'); // NUEVO: Compresión
const OpenAI = require('openai');
const pino = require('pino')();

// ============================================================================
// NUEVAS IMPORTACIONES DE MEJORAS
// ============================================================================
const { initializeSecrets, validateSecrets } = require('./engine/secrets_manager');
const { initializeRedis, generateCacheKey, getFromCache, setInCache } = require('./engine/cache_manager');
const { errorHandler, notFoundHandler, asyncHandler, AppError } = require('./middleware/errorHandler');
const { authValidators, chatValidators, documentValidators } = require('./middleware/validation');
const authImproved = require('./auth/index_improved'); // NUEVO: Autenticación mejorada

// ============================================================================
// CONFIGURACIÓN INICIAL
// ============================================================================

// Inicializar secretos ANTES de crear el cliente OpenAI
async function initializeApp() {
  console.log('🚀 Inicializando LEGITIMUS PRO con mejoras...');

  try {
    // 1. Validar y cargar secretos
    console.log('[Init] Validando secretos...');
    await initializeSecrets();

    // 2. Inicializar caché Redis
    console.log('[Init] Inicializando caché Redis...');
    await initializeRedis();

    console.log('[Init] ✅ Aplicación inicializada correctamente');
    return true;
  } catch (error) {
    console.error('[Init] ❌ Error inicializando aplicación:', error.message);
    process.exit(1);
  }
}

// ============================================================================
// CREAR APLICACIÓN EXPRESS
// ============================================================================

const app = express();

// NUEVOS MIDDLEWARES DE SEGURIDAD
app.use(helmet()); // Protección de cabeceras HTTP
app.use(compression()); // Compresión de respuestas

// Middlewares existentes
app.use(express.json());
app.use(fileUpload());

// CORS (mantener configuración existente)
const cfg = (() => {
  try {
    return JSON.parse(fs.readFileSync('./lexcode_instances/general/config.json', 'utf-8'));
  } catch {
    return {};
  }
})();

if (cfg?.cors?.enabled) {
  app.use(cors({ origin: cfg.cors.origins || cfg.cors.origin || '*' }));
}

// Rate limiting (mantener configuración existente)
if (cfg?.rate_limit) {
  const limiter = rateLimit({
    windowMs: cfg.rate_limit.windowMs || 60_000,
    max: cfg.rate_limit.max || 60
  });
  app.use(limiter);
}

// ============================================================================
// RUTAS DE AUTENTICACIÓN (MEJORADAS)
// ============================================================================

/**
 * Login - Ahora con validación y manejo de errores mejorado
 */
app.post('/api/auth/login', authValidators.login, asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await authImproved.login(email, password);
    console.log('✅ Login exitoso para:', email);
    res.json({ ok: true, ...result });
  } catch (error) {
    console.error('❌ Login fallido para:', email, error.message);
    
    if (error instanceof AppError) {
      throw error;
    }
    
    throw new AppError('Error en el login', 500, 'LOGIN_ERROR');
  }
}));

/**
 * Obtener usuario actual
 */
app.get('/api/auth/me', authImproved.authRequired, (req, res) => {
  const user = authImproved.getUser(req.userId);
  if (!user) {
    return res.status(404).json({ ok: false, error: 'user_not_found' });
  }
  res.json({ ok: true, user });
});

// ============================================================================
// RUTAS DE CHAT (CON CACHÉ INTEGRADO)
// ============================================================================

/**
 * Endpoint de chat con caché
 */
app.post('/api/ask', authImproved.authRequired, chatValidators.ask, asyncHandler(async (req, res) => {
  const { question, chatId } = req.body;
  const userId = req.userId;

  // NUEVO: Verificar caché
  const cacheKey = generateCacheKey(userId, question);
  const cached = await getFromCache(cacheKey);

  if (cached) {
    console.log(`[Cache] ✅ Respuesta obtenida del caché para usuario ${userId}`);
    return res.json({
      ok: true,
      response: cached.response,
      fromCache: true,
      timestamp: new Date().toISOString()
    });
  }

  // ... resto del código existente para generar respuesta ...

  // NUEVO: Guardar en caché después de generar respuesta
  const response = {
    text: 'Respuesta generada...',
    // ... otros datos ...
  };

  await setInCache(cacheKey, response, 3600); // 1 hora

  res.json({
    ok: true,
    response,
    fromCache: false,
    timestamp: new Date().toISOString()
  });
}));

/**
 * Streaming de chat con caché
 */
app.post('/api/ask-stream', authImproved.authRequired, chatValidators.ask, asyncHandler(async (req, res) => {
  const { question, chatId } = req.body;
  const userId = req.userId;

  // NUEVO: Verificar caché
  const cacheKey = generateCacheKey(userId, question);
  const cached = await getFromCache(cacheKey);

  if (cached) {
    console.log(`[Cache] ✅ Respuesta en streaming obtenida del caché`);
    res.setHeader('Content-Type', 'text/event-stream');
    res.write(`data: ${JSON.stringify({ response: cached.response, fromCache: true })}\n\n`);
    res.end();
    return;
  }

  // ... resto del código existente para streaming ...
}));

// ============================================================================
// RUTAS DE DOCUMENTOS (PROTEGIDAS Y VALIDADAS)
// ============================================================================

/**
 * Generar documento
 */
app.post('/api/documents/generate', authImproved.authRequired, documentValidators.generate, asyncHandler(async (req, res) => {
  const { content, title } = req.body;
  const userId = req.userId;

  // ... código existente para generar documento ...

  res.json({
    ok: true,
    document: {
      // ... datos del documento ...
    }
  });
}));

// ============================================================================
// RUTAS DE ADMINISTRACIÓN (CON AUTENTICACIÓN MEJORADA)
// ============================================================================

/**
 * Asignar créditos (solo administrador)
 */
app.post('/api/admin/credits/assign', authImproved.adminRequired, asyncHandler(async (req, res) => {
  const { userId, amount, description } = req.body;

  if (!userId || !amount || amount <= 0) {
    throw new AppError('Parámetros inválidos', 400, 'INVALID_PARAMS');
  }

  const success = authImproved.addCredits(userId, amount);

  if (!success) {
    throw new AppError('No se pudieron asignar créditos', 500, 'CREDIT_ASSIGNMENT_FAILED');
  }

  res.json({
    ok: true,
    message: `${amount} créditos asignados a ${userId}`
  });
}));

// ============================================================================
// RUTAS DE SALUD
// ============================================================================

app.get('/healthz', (req, res) => {
  res.json({
    ok: true,
    time: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// ============================================================================
// MANEJO DE ERRORES Y RUTAS NO ENCONTRADAS (AL FINAL)
// ============================================================================

// NUEVO: Capturar rutas no encontradas
app.use(notFoundHandler);

// NUEVO: Middleware centralizado de manejo de errores (DEBE SER EL ÚLTIMO)
app.use(errorHandler);

// ============================================================================
// INICIAR SERVIDOR
// ============================================================================

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    // Inicializar la aplicación
    await initializeApp();

    // Iniciar servidor
    app.listen(PORT, () => {
      console.log(`🎉 LEGITIMUS PRO iniciado en puerto ${PORT}`);
      console.log(`📍 URL: http://localhost:${PORT}`);
      console.log(`🔐 Seguridad: Habilitada (Helmet + JWT)`);
      console.log(`⚡ Caché: Habilitado (Redis)`);
      console.log(`✅ Validación: Habilitada (express-validator)`);
    });
  } catch (error) {
    console.error('❌ Error iniciando servidor:', error);
    process.exit(1);
  }
}

// Manejar señales de terminación
process.on('SIGTERM', async () => {
  console.log('📌 Recibida señal SIGTERM, cerrando gracefully...');
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('📌 Recibida señal SIGINT, cerrando gracefully...');
  process.exit(0);
});

// Iniciar
startServer();

module.exports = app;
