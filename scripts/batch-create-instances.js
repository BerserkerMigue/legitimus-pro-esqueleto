#!/usr/bin/env node

/**
 * Script para crear múltiples instancias de LexCode de una vez
 * 
 * Uso: node scripts/batch-create-instances.js <cantidad> [prefijo]
 * 
 * Ejemplos:
 *   node scripts/batch-create-instances.js 5
 *   node scripts/batch-create-instances.js 10 especialidad
 *   node scripts/batch-create-instances.js 3 area
 */

const fs = require('fs');
const path = require('path');
const { createInstance } = require('./create-instance-simple');

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

// Función principal
function batchCreateInstances(count, prefix = 'inst') {
  if (count < 1 || count > 100) {
    log('❌ Error: La cantidad debe estar entre 1 y 100', 'red');
    process.exit(1);
  }

  log(`\n${colors.cyan}╔════════════════════════════════════════════════════════════════╗`, 'cyan');
  log(`║  Creación Masiva de Instancias LexCode                        ║`, 'cyan');
  log(`╚════════════════════════════════════════════════════════════════╝${colors.reset}`, 'cyan');
  log('', 'reset');
  log(`📦 Creando ${count} instancias con prefijo '${prefix}'...`, 'yellow');
  log('', 'reset');

  const created = [];
  const failed = [];

  for (let i = 1; i <= count; i++) {
    const instanceId = `${prefix}${i}`;
    const displayName = `${prefix.charAt(0).toUpperCase() + prefix.slice(1)} ${i}`;
    const area = `especialidad ${instanceId}`;

    try {
      log(`[${i}/${count}] Creando ${instanceId}...`, 'blue');
      
      // Silenciar la salida del script individual
      const originalLog = console.log;
      console.log = () => {};
      
      createInstance(instanceId, displayName, area);
      
      console.log = originalLog;
      
      log(`   ✅ ${instanceId} creada exitosamente`, 'green');
      created.push(instanceId);
      
    } catch (error) {
      console.log = originalLog;
      log(`   ❌ Error creando ${instanceId}: ${error.message}`, 'red');
      failed.push({ id: instanceId, error: error.message });
    }
  }

  log('', 'reset');
  log('═══════════════════════════════════════════════════════════════', 'cyan');
  log('📊 RESUMEN DE CREACIÓN MASIVA', 'cyan');
  log('═══════════════════════════════════════════════════════════════', 'cyan');
  log('', 'reset');
  
  log(`✅ Instancias creadas exitosamente: ${created.length}`, 'green');
  if (created.length > 0) {
    created.forEach(id => {
      log(`   - ${id}`, 'green');
    });
  }
  
  log('', 'reset');
  
  if (failed.length > 0) {
    log(`❌ Instancias con errores: ${failed.length}`, 'red');
    failed.forEach(({ id, error }) => {
      log(`   - ${id}: ${error}`, 'red');
    });
    log('', 'reset');
  }
  
  log('🎯 Próximos pasos:', 'cyan');
  log('   1. Las instancias están listas y serán detectadas automáticamente', 'blue');
  log('   2. Puedes renombrarlas con: node scripts/rename-instance.js <id> <nombre> <area>', 'blue');
  log('   3. Personaliza prompts y conocimiento según necesites', 'blue');
  log('   4. Reinicia el servidor para verlas en el frontend', 'blue');
  log('', 'reset');
  
  log('📋 Listar todas las instancias:', 'yellow');
  log('   node scripts/list-instances.js', 'yellow');
  log('', 'reset');
}

// Ejecutar
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
${colors.cyan}╔════════════════════════════════════════════════════════════════╗
║  LexCode - Creador Masivo de Instancias                       ║
╚════════════════════════════════════════════════════════════════╝${colors.reset}

${colors.yellow}Uso:${colors.reset}
  node scripts/batch-create-instances.js <cantidad> [prefijo]

${colors.yellow}Parámetros:${colors.reset}
  cantidad    Número de instancias a crear (1-100)
  prefijo     Prefijo para los IDs (opcional, default: 'inst')

${colors.yellow}Ejemplos:${colors.reset}
  ${colors.green}# Crear 5 instancias: inst1, inst2, inst3, inst4, inst5${colors.reset}
  node scripts/batch-create-instances.js 5

  ${colors.green}# Crear 10 instancias con prefijo personalizado${colors.reset}
  node scripts/batch-create-instances.js 10 especialidad

  ${colors.green}# Crear 3 áreas${colors.reset}
  node scripts/batch-create-instances.js 3 area

${colors.yellow}Resultado:${colors.reset}
  - Crea múltiples instancias con configuración funcional
  - Cada instancia tiene estructura completa
  - Nombres genéricos que pueden renombrarse después
  - Detección automática por backend
  - Integración automática en frontend

${colors.yellow}Renombrar después:${colors.reset}
  node scripts/rename-instance.js inst1 "Civil" "derecho civil chileno"
  node scripts/rename-instance.js inst2 "Laboral" "derecho laboral chileno"
`);
    process.exit(0);
  }
  
  const count = parseInt(args[0], 10);
  const prefix = args[1] || 'inst';
  
  if (isNaN(count)) {
    log('❌ Error: La cantidad debe ser un número', 'red');
    process.exit(1);
  }
  
  batchCreateInstances(count, prefix);
}

module.exports = { batchCreateInstances };

