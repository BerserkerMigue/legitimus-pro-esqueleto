#!/usr/bin/env node

/**
 * Script para renombrar instancias de LexCode
 * 
 * Actualiza el nombre de display y área de especialización de una instancia existente
 * sin cambiar su ID (que es la carpeta y el identificador interno)
 * 
 * Uso: node scripts/rename-instance.js <instance_id> <nuevo_nombre> [nueva_area]
 * 
 * Ejemplos:
 *   node scripts/rename-instance.js inst1 "Civil" "derecho civil chileno"
 *   node scripts/rename-instance.js inst2 "Laboral"
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
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Actualizar builder.json
function updateBuilder(instancePath, instanceId, newName, newArea) {
  const builderPath = path.join(instancePath, 'builder.json');
  
  if (!fs.existsSync(builderPath)) {
    throw new Error('builder.json no encontrado');
  }

  const builder = JSON.parse(fs.readFileSync(builderPath, 'utf-8'));
  
  builder.name = `LexCode ${newName}`;
  builder.initial_configuration.description = `Soy LexCode ${newName}, sistema de inteligencia jurídica especializado en ${newArea}.`;
  
  fs.writeFileSync(builderPath, JSON.stringify(builder, null, 2));
  log('   ✅ builder.json actualizado', 'green');
}

// Actualizar instance_description.txt
function updateDescription(instancePath, newName, newArea) {
  const descPath = path.join(instancePath, 'instance_description.txt');
  const newDescription = `Especialista en ${newArea}, proporcionando asesoría jurídica precisa y fundamentada en normativa chilena vigente.`;
  
  fs.writeFileSync(descPath, newDescription);
  log('   ✅ instance_description.txt actualizado', 'green');
}

// Actualizar initial_greeting.txt
function updateGreeting(instancePath, newName, newArea) {
  const greetPath = path.join(instancePath, 'initial_greeting.txt');
  const newGreeting = `Bienvenido a LexCode ${newName}

Soy tu especialista en ${newArea}. Puedo ayudarte con:

- Análisis jurídico especializado
- Interpretación de normativa chilena
- Búsqueda de jurisprudencia relevante
- Orientación en casos concretos

¿En qué puedo asistirte hoy?`;
  
  fs.writeFileSync(greetPath, newGreeting);
  log('   ✅ initial_greeting.txt actualizado', 'green');
}

// Actualizar prompts (opcional, solo si contienen el nombre anterior)
function updatePrompts(instancePath, instanceId, oldName, newName, newArea) {
  const basePromptPath = path.join(instancePath, 'prompts', `${instanceId}_base.txt`);
  const funcPromptPath = path.join(instancePath, 'prompts', `${instanceId}_funcional.txt`);
  
  // Actualizar prompt base
  if (fs.existsSync(basePromptPath)) {
    let baseContent = fs.readFileSync(basePromptPath, 'utf-8');
    
    // Reemplazar referencias al nombre anterior
    baseContent = baseContent.replace(new RegExp(`LexCode ${oldName}`, 'g'), `LexCode ${newName}`);
    baseContent = baseContent.replace(new RegExp(oldName, 'g'), newName);
    
    // Actualizar referencias al área si es genérica
    if (oldName.toLowerCase() === newArea || baseContent.includes(oldName.toLowerCase())) {
      baseContent = baseContent.replace(new RegExp(oldName.toLowerCase(), 'g'), newArea);
    }
    
    fs.writeFileSync(basePromptPath, baseContent);
    log('   ✅ prompt base actualizado', 'green');
  }
  
  // Actualizar prompt funcional
  if (fs.existsSync(funcPromptPath)) {
    let funcContent = fs.readFileSync(funcPromptPath, 'utf-8');
    
    // Reemplazar referencias al nombre anterior
    funcContent = funcContent.replace(new RegExp(`LexCode ${oldName}`, 'g'), `LexCode ${newName}`);
    funcContent = funcContent.replace(new RegExp(oldName, 'g'), newName);
    
    // Actualizar referencias al área
    if (oldName.toLowerCase() === newArea || funcContent.includes(oldName.toLowerCase())) {
      funcContent = funcContent.replace(new RegExp(oldName.toLowerCase(), 'g'), newArea);
    }
    
    fs.writeFileSync(funcPromptPath, funcContent);
    log('   ✅ prompt funcional actualizado', 'green');
  }
}

// Actualizar README.md
function updateReadme(instancePath, instanceId, newName, newArea) {
  const readmePath = path.join(instancePath, 'README.md');
  
  if (!fs.existsSync(readmePath)) {
    return; // No es crítico
  }
  
  let readme = fs.readFileSync(readmePath, 'utf-8');
  
  // Actualizar título
  readme = readme.replace(/^# LexCode .+$/m, `# LexCode ${newName}`);
  
  // Actualizar área
  readme = readme.replace(/Instancia especializada en .+\./m, `Instancia especializada en ${newArea}.`);
  
  // Actualizar sección de información general
  readme = readme.replace(/\*\*Nombre\*\*: LexCode .+$/m, `**Nombre**: LexCode ${newName}`);
  readme = readme.replace(/\*\*Área\*\*: .+$/m, `**Área**: ${newArea}`);
  
  fs.writeFileSync(readmePath, readme);
  log('   ✅ README.md actualizado', 'green');
}

// Función principal
function renameInstance(instanceId, newName, newArea = null) {
  const instancePath = path.join(INSTANCES_DIR, instanceId);
  
  // Verificar que la instancia existe
  if (!fs.existsSync(instancePath)) {
    log(`❌ Error: La instancia '${instanceId}' no existe`, 'red');
    log(`   Ubicación esperada: ${instancePath}`, 'yellow');
    process.exit(1);
  }
  
  // Valor por defecto para área
  if (!newArea) {
    newArea = newName.toLowerCase();
  }
  
  // Obtener nombre anterior
  const builderPath = path.join(instancePath, 'builder.json');
  let oldName = instanceId.charAt(0).toUpperCase() + instanceId.slice(1);
  
  if (fs.existsSync(builderPath)) {
    try {
      const builder = JSON.parse(fs.readFileSync(builderPath, 'utf-8'));
      oldName = builder.name.replace('LexCode ', '');
    } catch (e) {
      // Usar default
    }
  }
  
  log(`\n🔄 Renombrando instancia '${instanceId}'...`, 'cyan');
  log(`   Nombre anterior: LexCode ${oldName}`, 'yellow');
  log(`   Nombre nuevo: LexCode ${newName}`, 'green');
  log(`   Área nueva: ${newArea}`, 'green');
  log('', 'reset');
  
  try {
    log('📝 Actualizando archivos...', 'yellow');
    
    // Actualizar cada archivo
    updateBuilder(instancePath, instanceId, newName, newArea);
    updateDescription(instancePath, newName, newArea);
    updateGreeting(instancePath, newName, newArea);
    updatePrompts(instancePath, instanceId, oldName, newName, newArea);
    updateReadme(instancePath, instanceId, newName, newArea);
    
    log('', 'reset');
    log('✅ ¡Instancia renombrada exitosamente!', 'green');
    log('', 'reset');
    log('📊 Resumen:', 'cyan');
    log(`   ID (sin cambios): ${instanceId}`, 'blue');
    log(`   Nombre anterior: LexCode ${oldName}`, 'yellow');
    log(`   Nombre nuevo: LexCode ${newName}`, 'green');
    log(`   Área nueva: ${newArea}`, 'green');
    log(`   Ubicación: ${instancePath}`, 'blue');
    log('', 'reset');
    log('🎯 Próximos pasos:', 'cyan');
    log('   1. El backend detectará el nuevo nombre automáticamente', 'blue');
    log('   2. El frontend mostrará el nombre actualizado en el selector', 'blue');
    log('   3. Reinicia el servidor para ver los cambios', 'blue');
    log('', 'reset');
    
  } catch (error) {
    log(`\n❌ Error renombrando instancia: ${error.message}`, 'red');
    log(`   Stack: ${error.stack}`, 'red');
    process.exit(1);
  }
}

// Ejecutar
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
${colors.cyan}╔════════════════════════════════════════════════════════════════╗
║  LexCode - Renombrador de Instancias                          ║
╚════════════════════════════════════════════════════════════════╝${colors.reset}

${colors.yellow}Uso:${colors.reset}
  node scripts/rename-instance.js <instance_id> <nuevo_nombre> [nueva_area]

${colors.yellow}Parámetros:${colors.reset}
  instance_id    ID de la instancia existente (carpeta)
  nuevo_nombre   Nuevo nombre para mostrar
  nueva_area     Nueva área de especialización (opcional, default: nuevo_nombre)

${colors.yellow}Ejemplos:${colors.reset}
  ${colors.green}# Renombrar inst1 a Civil${colors.reset}
  node scripts/rename-instance.js inst1 "Civil" "derecho civil chileno"

  ${colors.green}# Renombrar inst2 a Laboral (área = laboral)${colors.reset}
  node scripts/rename-instance.js inst2 "Laboral"

  ${colors.green}# Renombrar familia a Familia y Menores${colors.reset}
  node scripts/rename-instance.js familia "Familia y Menores" "derecho de familia y menores"

${colors.yellow}Nota:${colors.reset}
  - El ID de la instancia (carpeta) NO cambia
  - Solo se actualiza el nombre de display y área
  - Los archivos de configuración se actualizan automáticamente
  - Reinicia el servidor para ver los cambios en el frontend
`);
    process.exit(0);
  }
  
  if (args.length < 2) {
    log('❌ Error: Debes proporcionar al menos el ID y el nuevo nombre', 'red');
    log('   Uso: node scripts/rename-instance.js <instance_id> <nuevo_nombre> [nueva_area]', 'yellow');
    process.exit(1);
  }
  
  const [instanceId, newName, newArea] = args;
  renameInstance(instanceId, newName, newArea);
}

module.exports = { renameInstance };

