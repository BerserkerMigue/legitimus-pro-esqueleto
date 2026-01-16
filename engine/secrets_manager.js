/**
 * Gestor de Secretos Mejorado
 * ============================================================================
 * Proporciona una capa de abstracción para gestionar secretos de forma segura.
 * Soporta tanto variables de entorno como AWS Secrets Manager.
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');

/**
 * Obtiene un secreto del entorno o de AWS Secrets Manager
 * @param {string} secretName - Nombre del secreto
 * @param {string} fallback - Valor por defecto si no se encuentra
 * @returns {Promise<string>} El valor del secreto
 */
async function getSecret(secretName, fallback = null) {
  try {
    // Primero intentar obtener de variables de entorno
    const envKey = secretName.toUpperCase().replace(/-/g, '_');
    if (process.env[envKey]) {
      console.log(`[Secrets] Secreto '${secretName}' obtenido de variables de entorno`);
      return process.env[envKey];
    }

    // Si está configurado AWS, intentar obtener de AWS Secrets Manager
    if (process.env.USE_AWS_SECRETS === 'true' && process.env.AWS_REGION) {
      return await getSecretFromAWS(secretName);
    }

    // Si no se encuentra y hay fallback, usar fallback
    if (fallback) {
      console.warn(`[Secrets] Secreto '${secretName}' no encontrado. Usando valor por defecto.`);
      return fallback;
    }

    throw new Error(`Secreto '${secretName}' no configurado`);
  } catch (error) {
    console.error(`[Secrets] Error obteniendo secreto '${secretName}':`, error.message);
    throw error;
  }
}

/**
 * Obtiene un secreto de AWS Secrets Manager
 * @param {string} secretName - Nombre del secreto en AWS
 * @returns {Promise<string>} El valor del secreto
 */
async function getSecretFromAWS(secretName) {
  try {
    const AWS = require('aws-sdk');
    const client = new AWS.SecretsManager({ region: process.env.AWS_REGION });
    
    const data = await client.getSecretValue({ SecretId: secretName }).promise();
    console.log(`[Secrets] Secreto '${secretName}' obtenido de AWS Secrets Manager`);
    
    return data.SecretString;
  } catch (error) {
    console.error(`[Secrets] Error obteniendo secreto de AWS '${secretName}':`, error.message);
    throw error;
  }
}

/**
 * Valida que todos los secretos críticos estén configurados
 * @returns {Promise<boolean>} true si todos los secretos están configurados
 */
async function validateSecrets() {
  const requiredSecrets = [
    'OPENAI_API_KEY',
    'AUTH_JWT_SECRET',
    'ADMIN_KEY'
  ];

  const missing = [];

  for (const secret of requiredSecrets) {
    try {
      await getSecret(secret);
    } catch (error) {
      missing.push(secret);
    }
  }

  if (missing.length > 0) {
    console.error(`[Secrets] Secretos faltantes: ${missing.join(', ')}`);
    console.error('[Secrets] Por favor, configura estas variables de entorno o usa AWS Secrets Manager');
    return false;
  }

  console.log('[Secrets] ✅ Todos los secretos críticos están configurados');
  return true;
}

/**
 * Inicializa los secretos en variables de entorno globales
 * @returns {Promise<void>}
 */
async function initializeSecrets() {
  try {
    console.log('[Secrets] Inicializando gestión de secretos...');

    // Validar que los secretos estén disponibles
    const isValid = await validateSecrets();
    if (!isValid) {
      throw new Error('Secretos críticos no configurados');
    }

    // Cargar secretos en variables de entorno si no están ya
    if (!process.env.OPENAI_API_KEY) {
      process.env.OPENAI_API_KEY = await getSecret('OPENAI_API_KEY');
    }
    if (!process.env.AUTH_JWT_SECRET) {
      process.env.AUTH_JWT_SECRET = await getSecret('AUTH_JWT_SECRET');
    }
    if (!process.env.ADMIN_KEY) {
      process.env.ADMIN_KEY = await getSecret('ADMIN_KEY');
    }

    console.log('[Secrets] ✅ Secretos inicializados correctamente');
  } catch (error) {
    console.error('[Secrets] ❌ Error inicializando secretos:', error.message);
    process.exit(1);
  }
}

module.exports = {
  getSecret,
  getSecretFromAWS,
  validateSecrets,
  initializeSecrets
};
