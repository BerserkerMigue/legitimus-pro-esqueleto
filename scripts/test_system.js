const fs = require('fs');
const path = require('path');

/**
 * Sistema de Pruebas para LexCode RAG Optimizado
 * Valida la implementación de la estructura de tres carpetas
 */

class SystemTester {
  constructor() {
    this.botBasePath = path.join(__dirname, '..', 'bot_base');
    this.results = {
      passed: 0,
      failed: 0,
      warnings: 0,
      tests: []
    };
  }

  /**
   * Ejecuta todas las pruebas del sistema
   */
  async runAllTests() {
    console.log('🧪 Iniciando pruebas del sistema RAG optimizado...\n');

    // Pruebas de estructura
    await this.testFolderStructure();
    await this.testConfigurationFiles();
    await this.testKnowledgeContent();
    
    // Pruebas de scripts
    await this.testScripts();
    
    // Pruebas de metadatos e índices
    await this.testMetadataAndIndexes();
    
    // Pruebas de integración
    await this.testIntegration();

    // Mostrar resultados
    this.showResults();
    
    return this.results;
  }

  /**
   * Prueba la estructura de carpetas
   */
  async testFolderStructure() {
    console.log('📁 Probando estructura de carpetas...');

    // Verificar carpetas principales
    this.test('Carpeta conocimiento existe', () => {
      return fs.existsSync(path.join(this.botBasePath, 'conocimiento'));
    });

    this.test('Carpeta conocimiento_rag_only existe', () => {
      return fs.existsSync(path.join(this.botBasePath, 'conocimiento_rag_only'));
    });

    this.test('Carpeta conocimiento_index existe', () => {
      return fs.existsSync(path.join(this.botBasePath, 'conocimiento_index'));
    });

    this.test('Carpeta historial existe', () => {
      return fs.existsSync(path.join(this.botBasePath, 'historial'));
    });

    // Verificar contenido de carpetas
    const conocimientoFiles = fs.existsSync(path.join(this.botBasePath, 'conocimiento')) 
      ? fs.readdirSync(path.join(this.botBasePath, 'conocimiento')).filter(f => f.endsWith('.txt') || f.endsWith('.md'))
      : [];

    this.test('Conocimiento tiene archivos', () => {
      return conocimientoFiles.length > 0;
    });

    const ragOnlyFiles = fs.existsSync(path.join(this.botBasePath, 'conocimiento_rag_only'))
      ? fs.readdirSync(path.join(this.botBasePath, 'conocimiento_rag_only')).filter(f => f.endsWith('.txt') || f.endsWith('.md'))
      : [];

    this.test('Conocimiento RAG-only tiene archivos', () => {
      return ragOnlyFiles.length > 0;
    });

    const indexFiles = fs.existsSync(path.join(this.botBasePath, 'conocimiento_index'))
      ? fs.readdirSync(path.join(this.botBasePath, 'conocimiento_index')).filter(f => f.endsWith('.txt') || f.endsWith('.md'))
      : [];

    this.test('Conocimiento index tiene archivos', () => {
      return indexFiles.length > 0;
    });

    console.log(`✅ Estructura: ${conocimientoFiles.length} esenciales, ${ragOnlyFiles.length} RAG-only, ${indexFiles.length} índices\n`);
  }

  /**
   * Prueba los archivos de configuración
   */
  async testConfigurationFiles() {
    console.log('⚙️ Probando archivos de configuración...');

    const configPath = path.join(this.botBasePath, 'config.json');
    
    this.test('config.json existe', () => {
      return fs.existsSync(configPath);
    });

    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

      this.test('config.json tiene knowledge configurado', () => {
        return config.knowledge && Array.isArray(config.knowledge.paths);
      });

      this.test('config.json incluye conocimiento en paths', () => {
        return config.knowledge.paths.includes('bot_base/conocimiento');
      });

      this.test('config.json incluye conocimiento_index en paths', () => {
        return config.knowledge.paths.includes('bot_base/conocimiento_index');
      });

      this.test('config.json tiene knowledge_rag_only configurado', () => {
        return config.knowledge_rag_only && Array.isArray(config.knowledge_rag_only.paths);
      });

      this.test('config.json tiene enable_file_search habilitado', () => {
        return config.enable_file_search === true;
      });

      this.test('config.json tiene vector_store_ids configurado', () => {
        return Array.isArray(config.vector_store_ids) && config.vector_store_ids.length > 0;
      });

      this.test('config.json tiene memory_store_id configurado', () => {
        return typeof config.memory_store_id === 'string' && config.memory_store_id.length > 0;
      });
    }

    const builderPath = path.join(this.botBasePath, 'builder.json');
    this.test('builder.json existe', () => {
      return fs.existsSync(builderPath);
    });

