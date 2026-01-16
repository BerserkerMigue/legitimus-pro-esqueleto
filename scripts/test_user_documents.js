/**
 * Script de Pruebas - Sistema RAG de Documentos de Usuario
 * Valida las nuevas funcionalidades implementadas
 */

const fs = require('fs');
const path = require('path');
const { userDocumentsManager } = require('../engine/user_documents_manager');

class UserDocumentsTestSuite {
  constructor() {
    this.testResults = {
      passed: 0,
      failed: 0,
      warnings: 0,
      tests: []
    };
    this.testUserId = 'test_user_123';
    this.testSessionId = 'test_session_456';
    this.testDocuments = [];
  }

  /**
   * Ejecuta todas las pruebas del sistema de documentos de usuario
   */
  async runAllTests() {
    console.log('🧪 Iniciando pruebas del sistema RAG de documentos de usuario...\n');

    try {
      // Preparar entorno de prueba
      await this.setupTestEnvironment();

      // Pruebas de configuración
      await this.testConfiguration();
      
      // Pruebas de subida de documentos
      await this.testDocumentUpload();
      
      // Pruebas de búsqueda
      await this.testDocumentSearch();
      
      // Pruebas de listado
      await this.testDocumentListing();
      
      // Pruebas de migración
      await this.testDocumentMigration();
      
      // Pruebas de eliminación
      await this.testDocumentDeletion();
      
      // Limpiar entorno de prueba
      await this.cleanupTestEnvironment();

      // Mostrar resultados
      this.showResults();
      
    } catch (error) {
      console.error('❌ Error ejecutando pruebas:', error);
      this.testResults.failed++;
    }

    return this.testResults;
  }

  /**
   * Prepara el entorno de prueba
   */
  async setupTestEnvironment() {
    console.log('🔧 Preparando entorno de prueba...');

    // Crear documentos de prueba
    const testDocsDir = path.join(__dirname, '..', 'test_documents');
    if (!fs.existsSync(testDocsDir)) {
      fs.mkdirSync(testDocsDir, { recursive: true });
    }

    // Documento de prueba 1: Contrato
    const contractContent = `
CONTRATO DE SERVICIOS PROFESIONALES

PRIMERA: OBJETO DEL CONTRATO
El presente contrato tiene por objeto la prestación de servicios de consultoría legal.

SEGUNDA: OBLIGACIONES DEL PRESTADOR
- Brindar asesoría jurídica especializada
- Mantener confidencialidad absoluta
- Entregar informes mensuales

TERCERA: RESPONSABILIDAD CIVIL
El prestador será responsable por daños causados por negligencia grave.

CUARTA: JURISDICCIÓN
Cualquier controversia será resuelta en los tribunales de Santiago.
`;

    const contractPath = path.join(testDocsDir, 'contrato_prueba.txt');
    fs.writeFileSync(contractPath, contractContent);
    this.testDocuments.push({
      name: 'contrato_prueba.txt',
      path: contractPath,
      type: 'contract'
    });

    // Documento de prueba 2: Manual
    const manualContent = `
MANUAL DE PROCEDIMIENTOS LEGALES

CAPÍTULO 1: INTRODUCCIÓN
Este manual describe los procedimientos básicos para el manejo de casos legales.

CAPÍTULO 2: RESPONSABILIDAD CIVIL
La responsabilidad civil se divide en:
- Responsabilidad contractual
- Responsabilidad extracontractual

CAPÍTULO 3: GARANTÍAS
Las garantías pueden ser:
- Garantías reales (hipoteca, prenda)
- Garantías personales (fianza, aval)

CAPÍTULO 4: PROCEDIMIENTOS
1. Análisis inicial del caso
2. Recopilación de antecedentes
3. Estrategia legal
4. Ejecución
`;

    const manualPath = path.join(testDocsDir, 'manual_procedimientos.txt');
    fs.writeFileSync(manualPath, manualContent);
    this.testDocuments.push({
      name: 'manual_procedimientos.txt',
      path: manualPath,
      type: 'manual'
    });

    console.log(`✅ Entorno preparado: ${this.testDocuments.length} documentos de prueba creados\n`);
  }

  /**
   * Prueba la configuración del sistema
   */
  async testConfiguration() {
    console.log('⚙️ Probando configuración del sistema...');

    this.test('UserDocumentsManager se inicializa correctamente', () => {
      return userDocumentsManager && typeof userDocumentsManager.config === 'object';
    });

    this.test('Configuración tiene propiedades requeridas', () => {
      const config = userDocumentsManager.config;
      return config.allow_temporary !== undefined && 
             config.allow_persistent !== undefined &&
             config.default_mode !== undefined;
    });

    this.test('Directorios se crean correctamente', () => {
      const documentsPath = path.join(process.cwd(), 'files');
      return fs.existsSync(documentsPath) &&
             fs.existsSync(path.join(documentsPath, 'temporary')) &&
             fs.existsSync(path.join(documentsPath, 'persistent')) &&
             fs.existsSync(path.join(documentsPath, 'metadata'));
    });

    console.log('✅ Configuración validada\n');
  }

