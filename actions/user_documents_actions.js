/**
 * Acciones RAG para Documentos de Usuario
 * Permite subir, buscar y gestionar documentos con RAG
 */

const { userDocumentsManager } = require('../engine/user_documents_manager');
const path = require('path');
const fs = require('fs');

module.exports = [
  {
    name: 'upload_user_document',
    description: 'Sube un documento del usuario y lo indexa con RAG para búsquedas semánticas.',
    parametersSchema: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'Ruta del archivo a subir'
        },
        filename: {
          type: 'string',
          description: 'Nombre del archivo (opcional, se toma del path si no se especifica)'
        },
        mode: {
          type: 'string',
          enum: ['temporary', 'persistent', 'ask_user'],
          description: 'Modo de almacenamiento del documento',
          default: 'ask_user'
        },
        persistent: {
          type: 'boolean',
          description: 'Si es true, guarda el documento permanentemente (solo si mode es ask_user)',
          default: false
        }
      },
      required: ['file_path']
    },
    handler: async ({ file_path, filename, mode = 'ask_user', persistent = false }, context) => {
      try {
        const userId = context.userId || 'anon';
        const sessionId = context.sessionId || `session_${Date.now()}`;

        if (!fs.existsSync(file_path)) {
          return {
            success: false,
            error: 'Archivo no encontrado',
            file_path
          };
        }

        const actualFilename = filename || path.basename(file_path);

        console.log(`📤 Subiendo documento de usuario: ${actualFilename}`);

        const result = await userDocumentsManager.uploadDocument(
          userId,
          sessionId,
          file_path,
          {
            mode,
            filename: actualFilename,
            persistent
          }
        );

        return {
          success: true,
          message: `Documento "${actualFilename}" subido exitosamente en modo ${result.mode}`,
          document_id: result.documentId,
          store_id: result.storeId,
          mode: result.mode,
          filename: result.filename,
          can_migrate: result.mode === 'temporary' && userDocumentsManager.config.easy_migration
        };

      } catch (error) {
        console.error('❌ Error subiendo documento:', error);
        return {
          success: false,
          error: error.message,
          details: 'Error al procesar el documento con RAG'
        };
      }
    }
  },

  {
    name: 'search_user_documents',
    description: 'Busca información en los documentos del usuario usando RAG semántico.',
    parametersSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Consulta o pregunta para buscar en los documentos del usuario'
        },
        max_results: {
          type: 'number',
          description: 'Número máximo de resultados',
          default: 5
        },
        include_temporary: {
          type: 'boolean',
          description: 'Incluir documentos temporales en la búsqueda',
          default: true
        },
        include_persistent: {
          type: 'boolean',
          description: 'Incluir documentos persistentes en la búsqueda',
          default: true
        }
      },
      required: ['query']
    },
    handler: async ({ query, max_results = 5, include_temporary = true, include_persistent = true }, context) => {
      try {
        const userId = context.userId || 'anon';
        const sessionId = context.sessionId || `session_${Date.now()}`;

        console.log(`🔍 Buscando en documentos de usuario: "${query}"`);

        const searchResult = await userDocumentsManager.searchUserDocuments(
          userId,
          sessionId,
          query,
          {
            maxResults: max_results,
            includeTemporary: include_temporary,
            includePersistent: include_persistent
          }
        );

        if (searchResult.results.length === 0) {
          return {
            success: true,
            message: 'No se encontraron resultados en tus documentos',
            query,
            results: [],
            total_results: 0,
            searched_stores: searchResult.searchedStores
          };
        }

        // Formatear resultados para el bot
        const formattedResults = searchResult.results.map((result, index) => ({
          rank: index + 1,
          filename: result.filename,
          document_type: result.type,
          relevance_score: Math.round(result.relevanceScore * 100),
          excerpt: result.excerpt.substring(0, 300) + (result.excerpt.length > 300 ? '...' : ''),
          document_id: result.documentId
        }));

        return {
          success: true,
          message: `Encontrados ${searchResult.results.length} resultados en tus documentos`,
          query,
          results: formattedResults,
          total_results: searchResult.totalResults,
          searched_stores: searchResult.searchedStores,
          summary: `Se encontraron ${searchResult.results.length} fragmentos relevantes en ${searchResult.searchedStores} almacenes de documentos.`
        };

      } catch (error) {
        console.error('❌ Error buscando en documentos:', error);
        return {
          success: false,
          error: error.message,
          query,
          details: 'Error al realizar búsqueda RAG en documentos de usuario'
        };
      }
    }
  },

  {
    name: 'list_user_documents',
    description: 'Lista todos los documentos del usuario (temporales y persistentes).',
    parametersSchema: {
      type: 'object',
      properties: {
        include_temporary: {
          type: 'boolean',
          description: 'Incluir documentos temporales',
          default: true
        },
        include_persistent: {
          type: 'boolean',
          description: 'Incluir documentos persistentes',
          default: true
        },
        limit: {
          type: 'number',
          description: 'Número máximo de documentos a listar',
          default: 20
        }
      }
    },
    handler: async ({ include_temporary = true, include_persistent = true, limit = 20 }, context) => {
      try {
        const userId = context.userId || 'anon';
        const sessionId = context.sessionId || `session_${Date.now()}`;

        console.log(`📋 Listando documentos de usuario: ${userId}`);

        const result = await userDocumentsManager.listUserDocuments(
          userId,
          sessionId,
          {
            includeTemporary: include_temporary,
            includePersistent: include_persistent,
            limit
          }
        );

        if (result.documents.length === 0) {
          return {
            success: true,
            message: 'No tienes documentos cargados',
            documents: [],
            total: 0
          };
        }

        // Formatear documentos para mostrar
        const formattedDocs = result.documents.map(doc => ({
          filename: doc.filename,
          type: doc.type,
          size_kb: Math.round(doc.size / 1024),
          uploaded_at: new Date(doc.uploadedAt).toLocaleString('es-CL'),
          document_id: doc.id,
          can_migrate: doc.type === 'temporary' && userDocumentsManager.config.easy_migration
        }));

        return {
          success: true,
          message: `Tienes ${result.total} documento(s) cargado(s)`,
          documents: formattedDocs,
          total: result.total,
          summary: {
            temporary: formattedDocs.filter(d => d.type === 'temporary').length,
            persistent: formattedDocs.filter(d => d.type === 'persistent').length
          }
        };

      } catch (error) {
        console.error('❌ Error listando documentos:', error);
        return {
          success: false,
          error: error.message,
          details: 'Error al listar documentos de usuario'
        };
      }
    }
  },

  {
    name: 'migrate_document_to_persistent',
    description: 'Migra un documento temporal a almacenamiento persistente.',
    parametersSchema: {
      type: 'object',
      properties: {
        document_id: {
          type: 'string',
          description: 'ID del documento a migrar'
        }
      },
      required: ['document_id']
    },
    handler: async ({ document_id }, context) => {
      try {
        const userId = context.userId || 'anon';

        console.log(`🔄 Migrando documento a persistente: ${document_id}`);

        const result = await userDocumentsManager.migrateToPeristent(userId, document_id);

        return {
          success: true,
          message: `Documento "${result.filename}" migrado a almacenamiento persistente`,
          document_id: result.documentId,
          new_mode: result.newMode,
          filename: result.filename
        };

      } catch (error) {
        console.error('❌ Error migrando documento:', error);
        return {
          success: false,
          error: error.message,
          document_id,
          details: 'Error al migrar documento a persistente'
        };
      }
    }
  },

  {
    name: 'delete_user_document',
    description: 'Elimina un documento del usuario (temporal o persistente).',
    parametersSchema: {
      type: 'object',
      properties: {
        document_id: {
          type: 'string',
          description: 'ID del documento a eliminar'
        }
      },
      required: ['document_id']
    },
    handler: async ({ document_id }, context) => {
      try {
        console.log(`🗑️ Eliminando documento: ${document_id}`);

        const result = await userDocumentsManager.deleteDocument(document_id);

        return {
          success: true,
          message: `Documento "${result.filename}" eliminado exitosamente`,
          document_id: result.documentId,
          filename: result.filename
        };

      } catch (error) {
        console.error('❌ Error eliminando documento:', error);
        return {
          success: false,
          error: error.message,
          document_id,
          details: 'Error al eliminar documento'
        };
      }
    }
  },

  {
    name: 'get_user_documents_config',
    description: 'Obtiene la configuración actual del sistema de documentos de usuario.',
    parametersSchema: {
      type: 'object',
      properties: {}
    },
    handler: async ({}, context) => {
      try {
        const config = userDocumentsManager.config;

        return {
          success: true,
          config: {
            allow_temporary: config.allow_temporary,
            allow_persistent: config.allow_persistent,
            default_mode: config.default_mode,
            user_can_choose: config.user_can_choose,
            storage_limit_mb: config.storage_limit_mb,
            retention_days: config.retention_days,
            easy_migration: config.easy_migration
          },
          message: 'Configuración del sistema de documentos de usuario'
        };

      } catch (error) {
        console.error('❌ Error obteniendo configuración:', error);
        return {
          success: false,
          error: error.message,
          details: 'Error al obtener configuración'
        };
      }
    }
  }
];

