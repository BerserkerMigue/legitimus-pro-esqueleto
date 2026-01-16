/**
 * Gestor de Documentos de Usuario con RAG
 * Maneja documentos temporales y persistentes con búsqueda semántica
 */

const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

class UserDocumentsManager {
  constructor() {
    this.userStores = new Map(); // userId -> { temporary: storeId, persistent: storeId }
    this.sessionStores = new Map(); // sessionId -> storeId
    this.documentsPath = path.join(process.cwd(), 'files');
    this.config = this.getConfig();
    
    // Asegurar que existan los directorios
    this.ensureDirectories();
  }

  getConfig() {
    const globalConfig = global.bot_config || {};
    return {
      // Configuración por defecto para documentos de usuario
      allow_temporary: true,
      allow_persistent: true,
      default_mode: 'ask_user', // 'temporary' | 'persistent' | 'ask_user'
      user_can_choose: true,
      storage_limit_mb: 100,
      retention_days: 30,
      auto_cleanup: true,
      easy_migration: true,
      // Sobrescribir con configuración del usuario si existe
      ...(globalConfig.user_documents || {})
    };
  }

  ensureDirectories() {
    const dirs = [
      this.documentsPath,
      path.join(this.documentsPath, 'temporary'),
      path.join(this.documentsPath, 'persistent'),
      path.join(this.documentsPath, 'metadata')
    ];

    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  /**
   * Genera un ID único para el documento
   */
  generateDocumentId(userId, filename, content) {
    const hash = crypto.createHash('sha256')
      .update(`${userId}-${filename}-${Date.now()}`)
      .digest('hex');
    return hash.substring(0, 16);
  }

  /**
   * Crea un vector store temporal para una sesión
   */
  async createTemporaryStore(sessionId, userId) {
    try {
      console.log(`📄 Creando vector store temporal para sesión: ${sessionId}`);
      
      const vectorStore = await client.beta.vectorStores.create({
        name: `temp_docs_${sessionId}_${userId}`,
        expires_after: {
          anchor: 'last_active_at',
          days: 1 // Los documentos temporales expiran en 1 día
        }
      });

      this.sessionStores.set(sessionId, vectorStore.id);
      console.log(`✅ Vector store temporal creado: ${vectorStore.id}`);
      
      return vectorStore.id;
    } catch (error) {
      console.error('❌ Error creando vector store temporal:', error);
      throw error;
    }
  }

  /**
   * Crea un vector store persistente para un usuario
   */
  async createPersistentStore(userId) {
    try {
      console.log(`📚 Creando vector store persistente para usuario: ${userId}`);
      
      const vectorStore = await client.beta.vectorStores.create({
        name: `user_docs_${userId}`,
        expires_after: {
          anchor: 'last_active_at',
          days: this.config.retention_days || 30
        }
      });

      // Guardar referencia del store del usuario
      if (!this.userStores.has(userId)) {
        this.userStores.set(userId, {});
      }
      this.userStores.get(userId).persistent = vectorStore.id;
      
      // Guardar en metadata para persistencia
      await this.saveUserMetadata(userId);
      
      console.log(`✅ Vector store persistente creado: ${vectorStore.id}`);
      return vectorStore.id;
    } catch (error) {
      console.error('❌ Error creando vector store persistente:', error);
      throw error;
    }
  }

  /**
   * Sube un documento al vector store apropiado
   */
  async uploadDocument(userId, sessionId, filePath, options = {}) {
    try {
      const {
        mode = this.config.default_mode,
        filename = path.basename(filePath),
        persistent = false
      } = options;

      console.log(`📤 Subiendo documento: ${filename} (modo: ${mode})`);

      let storeId;
      let documentPath;
      let documentMode = mode;

      // Determinar el modo si es 'ask_user'
      if (mode === 'ask_user') {
        documentMode = persistent ? 'persistent' : 'temporary';
      }

      // Obtener o crear el vector store apropiado
      if (documentMode === 'persistent' && this.config.allow_persistent) {
        if (!this.userStores.has(userId) || !this.userStores.get(userId).persistent) {
          storeId = await this.createPersistentStore(userId);
        } else {
          storeId = this.userStores.get(userId).persistent;
        }
        
        // Guardar archivo en carpeta persistente
        const userDir = path.join(this.documentsPath, 'persistent', userId);
        if (!fs.existsSync(userDir)) {
          fs.mkdirSync(userDir, { recursive: true });
        }
        documentPath = path.join(userDir, filename);
        
      } else {
        // Modo temporal
        if (!this.sessionStores.has(sessionId)) {
          storeId = await this.createTemporaryStore(sessionId, userId);
        } else {
          storeId = this.sessionStores.get(sessionId);
        }
        
        // Guardar archivo en carpeta temporal
        const sessionDir = path.join(this.documentsPath, 'temporary', sessionId);
        if (!fs.existsSync(sessionDir)) {
          fs.mkdirSync(sessionDir, { recursive: true });
        }
        documentPath = path.join(sessionDir, filename);
      }

      // Copiar archivo a la ubicación apropiada
      fs.copyFileSync(filePath, documentPath);

      // Subir al vector store de OpenAI
      const fileStream = fs.createReadStream(documentPath);
      const uploadedFile = await client.files.create({
        file: fileStream,
        purpose: 'assistants'
      });

      // Agregar archivo al vector store
      await client.beta.vectorStores.files.create(storeId, {
        file_id: uploadedFile.id
      });

      // Generar metadata del documento
      const documentId = this.generateDocumentId(userId, filename, fs.readFileSync(documentPath, 'utf-8'));
      const metadata = {
        id: documentId,
        filename,
        userId,
        sessionId,
        mode: documentMode,
        storeId,
        filePath: documentPath,
        openaiFileId: uploadedFile.id,
        uploadedAt: new Date().toISOString(),
        size: fs.statSync(documentPath).size
      };

      await this.saveDocumentMetadata(documentId, metadata);

      console.log(`✅ Documento subido exitosamente: ${filename} (${documentMode})`);
      
      return {
        documentId,
        storeId,
        mode: documentMode,
        filename,
        success: true
      };

    } catch (error) {
      console.error('❌ Error subiendo documento:', error);
      throw error;
    }
  }

  /**
   * Busca en los documentos del usuario usando RAG
   */
  async searchUserDocuments(userId, sessionId, query, options = {}) {
    try {
      const {
        maxResults = 5,
        includeTemporary = true,
        includePersistent = true
      } = options;

      console.log(`🔍 Buscando en documentos de usuario: "${query}"`);

      const results = [];
      const storeIds = [];

      // Agregar stores temporales si están habilitados
      if (includeTemporary && this.sessionStores.has(sessionId)) {
        storeIds.push({
          id: this.sessionStores.get(sessionId),
          type: 'temporary'
        });
      }

      // Agregar stores persistentes si están habilitados
      if (includePersistent && this.userStores.has(userId) && this.userStores.get(userId).persistent) {
        storeIds.push({
          id: this.userStores.get(userId).persistent,
          type: 'persistent'
        });
      }

      if (storeIds.length === 0) {
        return {
          results: [],
          totalResults: 0,
          query,
          message: 'No hay documentos disponibles para buscar'
        };
      }

      // Realizar búsqueda en cada store
      for (const store of storeIds) {
        try {
          // Usar la API de búsqueda de vector stores
          const searchResponse = await client.beta.vectorStores.files.list(store.id, {
            limit: maxResults
          });

          // Para cada archivo, intentar hacer una búsqueda más específica
          // Nota: Esta es una implementación básica, se puede mejorar con embeddings propios
          for (const file of searchResponse.data) {
            const metadata = await this.getDocumentMetadataByFileId(file.id);
            if (metadata) {
              // Leer contenido del archivo para hacer búsqueda básica
              const content = fs.readFileSync(metadata.filePath, 'utf-8');
              const lowerQuery = query.toLowerCase();
              const lowerContent = content.toLowerCase();
              
              if (lowerContent.includes(lowerQuery)) {
                const index = lowerContent.indexOf(lowerQuery);
                const start = Math.max(0, index - 200);
                const end = Math.min(content.length, index + 400);
                const excerpt = content.slice(start, end);

                results.push({
                  documentId: metadata.id,
                  filename: metadata.filename,
                  type: store.type,
                  relevanceScore: 0.8, // Puntuación básica
                  excerpt,
                  metadata
                });
              }
            }
          }
        } catch (error) {
          console.error(`❌ Error buscando en store ${store.id}:`, error);
        }
      }

      // Ordenar por relevancia y limitar resultados
      results.sort((a, b) => b.relevanceScore - a.relevanceScore);
      const limitedResults = results.slice(0, maxResults);

      console.log(`✅ Búsqueda completada: ${limitedResults.length} resultados`);

      return {
        results: limitedResults,
        totalResults: results.length,
        query,
        searchedStores: storeIds.length
      };

    } catch (error) {
      console.error('❌ Error en búsqueda de documentos:', error);
      throw error;
    }
  }

  /**
   * Migra un documento de temporal a persistente
   */
  async migrateToPeristent(userId, documentId) {
    try {
      const metadata = await this.getDocumentMetadata(documentId);
      if (!metadata || metadata.mode !== 'temporary') {
        throw new Error('Documento no encontrado o no es temporal');
      }

      console.log(`🔄 Migrando documento a persistente: ${metadata.filename}`);

      // Crear store persistente si no existe
      if (!this.userStores.has(userId) || !this.userStores.get(userId).persistent) {
        await this.createPersistentStore(userId);
      }

      const persistentStoreId = this.userStores.get(userId).persistent;

      // Copiar archivo a carpeta persistente
      const userDir = path.join(this.documentsPath, 'persistent', userId);
      if (!fs.existsSync(userDir)) {
        fs.mkdirSync(userDir, { recursive: true });
      }
      
      const newPath = path.join(userDir, metadata.filename);
      fs.copyFileSync(metadata.filePath, newPath);

      // Subir al nuevo vector store
      const fileStream = fs.createReadStream(newPath);
      const uploadedFile = await client.files.create({
        file: fileStream,
        purpose: 'assistants'
      });

      await client.beta.vectorStores.files.create(persistentStoreId, {
        file_id: uploadedFile.id
      });

      // Actualizar metadata
      metadata.mode = 'persistent';
      metadata.storeId = persistentStoreId;
      metadata.filePath = newPath;
      metadata.openaiFileId = uploadedFile.id;
      metadata.migratedAt = new Date().toISOString();

      await this.saveDocumentMetadata(documentId, metadata);

      console.log(`✅ Documento migrado exitosamente: ${metadata.filename}`);
      
      return {
        success: true,
        documentId,
        newMode: 'persistent',
        filename: metadata.filename
      };

    } catch (error) {
      console.error('❌ Error migrando documento:', error);
      throw error;
    }
  }

  /**
   * Lista los documentos del usuario
   */
  async listUserDocuments(userId, sessionId, options = {}) {
    try {
      const {
        includeTemporary = true,
        includePersistent = true,
        limit = 50
      } = options;

      const documents = [];

      // Buscar documentos temporales
      if (includeTemporary) {
        const tempDir = path.join(this.documentsPath, 'temporary', sessionId);
        if (fs.existsSync(tempDir)) {
          const files = fs.readdirSync(tempDir);
          for (const file of files) {
            const metadata = await this.getDocumentMetadataByPath(path.join(tempDir, file));
            if (metadata) {
              documents.push({
                ...metadata,
                type: 'temporary'
              });
            }
          }
        }
      }

      // Buscar documentos persistentes
      if (includePersistent) {
        const userDir = path.join(this.documentsPath, 'persistent', userId);
        if (fs.existsSync(userDir)) {
          const files = fs.readdirSync(userDir);
          for (const file of files) {
            const metadata = await this.getDocumentMetadataByPath(path.join(userDir, file));
            if (metadata) {
              documents.push({
                ...metadata,
                type: 'persistent'
              });
            }
          }
        }
      }

      // Ordenar por fecha de subida (más recientes primero)
      documents.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));

      return {
        documents: documents.slice(0, limit),
        total: documents.length,
        userId,
        sessionId
      };

    } catch (error) {
      console.error('❌ Error listando documentos:', error);
      throw error;
    }
  }

  /**
   * Elimina un documento
   */
  async deleteDocument(documentId) {
    try {
      const metadata = await this.getDocumentMetadata(documentId);
      if (!metadata) {
        throw new Error('Documento no encontrado');
      }

      console.log(`🗑️ Eliminando documento: ${metadata.filename}`);

      // Eliminar archivo físico
      if (fs.existsSync(metadata.filePath)) {
        fs.unlinkSync(metadata.filePath);
      }

      // Eliminar de OpenAI (opcional, se puede dejar que expire)
      try {
        await client.files.del(metadata.openaiFileId);
      } catch (error) {
        console.warn('⚠️ No se pudo eliminar archivo de OpenAI:', error.message);
      }

      // Eliminar metadata
      await this.deleteDocumentMetadata(documentId);

      console.log(`✅ Documento eliminado: ${metadata.filename}`);
      
      return {
        success: true,
        documentId,
        filename: metadata.filename
      };

    } catch (error) {
      console.error('❌ Error eliminando documento:', error);
      throw error;
    }
  }

  /**
   * Limpia documentos temporales expirados
   */
  async cleanupExpiredDocuments() {
    try {
      console.log('🧹 Iniciando limpieza de documentos expirados...');
      
      const tempDir = path.join(this.documentsPath, 'temporary');
      if (!fs.existsSync(tempDir)) return;

      const sessions = fs.readdirSync(tempDir);
      let cleanedCount = 0;

      for (const sessionDir of sessions) {
        const sessionPath = path.join(tempDir, sessionDir);
        const stats = fs.statSync(sessionPath);
        
        // Eliminar sesiones más antiguas que retention_days
        const daysSinceCreation = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24);
        
        if (daysSinceCreation > this.config.retention_days) {
          fs.rmSync(sessionPath, { recursive: true, force: true });
          this.sessionStores.delete(sessionDir);
          cleanedCount++;
        }
      }

      console.log(`✅ Limpieza completada: ${cleanedCount} sesiones eliminadas`);
      
    } catch (error) {
      console.error('❌ Error en limpieza:', error);
    }
  }

  // Métodos auxiliares para metadata
  async saveDocumentMetadata(documentId, metadata) {
    const metadataPath = path.join(this.documentsPath, 'metadata', `${documentId}.json`);
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  }

  async getDocumentMetadata(documentId) {
    try {
      const metadataPath = path.join(this.documentsPath, 'metadata', `${documentId}.json`);
      if (fs.existsSync(metadataPath)) {
        return JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
      }
      return null;
    } catch {
      return null;
    }
  }

  async getDocumentMetadataByFileId(openaiFileId) {
    try {
      const metadataDir = path.join(this.documentsPath, 'metadata');
      const files = fs.readdirSync(metadataDir);
      
      for (const file of files) {
        const metadata = JSON.parse(fs.readFileSync(path.join(metadataDir, file), 'utf-8'));
        if (metadata.openaiFileId === openaiFileId) {
          return metadata;
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  async getDocumentMetadataByPath(filePath) {
    try {
      const metadataDir = path.join(this.documentsPath, 'metadata');
      const files = fs.readdirSync(metadataDir);
      
      for (const file of files) {
        const metadata = JSON.parse(fs.readFileSync(path.join(metadataDir, file), 'utf-8'));
        if (metadata.filePath === filePath) {
          return metadata;
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  async deleteDocumentMetadata(documentId) {
    const metadataPath = path.join(this.documentsPath, 'metadata', `${documentId}.json`);
    if (fs.existsSync(metadataPath)) {
      fs.unlinkSync(metadataPath);
    }
  }

  async saveUserMetadata(userId) {
    const userMetadata = {
      userId,
      stores: this.userStores.get(userId) || {},
      lastUpdated: new Date().toISOString()
    };
    
    const metadataPath = path.join(this.documentsPath, 'metadata', `user_${userId}.json`);
    fs.writeFileSync(metadataPath, JSON.stringify(userMetadata, null, 2));
  }

  async loadUserMetadata(userId) {
    try {
      const metadataPath = path.join(this.documentsPath, 'metadata', `user_${userId}.json`);
      if (fs.existsSync(metadataPath)) {
        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
        this.userStores.set(userId, metadata.stores || {});
        return metadata;
      }
      return null;
    } catch {
      return null;
    }
  }
}

// Instancia singleton
const userDocumentsManager = new UserDocumentsManager();

module.exports = {
  UserDocumentsManager,
  userDocumentsManager
};