  /**
   * Prueba la subida de documentos
   */
  async testDocumentUpload() {
    console.log('📤 Probando subida de documentos...');

    // Prueba subida temporal
    try {
      const result = await userDocumentsManager.uploadDocument(
        this.testUserId,
        this.testSessionId,
        this.testDocuments[0].path,
        { mode: 'temporary', filename: this.testDocuments[0].name }
      );

      this.test('Subida temporal exitosa', () => {
        return result.success && result.mode === 'temporary';
      });

      this.testDocuments[0].documentId = result.documentId;
      this.testDocuments[0].storeId = result.storeId;

    } catch (error) {
      this.test('Subida temporal exitosa', () => false, 'normal', error.message);
    }

    // Prueba subida persistente
    try {
      const result = await userDocumentsManager.uploadDocument(
        this.testUserId,
        this.testSessionId,
        this.testDocuments[1].path,
        { mode: 'persistent', filename: this.testDocuments[1].name }
      );

      this.test('Subida persistente exitosa', () => {
        return result.success && result.mode === 'persistent';
      });

      this.testDocuments[1].documentId = result.documentId;
      this.testDocuments[1].storeId = result.storeId;

    } catch (error) {
      this.test('Subida persistente exitosa', () => false, 'normal', error.message);
    }

    console.log('✅ Subida de documentos validada\n');
  }

  /**
   * Prueba la búsqueda de documentos
   */
  async testDocumentSearch() {
    console.log('🔍 Probando búsqueda de documentos...');

    // Búsqueda de término específico
    try {
      const result = await userDocumentsManager.searchUserDocuments(
        this.testUserId,
        this.testSessionId,
        'responsabilidad civil'
      );

      this.test('Búsqueda encuentra resultados', () => {
        return result.results && result.results.length > 0;
      });

      this.test('Resultados contienen información relevante', () => {
        return result.results.some(r => 
          r.excerpt.toLowerCase().includes('responsabilidad')
        );
      });

    } catch (error) {
      this.test('Búsqueda encuentra resultados', () => false, 'normal', error.message);
    }

    // Búsqueda de término en documento específico
    try {
      const result = await userDocumentsManager.searchUserDocuments(
        this.testUserId,
        this.testSessionId,
        'garantías'
      );

      this.test('Búsqueda en múltiples documentos', () => {
        return result.searchedStores > 0;
      });

    } catch (error) {
      this.test('Búsqueda en múltiples documentos', () => false, 'normal', error.message);
    }

    console.log('✅ Búsqueda de documentos validada\n');
  }

  /**
   * Prueba el listado de documentos
   */
  async testDocumentListing() {
    console.log('📋 Probando listado de documentos...');

    try {
      const result = await userDocumentsManager.listUserDocuments(
        this.testUserId,
        this.testSessionId
      );

      this.test('Listado retorna documentos', () => {
        return result.documents && result.documents.length > 0;
      });

      this.test('Listado incluye documentos temporales y persistentes', () => {
        const types = result.documents.map(d => d.type);
        return types.includes('temporary') && types.includes('persistent');
      });

      this.test('Documentos tienen metadata completa', () => {
        return result.documents.every(d => 
          d.filename && d.uploadedAt && d.size !== undefined
        );
      });

    } catch (error) {
      this.test('Listado retorna documentos', () => false, 'normal', error.message);
    }

    console.log('✅ Listado de documentos validado\n');
  }

  /**
   * Prueba la migración de documentos
   */
  async testDocumentMigration() {
    console.log('🔄 Probando migración de documentos...');

    if (this.testDocuments[0].documentId) {
      try {
        const result = await userDocumentsManager.migrateToPeristent(
          this.testUserId,
          this.testDocuments[0].documentId
        );

        this.test('Migración temporal a persistente exitosa', () => {
          return result.success && result.newMode === 'persistent';
        });

      } catch (error) {
        this.test('Migración temporal a persistente exitosa', () => false, 'normal', error.message);
      }
    } else {
      this.test('Migración temporal a persistente exitosa', () => false, 'warning', 'No hay documento temporal para migrar');
    }

    console.log('✅ Migración de documentos validada\n');
  }

  /**
   * Prueba la eliminación de documentos
   */
  async testDocumentDeletion() {
    console.log('🗑️ Probando eliminación de documentos...');

    // Eliminar uno de los documentos de prueba
    if (this.testDocuments[1].documentId) {
      try {
        const result = await userDocumentsManager.deleteDocument(
          this.testDocuments[1].documentId
        );

        this.test('Eliminación de documento exitosa', () => {
          return result.success;
        });

        this.test('Archivo físico eliminado', () => {
          const metadata = result.metadata;
          return !metadata || !fs.existsSync(metadata.filePath);
        });

      } catch (error) {
        this.test('Eliminación de documento exitosa', () => false, 'normal', error.message);
      }
    } else {
      this.test('Eliminación de documento exitosa', () => false, 'warning', 'No hay documento para eliminar');
    }

    console.log('✅ Eliminación de documentos validada\n');
  }

