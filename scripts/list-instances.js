#!/usr/bin/env node

/**
 * Script para listar todas las instancias de LexCode
 * 
 * Muestra información detallada de cada instancia disponible
 * 
 * Uso: node scripts/list-instances.js [--detailed]
 */

const fs = require('fs');
const path = require('path');

const INSTANCES_DIR = path.join(__dirname, '../lexcode_instances');

// Colores para consola
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Obtener información de una instancia
function getInstanceInfo(instanceId) {
  const instancePath = path.join(INSTANCES_DIR, instanceId);
  const configPath = path.join(instancePath, 'config.json');
  const builderPath = path.join(instancePath, 'builder.json');
  const descPath = path.join(instancePath, 'instance_description.txt');
  
  const info = {
    id: instanceId,
    path: instancePath,
    valid: false,
    name: instanceId,
    description: '',
    hasConfig: false,
    hasBuilder: false,
    hasPrompts: false,
    hasKnowledge: false,
    hasVectorStores: false
  };
  
  // Verificar config.json
  if (fs.existsSync(configPath)) {
    info.hasConfig = true;
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      info.hasVectorStores = !!(config.knowledge_store_id || config.rag_only_store_id);
    } catch (e) {
      // Ignorar errores de parseo
    }
  }
  
  // Verificar builder.json
  if (fs.existsSync(builderPath)) {
    info.hasBuilder = true;
    try {
      const builder = JSON.parse(fs.readFileSync(builderPath, 'utf-8'));
      info.name = builder.name || instanceId;
    } catch (e) {
      // Ignorar errores de parseo
    }
  }
  
  // Verificar descripción
  if (fs.existsSync(descPath)) {
    try {
      info.description = fs.readFileSync(descPath, 'utf-8').trim();
    } catch (e) {
      // Ignorar errores
    }
  }
  
  // Verificar prompts
  const promptsDir = path.join(instancePath, 'prompts');
  if (fs.existsSync(promptsDir)) {
    const files = fs.readdirSync(promptsDir);
    info.hasPrompts = files.some(f => f.endsWith('.txt'));
  }
  
  // Verificar conocimiento
  const conocimientoDir = path.join(instancePath, 'conocimiento');
  const ragDir = path.join(instancePath, 'conocimiento_rag_only');
  
  if (fs.existsSync(conocimientoDir) || fs.existsSync(ragDir)) {
    let hasFiles = false;
    
    if (fs.existsSync(conocimientoDir)) {
      const files = fs.readdirSync(conocimientoDir);
      hasFiles = files.some(f => f !== '.gitkeep');
    }
    
    if (!hasFiles && fs.existsSync(ragDir)) {
      const files = fs.readdirSync(ragDir);
      hasFiles = files.some(f => f !== '.gitkeep');
    }
    
    info.hasKnowledge = hasFiles;
  }
  
  // Validez general
  info.valid = info.hasConfig && info.hasBuilder && info.hasPrompts;
  
  return info;
}