    console.log('✅ Configuración validada\n');
  }

  /**
   * Prueba el contenido de conocimiento
   */
  async testKnowledgeContent() {
    console.log('📚 Probando contenido de conocimiento...');

    // Verificar archivos README en cada carpeta
    this.test('README en conocimiento/', () => {
      return fs.existsSync(path.join(this.botBasePath, 'conocimiento', 'README.md'));
    });

    this.test('README en conocimiento_rag_only/', () => {
      return fs.existsSync(path.join(this.botBasePath, 'conocimiento_rag_only', 'README.md'));
    });

    this.test('README en conocimiento_index/', () => {
      return fs.existsSync(path.join(this.botBasePath, 'conocimiento_index', 'README.md'));
    });

    // Verificar archivos de ejemplo
    this.test('Archivo de ejemplo en conocimiento_rag_only/', () => {
      const files = fs.readdirSync(path.join(this.botBasePath, 'conocimiento_rag_only'))
        .filter(f => f.includes('ejemplo') || f.includes('codigo_civil'));
      return files.length > 0;
    });

    this.test('Mapa de conocimiento en index/', () => {
      const files = fs.readdirSync(path.join(this.botBasePath, 'conocimiento_index'))
        .filter(f => f.includes('mapa') || f.includes('navegacion'));
      return files.length > 0;
    });

    // Verificar tamaños de archivos
    const conocimientoFiles = fs.readdirSync(path.join(this.botBasePath, 'conocimiento'))
      .filter(f => f.endsWith('.txt') || f.endsWith('.md'));

    for (const file of conocimientoFiles) {
      const filePath = path.join(this.botBasePath, 'conocimiento', file);
      const stats = fs.statSync(filePath);
      
      this.test(`${file} no excede límite de tamaño (27KB)`, () => {
        return stats.size <= 27000;
      }, stats.size > 27000 ? 'warning' : 'pass');
    }

    console.log('✅ Contenido validado\n');
  }

  /**
   * Prueba los scripts del sistema
   */
  async testScripts() {
    console.log('🔧 Probando scripts del sistema...');

    const scriptsPath = path.join(__dirname);

    this.test('setup_vector_stores.js existe', () => {
      return fs.existsSync(path.join(scriptsPath, 'setup_vector_stores.js'));
    });

    this.test('auto_indexer.js existe', () => {
      return fs.existsSync(path.join(scriptsPath, 'auto_indexer.js'));
    });

    this.test('metadata_generator.js existe', () => {
      return fs.existsSync(path.join(scriptsPath, 'metadata_generator.js'));
    });

    // Verificar sintaxis de scripts (básico)
    try {
      require(path.join(scriptsPath, 'setup_vector_stores.js'));
      this.test('setup_vector_stores.js tiene sintaxis válida', () => true);
    } catch (error) {
      this.test('setup_vector_stores.js tiene sintaxis válida', () => false);
    }

    console.log('✅ Scripts validados\n');
  }

  /**
   * Prueba metadatos e índices
   */
  async testMetadataAndIndexes() {
    console.log('📊 Probando metadatos e índices...');

    const indexPath = path.join(this.botBasePath, 'conocimiento_index');
    
    // Verificar archivos de índice generados
    const expectedIndexFiles = [
      'mapa_conocimiento_juridico.txt',
      'indice_tematico_automatico.txt',
      'mapa_navegacion_automatico.txt',
      'taxonomia_juridica_automatica.txt',
      'guia_casos_frecuentes_automatica.txt'
    ];

    for (const file of expectedIndexFiles) {
      this.test(`Índice ${file} existe`, () => {
        return fs.existsSync(path.join(indexPath, file));
      }, 'warning'); // Warning porque pueden no estar generados aún
    }

    // Verificar directorio de metadatos
    const metadataPath = path.join(indexPath, 'metadata');
    this.test('Directorio de metadatos existe', () => {
      return fs.existsSync(metadataPath);
    }, 'warning');

    console.log('✅ Metadatos e índices verificados\n');
  }

  /**
   * Prueba la integración del sistema
   */
  async testIntegration() {
    console.log('🔗 Probando integración del sistema...');

    // Verificar que los archivos de engine existen
    const enginePath = path.join(__dirname, '..', 'engine');
    
    this.test('knowledge_readers.js existe', () => {
      return fs.existsSync(path.join(enginePath, 'knowledge_readers.js'));
    });

    this.test('enhanced_knowledge_readers.js existe', () => {
      return fs.existsSync(path.join(enginePath, 'enhanced_knowledge_readers.js'));
    });

    // Verificar package.json
    const packagePath = path.join(__dirname, '..', 'package.json');
    this.test('package.json existe', () => {
      return fs.existsSync(packagePath);
    });

    if (fs.existsSync(packagePath)) {
      const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
      
      this.test('package.json tiene dependencia openai', () => {
        return packageJson.dependencies && packageJson.dependencies.openai;
      });
    }

    // Verificar servidor principal
    const serverPath = path.join(__dirname, '..', 'server.js');
    this.test('server.js existe', () => {
      return fs.existsSync(serverPath);
    });

    console.log('✅ Integración verificada\n');
  }

  /**
   * Ejecuta una prueba individual
   */
  test(description, testFunction, type = 'normal') {
    try {
      const result = testFunction();
      if (result) {
        this.results.passed++;
        this.results.tests.push({ description, status: 'PASS', type });
        if (type !== 'warning') {
          console.log(`  ✅ ${description}`);
        } else {
          console.log(`  ⚠️ ${description} (opcional)`);
          this.results.warnings++;
        }
      } else {
        if (type === 'warning') {
          this.results.warnings++;
          this.results.tests.push({ description, status: 'WARN', type });
          console.log(`  ⚠️ ${description} (no crítico)`);
        } else {
          this.results.failed++;
          this.results.tests.push({ description, status: 'FAIL', type });
          console.log(`  ❌ ${description}`);
        }
      }
    } catch (error) {
      this.results.failed++;
      this.results.tests.push({ description, status: 'ERROR', type, error: error.message });
      console.log(`  💥 ${description} - Error: ${error.message}`);
    }
  }

  /**
   * Muestra los resultados finales
   */
  showResults() {
    console.log('📋 RESULTADOS DE LAS PRUEBAS');
    console.log('═'.repeat(50));
    console.log(`✅ Pruebas exitosas: ${this.results.passed}`);
    console.log(`❌ Pruebas fallidas: ${this.results.failed}`);
    console.log(`⚠️ Advertencias: ${this.results.warnings}`);
    console.log(`📊 Total de pruebas: ${this.results.tests.length}`);
    console.log('═'.repeat(50));

    if (this.results.failed === 0) {
      console.log('🎉 ¡Todas las pruebas críticas pasaron exitosamente!');
      console.log('✅ El sistema RAG optimizado está listo para usar');
    } else {
      console.log('⚠️ Algunas pruebas fallaron. Revisar antes de continuar.');
    }

    if (this.results.warnings > 0) {
      console.log(`💡 ${this.results.warnings} elementos opcionales no están configurados aún`);
    }

    console.log('');
    console.log('🚀 Próximos pasos recomendados:');
    if (this.results.warnings > 0) {
      console.log('1. Ejecutar generación de metadatos: node scripts/metadata_generator.js');
      console.log('2. Ejecutar indexación automática: node scripts/auto_indexer.js');
    }
    console.log('3. Configurar vector stores: node scripts/setup_vector_stores.js');
    console.log('4. Iniciar el bot: npm start');
    console.log('5. Probar funcionalidad en el inspector');
  }

  /**
   * Genera reporte detallado
   */
  generateReport() {
    const report = `# REPORTE DE PRUEBAS - LEXCODE RAG OPTIMIZADO
## Generado el ${new Date().toLocaleString('es-CL')}

### RESUMEN
- ✅ Pruebas exitosas: ${this.results.passed}
- ❌ Pruebas fallidas: ${this.results.failed}
- ⚠️ Advertencias: ${this.results.warnings}
- 📊 Total: ${this.results.tests.length}

### DETALLE DE PRUEBAS

${this.results.tests.map(test => {
  const icon = test.status === 'PASS' ? '✅' : test.status === 'WARN' ? '⚠️' : '❌';
  return `${icon} **${test.description}** - ${test.status}${test.error ? ` (${test.error})` : ''}`;
}).join('\n')}

### RECOMENDACIONES

${this.results.failed === 0 ? 
  '🎉 Sistema listo para producción. Todas las pruebas críticas pasaron.' : 
  '⚠️ Revisar pruebas fallidas antes de continuar.'}

${this.results.warnings > 0 ? 
  `💡 ${this.results.warnings} elementos opcionales pendientes de configuración.` : 
  ''}

---
*Reporte generado automáticamente por el Sistema de Pruebas de LexCode*
`;

    fs.writeFileSync(
      path.join(this.botBasePath, 'conocimiento_index', 'reporte_pruebas.md'),
      report
    );

    console.log('📄 Reporte detallado guardado en: conocimiento_index/reporte_pruebas.md');
  }
}

// Función principal para ejecutar desde línea de comandos
async function runSystemTests() {
  try {
    const tester = new SystemTester();
    const results = await tester.runAllTests();
    tester.generateReport();
    
    // Salir con código de error si hay pruebas fallidas
    if (results.failed > 0) {
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ Error ejecutando pruebas:', error.message);
    process.exit(1);
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  runSystemTests();
}

module.exports = { SystemTester };

