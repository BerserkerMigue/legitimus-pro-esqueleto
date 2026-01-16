// auth/user_profile_manager.js
// Módulo para gestionar perfiles de usuario (rol, descripción)

const fs = require('fs');
const path = require('path');

const PROFILES_DIR = path.join(__dirname, 'user_profiles');

/**
 * Asegura que el directorio de perfiles existe
 */
function ensureProfilesDir() {
  if (!fs.existsSync(PROFILES_DIR)) {
    fs.mkdirSync(PROFILES_DIR, { recursive: true });
  }
}

/**
 * Obtiene el perfil de un usuario
 * @param {String} userId - ID del usuario
 * @returns {Object} { general_context, updatedAt }
 */
function getUserProfile(userId) {
  try {
    ensureProfilesDir();
    const profilePath = path.join(PROFILES_DIR, `${userId}.json`);
    
    if (fs.existsSync(profilePath)) {
      const data = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
      return {
        general_context: data.general_context || '',
        updatedAt: data.updatedAt || null
      };
    }
  } catch (e) {
    console.error(`[UserProfileManager] Error al obtener perfil de ${userId}:`, e.message);
  }
  
  // Retornar perfil vacío si no existe
  return {
    general_context: '',
    updatedAt: null
  };
}

/**
 * Guarda o actualiza el perfil de un usuario
 * @param {String} userId - ID del usuario
 * @param {Object} profileData - { general_context }
 * @returns {Boolean} true si se guardó exitosamente
 */
function saveUserProfile(userId, profileData) {
  try {
    ensureProfilesDir();
    const profilePath = path.join(PROFILES_DIR, `${userId}.json`);
    
    const profile = {
      userId,
      general_context: (profileData.general_context || '').trim(),
      updatedAt: new Date().toISOString()
    };
    
    fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2));
    console.log(`[UserProfileManager] Perfil de ${userId} guardado exitosamente`);
    return true;
  } catch (e) {
    console.error(`[UserProfileManager] Error al guardar perfil de ${userId}:`, e.message);
    return false;
  }
}

/**
 * Actualiza el contexto general del usuario
 * @param {String} userId - ID del usuario
 * @param {String} general_context - Nuevo contexto general
 * @returns {Boolean} true si se guardó exitosamente
 */
function updateGeneralContext(userId, general_context) {
  try {
    return saveUserProfile(userId, {
      general_context: general_context || ''
    });
  } catch (e) {
    console.error(`[UserProfileManager] Error al actualizar contexto general de ${userId}:`, e.message);
    return false;
  }
}

/**
 * Elimina el perfil de un usuario
 * @param {String} userId - ID del usuario
 * @returns {Boolean} true si se eliminó exitosamente
 */
function deleteUserProfile(userId) {
  try {
    const profilePath = path.join(PROFILES_DIR, `${userId}.json`);
    if (fs.existsSync(profilePath)) {
      fs.unlinkSync(profilePath);
      console.log(`[UserProfileManager] Perfil de ${userId} eliminado`);
      return true;
    }
    return false;
  } catch (e) {
    console.error(`[UserProfileManager] Error al eliminar perfil de ${userId}:`, e.message);
    return false;
  }
}

/**
 * Obtiene todos los perfiles de usuario (para administración)
 * @returns {Array} Array de perfiles
 */
function getAllProfiles() {
  try {
    ensureProfilesDir();
    const files = fs.readdirSync(PROFILES_DIR).filter(f => f.endsWith('.json'));
    const profiles = [];
    
    for (const file of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(PROFILES_DIR, file), 'utf-8'));
        profiles.push(data);
      } catch (e) {
        console.error(`[UserProfileManager] Error al leer ${file}:`, e.message);
      }
    }
    
    return profiles;
  } catch (e) {
    console.error(`[UserProfileManager] Error al obtener todos los perfiles:`, e.message);
    return [];
  }
}

/**
 * Obtiene solo el contexto general de un usuario
 * @param {String} userId - ID del usuario
 * @returns {String} Contexto general
 */
function getGeneralContext(userId) {
  try {
    const profile = getUserProfile(userId);
    return profile.general_context || '';
  } catch (e) {
    console.error(`[UserProfileManager] Error al obtener contexto general de ${userId}:`, e.message);
    return '';
  }
}

module.exports = {
  getUserProfile,
  saveUserProfile,
  updateGeneralContext,
  deleteUserProfile,
  getAllProfiles
};