// Listar instancias
function listInstances(detailed = false) {
  log(`\n${colors.cyan}╔════════════════════════════════════════════════════════════════╗`, 'cyan');
  log(`║  Instancias LexCode Disponibles                               ║`, 'cyan');
  log(`╚════════════════════════════════════════════════════════════════╝${colors.reset}`, 'cyan');
  log('', 'reset');
  
  if (!fs.existsSync(INSTANCES_DIR)) {
    log('❌ No se encontró el directorio de instancias', 'red');
    log(`   Ubicación esperada: ${INSTANCES_DIR}`, 'yellow');
    return;
  }
  
  const dirs = fs.readdirSync(INSTANCES_DIR);
  const instances = [];
  
  for (const dir of dirs) {
    const instancePath = path.join(INSTANCES_DIR, dir);
    if (fs.statSync(instancePath).isDirectory()) {
      const info = getInstanceInfo(dir);
      instances.push(info);
    }
  }
  
  if (instances.length === 0) {
    log('⚠️  No se encontraron instancias', 'yellow');
    log('', 'reset');
    log('💡 Crear una instancia:', 'cyan');
    log('   node scripts/create-instance-simple.js <id> [nombre] [area]', 'blue');
    log('', 'reset');
    return;
  }
  
  // Ordenar por ID
  instances.sort((a, b) => a.id.localeCompare(b.id));
  
  log(`📊 Total de instancias: ${instances.length}`, 'cyan');
  log('', 'reset');
  
  if (!detailed) {
    // Vista resumida
    log('═══════════════════════════════════════════════════════════════', 'cyan');
    log('', 'reset');
    
    instances.forEach((inst, idx) => {
      const status = inst.valid ? '✅' : '❌';
      const color = inst.valid ? 'green' : 'red';
      
      log(`${status} ${inst.id}`, color);
      log(`   Nombre: ${inst.name}`, 'blue');
      
      if (inst.description) {
        log(`   Descripción: ${inst.description.substring(0, 80)}${inst.description.length > 80 ? '...' : ''}`, 'blue');
      }
      
      if (!inst.valid) {
        const missing = [];
        if (!inst.hasConfig) missing.push('config.json');
        if (!inst.hasBuilder) missing.push('builder.json');
        if (!inst.hasPrompts) missing.push('prompts');
        log(`   ⚠️  Falta: ${missing.join(', ')}`, 'yellow');
      }
      
      log('', 'reset');
    });
    
  } else {
    // Vista detallada
    instances.forEach((inst, idx) => {
      log('═══════════════════════════════════════════════════════════════', 'cyan');
      log(`Instancia ${idx + 1}/${instances.length}`, 'cyan');
      log('═══════════════════════════════════════════════════════════════', 'cyan');
      log('', 'reset');
      
      const status = inst.valid ? '✅ VÁLIDA' : '❌ INVÁLIDA';
      const color = inst.valid ? 'green' : 'red';
      
      log(`Estado: ${status}`, color);
      log(`ID: ${inst.id}`, 'blue');
      log(`Nombre: ${inst.name}`, 'blue');
      log(`Ruta: ${inst.path}`, 'blue');
      
      if (inst.description) {
        log(`Descripción: ${inst.description}`, 'blue');
      }
      
      log('', 'reset');
      log('Componentes:', 'yellow');
      log(`  config.json: ${inst.hasConfig ? '✅' : '❌'}`, inst.hasConfig ? 'green' : 'red');
      log(`  builder.json: ${inst.hasBuilder ? '✅' : '❌'}`, inst.hasBuilder ? 'green' : 'red');
      log(`  prompts: ${inst.hasPrompts ? '✅' : '❌'}`, inst.hasPrompts ? 'green' : 'red');
      log(`  conocimiento: ${inst.hasKnowledge ? '✅' : '❌'}`, inst.hasKnowledge ? 'green' : 'yellow');
      log(`  vector stores: ${inst.hasVectorStores ? '✅' : '❌'}`, inst.hasVectorStores ? 'green' : 'yellow');
      
      log('', 'reset');
    });
  }
  
  log('═══════════════════════════════════════════════════════════════', 'cyan');
  log('', 'reset');
  
  // Estadísticas
  const valid = instances.filter(i => i.valid).length;
  const withKnowledge = instances.filter(i => i.hasKnowledge).length;
  const withVectorStores = instances.filter(i => i.hasVectorStores).length;
  
  log('📈 Estadísticas:', 'cyan');
  log(`   Instancias válidas: ${valid}/${instances.length}`, valid === instances.length ? 'green' : 'yellow');
  log(`   Con conocimiento: ${withKnowledge}/${instances.length}`, withKnowledge > 0 ? 'green' : 'yellow');
  log(`   Con Vector Stores: ${withVectorStores}/${instances.length}`, withVectorStores > 0 ? 'green' : 'yellow');
  log('', 'reset');
  
  if (!detailed) {
    log('💡 Para ver detalles completos:', 'cyan');
    log('   node scripts/list-instances.js --detailed', 'blue');
    log('', 'reset');
  }
}

// Ejecutar
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
${colors.cyan}╔════════════════════════════════════════════════════════════════╗
║  LexCode - Listador de Instancias                             ║
╚════════════════════════════════════════════════════════════════╝${colors.reset}

${colors.yellow}Uso:${colors.reset}
  node scripts/list-instances.js [--detailed]

${colors.yellow}Opciones:${colors.reset}
  --detailed    Mostrar información detallada de cada instancia
  --help, -h    Mostrar esta ayuda

${colors.yellow}Ejemplos:${colors.reset}
  ${colors.green}# Listar todas las instancias (vista resumida)${colors.reset}
  node scripts/list-instances.js

  ${colors.green}# Listar con detalles completos${colors.reset}
  node scripts/list-instances.js --detailed

${colors.yellow}Información mostrada:${colors.reset}
  - ID de la instancia
  - Nombre de display
  - Descripción
  - Estado de validez
  - Componentes disponibles
  - Estadísticas generales
`);
    process.exit(0);
  }
  
  const detailed = args.includes('--detailed') || args.includes('-d');
  listInstances(detailed);
}

module.exports = { listInstances, getInstanceInfo };