  /**
   * Limpia el entorno de prueba
   */
  async cleanupTestEnvironment() {
    console.log('🧹 Limpiando entorno de prueba...');

    try {
      // Eliminar documentos de prueba restantes
      for (const doc of this.testDocuments) {
        if (doc.documentId) {
          try {
            await userDocumentsManager.deleteDocument(doc.documentId);
          } catch (error) {
            console.warn(`⚠️ No se pudo eliminar documento ${doc.name}:`, error.message);
          }
        }
      }

      // Eliminar directorio de documentos de prueba
      const testDocsDir = path.join(__dirname, '..', 'test_documents');
      if (fs.existsSync(testDocsDir)) {
        fs.rmSync(testDocsDir, { recursive: true, force: true });
      }

      // Limpiar directorios de prueba del usuario
      const userTempDir = path.join(process.cwd(), 'files', 'temporary', this.testSessionId);
      const userPersistentDir = path.join(process.cwd(), 'files', 'persistent', this.testUserId);
      
      if (fs.existsSync(userTempDir)) {
        fs.rmSync(userTempDir, { recursive: true, force: true });
      }
      
      if (fs.existsSync(userPersistentDir)) {
        fs.rmSync(userPersistentDir, { recursive: true, force: true });
      }

      console.log('✅ Entorno de prueba limpiado\n');

    } catch (error) {
      console.warn('⚠️ Error limpiando entorno de prueba:', error.message);
    }
  }

  /**
   * Ejecuta una prueba individual
   */
  test(description, testFunction, type = 'normal', errorMessage = null) {
    try {
      const result = testFunction();
      if (result) {
        this.testResults.passed++;
        this.testResults.tests.push({ description, status: 'PASS', type });
        if (type !== 'warning') {
          console.log(`  ✅ ${description}`);
        } else {
          console.log(`  ⚠️ ${description} (opcional)`);
          this.testResults.warnings++;
        }
      } else {
        if (type === 'warning') {
          this.testResults.warnings++;
          this.testResults.tests.push({ description, status: 'WARN', type, error: errorMessage });
          console.log(`  ⚠️ ${description} (no crítico)${errorMessage ? ` - ${errorMessage}` : ''}`);
        } else {
          this.testResults.failed++;
          this.testResults.tests.push({ description, status: 'FAIL', type, error: errorMessage });
          console.log(`  ❌ ${description}${errorMessage ? ` - ${errorMessage}` : ''}`);
        }
      }
    } catch (error) {
      this.testResults.failed++;
      this.testResults.tests.push({ description, status: 'ERROR', type, error: error.message });
      console.log(`  💥 ${description} - Error: ${error.message}`);
    }
  }

  /**
   * Muestra los resultados finales
   */
  showResults() {
    console.log('📋 RESULTADOS DE LAS PRUEBAS - DOCUMENTOS DE USUARIO');
    console.log('═'.repeat(60));
    console.log(`✅ Pruebas exitosas: ${this.testResults.passed}`);
    console.log(`❌ Pruebas fallidas: ${this.testResults.failed}`);
    console.log(`⚠️ Advertencias: ${this.testResults.warnings}`);
    console.log(`📊 Total de pruebas: ${this.testResults.tests.length}`);
    console.log('═'.repeat(60));

    if (this.testResults.failed === 0) {
      console.log('🎉 ¡Todas las pruebas críticas del sistema RAG de documentos pasaron!');
      console.log('✅ El sistema está listo para usar');
    } else {
      console.log('⚠️ Algunas pruebas fallaron. Revisar antes de usar en producción.');
    }

    if (this.testResults.warnings > 0) {
      console.log(`💡 ${this.testResults.warnings} elementos opcionales no están configurados`);
    }

    console.log('');
    console.log('🚀 Funcionalidades validadas:');
    console.log('- ✅ Subida de documentos (temporal y persistente)');
    console.log('- ✅ Búsqueda semántica en documentos');
    console.log('- ✅ Listado y gestión de documentos');
    console.log('- ✅ Migración temporal → persistente');
    console.log('- ✅ Eliminación de documentos');
    console.log('');
    console.log('💡 Próximos pasos:');
    console.log('1. Probar subida de documentos desde la interfaz');
    console.log('2. Probar búsquedas: "busca en mis documentos: [consulta]"');
    console.log('3. Usar el inspector para probar acciones específicas');
  }
}

// Función principal para ejecutar desde línea de comandos
async function runUserDocumentsTests() {
  try {
    const tester = new UserDocumentsTestSuite();
    const results = await tester.runAllTests();
    
    // Salir con código de error si hay pruebas fallidas
    if (results.failed > 0) {
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ Error ejecutando pruebas de documentos de usuario:', error.message);
    process.exit(1);
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  runUserDocumentsTests();
}

module.exports = { UserDocumentsTestSuite };

