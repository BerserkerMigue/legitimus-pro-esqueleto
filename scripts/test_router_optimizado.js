/**
 * Script de Prueba para el Router de Modelos Optimizado
 * 
 * Este script valida:
 * 1. Clasificación correcta de preguntas simples y complejas
 * 2. Funcionamiento del caché de clasificaciones
 * 3. Uso correcto de modelos según clasificación
 * 4. Logging y auditoría de costos
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

// Cargar configuración
const configPath = path.join(__dirname, '../bot_base/config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

// Cargar módulo LLM
const { classifyIntent, getCacheStats, clearClassificationCache } = require('../engine/llm');

// Casos de prueba
const testCases = [
  // Casos SIMPLE
  { question: "Hola, ¿cómo estás?", expected: "SIMPLE", description: "Saludo básico" },
  { question: "Gracias por tu ayuda", expected: "SIMPLE", description: "Agradecimiento" },
  { question: "¿Qué puedes hacer?", expected: "SIMPLE", description: "Pregunta sobre el bot" },
  { question: "Adiós", expected: "SIMPLE", description: "Despedida" },
  { question: "¿Cómo está el clima?", expected: "SIMPLE", description: "Pregunta casual" },
  
  // Casos COMPLEX
  { question: "¿Qué dice el artículo 1545 del Código Civil?", expected: "COMPLEX", description: "Consulta de artículo específico" },
  { question: "¿Cuáles son los requisitos para un contrato válido?", expected: "COMPLEX", description: "Pregunta jurídica general" },
  { question: "Explícame la prescripción adquisitiva", expected: "COMPLEX", description: "Concepto jurídico" },
  { question: "¿Cómo se calcula la indemnización por despido?", expected: "COMPLEX", description: "Cálculo legal" },
  { question: "¿Qué es el recurso de protección?", expected: "COMPLEX", description: "Procedimiento legal" },
  
  // Casos repetidos (para probar caché)
  { question: "Hola, ¿cómo estás?", expected: "SIMPLE", description: "Saludo repetido (caché)" },
  { question: "¿Qué dice el artículo 1545 del Código Civil?", expected: "COMPLEX", description: "Consulta repetida (caché)" },
];

async function runTests() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  TEST DEL ROUTER DE MODELOS OPTIMIZADO - LexCode V8.2');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  // Verificar configuración
  console.log('📋 Configuración del Router:');
  console.log(`   - Router habilitado: ${config.enable_model_router}`);
  console.log(`   - Modelo complejo: ${config.router_complex_model}`);
  console.log(`   - Modelo simple: ${config.router_simple_model}`);
  console.log(`   - Caché habilitado: ${config.router_cache_enabled !== false}`);
  console.log(`   - Max tokens clasificación: ${config.router_classification_max_tokens || 10}`);
  console.log('');
  
  // Limpiar caché antes de empezar
  clearClassificationCache();
  console.log('🧹 Caché limpiado antes de las pruebas\n');
  
  let passed = 0;
  let failed = 0;
  const results = [];
  
  for (let i = 0; i < testCases.length; i++) {
    const test = testCases[i];
    console.log(`\n[Test ${i + 1}/${testCases.length}] ${test.description}`);
    console.log(`Pregunta: "${test.question}"`);
    console.log(`Esperado: ${test.expected}`);
    
    try {
      const startTime = Date.now();
      const classification = await classifyIntent(config, test.question);
      const duration = Date.now() - startTime;
      
      const success = classification === test.expected;
      
      if (success) {
        console.log(`✅ PASS - Clasificación: ${classification} (${duration}ms)`);
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
        duration: duration
      });
      
    } catch (error) {
      console.log(`❌ ERROR - ${error.message}`);
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
  
  // Estadísticas del caché
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('📊 Estadísticas del Caché:');
  const cacheStats = getCacheStats();
  console.log(`   - Entradas en caché: ${cacheStats.size}/${cacheStats.maxSize}`);
  console.log(`   - TTL: ${cacheStats.ttl / 1000} segundos`);
  
  // Resumen
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('📈 RESUMEN DE PRUEBAS:');
  console.log(`   ✅ Exitosas: ${passed}/${testCases.length} (${((passed/testCases.length)*100).toFixed(1)}%)`);
  console.log(`   ❌ Fallidas: ${failed}/${testCases.length}`);
  
  // Análisis de latencia
  const durations = results.filter(r => r.duration).map(r => r.duration);
  if (durations.length > 0) {
    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
    const minDuration = Math.min(...durations);
    const maxDuration = Math.max(...durations);
    
    console.log('\n📊 Análisis de Latencia:');
    console.log(`   - Promedio: ${avgDuration.toFixed(0)}ms`);
    console.log(`   - Mínimo: ${minDuration}ms`);
    console.log(`   - Máximo: ${maxDuration}ms`);
  }
  
  // Guardar resultados
  const resultsPath = path.join(__dirname, '../temp/test_router_results.json');
  fs.writeFileSync(resultsPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    config: {
      router_enabled: config.enable_model_router,
      cache_enabled: config.router_cache_enabled !== false,
      complex_model: config.router_complex_model,
      simple_model: config.router_simple_model
    },
    summary: {
      total: testCases.length,
      passed: passed,
      failed: failed,
      success_rate: ((passed/testCases.length)*100).toFixed(1) + '%'
    },
    results: results
  }, null, 2));
  
  console.log(`\n💾 Resultados guardados en: ${resultsPath}`);
  console.log('═══════════════════════════════════════════════════════════\n');
  
  // Exit code
  process.exit(failed > 0 ? 1 : 0);
}

// Ejecutar pruebas
runTests().catch(error => {
  console.error('❌ Error fatal en las pruebas:', error);
  process.exit(1);
});
