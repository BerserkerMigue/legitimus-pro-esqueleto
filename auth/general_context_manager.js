// general_context_manager.js
// Módulo para gestionar el contexto general del usuario

const fs = require('fs');
const path = require('path');

const CONTEXTS_DIR = path.join(process.cwd(), 'auth', 'user_contexts');

// Asegurar que el directorio existe
function ensureContextsDir() {
  if (!fs.existsSync(CONTEXTS_DIR)) {
    fs.mkdirSync(CONTEXTS_DIR, { recursive: true });
  }
}

/**
 * Obtiene el contexto general de un usuario
 * @param {String} userId - ID del usuario
 * @returns {String} Contexto general del usuario (vacío si no existe)
 */
function getGeneralContext(userId) {
  try {
    ensureContextsDir();
    const contextPath = path.join(CONTEXTS_DIR, `${userId}.txt`);
    
    if (fs.existsSync(contextPath)) {
      return fs.readFileSync(contextPath, 'utf-8');
    }
    return '';
  } catch (error) {
    console.error(`[General Context Manager] Error al obtener contexto de ${userId}:`, error.message);
    return '';
  }
}

/**
 * Guarda el contexto general de un usuario
 * @param {String} userId - ID del usuario
 * @param {String} context - Contexto a guardar
 * @returns {Boolean} true si se guardó exitosamente
 */
function saveGeneralContext(userId, context) {
  try {
    ensureContextsDir();
    const contextPath = path.join(CONTEXTS_DIR, `${userId}.txt`);
    
    // Guardar el contexto
    fs.writeFileSync(contextPath, context || '', 'utf-8');
    console.log(`[General Context Manager] Contexto de ${userId} guardado exitosamente`);
    return true;
  } catch (error) {
    console.error(`[General Context Manager] Error al guardar contexto de ${userId}:`, error.message);
    return false;
  }
}

/**
 * Elimina el contexto general de un usuario
 * @param {String} userId - ID del usuario
 * @returns {Boolean} true si se eliminó exitosamente
 */
function deleteGeneralContext(userId) {
  try {
    ensureContextsDir();
    const contextPath = path.join(CONTEXTS_DIR, `${userId}.txt`);
    
    if (fs.existsSync(contextPath)) {
      fs.unlinkSync(contextPath);
      console.log(`[General Context Manager] Contexto de ${userId} eliminado`);
      return true;
    }
    return true; // No error si no existe
  } catch (error) {
    console.error(`[General Context Manager] Error al eliminar contexto de ${userId}:`, error.message);
    return false;
  }
}

module.exports = {
  getGeneralContext,
  saveGeneralContext,
  deleteGeneralContext
};
