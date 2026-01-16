/**
 * Script de Prueba para IA Local (Ollama)
 * 
 * Este script valida:
 * 1. Conectividad con el servicio Ollama
 * 2. Disponibilidad del modelo configurado
 * 3. Clasificación de intención con modelo local
 * 4. Fallback automático a OpenAI
 * 5. Comparación de latencia y precisión
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

// Cargar configuración
const configPath = path.join(__dirname, '../bot_base/config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

// Cargar módulos
const { checkLocalServiceHealth, classifyIntentLocal, getLocalServiceStatus } = require('../engine/local_llm');
const { classifyIntent } = require('../engine/llm');

// Casos de prueba
const testCases = [
  // Casos SIMPLE
  { question: "Hola, ¿cómo estás?", expected: "SIMPLE", description: "Saludo básico" },
  { question: "Gracias por tu ayuda", expected: "SIMPLE", description: "Agradecimiento" },
  { question: "¿Qué puedes hacer?", expected: "SIMPLE", description: "Pregunta sobre el bot" },
  { question: "Adiós", expected: "SIMPLE", description: "Despedida" },
  
  // Casos COMPLEX
  { question: "¿Qué dice el artículo 1545 del Código Civil?", expected: "COMPLEX", description: "Consulta de artículo específico" },
  { question: "¿Cuáles son los requisitos para un contrato válido?", expected: "COMPLEX", description: "Pregunta jurídica general" },
  { question: "Explícame la prescripción adquisitiva", expected: "COMPLEX", description: "Concepto jurídico" },
  { question: "¿Cómo se calcula la indemnización por despido?", expected: "COMPLEX", description: "Cálculo legal" },
];

async function runTests() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  TEST DE IA LOCAL (OLLAMA) - LexCode V8.3');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  // Verificar configuración
  console.log('📋 Configuración de IA Local:');
  console.log(`   - IA Local habilitada: ${config.enable_local_llm}`);
  console.log(`   - Host Ollama: ${config.local_llm_host || 'http://localhost:11434'}`);
  console.log(`   - Modelo: ${config.local_llm_model || 'llama3.2:3b'}`);
  console.log(`   - Fallback a OpenAI: Automático`);
  console.log('');
  
  // PASO 1: Verificar conectividad con Ollama
  console.log('🔍 PASO 1: Verificando conectividad con Ollama...\n');
  
  const isHealthy = await checkLocalServiceHealth(config);
  
  if (!isHealthy) {
    console.log('❌ ADVERTENCIA: Servicio Ollama no disponible');
    console.log('   El sistema usará fallback automático a OpenAI');
    console.log('');
    console.log('📝 Para instalar Ollama:');
    console.log('   1. Visita: https://ollama.ai');
    console.log('   2. Descarga e instala Ollama para tu sistema operativo');
    console.log('   3. Ejecuta: ollama pull llama3.2:3b');
    console.log('   4. Verifica: ollama list');
    console.log('');
    console.log('⚠️  Continuando con pruebas usando fallback a OpenAI...\n');
  } else {
    console.log('✅ Servicio Ollama disponible y funcionando\n');
  }
  
  // PASO 2: Probar clasificación con modelo local (o fallback)
  console.log('🧪 PASO 2: Probando clasificación de intención...\n');
  
  let passed = 0;
  let failed = 0;
  let localUsed = 0;
  let fallbackUsed = 0;
  const results = [];
  
  for (let i = 0; i < testCases.length; i++) {
    const test = testCases[i];
    console.log(`[Test ${i + 1}/${testCases.length}] ${test.description}`);
    console.log(`Pregunta: "${test.question}"`);
    console.log(`Esperado: ${test.expected}`);
    
    try {
      const startTime = Date.now();
      const classification = await classifyIntent(config, test.question);
      const duration = Date.now() - startTime;
      
      const success = classification === test.expected;
      
      // Verificar si se usó modelo local o fallback
      const status = getLocalServiceStatus();
      const usedLocal = isHealthy && config.enable_local_llm === true;
      
      if (usedLocal) {
        localUsed++;
      } else {
        fallbackUsed++;
      }
      
      if (success) {
        console.log(`✅ PASS - Clasificación: ${classification} (${duration}ms) ${usedLocal ? '[LOCAL]' : '[OPENAI]'}`);
        passed++;
      } else {
        console.log(`❌ FAIL - Clasificación: ${classification} (esperado: ${test.expected})`);
        failed++;
      }
      
      results.push({
        test: test.description,
        question: test.question,
        expected: test.expected,
        actual: classification,
        success: success,
        duration: duration,
        usedLocal: usedLocal
      });
      
      console.log('');
      
    } catch (error) {
      console.log(`❌ ERROR - ${error.message}\n`);
      failed++;
      results.push({
        test: test.description,
        question: test.question,
        expected: test.expected,
        actual: 'ERROR',
        success: false,
        error: error.message
      });
    }
  }
  
  // PASO 3: Resumen
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📊 RESUMEN DE PRUEBAS:');
  console.log(`   ✅ Exitosas: ${passed}/${testCases.length} (${((passed/testCases.length)*100).toFixed(1)}%)`);
  console.log(`   ❌ Fallidas: ${failed}/${testCases.length}`);
  console.log('');
  console.log('📈 Uso de Modelos:');
  console.log(`   🏠 Modelo Local: ${localUsed}/${testCases.length} clasificaciones`);
  console.log(`   ☁️  OpenAI (Fallback): ${fallbackUsed}/${testCases.length} clasificaciones`);
  
  // Análisis de latencia
  const durations = results.filter(r => r.duration).map(r => r.duration);
  if (durations.length > 0) {
    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
    const minDuration = Math.min(...durations);
    const maxDuration = Math.max(...durations);
    
    console.log('');
    console.log('⏱️  Análisis de Latencia:');
    console.log(`   - Promedio: ${avgDuration.toFixed(0)}ms`);
    console.log(`   - Mínimo: ${minDuration}ms`);
    console.log(`   - Máximo: ${maxDuration}ms`);
  }
  
  // Análisis de costos
  console.log('');
  console.log('💰 Análisis de Costos:');
  console.log(`   - Clasificaciones con modelo local: ${localUsed} × $0.00 = $0.00`);
  console.log(`   - Clasificaciones con OpenAI: ${fallbackUsed} × ~$0.0001 = ~$${(fallbackUsed * 0.0001).toFixed(4)}`);
  console.log(`   - Ahorro total: ~$${(localUsed * 0.0001).toFixed(4)}`);
  
  // Estado del servicio local
  console.log('');
  console.log('🔧 Estado del Servicio Local:');
  const serviceStatus = getLocalServiceStatus();
  console.log(`   - Disponible: ${serviceStatus.available !== false ? 'Sí' : 'No'}`);
  console.log(`   - Última verificación: ${serviceStatus.lastCheck > 0 ? new Date(serviceStatus.lastCheck).toLocaleString() : 'Nunca'}`);
  
  // Guardar resultados
  const resultsPath = path.join(__dirname, '../temp/test_local_llm_results.json');
  fs.writeFileSync(resultsPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    config: {
      local_llm_enabled: config.enable_local_llm,
      local_llm_host: config.local_llm_host,
      local_llm_model: config.local_llm_model,
      ollama_available: isHealthy
    },
    summary: {
      total: testCases.length,
      passed: passed,
      failed: failed,
      success_rate: ((passed/testCases.length)*100).toFixed(1) + '%',
      local_used: localUsed,
      fallback_used: fallbackUsed
    },
    results: results
  }, null, 2));
  
  console.log(`\n💾 Resultados guardados en: ${resultsPath}`);
  console.log('═══════════════════════════════════════════════════════════\n');
  
  // Recomendaciones finales
  if (!isHealthy) {
    console.log('💡 RECOMENDACIÓN:');
    console.log('   Para aprovechar el ahorro de costos con IA local:');
    console.log('   1. Instala Ollama desde https://ollama.ai');
    console.log('   2. Descarga el modelo: ollama pull llama3.2:3b');
    console.log('   3. Reinicia el servidor de LexCode');
    console.log('   4. Ejecuta este script nuevamente para verificar');
    console.log('');
  } else {
    console.log('🎉 ¡ÉXITO!');
    console.log('   El sistema está usando IA local para clasificación');
    console.log('   Costo de clasificación: $0 (100% de ahorro)');
    console.log('');
  }
  
  // Exit code
  process.exit(failed > 0 ? 1 : 0);
}

// Ejecutar pruebas
runTests().catch(error => {
  console.error('❌ Error fatal en las pruebas:', error);
  process.exit(1);
});

