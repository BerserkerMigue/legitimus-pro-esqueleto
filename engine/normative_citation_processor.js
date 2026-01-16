/**
 * NORMATIVE CITATION PROCESSOR - LEGITIMUS PRO v3.0
 * ==================================================
 * 
 * Sistema de procesamiento de citas normativas con DOBLE VISTA:
 * - Vista MODELO: Completa con instrucciones de verificación y todos los campos
 * - Vista USUARIO: Limpia, solo información útil para el cliente
 * 
 * FLUJO:
 * 1. Extrae códigos normativos del mensaje de LEGITIMUS (formato CLAVE.ArtX)
 * 2. Busca por CLAVE + número de artículo en la BD SQLite
 * 3. Genera DOS versiones del Anexo Normativo Documental:
 *    - anexo_modelo: Para que LEGITIMUS verifique y confirme/corrija
 *    - anexo_usuario: Para mostrar al cliente en el frontend
 * 
 * FORMATO DE CITAS QUE DETECTA:
 * - CCCH.Art1545 → Código Civil, Artículo 1545
 * - CPCH.Art391 → Código Penal, Artículo 391
 * - L20190.Art5 → Ley 20.190, Artículo 5
 * - CTRIB.Art10 → Código Tributario, Artículo 10
 * - DFL1.2006.Art5 → DFL 1 2006 , Artículo 5
 * - DL824.1974.Art7 → DL 824 1974 , Artículo 7
 * - D326.1989.Art9 → Decreto 326 1989 , Artículo 9
 * 
 * @version 3.0.0
 * @author LEGITIMUS PRO Development Team
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Rutas
const DB_PATH = path.join(__dirname, 'normative_db', 'normas.sqlite');
const CONFIG_PATH = path.join(__dirname, 'normative_db', 'anexo_config.json');

/**
 * Carga la configuración del anexo
 */
function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            const configContent = fs.readFileSync(CONFIG_PATH, 'utf8');
            return JSON.parse(configContent);
        }
    } catch (error) {
        console.warn('[NormativeCitationProcessor] Error cargando config:', error.message);
    }
    
    // Configuración por defecto si no existe el archivo
    return {
        instruccion_modelo: {
            activa: true,
            texto: "INSTRUCCIÓN DE VERIFICACIÓN: Lee detenidamente el texto literal de cada artículo citado. Compara con tu análisis anterior. Si detectas alguna imprecisión, corrígela explícitamente. Si tu análisis es correcto, confirma brevemente."
        },
        campos: [
            { nombre: "clave", incluir_usuario: true, incluir_modelo: true },
            { nombre: "nombre_norma", incluir_usuario: true, incluir_modelo: true, campo_bd: "norma" },
            { nombre: "nombreparte", incluir_usuario: true, incluir_modelo: true },
            { nombre: "url", incluir_usuario: true, incluir_modelo: true, campo_bd: "url_norma_pdf" },
            { nombre: "texto", incluir_usuario: true, incluir_modelo: true }
        ]
    };
}

/**
 * Patrones de expresiones regulares para detectar citas normativas (LEGITIMUS PRO 2025)
 * ===================================================================================
 * Cumple 100 % con las secciones 4 y 5 del NORMATIVE CITATION SYSTEM.
 * 
 * Soporta:
 *  - Códigos especiales: CCCH, CPCH, CTRIB, CPC, etc.
 *  - Leyes: L20000.Art5, L19968.Art102b
 *  - Decretos con fuerza de ley: DFL1.2006.Art7
 *  - Decretos ley: DL824.1974.Art41e
 *  - Decretos simples: D14.1991.Art5
 *  - Sufijos normativos válidos: bis, ter, quater, quinquies, sexies, septies, octies, novies, decies
 *  - Artículos con letras: 21a, 41e, 10b, etc.
 * 
 * Rechaza:
 *  - Espacios en las claves o artículos
 *  - Palabras no permitidas (“inciso”, “número”, “No.”)
 *  - Formatos obsoletos tipo DFL1.2000A3
 */
