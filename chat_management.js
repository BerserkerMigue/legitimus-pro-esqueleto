// chat_management.js
const fs = require('fs');
const path = require('path');

/**
 * Obtiene la ruta del archivo de metadatos de chats de un usuario
 */
function getChatMetadataPath(config, userId) {
  const base = (config?.memory?.path)
    ? path.join(process.cwd(), config.memory.path)
    : path.join(process.cwd(), 'lexcode_instances', 'general', 'historial');
  
  const userDir = path.join(base, userId);
  
  // Asegurar que el directorio existe
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true });
  }
  
  return path.join(userDir, '_chat_metadata.json');
}

/**
 * Carga los metadatos de chats de un usuario
 */
function loadChatMetadata(config, userId) {
  try {
    const metadataPath = getChatMetadataPath(config, userId);
    if (fs.existsSync(metadataPath)) {
      const content = fs.readFileSync(metadataPath, 'utf-8');
      return JSON.parse(content || '{}');
    }
    return {};
  } catch (err) {
    console.error(`Error cargando metadatos de chats para ${userId}:`, err.message);
    return {};
  }
}

/**
 * Guarda los metadatos de chats de un usuario
 */
function saveChatMetadata(config, userId, metadata) {
  try {
    const metadataPath = getChatMetadataPath(config, userId);
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error(`Error guardando metadatos de chats para ${userId}:`, err.message);
    return false;
  }
}

/**
 * Crea un nuevo chat con nombre
 */
function createUserChat(config, userId, chatId, chatName = '', instanceId = 'general') {
  try {
    const metadata = loadChatMetadata(config, userId);
    
    metadata[chatId] = {
      name: chatName,
      instanceId: instanceId,
      createdAt: new Date().toISOString(),
      lastModified: new Date().toISOString()
    };
    
    saveChatMetadata(config, userId, metadata);
    
    // Crear archivo de historial vacío
    const base = (config?.memory?.path)
      ? path.join(process.cwd(), config.memory.path)
      : path.join(process.cwd(), 'lexcode_instances', 'general', 'historial');
    
    const userDir = path.join(base, userId);
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }
    
    const filePath = path.join(userDir, `${chatId}.json`);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, '[]', 'utf-8');
    }
    
    return true;
  } catch (err) {
    console.error(`Error creando chat ${chatId} para ${userId}:`, err.message);
    return false;
  }
}

/**
 * Obtiene la lista de chats de un usuario
 */
function getUserChats(config, userId) {
  try {
    const base = (config?.memory?.path)
      ? path.join(process.cwd(), config.memory.path)
      : path.join(process.cwd(), 'lexcode_instances', 'general', 'historial');
    
    const userDir = path.join(base, userId);
    
    if (!fs.existsSync(userDir)) {
      return [];
    }
    
    // Cargar metadatos
    const metadata = loadChatMetadata(config, userId);
    
    const files = fs.readdirSync(userDir);
    const chats = [];
    
    for (const file of files) {
      // Ignorar el archivo de metadatos y archivos _turns
      if (file === '_chat_metadata.json') continue;
      if (file.includes('_turns')) continue;
      
      if (file.endsWith('.json')) {
        const chatId = file.replace('.json', '');
        const filePath = path.join(userDir, file);
        
        try {
          const stats = fs.statSync(filePath);
          const content = fs.readFileSync(filePath, 'utf-8');
          let messages = JSON.parse(content || '[]');
          
          // Asegurar que messages sea un array
          if (!Array.isArray(messages)) {
            messages = [];
          }
          
          // Obtener el primer mensaje del usuario como preview
          const firstUserMessage = messages.find(m => m.role === 'user');
          const preview = firstUserMessage ? 
            firstUserMessage.content.substring(0, 100) + (firstUserMessage.content.length > 100 ? '...' : '') :
            'Chat vacío';
          
          // Obtener nombre desde metadatos
          const chatMeta = metadata[chatId] || {};
          
          chats.push({
            chatId,
            name: chatMeta.name || '',
            instanceId: chatMeta.instanceId || 'general',
            preview,
            messageCount: messages.length,
            lastModified: stats.mtime,
            created: chatMeta.createdAt || stats.birthtime || stats.mtime
          });
        } catch (err) {
          console.error(`Error leyendo chat ${chatId}:`, err.message);
        }
      }
    }
    
    // Ordenar por última modificación (más reciente primero)
    chats.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
    
    return chats;
  } catch (err) {
    console.error(`Error obteniendo chats para ${userId}:`, err.message);
    return [];
  }
}

/**
 * Elimina un chat específico de un usuario
 */
function deleteUserChat(config, userId, chatId) {
  try {
    const base = (config?.memory?.path)
      ? path.join(process.cwd(), config.memory.path)
      : path.join(process.cwd(), 'lexcode_instances', 'general', 'historial');
    
    const filePath = path.join(base, userId, `${chatId}.json`);
    
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      
      // Eliminar de metadatos
      const metadata = loadChatMetadata(config, userId);
      delete metadata[chatId];
      saveChatMetadata(config, userId, metadata);
      
      return true;
    }
    
    return false;
  } catch (err) {
    console.error(`Error eliminando chat ${chatId} para ${userId}:`, err.message);
    return false;
  }
}

/**
 * Renombra un chat
 */
function renameUserChat(config, userId, chatId, newName) {
  try {
    const metadata = loadChatMetadata(config, userId);
    
    if (!metadata[chatId]) {
      metadata[chatId] = {
        createdAt: new Date().toISOString()
      };
    }
    
    metadata[chatId].name = newName;
    metadata[chatId].lastModified = new Date().toISOString();
    
    saveChatMetadata(config, userId, metadata);
    return true;
  } catch (err) {
    console.error(`Error renombrando chat ${chatId} para ${userId}:`, err.message);
    return false;
  }
}

module.exports = {
  getUserChats,
  createUserChat,
  deleteUserChat,
  renameUserChat,
  loadChatMetadata,
  saveChatMetadata
};
