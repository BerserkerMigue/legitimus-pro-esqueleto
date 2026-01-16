const fs = require('fs');

/**
 * Construye el system prompt a partir de un builder (v2-structured).
 * Acepta claves alternativas para tolerancia:
 *   - initial_configuration | initialConfiguration | init_configuration
 *   - configuration_base    | base_configuration
 *   - configuration_functional | functional_configuration
 * @param {Object} builder - Configuración del builder
 * @param {String} basePath - Ruta base para resolver rutas relativas (opcional)
 */
function buildPromptFromConfig(builder, basePath = null) {
  const cfg = (builder && typeof builder === 'object') ? builder : {};
  const path = require('path');

  // Aliases tolerantes
  const initCfg = cfg.initial_configuration || cfg.initialConfiguration || cfg.init_configuration || null;
  const baseCfg = cfg.configuration_base || cfg.base_configuration || null;
  const funcCfg = cfg.configuration_functional || cfg.functional_configuration || null;
  const citeCfg = cfg.configuration_citation || cfg.citation_configuration || null;

  let prompt = '';

  // Instrucciones iniciales (si existen)
  if (initCfg && initCfg.description) {
    prompt += `\n\n[FORCED INITIAL CONFIGURATION]\n${String(initCfg.description).trim()}`;
  }

  // Configuración base (si existe path)
  if (baseCfg && baseCfg.path) {
    try {
      let resolvedPath = baseCfg.path;
      
      // Si la ruta contiene 'lexcode_instances/', es absoluta desde el proyecto
      if (baseCfg.path.includes('lexcode_instances/')) {
        // Usar la ruta tal cual (relativa al directorio de trabajo)
        resolvedPath = baseCfg.path;
      }
      // Si la ruta empieza con './' y NO contiene 'lexcode_instances/', es relativa a la instancia
      else if (basePath && baseCfg.path.startsWith('./')) {
        // Quitar './' y unir con basePath
        resolvedPath = path.join(basePath, baseCfg.path.substring(2));
      }
      
      const base = fs.readFileSync(resolvedPath, 'utf-8');
      prompt += `\n\n[FORCED BASE CONFIGURATION]\n${base.trim()}`;
    } catch (e) {
      console.warn('Base config file not found:', baseCfg.path, e.message);
    }
  }

  // Configuración funcional (si existe path)
  if (funcCfg && funcCfg.path) {
    try {
      let resolvedPath = funcCfg.path;
      
      // Si la ruta contiene 'lexcode_instances/', es absoluta desde el proyecto
      if (funcCfg.path.includes('lexcode_instances/')) {
        // Usar la ruta tal cual (relativa al directorio de trabajo)
        resolvedPath = funcCfg.path;
      }
      // Si la ruta empieza con './' y NO contiene 'lexcode_instances/', es relativa a la instancia
      else if (basePath && funcCfg.path.startsWith('./')) {
        // Quitar './' y unir con basePath
        resolvedPath = path.join(basePath, funcCfg.path.substring(2));
      }
      
      const func = fs.readFileSync(resolvedPath, 'utf-8');
      prompt += `\n\n[FORCED FUNCTIONAL CONFIGURATION]\n${func.trim()}`;
    } catch (e) {
      console.warn('Functional config file not found:', funcCfg.path, e.message);
    }
  }

  // Configuración de citación normativa (si existe path)
  if (citeCfg && citeCfg.path) {
    try {
      let resolvedPath = citeCfg.path;
      
      // Si la ruta contiene 'lexcode_instances/', es absoluta desde el proyecto
      if (citeCfg.path.includes('lexcode_instances/')) {
        resolvedPath = citeCfg.path;
      }
      // Si la ruta empieza con './' y NO contiene 'lexcode_instances/', es relativa a la instancia
      else if (basePath && citeCfg.path.startsWith('./')) {
        resolvedPath = path.join(basePath, citeCfg.path.substring(2));
      }
      
      const cite = fs.readFileSync(resolvedPath, 'utf-8');
      prompt += `\n\n[FORCED CITATION CONFIGURATION]\n${cite.trim()}`;
    } catch (e) {
      console.warn('Citation config file not found:', citeCfg.path, e.message);
    }
  }

  return prompt.trim();
}

/**
 * Compatibilidad con builders antiguos (v2-simple, v1, etc.)
 */
function legacyBuildPrompt(cfg) {
  const c = cfg || {};
  let prompt = '';

  if (c.config_base_path) {
    try {
      const base = fs.readFileSync(c.config_base_path, 'utf-8');
      prompt += base.trim();
    } catch {}
  }
  if (c.config_funcional_path) {
    try {
      const func = fs.readFileSync(c.config_funcional_path, 'utf-8');
      prompt += `\n\n${func.trim()}`;
    } catch {}
  }
  return prompt.trim();
}

module.exports = { buildPromptFromConfig, legacyBuildPrompt };