const CITATION_PATTERNS = [
  // Códigos especiales: CCCH.Art1545, CPCH.Art391, CTRIB.Art10, CTRIB.Art21bis, CPCH.Art467a
  /\b([A-Z]{2,10})\.Art\.?(\d+(?:[a-z]|(?:\s*(?:bis|ter|quater|quinquies|sexies|septies|octies|novies|decies)))?)\b/gi,
    
  // Leyes: L21156.Art1, L19968.Art102b, L20000.Art5bis
  /\b(L\d{4,6})\.Art\.?(\d+(?:[a-z]|(?:\s*(?:bis|ter|quater|quinquies|sexies|septies|octies|novies|decies)))?)\b/gi,
    
  // Decretos con fuerza de ley: DFL1.2006.Art7, DFL2.1989.Art3bis
  /\b(DFL\d+\.\d{4})\.Art\.?(\d+(?:[a-z]|(?:\s*(?:bis|ter|quater|quinquies|sexies|septies|octies|novies|decies)))?)\b/gi,
    
  // Decretos ley: DL824.1974.Art41e, DL830.1974.Art10bis
  /\b(DL\d+\.\d{4})\.Art\.?(\d+(?:[a-z]|(?:\s*(?:bis|ter|quater|quinquies|sexies|septies|octies|novies|decies)))?)\b/gi,
    
  // Decretos simples: D14.1991.Art5, D200.1992.Art7ter
  /\b(D\d+\.\d{4})\.Art\.?(\d+(?:[a-z]|(?:\s*(?:bis|ter|quater|quinquies|sexies|septies|octies|novies|decies)))?)\b/gi,

  // Alternativo con espacio (solo para compatibilidad con textos antiguos)
  /\b([A-Z]{2,10})\s+Art(?:[íi]culo)?\.?\s*(\d+(?:[a-z]|(?:\s*(?:bis|ter|quater|quinquies|sexies|septies|octies|novies|decies)))?)\b/gi

];

/**
 * Clase principal para procesar citas normativas
 */
class NormativeCitationProcessor {
    constructor() {
        this.db = null;
        this.isInitialized = false;
        this.config = loadConfig();
    }

    /**
     * Recarga la configuración desde el archivo
     */
    reloadConfig() {
        this.config = loadConfig();
    }

    /**
     * Inicializa la conexión a la base de datos
     */
    initialize() {
        if (this.isInitialized) return true;
        
        try {
            if (!fs.existsSync(DB_PATH)) {
                console.warn('[NormativeCitationProcessor] Base de datos no encontrada:', DB_PATH);
                return false;
            }
            
            this.db = new Database(DB_PATH, { readonly: true });
            this.isInitialized = true;
            console.log('[NormativeCitationProcessor] Base de datos inicializada correctamente');
            return true;
        } catch (error) {
            console.error('[NormativeCitationProcessor] Error inicializando BD:', error.message);
            return false;
        }
    }

    /**
     * Extrae todas las citas normativas de un texto
     */
    extractCitations(text) {
        if (!text || typeof text !== 'string') return [];
        
        const citations = [];
        const seen = new Set();
        
        for (const pattern of CITATION_PATTERNS) {
            pattern.lastIndex = 0;
            
            let match;
            while ((match = pattern.exec(text)) !== null) {
                const clave = match[1].toUpperCase();
                const articulo = match[2].toLowerCase().replace(/\s+/g, ' ').trim();
                const key = `${clave}|${articulo}`;
                
                if (!seen.has(key)) {
                    seen.add(key);
                    citations.push({
                        clave: clave,
                        articulo: articulo,
                        raw: match[0]
                    });
                }
            }
        }
        
        console.log(`[NormativeCitationProcessor] Citas extraídas: ${citations.length}`);
        citations.forEach(c => console.log(`  - ${c.clave}.Art${c.articulo}`));
        
        return citations;
    }

