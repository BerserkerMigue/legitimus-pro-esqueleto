/**
 * NORMATIVE CODE MANAGER - LEGITIMUS PRO
 * =======================================
 * 
 * Sistema de gestión de códigos normativos para citación estructurada.
 * Permite traducir normas a códigos únicos y viceversa.
 * 
 * @version 1.0.0
 * @author LEGITIMUS PRO Development Team
 */

const fs = require('fs');
const path = require('path');

// Cargar base de datos de códigos normativos
const DB_PATH = path.join(__dirname, 'normative_codes_db.json');
let normativeCodesDB = null;

/**
 * Carga la base de datos de códigos normativos
 * @returns {Object} Base de datos de códigos
 */
function loadDatabase() {
    if (normativeCodesDB) {
        return normativeCodesDB;
    }
    
    try {
        const data = fs.readFileSync(DB_PATH, 'utf8');
        normativeCodesDB = JSON.parse(data);
        console.log(`[NormativeCodeManager] Base de datos cargada: ${Object.keys(normativeCodesDB.codes).length} códigos`);
        return normativeCodesDB;
    } catch (error) {
        console.error('[NormativeCodeManager] Error cargando base de datos:', error.message);
        // Retornar estructura vacía si hay error
        normativeCodesDB = { codes: {}, _metadata: {}, _nomenclature_rules: {} };
        return normativeCodesDB;
    }
}

/**
 * Recarga la base de datos desde disco (útil después de ediciones)
 * @returns {Object} Base de datos actualizada
 */
function reloadDatabase() {
    normativeCodesDB = null;
    return loadDatabase();
}

/**
 * Obtiene información de un código normativo
 * @param {string} code - Código normativo (ej: CPCH, L20000)
 * @returns {Object|null} Información del código o null si no existe
 */
function getCodeInfo(code) {
    const db = loadDatabase();
    const normalizedCode = code.toUpperCase().trim();
    return db.codes[normalizedCode] || null;
}

/**
 * Obtiene la URL base de un código normativo
 * @param {string} code - Código normativo
 * @returns {string|null} URL base o null si no existe
 */
function getCodeUrl(code) {
    const info = getCodeInfo(code);
    return info ? info.url_base : null;
}

/**
 * Obtiene el idnorma de un código
 * @param {string} code - Código normativo
 * @returns {string|null} idnorma o null si no existe
 */
function getCodeIdNorma(code) {
    const info = getCodeInfo(code);
    return info ? info.idnorma : null;
}

/**
 * Busca un código por idnorma
 * @param {string} idnorma - ID de la norma en LeyChile
 * @returns {Object|null} Objeto con código e información o null
 */
function findByIdNorma(idnorma) {
    const db = loadDatabase();
    const normalizedId = String(idnorma).trim();
    
    for (const [code, info] of Object.entries(db.codes)) {
        if (info.idnorma === normalizedId) {
            return { code, ...info };
        }
    }
    return null;
}

/**
 * Busca códigos por nombre (parcial)
 * @param {string} searchTerm - Término de búsqueda
 * @returns {Array} Array de resultados {code, info}
 */
function searchByName(searchTerm) {
    const db = loadDatabase();
    const term = searchTerm.toLowerCase().trim();
    const results = [];
    
    for (const [code, info] of Object.entries(db.codes)) {
        if (info.nombre_corto.toLowerCase().includes(term) ||
            info.nombre_oficial.toLowerCase().includes(term)) {
            results.push({ code, ...info });
        }
    }
    return results;
}

/**
 * Lista todos los códigos disponibles
 * @returns {Array} Array de {code, nombre_corto, tipo}
 */
function listAllCodes() {
    const db = loadDatabase();
    return Object.entries(db.codes).map(([code, info]) => ({
        code,
        nombre_corto: info.nombre_corto,
        tipo: info.tipo
    }));
}

/**
 * Lista códigos por tipo
 * @param {string} tipo - Tipo de norma (ley, dfl, decreto, codigo, etc.)
 * @returns {Array} Array de códigos del tipo especificado
 */
function listByType(tipo) {
    const db = loadDatabase();
    const normalizedType = tipo.toLowerCase().trim();
    
    return Object.entries(db.codes)
        .filter(([_, info]) => info.tipo === normalizedType)
        .map(([code, info]) => ({ code, ...info }));
}

/**
 * Verifica si un código existe en la base de datos
 * @param {string} code - Código a verificar
 * @returns {boolean} true si existe, false si no
 */
function codeExists(code) {
    return getCodeInfo(code) !== null;
}

/**
 * Genera las reglas de nomenclatura para el System Prompt
 * @returns {string} Texto formateado con las reglas
 */
function generateNomenclatureRules() {
    const db = loadDatabase();
    const rules = db._nomenclature_rules || {};
    
    let text = `## SISTEMA DE CÓDIGOS NORMATIVOS LEGITIMUS PRO\n\n`;
    text += `### Reglas de Nomenclatura:\n\n`;
    
    for (const [key, value] of Object.entries(rules)) {
        text += `- **${key}**: ${value}\n`;
    }
    
    text += `\n### Códigos Especiales (Normas Importantes):\n\n`;
    
    // Listar códigos especiales (códigos cortos de 2-4 letras)
    const specialCodes = Object.entries(db.codes)
        .filter(([code, _]) => code.length <= 5 && !/\d/.test(code))
        .map(([code, info]) => `- **${code}**: ${info.nombre_corto}`);
    
    text += specialCodes.join('\n');
    
    return text;
}

/**
 * Genera la lista completa de códigos para referencia
 * @returns {string} Texto formateado con todos los códigos
 */
function generateCodeReference() {
    const db = loadDatabase();
    let text = `## REFERENCIA COMPLETA DE CÓDIGOS NORMATIVOS\n\n`;
    
    // Agrupar por tipo
    const byType = {};
    for (const [code, info] of Object.entries(db.codes)) {
        const tipo = info.tipo || 'otros';
        if (!byType[tipo]) byType[tipo] = [];
        byType[tipo].push({ code, ...info });
    }
    
    for (const [tipo, codes] of Object.entries(byType)) {
        text += `### ${tipo.toUpperCase()}\n\n`;
        for (const item of codes) {
            text += `- **${item.code}**: ${item.nombre_corto}\n`;
        }
        text += `\n`;
    }
    
    return text;
}

/**
 * Obtiene las estadísticas de la base de datos
 * @returns {Object} Estadísticas
 */
function getStats() {
    const db = loadDatabase();
    const codes = Object.values(db.codes);
    
    const byType = {};
    for (const info of codes) {
        const tipo = info.tipo || 'otros';
        byType[tipo] = (byType[tipo] || 0) + 1;
    }
    
    return {
        total: codes.length,
        byType,
        lastUpdated: db._metadata?.last_updated || 'unknown'
    };
}

module.exports = {
    loadDatabase,
    reloadDatabase,
    getCodeInfo,
    getCodeUrl,
    getCodeIdNorma,
    findByIdNorma,
    searchByName,
    listAllCodes,
    listByType,
    codeExists,
    generateNomenclatureRules,
    generateCodeReference,
    getStats
};
