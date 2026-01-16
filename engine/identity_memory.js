// engine/identity_memory.js
// Memoria fija de identidad: OPTIMIZADO para funcionar exclusivamente con RAG
// La carpeta bot_base/conocimiento/ ahora se gestiona únicamente a través de búsqueda semántica

"use strict";

const fs = require("fs");
const path = require("path");

/**
 * FUNCIÓN OPTIMIZADA: Ya no inyecta conocimiento fijo en el contexto
 * 
 * ANTES: Esta función cargaba todo el contenido de bot_base/conocimiento/ 
 * directamente en el contexto, gastando tokens en cada consulta.
 * 
 * AHORA: Devuelve un array vacío, permitiendo que todo el conocimiento
 * se gestione eficientemente a través del sistema RAG (memoria semántica).
 * 
 * BENEFICIOS:
 * - Ahorro masivo de tokens (no se carga contenido fijo en cada consulta)
 * - Escalabilidad: puedes agregar archivos grandes sin afectar el rendimiento
 * - Consistencia: todo el conocimiento funciona de la misma manera (RAG)
 * - Flexibilidad: el bot accede al conocimiento cuando lo necesita, no siempre
 */
function loadFixedKnowledge() {
  // OPTIMIZACIÓN: Desactivamos la inyección automática de conocimiento en el contexto
  // El conocimiento de la carpeta bot_base/conocimiento/ ahora está disponible
  // exclusivamente a través del sistema RAG (enhanced_knowledge_readers.js)
  
  console.log("✅ Memoria fija optimizada: Conocimiento gestionado vía RAG semántico");
  
  return []; // Array vacío = no se inyecta nada en el contexto
}

/**
 * FUNCIÓN AUXILIAR: Para reactivar la inyección si fuera necesario en el futuro
 * (Solo usar en casos muy específicos donde se requiera conocimiento siempre presente)
 */
function loadFixedKnowledgeForced() {
  const baseDir = path.resolve(process.cwd(), "lexcode_instances/general/conocimiento");
  if (!fs.existsSync(baseDir)) return [];

  const files = fs.readdirSync(baseDir).filter(f => fs.statSync(path.join(baseDir, f)).isFile());
  let combined = "";

  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(baseDir, file), "utf-8");
      combined += `\n[${file}]\n${content}\n`;
    } catch (e) {
      console.error(`Error leyendo ${file}:`, e);
    }
  }

  if (!combined.trim()) return [];

  return [
    {
      role: "system",
      content: `⚖️ Conocimiento fundamental permanente (memoria fija):\n${combined}`
    }
  ];
}

module.exports = {
  loadFixedKnowledge,
  loadFixedKnowledgeForced // Disponible pero no se usa por defecto
};
