// context_injector_enhanced.js
// Módulo mejorado para inyectar contexto: temporal, geográfico, usuario y empresa

const fs = require('fs');
const path = require('path');

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
 * NUEVA: Construye un bloque de contexto general del usuario
 * que se genera en cada consulta con información libre que el usuario proporciona.
 * 
 * @param {String} generalContext - Contexto general del usuario
 * @returns {String} Bloque de contexto general formateado
 */
function buildGeneralContextBlock(generalContext) {
  // Si no hay contexto general, no inyectar nada
  if (!generalContext || generalContext.trim() === '') {
    return '';
  }

  let contextBlock = '\n\n[CONTEXTO GENERAL]\n';
  contextBlock += `${generalContext}\n`;
  contextBlock += '\n⚠️ IMPORTANTE: Este es el contexto adicional que el usuario ha proporcionado. Úsalo para:\n';
  contextBlock += '- Entender mejor el contexto específico de la consulta\n';
  contextBlock += '- Personalizar respuestas según la información proporcionada\n';
  contextBlock += '- Mantener coherencia con el contexto del usuario\n';

  return contextBlock;
}

/**
 * NUEVA: Construye un bloque de contexto de empresa/instancia
 * que se genera en cada consulta con la información de la empresa.
 * 
 * @param {Object} config - Configuración de la instancia
 * @returns {String} Bloque de contexto de empresa formateado
 */
function buildCompanyContextBlock(config) {
  // Si no hay descripción de empresa, no inyectar nada
  if (!config || !config.company_description) {
    return '';
  }

  const companyDescription = config.company_description.trim();
  if (!companyDescription) {
    return '';
  }

  let companyContextBlock = '\n\n[CONTEXTO DE EMPRESA/INSTANCIA]\n';
  companyContextBlock += `Información de la empresa/cliente:\n${companyDescription}\n`;
  companyContextBlock += '\n⚠️ IMPORTANTE: Esta información de empresa es para contextualizar las respuestas. Úsala para:\n';
  companyContextBlock += '- Entender el contexto empresarial del usuario\n';
  companyContextBlock += '- Proporcionar recomendaciones específicas para esta empresa\n';
  companyContextBlock += '- Adaptar ejemplos y casos de uso a la industria/sector\n';
  companyContextBlock += '- Considerar políticas y normativas internas de la empresa\n';

  return companyContextBlock;
}

/**
 * NUEVA: Construye un bloque de contexto con documentos de contexto
 * que se han cargado en la instancia.
 * 
 * @param {Object} config - Configuración de la instancia
 * @returns {String} Bloque de contexto de documentos formateado
 */
function buildContextDocumentsBlock(config) {
  if (!config || !Array.isArray(config.context_documents) || config.context_documents.length === 0) {
    return '';
  }

  const docs = config.context_documents.filter(d => d && d.trim());
  if (docs.length === 0) {
    return '';
  }

  let docsBlock = '\n\n[DOCUMENTOS DE CONTEXTO DISPONIBLES]\n';
  docsBlock += 'Los siguientes documentos están disponibles para búsqueda semántica:\n';
  docs.forEach((doc, idx) => {
    docsBlock += `${idx + 1}. ${doc}\n`;
  });
  docsBlock += '\n⚠️ IMPORTANTE: Estos documentos contienen información contextual de la instancia. Búscalos semánticamente cuando sea relevante para:\n';
  docsBlock += '- Proporcionar información específica de la empresa\n';
  docsBlock += '- Contextualizar respuestas con políticas internas\n';
  docsBlock += '- Referirse a documentos y procedimientos específicos\n';
  docsBlock += '- Mantener consistencia con información previa cargada\n';

  return docsBlock;
}

/**
 * NUEVA: Carga información del perfil del usuario desde archivo
 * 
 * @param {String} userId - ID del usuario
 * @returns {Object} Información del perfil { role, description }
 */
function loadUserProfile(userId) {
  try {
    const profilePath = path.join(process.cwd(), 'lexcode_instances', 'general', 'users_profiles', `${userId}.json`);
    if (fs.existsSync(profilePath)) {
      const profileData = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
      return {
        role: profileData.role || '',
        description: profileData.description || ''
      };
    }
  } catch (e) {
    console.log(`[Context Injector] No se pudo cargar perfil del usuario ${userId}:`, e.message);
  }
  return { role: '', description: '' };
}

/**
 * NUEVA: Guarda información del perfil del usuario
 * 
 * @param {String} userId - ID del usuario
 * @param {Object} profileData - { role, description }
 * @returns {Boolean} true si se guardó exitosamente
 */
function saveUserProfile(userId, profileData) {
  try {
    const profilesDir = path.join(process.cwd(), 'lexcode_instances', 'general', 'users_profiles');
    if (!fs.existsSync(profilesDir)) {
      fs.mkdirSync(profilesDir, { recursive: true });
    }
    const profilePath = path.join(profilesDir, `${userId}.json`);
    fs.writeFileSync(profilePath, JSON.stringify({
      userId,
      role: profileData.role || '',
      description: profileData.description || '',
      updatedAt: new Date().toISOString()
    }, null, 2));
    console.log(`[Context Injector] Perfil del usuario ${userId} guardado exitosamente`);
    return true;
  } catch (e) {
    console.error(`[Context Injector] Error al guardar perfil del usuario ${userId}:`, e.message);
    return false;
  }
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
  buildGeneralContextBlock,
  buildCompanyContextBlock,
  buildContextDocumentsBlock,
  loadUserProfile,
  saveUserProfile,
  getCurrentDateTime
};
