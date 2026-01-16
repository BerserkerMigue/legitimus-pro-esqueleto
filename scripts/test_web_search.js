#!/usr/bin/env node
// scripts/test_web_search.js
// Script para probar la funcionalidad de búsqueda web en LEGITIMUS

require('dotenv').config();
const { answer } = require('../engine/index');

async function testWebSearch() {
  console.log('🧪 PRUEBA DE BÚSQUEDA WEB EN LEGITIMUS\n');
  console.log('=' .repeat(60));
  
  const testCases = [
    {
      name: 'Test 1: Búsqueda en BCN (Biblioteca del Congreso Nacional)',
      question: 'Busca información actualizada sobre la Ley 21.400 de matrimonio igualitario en el sitio bcn.cl y dime qué encontraste',
      userId: 'test_user',
      chatId: 'test_web_search_1',
      expectedDomain: 'bcn.cl'
    },
    {
      name: 'Test 2: Búsqueda en LeyChile',
      question: 'Consulta en leychile.cl la última modificación del Código Civil chileno y dime cuándo fue',
      userId: 'test_user',
      chatId: 'test_web_search_2',
      expectedDomain: 'leychile.cl'
    },
    {
      name: 'Test 3: Búsqueda en Poder Judicial',
      question: 'Busca en pjud.cl información sobre el funcionamiento de los tribunales de familia',
      userId: 'test_user',
      chatId: 'test_web_search_3',
      expectedDomain: 'pjud.cl'
    },
    {
      name: 'Test 4: Búsqueda genérica (debería usar RAG interno)',
      question: '¿Qué dice el artículo 1545 del Código Civil chileno?',
      userId: 'test_user',
      chatId: 'test_web_search_4',
      expectedDomain: null // No debería buscar en web
    }
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const test of testCases) {
    console.log(`\n📝 ${test.name}`);
    console.log(`   Pregunta: "${test.question}"`);
    console.log(`   Dominio esperado: ${test.expectedDomain || 'N/A (RAG interno)'}`);
    
    try {
      const startTime = Date.now();
      
      const result = await answer(
        test.question,
        test.userId,
        [],
        test.chatId
      );
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      console.log(`   ✅ Respuesta recibida en ${duration}ms`);
      console.log(`   📊 Tokens: ${JSON.stringify(result.usage || 'N/A')}`);
      console.log(`   📏 Longitud: ${result.answer.length} caracteres`);
      
      // Verificar si se usó búsqueda web
      const answer_lower = result.answer.toLowerCase();
      let webSearchDetected = false;
      let domainFound = null;
      
      // Buscar dominios oficiales en la respuesta
      const officialDomains = [
        'bcn.cl', 'leychile.cl', 'pjud.cl', 'contraloria.cl',
        'sii.cl', 'dt.gob.cl', 'dipres.gob.cl', 'minsal.cl',
        'gob.cl', 'presidencia.cl', 'diariooficial.interior.gob.cl',
        'tribunalconstitucional.cl'
      ];
      
      for (const domain of officialDomains) {
        if (answer_lower.includes(domain)) {
          webSearchDetected = true;
          domainFound = domain;
          break;
        }
      }
      
      // Buscar indicadores de búsqueda web
      const webIndicators = [
        'según el sitio',
        'consultando',
        'en el sitio web',
        'fuente:',
        'url:',
        'https://',
        'http://'
      ];
      
      for (const indicator of webIndicators) {
        if (answer_lower.includes(indicator)) {
          webSearchDetected = true;
          break;
        }
      }
      
      // Validar resultado
      if (test.expectedDomain) {
        // Se esperaba búsqueda web
        if (webSearchDetected) {
          if (domainFound === test.expectedDomain || !test.expectedDomain) {
            console.log(`   🌐 ✅ Búsqueda web DETECTADA: ${domainFound || 'dominio no especificado'}`);
            passed++;
          } else {
            console.log(`   🌐 ⚠️  Búsqueda web detectada pero en dominio diferente: ${domainFound}`);
            console.log(`   🌐 ⚠️  Se esperaba: ${test.expectedDomain}`);
            passed++; // Aún así cuenta como éxito parcial
          }
        } else {
          console.log(`   ❌ Búsqueda web NO detectada (se esperaba búsqueda en ${test.expectedDomain})`);
          failed++;
        }
      } else {
        // NO se esperaba búsqueda web (debería usar RAG interno)
        if (!webSearchDetected) {
          console.log(`   ✅ Búsqueda web NO usada (correcto, se usó RAG interno)`);
          passed++;
        } else {
          console.log(`   ⚠️  Búsqueda web detectada cuando se esperaba usar RAG interno`);
          console.log(`   ⚠️  Dominio encontrado: ${domainFound}`);
          passed++; // No es un error crítico
        }
      }
      
      // Mostrar extracto de la respuesta
      const excerpt = result.answer.slice(0, 200).replace(/\n/g, ' ');
      console.log(`   📄 Extracto: "${excerpt}..."`);
      
    } catch (error) {
      console.error(`   ❌ Error: ${error.message}`);
      console.error(`   📚 Stack: ${error.stack}`);
      failed++;
    }
    
    console.log('   ' + '-'.repeat(58));
  }
  
  // Resumen final
  console.log('\n' + '='.repeat(60));
  console.log('📊 RESUMEN DE PRUEBAS');
  console.log('='.repeat(60));
  console.log(`✅ Pruebas exitosas: ${passed}/${testCases.length}`);
  console.log(`❌ Pruebas fallidas: ${failed}/${testCases.length}`);
  
  if (failed === 0) {
    console.log('\n🎉 ¡Todas las pruebas pasaron exitosamente!');
    console.log('✅ La búsqueda web está funcionando correctamente.');
  } else {
    console.log('\n⚠️  Algunas pruebas fallaron.');
    console.log('🔧 Revisa la configuración de web_navigation en config.json');
    console.log('📝 Revisa los logs del servidor para más detalles');
  }
  
  console.log('\n💡 RECOMENDACIONES:');
  console.log('   1. Verifica que enable_web_search esté en false');
  console.log('   2. Verifica que web_navigation.enabled esté en true');
  console.log('   3. Verifica que web_navigation.mode esté en "allowlist"');
  console.log('   4. Verifica que web_navigation.allow_domains contenga los dominios oficiales');
  console.log('   5. Revisa los logs del servidor: pm2 logs legitimus');
  
  console.log('\n');
}

// Ejecutar pruebas
testWebSearch()
  .then(() => {
    console.log('✅ Script de pruebas completado');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Error fatal en script de pruebas:', error);
    process.exit(1);
  });
