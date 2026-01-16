/**
 * markdown_cleaner.js
 * 
 * Limpia símbolos de Markdown de las respuestas de Legitimus
 * para entregar un formato más formal y humano al usuario.
 * 
 * Se aplica DESPUÉS de que el modelo genera la respuesta,
 * justo antes de enviarla al usuario.
 */

/**
 * Limpia símbolos de Markdown de un texto
 * @param {string} text - Texto con Markdown
 * @returns {string} - Texto limpio sin símbolos Markdown
 */
function cleanMarkdown(text) {
  if (!text || typeof text !== 'string') return text;

  let cleaned = text;

  // 1. Limpiar encabezados (# ## ### etc.)
  // Convertir "## Título" a "Título"
  // Convertir "### Subtítulo" a "Subtítulo"
  cleaned = cleaned.replace(/^#{1,6}\s+(.+)$/gm, '$1');

  // 2. Limpiar negritas (**texto** o __texto__)
  // Convertir "**texto**" a "texto"
  // Convertir "__texto__" a "texto"
  cleaned = cleaned.replace(/\*\*(.+?)\*\*/g, '$1');
  cleaned = cleaned.replace(/__(.+?)__/g, '$1');

  // 3. Limpiar cursivas (*texto* o _texto_)
  // Convertir "*texto*" a "texto"
  // Convertir "_texto_" a "texto"
  // CUIDADO: No afectar asteriscos sueltos que no sean cursivas
  cleaned = cleaned.replace(/\*([^\*\n]+?)\*/g, '$1');
  cleaned = cleaned.replace(/_([^_\n]+?)_/g, '$1');

  // 4. Limpiar listas con asteriscos (* item)
  // Convertir "* item" a "- item" (más formal)
  cleaned = cleaned.replace(/^\*\s+/gm, '- ');

  // 5. Limpiar listas con guiones bajos (_ item) si existen
  cleaned = cleaned.replace(/^_\s+/gm, '- ');

  // 6. Limpiar código inline (`código`)
  // Convertir "`código`" a "código"
  cleaned = cleaned.replace(/`([^`]+)`/g, '$1');

  // 7. Limpiar bloques de código (```código```)
  // Convertir "```\ncódigo\n```" a "código"
  cleaned = cleaned.replace(/```[\s\S]*?```/g, (match) => {
    // Extraer solo el contenido, sin los backticks ni el lenguaje
    return match.replace(/```[a-z]*\n?/g, '').replace(/```/g, '').trim();
  });

  // 8. Limpiar enlaces [texto](url)
  // Convertir "[texto](url)" a "texto"
  cleaned = cleaned.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');

  // 9. Limpiar imágenes ![alt](url)
  // Convertir "![alt](url)" a "alt"
  cleaned = cleaned.replace(/!\[([^\]]*)\]\([^\)]+\)/g, '$1');

  // 10. Limpiar líneas horizontales (---, ***, ___)
  // Eliminar completamente
  cleaned = cleaned.replace(/^(\-{3,}|\*{3,}|_{3,})$/gm, '');

  // 11. Limpiar blockquotes (> texto)
  // Convertir "> texto" a "texto"
  cleaned = cleaned.replace(/^>\s+/gm, '');

  // 12. Limpiar múltiples líneas en blanco consecutivas
  // Convertir "\n\n\n" a "\n\n"
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  // 13. Limpiar espacios al inicio y final
  cleaned = cleaned.trim();

  return cleaned;
}

/**
 * Limpia Markdown de forma agresiva (elimina TODO el formato)
 * @param {string} text - Texto con Markdown
 * @returns {string} - Texto completamente limpio
 */
function cleanMarkdownAggressive(text) {
  if (!text || typeof text !== 'string') return text;

  let cleaned = text;

  // Aplicar limpieza normal primero
  cleaned = cleanMarkdown(cleaned);

  // Eliminar TODOS los asteriscos sueltos que queden
  cleaned = cleaned.replace(/\*/g, '');

  // Eliminar TODOS los guiones bajos sueltos que queden
  cleaned = cleaned.replace(/_/g, '');

  // Eliminar TODOS los backticks sueltos que queden
  cleaned = cleaned.replace(/`/g, '');

  // Eliminar TODOS los símbolos # sueltos que queden
  cleaned = cleaned.replace(/#/g, '');

  return cleaned;
}

/**
 * Limpia Markdown de forma conservadora (mantiene estructura básica)
 * @param {string} text - Texto con Markdown
 * @returns {string} - Texto con formato mínimo
 */
function cleanMarkdownConservative(text) {
  if (!text || typeof text !== 'string') return text;

  let cleaned = text;

  // Solo limpiar encabezados y negritas/cursivas
  cleaned = cleaned.replace(/^#{1,6}\s+(.+)$/gm, '$1');
  cleaned = cleaned.replace(/\*\*(.+?)\*\*/g, '$1');
  cleaned = cleaned.replace(/\*([^\*\n]+?)\*/g, '$1');

  // Mantener listas, enlaces, etc.

  return cleaned;
}

module.exports = {
  cleanMarkdown,
  cleanMarkdownAggressive,
  cleanMarkdownConservative
};
