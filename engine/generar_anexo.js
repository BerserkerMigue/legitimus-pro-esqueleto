
function generarAnexoTexto(anexo) {
  return "[ANEXO NORMATIVO]\n\n" + anexo.map(n =>
    `Clave: ${n.clave}\nNorma: ${n.nombre_norma}, Artículo ${n.articulo}\nTexto: ${n.texto}\nEnlace: ${n.url_pdf_norma || 'No disponible'}\n\n`).join("");
}

module.exports = { generarAnexoTexto };
