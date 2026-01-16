// multi_instance_endpoints.js
const { getAvailableInstances, loadInstance, validateInstance, getDefaultInstance } = require('./instance_manager');
const { answer } = require('./engine');

/**
 * Agregar endpoints para gestión de instancias MultiLexCode
 */
function addMultiInstanceEndpoints(app, authRequired) {
  
  // Obtener lista de instancias disponibles
  app.get('/api/instances', authRequired, async (req, res) => {
    try {
      const instances = getAvailableInstances();
      res.json({ ok: true, instances });
    } catch (e) {
      console.error('Error obteniendo instancias:', e);
      res.status(500).json({ ok: false, error: 'get_instances_failed' });
    }
  });

  // Obtener información de una instancia específica
  app.get('/api/instances/:instanceId', authRequired, async (req, res) => {
    try {
      const { instanceId } = req.params;
      
      if (!validateInstance(instanceId)) {
        return res.status(404).json({ ok: false, error: 'instance_not_found' });
      }
      
      const instanceConfig = loadInstance(instanceId);
      
      // Devolver solo informacion basica, no la configuracion completa
      res.json({ 
        ok: true, 
        instance: {
          id: instanceConfig.instanceId,
          name: instanceConfig.builder_name,
          identity: instanceConfig.bot_config.identity,
          description: instanceConfig.description,
          initial_greeting: instanceConfig.initial_greeting,
          initialization_message: instanceConfig.initialization_message,
          valid: instanceConfig.builder_valid
        }
      });
    } catch (e) {
      console.error('Error obteniendo instancia:', e);
      res.status(500).json({ ok: false, error: 'get_instance_failed' });
    }
  });

  // Endpoint para hacer consultas a una instancia específica
  app.post('/api/instances/:instanceId/ask', authRequired, async (req, res) => {
    const __debug = (req.query.debug === '1') || (req.headers['x-debug'] === '1');
    const __prevDbg = global.__DEBUG_REQUEST__;
    global.__DEBUG_REQUEST__ = __debug;

    try {
      const { instanceId } = req.params;
      
      if (!validateInstance(instanceId)) {
        return res.status(404).json({ ok: false, error: 'instance_not_found' });
      }

      let question = '';
      let attachments = [];
      let chatId = 'default';
      let isInitialization = false;

      if (req.is('application/json')) {
        question = (req.body?.question || '').toString();
        chatId = (req.body?.chatId || 'default').toString();
        isInitialization = req.body?.isInitialization === true;
      } else {
        question = (req.body?.question || '').toString();
        chatId = (req.body?.chatId || 'default').toString();
        isInitialization = req.body?.isInitialization === true;
        
        if (req.files) {
          const allow = (global.bot_config?.uploads?.mime_allow) || [
            "text/plain","text/markdown","application/pdf","application/json"
          ];

          const incoming = req.files.files || req.files.file || null;
          const arr = Array.isArray(incoming) ? incoming : (incoming ? [incoming] : []);
          if (arr.length) {
            const userId = (req.userId || 'anon').toString().replace(/[^\w.-]/g,'_');
            const updir = require('path').join(__dirname, 'files', userId);
            require('fs').mkdirSync(updir, { recursive: true });
            for (const f of arr) {
              const safe = (f.name || 'file').replace(/[^\w.\-]/g, '_');
              const dest = require('path').join(updir, `${Date.now()}_${safe}`);
              await f.mv(dest);
              attachments.push(dest);
            }
          }
        }
      }

      if (!question && attachments.length === 0) {
        return res.status(400).json({ ok: false, error: 'question_or_files_required' });
      }

      // Cargar configuración de la instancia
      const instanceConfig = loadInstance(instanceId);
      
      // Llamar a answer con la configuracion de la instancia
      const out = await answer(question, req.userId, attachments, chatId, instanceConfig);
      
      // Si es un mensaje de inicializacion, no mostrar respuesta al usuario
      if (isInitialization) {
        out.isInitialization = true;
        out.answer = ''; // Respuesta vacia para el frontend
      }

      const responsePayload = Object.assign({ ok: true, instance: instanceId }, out);
      if (__debug && global.__ASSISTANTS_DEBUG__) {
        responsePayload.debug = global.__ASSISTANTS_DEBUG__;
      }
      return res.json(responsePayload);
    } catch (e) {
      console.error('Error en consulta a instancia:', e);
      return res.status(500).json({ ok: false, error: 'instance_ask_failed', detail: e?.message || String(e) });
    } finally {
      try {
        global.__DEBUG_REQUEST__ = __prevDbg;
        global.__ASSISTANTS_DEBUG__ = null;
      } catch(_){}
    }
  });

  // Endpoint para obtener la instancia por defecto
  app.get('/api/instances/default', authRequired, async (req, res) => {
    try {
      const defaultInstanceId = getDefaultInstance();
      if (!defaultInstanceId) {
        return res.status(404).json({ ok: false, error: 'no_default_instance' });
      }
      
      res.json({ ok: true, defaultInstance: defaultInstanceId });
    } catch (e) {
      console.error('Error obteniendo instancia por defecto:', e);
      res.status(500).json({ ok: false, error: 'get_default_instance_failed' });
    }
  });
}

module.exports = { addMultiInstanceEndpoints };
