/**
 * Instance Files Loader
 * Carga archivos de configuración de la instancia para inyectarlos en el contexto del sistema.
 * Estos archivos son parte del conocimiento base de la instancia (información de empresa, conceptos, etc.)
 * 
 * Ubicación de archivos: lexcode_instances/general/files/
 * Formatos soportados: .txt, .md, .json
 */

const fs = require('fs');
const path = require('path');

// Configuración por defecto
const DEFAULT_CONFIG = {
  maxCharsPerFile: 50000,      // Máximo de caracteres por archivo
  maxTotalChars: 200000,       // Máximo total de caracteres a inyectar
  supportedExtensions: ['.txt', '.md', '.json'],
  instancePath: 'lexcode_instances/general/files'
};

/**
 * Obtiene la configuración de instance_files desde config.json
 */
function getInstanceFilesConfig() {
  try {
    const configPath = path.join(process.cwd(), 'lexcode_instances', 'general', 'config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      return config.instance_files || {};
    }
  } catch (error) {
    console.error('[Instance Files] Error leyendo config:', error.message);
  }
  return {};
}

/**
 * Verifica si instance_files está habilitado en config.json
 */
function isInstanceFilesEnabled() {
  const config = getInstanceFilesConfig();
  return config.enabled === true;
}

/**
 * Obtiene la ruta de la carpeta de archivos de la instancia
 */
function getInstanceFilesPath(customPath = null) {
  const basePath = customPath || DEFAULT_CONFIG.instancePath;
  return path.join(process.cwd(), basePath);
}

/**
 * Lee todos los archivos de configuración de la instancia
 * @param {Object} options - Opciones de configuración
 * @returns {Array} Array de objetos con { filename, content, size }
 */
function loadInstanceFiles(options = {}) {
  // Verificar si está habilitado en config.json
  if (!isInstanceFilesEnabled()) {
    console.log('[Instance Files] Deshabilitado en config.json (enabled: false)');
    return [];
  }

  const instanceConfig = getInstanceFilesConfig();
  const {
    maxCharsPerFile = instanceConfig.maxCharsPerFile || DEFAULT_CONFIG.maxCharsPerFile,
    maxTotalChars = instanceConfig.maxTotalChars || DEFAULT_CONFIG.maxTotalChars,
    supportedExtensions = DEFAULT_CONFIG.supportedExtensions,
    instancePath = DEFAULT_CONFIG.instancePath
  } = options;

  const filesPath = getInstanceFilesPath(instancePath);
  const loadedFiles = [];
  let totalChars = 0;

  // Verificar si existe la carpeta
  if (!fs.existsSync(filesPath)) {
    console.log(`[Instance Files] Carpeta no encontrada: ${filesPath}`);
    return [];
  }

  try {
    const files = fs.readdirSync(filesPath)
      .filter(f => {
        const ext = path.extname(f).toLowerCase();
        return supportedExtensions.includes(ext) && fs.statSync(path.join(filesPath, f)).isFile();
      })
      .sort(); // Ordenar alfabéticamente para consistencia

    for (const filename of files) {
      // Verificar límite total
      if (totalChars >= maxTotalChars) {
        console.log(`[Instance Files] Límite total de caracteres alcanzado (${maxTotalChars})`);
        break;
      }

      const filePath = path.join(filesPath, filename);
      
      try {
        let content = fs.readFileSync(filePath, 'utf-8');
        const ext = path.extname(filename).toLowerCase();

        // Para archivos JSON, formatear bonito
        if (ext === '.json') {
          try {
            const jsonContent = JSON.parse(content);
            content = JSON.stringify(jsonContent, null, 2);
          } catch (e) {
            // Si falla el parse, usar contenido raw
          }
        }

        // Truncar si excede el límite por archivo
        if (content.length > maxCharsPerFile) {
          content = content.slice(0, maxCharsPerFile) + '\n[... contenido truncado ...]';
        }

        // Verificar si cabe en el límite total
        const remainingChars = maxTotalChars - totalChars;
        if (content.length > remainingChars) {
          content = content.slice(0, remainingChars) + '\n[... contenido truncado por límite total ...]';
        }

        loadedFiles.push({
          filename,
          content,
          size: content.length,
          path: filePath
        });

        totalChars += content.length;
        console.log(`[Instance Files] Cargado: ${filename} (${content.length} chars)`);

      } catch (error) {
        console.error(`[Instance Files] Error leyendo ${filename}:`, error.message);
      }
    }

    console.log(`[Instance Files] Total: ${loadedFiles.length} archivos, ${totalChars} caracteres`);
    return loadedFiles;

  } catch (error) {
    console.error('[Instance Files] Error listando archivos:', error.message);
    return [];
  }
}

/**
 * Genera el bloque de contexto para inyectar en el system prompt
 * @param {Object} options - Opciones de configuración
 * @returns {string} Bloque de texto formateado para el prompt
 */
function buildInstanceFilesContext(options = {}) {
  // Verificar si está habilitado en config.json
  if (!isInstanceFilesEnabled()) {
    return '';
  }

  const files = loadInstanceFiles(options);

  if (files.length === 0) {
    return '';
  }

  const sections = files.map(f => {
    const ext = path.extname(f.filename).toLowerCase();
    const label = ext === '.json' ? 'JSON' : ext === '.md' ? 'Markdown' : 'Texto';
    return `=== ARCHIVO DE CONFIGURACIÓN: ${f.filename} (${label}) ===\n${f.content}\n=== FIN ARCHIVO: ${f.filename} ===`;
  });

  return `
[CONOCIMIENTO BASE DE LA INSTANCIA - NO SON ADJUNTOS DEL USUARIO]
⚠️ IMPORTANTE: Los siguientes documentos son parte de tu CONFIGURACIÓN PERMANENTE.
Estos archivos fueron cargados por el administrador del sistema, NO por el usuario actual.
Debes tratarlos como tu conocimiento base institucional y puedes citarlos cuando sea relevante.
Si el usuario pregunta sobre el origen de esta información, indica que proviene de tus archivos de configuración.

${sections.join('\n\n')}

[/CONOCIMIENTO BASE DE LA INSTANCIA]
`;
}

/**
 * Obtiene la lista de archivos disponibles (sin contenido)
 * @returns {Array} Array de nombres de archivo
 */
function listInstanceFiles(instancePath = null) {
  const filesPath = getInstanceFilesPath(instancePath);
  
  if (!fs.existsSync(filesPath)) {
    return [];
  }

  try {
    return fs.readdirSync(filesPath)
      .filter(f => {
        const ext = path.extname(f).toLowerCase();
        return DEFAULT_CONFIG.supportedExtensions.includes(ext) && 
               fs.statSync(path.join(filesPath, f)).isFile();
      })
      .sort();
  } catch (error) {
    console.error('[Instance Files] Error listando archivos:', error.message);
    return [];
  }
}

/**
 * Recarga los archivos de la instancia (útil para hot-reload)
 */
function reloadInstanceFiles() {
  console.log('[Instance Files] Recargando archivos de configuración...');
  return loadInstanceFiles();
}

module.exports = {
  loadInstanceFiles,
  buildInstanceFilesContext,
  listInstanceFiles,
  reloadInstanceFiles,
  getInstanceFilesPath,
  getInstanceFilesConfig,
  isInstanceFilesEnabled,
  DEFAULT_CONFIG
};
