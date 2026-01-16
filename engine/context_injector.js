// context_injector.js
// Módulo para inyectar contexto temporal, geográfico y de usuario dinámicamente

/**
 * Construye un bloque de contexto temporal y geográfico DINÁMICO
 * que se genera en cada consulta con la fecha/hora actual del sistema.
 * 
 * @param {Object} config - Configuración del bot (config.json)
 * @returns {String} Bloque de contexto formateado para inyectar en el prompt
 */
function buildContextBlock(config) {
  const contextDefaults = config.context_defaults || {};
  
  // Si ambos están desactivados, no inyectar nada
  if (!contextDefaults.inject_date_time && !contextDefaults.inject_region) {
    return '';
  }
  
  const timezone = contextDefaults.timezone || 'America/Santiago';
  const country = contextDefaults.country || 'Chile';
  const locale = contextDefaults.locale || 'es-CL';
  
  // Obtener fecha/hora ACTUAL del sistema (DINÁMICO)
  const now = new Date();
  
  // Convertir a la zona horaria configurada
  const options = {
    timeZone: timezone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  };
  
  const formatter = new Intl.DateTimeFormat(locale, options);
  const formattedDate = formatter.format(now);
  
  // Construir el bloque de contexto
  let contextBlock = '\n\n[CONTEXTO ACTUAL DEL SISTEMA]\n';
  
  if (contextDefaults.inject_date_time) {
    contextBlock += `Fecha y hora actual: ${formattedDate}\n`;
    contextBlock += `Zona horaria: ${timezone}\n`;
    contextBlock += `Timestamp Unix: ${Math.floor(now.getTime() / 1000)}\n`;
  }
  
  if (contextDefaults.inject_region) {
    contextBlock += `País: ${country}\n`;
    contextBlock += `Locale: ${locale}\n`;
  }
  
  contextBlock += '\n⚠️ IMPORTANTE: Esta información de contexto se actualiza automáticamente en cada consulta. Úsala para:\n';
  contextBlock += '- Saber la fecha y hora actual cuando el usuario pregunte "¿qué día es hoy?" o "¿qué hora es?"\n';
  contextBlock += '- Calcular plazos legales desde la fecha actual\n';
  contextBlock += '- Contextualizar referencias temporales del usuario (ej: "ayer", "la semana pasada", "hace 3 días")\n';
  contextBlock += '- Buscar información actualizada cuando sea necesario\n';
  
  return contextBlock;
}

/**
 * NUEVA FUNCIÓN: Construye un bloque de contexto del usuario
 * que se genera en cada consulta con la información del usuario.
 * 
 * @param {Object} userInfo - Información del usuario { name, description }
 * @returns {String} Bloque de contexto del usuario formateado
 */
function buildUserContextBlock(userInfo) {
  // Si no hay información del usuario, no inyectar nada
  if (!userInfo || (!userInfo.name && !userInfo.description)) {
    return '';
  }

  let userContextBlock = '\n\n[CONTEXTO DEL USUARIO]\n';

  if (userInfo.name) {
    userContextBlock += `Nombre del usuario: ${userInfo.name}\n`;
  }

  if (userInfo.description) {
    userContextBlock += `Descripción del usuario: ${userInfo.description}\n`;
  }

  userContextBlock += '\n⚠️ IMPORTANTE: Esta información del usuario es para personalizar la interacción. Úsala para:\n';
  userContextBlock += '- Dirigirte al usuario por su nombre cuando sea apropiado\n';
  userContextBlock += '- Entender mejor el contexto de sus preguntas\n';
  userContextBlock += '- Adaptar el tono y estilo de la respuesta según su perfil\n';
  userContextBlock += '- Proporcionar ejemplos y explicaciones relevantes a su área de especialización\n';

  return userContextBlock;
}

/**
 * NUEVA FUNCIÓN: Construye un bloque de contexto general
 * que el usuario proporciona en Settings para personalizar sus interacciones.
 * 
 * @param {String} generalContext - Contexto general del usuario
 * @returns {String} Bloque de contexto general formateado
 */
function buildGeneralContextBlock(generalContext) {
  // Si no hay contexto general, no inyectar nada
  if (!generalContext || generalContext.trim() === '') {
    return '';
  }

  let contextBlock = '\n\n[CONTEXTO GENERAL DEL USUARIO]\n';
  contextBlock += generalContext + '\n';

  return contextBlock;
}

/**
 * Versión simplificada que solo retorna la fecha/hora como string
 * útil para logging o debugging
 */
function getCurrentDateTime(config) {
  const contextDefaults = config.context_defaults || {};
  const timezone = contextDefaults.timezone || 'America/Santiago';
  const locale = contextDefaults.locale || 'es-CL';
  
  const now = new Date();
  const options = {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  };
  
  return new Intl.DateTimeFormat(locale, options).format(now);
}

module.exports = {
  buildContextBlock,
  buildUserContextBlock,
  buildGeneralContextBlock,
  getCurrentDateTime
};
