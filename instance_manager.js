// instance_manager.js
const fs = require('fs');
const path = require('path');
const { buildPromptFromConfig } = require('./engine/loader');

const INSTANCES_DIR = path.join(process.cwd(), 'lexcode_instances');

/**
 * Obtiene la lista de instancias disponibles
 */
function getAvailableInstances() {
  try {
    if (!fs.existsSync(INSTANCES_DIR)) {
      return [];
    }
    
    const dirs = fs.readdirSync(INSTANCES_DIR);
    const instances = [];
    
    for (const dir of dirs) {
      const instancePath = path.join(INSTANCES_DIR, dir);
      const configPath = path.join(instancePath, 'config.json');
      const builderPath = path.join(instancePath, 'builder.json');
      
      if (fs.statSync(instancePath).isDirectory() && 
          fs.existsSync(configPath) && 
          fs.existsSync(builderPath)) {
        
        try {
          const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
          const builder = JSON.parse(fs.readFileSync(builderPath, 'utf-8'));
          
          // Cargar descripción desde instance_description.txt si existe
          const descriptionPath = path.join(instancePath, 'instance_description.txt');
          let description = builder.initial_configuration?.description || `Instancia ${dir}`;
          if (fs.existsSync(descriptionPath)) {
            description = fs.readFileSync(descriptionPath, 'utf-8').trim();
          }
          
          instances.push({
            id: dir,
            name: builder.name || dir,
            identity: config.identity || dir,
            description: description,
            available: true
          });
        } catch (err) {
          console.error(`Error leyendo configuración de instancia ${dir}:`, err.message);
          instances.push({
            id: dir,
            name: dir,
            identity: dir,
            description: `Instancia ${dir} (configuración inválida)`,
            available: false
          });
        }
      }
    }
    
    return instances;
  } catch (err) {
    console.error('Error obteniendo instancias disponibles:', err.message);
    return [];
  }
}

/**
 * Carga la configuración de una instancia específica
 */
function loadInstance(instanceId) {
  try {
    const instancePath = path.join(INSTANCES_DIR, instanceId);
    const configPath = path.join(instancePath, 'config.json');
    const builderPath = path.join(instancePath, 'builder.json');
    
    if (!fs.existsSync(instancePath)) {
      throw new Error(`Instancia '${instanceId}' no encontrada`);
    }
    
    if (!fs.existsSync(configPath)) {
      throw new Error(`Archivo config.json no encontrado para instancia '${instanceId}'`);
    }
    
    if (!fs.existsSync(builderPath)) {
      throw new Error(`Archivo builder.json no encontrado para instancia '${instanceId}'`);
    }
    
    // Leer y parsear configuraciones
    const bot_config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const builder_config = JSON.parse(fs.readFileSync(builderPath, 'utf-8'));
    
    // Construir el system prompt (pasando instancePath para resolver rutas relativas)
    const system_prompt = buildPromptFromConfig(builder_config, instancePath);
    
    // Calcular hash del system prompt para identificación
    const crypto = require('crypto');
    const system_prompt_hash = crypto.createHash('sha256').update(system_prompt).digest('hex');
    
    // Información de identidad
    const builder_name = builder_config.name || instanceId;
    const builder_valid = !!(builder_config.name);
    
    // Cargar initial_greeting si existe
    const greetingPath = path.join(instancePath, 'initial_greeting.txt');
    let initial_greeting = null;
    if (fs.existsSync(greetingPath)) {
      initial_greeting = fs.readFileSync(greetingPath, 'utf-8').trim();
    }
    // Tambien intentar cargar desde builder.json
    if (!initial_greeting && builder_config.initial_greeting) {
      initial_greeting = builder_config.initial_greeting;
    }
    
    // Cargar initialization_message desde archivo .txt (mensaje invisible de inicializacion)
    const initMessagePath = path.join(instancePath, 'initialization_message.txt');
    let initialization_message = null;
    if (fs.existsSync(initMessagePath)) {
      initialization_message = fs.readFileSync(initMessagePath, 'utf-8').trim();
    }
    // Fallback: intentar cargar desde builder.json si no existe el archivo
    if (!initialization_message && builder_config.initialization_message) {
      initialization_message = builder_config.initialization_message;
    }
    
    // Cargar descripción si existe
    const descriptionPath = path.join(instancePath, 'instance_description.txt');
    let description = builder_config.initial_configuration?.description || `Instancia ${instanceId}`;
    if (fs.existsSync(descriptionPath)) {
      description = fs.readFileSync(descriptionPath, 'utf-8').trim();
    }
    
    return {
      instanceId,
      bot_config,
      builder_config,
      system_prompt,
      system_prompt_hash,
      builder_name,
      builder_valid,
      instance_path: instancePath,
      initial_greeting,
      initialization_message,
      description
    };
  } catch (err) {
    console.error(`Error cargando instancia '${instanceId}':`, err.message);
    throw err;
  }
}

/**
 * Valida si una instancia existe y está disponible
 */
function validateInstance(instanceId) {
  try {
    const instancePath = path.join(INSTANCES_DIR, instanceId);
    const configPath = path.join(instancePath, 'config.json');
    const builderPath = path.join(instancePath, 'builder.json');
    
    return fs.existsSync(instancePath) && 
           fs.existsSync(configPath) && 
           fs.existsSync(builderPath);
  } catch (err) {
    return false;
  }
}

/**
 * Obtiene la instancia por defecto (general)
 */
function getDefaultInstance() {
  const instances = getAvailableInstances();
  
  // Buscar instancia 'general' primero
  let defaultInstance = instances.find(inst => inst.id === 'general');
  
  // Si no existe 'general', tomar la primera disponible
  if (!defaultInstance) {
    defaultInstance = instances.find(inst => inst.available);
  }
  
  return defaultInstance ? defaultInstance.id : null;
}

/**
 * Crea una nueva instancia basada en una plantilla
 */
function createInstance(instanceId, templateId = 'general') {
  try {
    const templatePath = path.join(INSTANCES_DIR, templateId);
    const newInstancePath = path.join(INSTANCES_DIR, instanceId);
    
    if (!fs.existsSync(templatePath)) {
      throw new Error(`Plantilla '${templateId}' no encontrada`);
    }
    
    if (fs.existsSync(newInstancePath)) {
      throw new Error(`Instancia '${instanceId}' ya existe`);
    }
    
    // Copiar recursivamente la plantilla
    copyRecursive(templatePath, newInstancePath);
    
    // Actualizar configuraciones básicas
    const configPath = path.join(newInstancePath, 'config.json');
    const builderPath = path.join(newInstancePath, 'builder.json');
    
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      config.identity = instanceId;
      if (config.memory && config.memory.path) {
        config.memory.path = `lexcode_instances/general/historial/${instanceId}`;
      }
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    }
    
    if (fs.existsSync(builderPath)) {
      const builder = JSON.parse(fs.readFileSync(builderPath, 'utf-8'));
      builder.name = `LexCode ${instanceId.charAt(0).toUpperCase() + instanceId.slice(1)}`;
      fs.writeFileSync(builderPath, JSON.stringify(builder, null, 2));
    }
    
    return true;
  } catch (err) {
    console.error(`Error creando instancia '${instanceId}':`, err.message);
    throw err;
  }
}

/**
 * Función auxiliar para copiar directorios recursivamente
 */
function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  
  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    
    const files = fs.readdirSync(src);
    for (const file of files) {
      copyRecursive(path.join(src, file), path.join(dest, file));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

module.exports = {
  getAvailableInstances,
  loadInstance,
  validateInstance,
  getDefaultInstance,
  createInstance
};