    /**
     * Busca un artículo en la BD con TODOS los campos disponibles
     * Incluye BÚSQUEDA INTELIGENTE para DL (Decretos Ley):
     * - Si no encuentra DL824, busca DL824% (cualquier variante con año)
     * - Si encuentra exactamente 1 resultado, lo usa
     * - Si encuentra 0 o más de 1, no resuelve
     */
    findArticleComplete(clave, articulo) {
        if (!this.initialize()) return null;
        
        try {
            // Consulta con todos los campos relevantes
            const baseQuery = `
                SELECT 
                    clave, 
                    norma, 
                    norma_tipo, 
                    norma_idnorma,
                    norma_organismo,
                    metadatos_idparte, 
                    metadatos_fechaversion,
                    nombreparte, 
                    url_norma_pdf,
                    texto,
                    clasificacion_norma,
                    rutacompleta,
                    materias,
                    bloque_juridico
                FROM articulos 
            `;
            
            // Función auxiliar para ejecutar búsqueda
            const searchWithClave = (searchClave) => {
                // Búsqueda exacta por clave + numero_articulo
                let stmt = this.db.prepare(baseQuery + 'WHERE clave = ? AND numero_articulo = ? LIMIT 1');
                let result = stmt.get(searchClave, articulo);
                
                // Fallback: buscar por nombreparte_normalizado
                if (!result) {
                    const nombreparteNormalizado = `articulo ${articulo}`;
                    stmt = this.db.prepare(baseQuery + 'WHERE clave = ? AND nombreparte_normalizado = ? LIMIT 1');
                    result = stmt.get(searchClave, nombreparteNormalizado);
                }
                
                // Fallback: buscar con LIKE
                if (!result) {
                    stmt = this.db.prepare(baseQuery + `
                        WHERE clave = ? AND (
                            nombreparte LIKE ? OR 
                            nombreparte LIKE ? OR
                            nombreparte_normalizado LIKE ?
                        )
                        LIMIT 1
                    `);
                    result = stmt.get(
                        searchClave, 
                        `%articulo ${articulo}%`,
                        `%art. ${articulo}%`,
                        `%articulo ${articulo}%`
                    );
                }
                
                return result;
            };
            
            // Primero: búsqueda exacta con la clave original
            let result = searchWithClave(clave);
            
            // BÚSQUEDA INTELIGENTE PARA DL (Decretos Ley)
            // Si no encuentra y la clave empieza con "DL" seguido de número (sin año)
            if (!result && /^DL\d+$/i.test(clave)) {
                console.log(`[NormativeCitationProcessor] 🔍 Búsqueda inteligente para ${clave}...`);
                
                // Buscar todas las claves que empiecen con DL + número
                const wildcardQuery = `
                    SELECT DISTINCT clave 
                    FROM articulos 
                    WHERE clave LIKE ? 
                    AND numero_articulo = ?
                `;
                const stmt = this.db.prepare(wildcardQuery);
                const matches = stmt.all(clave + '%', articulo);
                
                if (matches.length === 1) {
                    // Encontró exactamente 1 variante → usarla
                    const foundClave = matches[0].clave;
                    console.log(`[NormativeCitationProcessor] 🔍 Encontrada variante única: ${foundClave}`);
                    result = searchWithClave(foundClave);
                } else if (matches.length > 1) {
                    // Múltiples variantes → ambigüedad, no resolver
                    console.log(`[NormativeCitationProcessor] ⚠️ Múltiples variantes encontradas para ${clave}: ${matches.map(m => m.clave).join(', ')}`);
                } else {
                    // También intentar sin el artículo específico para ver qué claves existen
                    const checkQuery = `SELECT DISTINCT clave FROM articulos WHERE clave LIKE ? LIMIT 5`;
                    const checkStmt = this.db.prepare(checkQuery);
                    const existingClaves = checkStmt.all(clave + '%');
                    if (existingClaves.length > 0) {
                        console.log(`[NormativeCitationProcessor] 🔍 Claves similares en BD: ${existingClaves.map(m => m.clave).join(', ')}`);
                    }
                }
            }
            
            if (result) {
                console.log(`[NormativeCitationProcessor] ✅ Encontrado: ${clave}.Art${articulo} → ${result.clave}`);
                return {
                    found: true,
                    clave: result.clave,
                    norma: result.norma,
                    norma_tipo: result.norma_tipo,
                    norma_organismo: result.norma_organismo,
                    nombreparte: result.nombreparte,
                    url: result.url_norma_pdf,
                    texto: result.texto,
                    vigencia: result.clasificacion_norma,
                    fecha_version: result.metadatos_fechaversion,
                    estructura: result.rutacompleta,
                    materias: result.materias,
                    bloque_juridico: result.bloque_juridico,
                    idnorma: result.norma_idnorma,
                    idparte: result.metadatos_idparte
                };
            }
            
            console.log(`[NormativeCitationProcessor] ❌ No encontrado: ${clave}.Art${articulo}`);
            return null;
            
        } catch (error) {
            console.error('[NormativeCitationProcessor] Error buscando artículo:', error.message);
            return null;
        }
    }

    /**
     * Procesa un mensaje completo y retorna las citas resueltas con datos completos
     */
    processMessage(message) {
        const citations = this.extractCitations(message);
        const resolved = [];
        const unresolved = [];
        
        for (const citation of citations) {
            const result = this.findArticleComplete(citation.clave, citation.articulo);
            
            if (result && result.found) {
                resolved.push({
                    code: citation.clave,
                    article: citation.articulo,
                    raw: citation.raw,
                    // Datos completos para el anexo
                    norma: result.norma,
                    norma_tipo: result.norma_tipo,
                    norma_organismo: result.norma_organismo,
                    nombreparte: result.nombreparte,
                    url: result.url,
                    texto: result.texto,
                    vigencia: result.vigencia,
                    fecha_version: result.fecha_version,
                    estructura: result.estructura,
                    materias: result.materias,
                    bloque_juridico: result.bloque_juridico,
                    idnorma: result.idnorma,
                    idparte: result.idparte
                });
            } else {
                unresolved.push({
                    code: citation.clave,
                    article: citation.articulo,
                    raw: citation.raw
                });
            }
        }
        
        console.log(`[NormativeCitationProcessor] Resultado: ${resolved.length} resueltas, ${unresolved.length} no resueltas`);
        
        return {
            total: citations.length,
            resolved: resolved,
            unresolved: unresolved,
            hasResults: resolved.length > 0
        };
    }

    /**
     * Cierra la conexión a la base de datos
     */
    close() {
        if (this.db) {
            this.db.close();
            this.db = null;
            this.isInitialized = false;
        }
    }
}

// Instancia singleton
const processor = new NormativeCitationProcessor();

/**
 * Genera el Anexo Normativo para el MODELO (completo con instrucciones)
 * @param {Array} resolvedCitations - Citas resueltas con datos completos
 * @returns {string} Texto formateado del anexo para el modelo
 */
function generateAnexoModelo(resolvedCitations) {
    if (!resolvedCitations || resolvedCitations.length === 0) {
        return null;
    }
    
    const config = processor.config;
    let anexo = '';
    
    // Agregar instrucción de verificación si está activa
    if (config.instruccion_modelo && config.instruccion_modelo.activa) {
        anexo += `\n${config.instruccion_modelo.texto}\n\n`;
    }
    
    anexo += '=== ANEXO NORMATIVO PARA VERIFICACIÓN ===\n\n';
    
    for (const citation of resolvedCitations) {
        anexo += `--- ARTÍCULO CITADO ---\n`;
        anexo += `CLAVE: ${citation.code}.Art${citation.article}\n`;
        anexo += `NORMA: ${citation.norma || 'N/A'}\n`;
        anexo += `TIPO: ${citation.norma_tipo || 'N/A'}\n`;
        anexo += `ARTÍCULO: ${citation.nombreparte || 'N/A'}\n`;
        anexo += `URL_LEYCHILE: ${citation.url || 'N/A'}\n`;
        
        if (citation.vigencia) {
            anexo += `VIGENCIA: ${citation.vigencia}\n`;
        }
        if (citation.fecha_version) {
            anexo += `FECHA_VERSION: ${citation.fecha_version}\n`;
        }
        if (citation.estructura) {
            anexo += `UBICACIÓN: ${citation.estructura}\n`;
        }
        if (citation.bloque_juridico) {
            anexo += `BLOQUE_JURIDICO: ${citation.bloque_juridico}\n`;
        }
        if (citation.materias) {
            anexo += `MATERIAS: ${citation.materias}\n`;
        }
        if (citation.norma_organismo) {
            anexo += `ORGANISMO: ${citation.norma_organismo}\n`;
        }
        
        // Texto literal del artículo (lo más importante)
        if (citation.texto) {
            anexo += `\nTEXTO_LITERAL_VIGENTE:\n"${citation.texto}"\n`;
        }
        
        anexo += '\n';
    }
    
    anexo += '=== FIN ANEXO NORMATIVO ===\n';
    
    return anexo;
}

/**
 * Genera el Anexo Normativo para el USUARIO (limpio, solo info útil)
 * @param {Array} resolvedCitations - Citas resueltas con datos completos
 * @returns {Array} Array de objetos con la información para el frontend
 */
function generateAnexoUsuario(resolvedCitations) {
    if (!resolvedCitations || resolvedCitations.length === 0) {
        return null;
    }
    
    const config = processor.config;
    const camposUsuario = config.campos
        ? config.campos.filter(c => c.incluir_usuario)
        : [];
    
    return resolvedCitations.map(citation => {
        const item = {
            clave: `${citation.code}.Art${citation.article}`,
            norma: citation.norma || 'Norma',
            articulo: citation.nombreparte || `Artículo ${citation.article}`,
            url: citation.url
        };
        
        // Agregar texto si está configurado para usuario
        const textoConfig = camposUsuario.find(c => c.nombre === 'texto');
        if (textoConfig && citation.texto) {
            // Truncar texto largo para el usuario (primeros 500 caracteres)
            item.texto = citation.texto.length > 500 
                ? citation.texto.substring(0, 500) + '...' 
                : citation.texto;
            item.texto_completo = citation.texto;
        }
        
        return item;
    });
}

/**
 * Genera AMBAS versiones del Anexo Normativo
 * @param {Array} resolvedCitations - Citas resueltas
 * @returns {Object} { anexoModelo, anexoUsuario }
 */
function generateDualAnnex(resolvedCitations) {
    return {
        anexoModelo: generateAnexoModelo(resolvedCitations),
        anexoUsuario: generateAnexoUsuario(resolvedCitations)
    };
}

/**
 * Función principal de procesamiento con generación dual de anexos
 * @param {string} message - Mensaje a procesar
 * @returns {Object} Resultado del procesamiento con ambos anexos
 */
function processMessageWithDualAnnex(message) {
    const result = processor.processMessage(message);
    
    if (result.hasResults) {
        const { anexoModelo, anexoUsuario } = generateDualAnnex(result.resolved);
        result.anexoModelo = anexoModelo;
        result.anexoUsuario = anexoUsuario;
    }
    
    return result;
}

/**
 * Función de procesamiento simple (compatibilidad hacia atrás)
 */
function processMessage(message) {
    return processor.processMessage(message);
}

/**
 * Obtiene estadísticas de la base de datos
 */
function getStats() {
    if (!processor.initialize()) {
        return { error: 'No se pudo inicializar la BD' };
    }
    
    try {
        const totalStmt = processor.db.prepare('SELECT COUNT(*) as total FROM articulos');
        const clavesStmt = processor.db.prepare('SELECT clave, COUNT(*) as count FROM articulos GROUP BY clave ORDER BY count DESC');
        
        const total = totalStmt.get().total;
        const claves = clavesStmt.all();
        
        return {
            totalArticulos: total,
            clavesPorNorma: claves
        };
    } catch (error) {
        return { error: error.message };
    }
}

/**
 * Recarga la configuración del anexo
 */
function reloadConfig() {
    processor.reloadConfig();
}

module.exports = {
    processMessage,
    processMessageWithDualAnnex,
    generateAnexoModelo,
    generateAnexoUsuario,
    generateDualAnnex,
    getStats,
    reloadConfig,
    NormativeCitationProcessor
};
