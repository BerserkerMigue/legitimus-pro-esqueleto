#!/usr/bin/env python3
"""
CONVERTIDOR EXCEL → SQLITE (FINAL-FINAL v2 con soporte completo de clave_manual)
===============================================================================

✅ Mantiene tus clave_manual tal como están (CTRIB.Art31, DL824.1974.Art41e, etc.)
✅ Divide internamente clave base y número de artículo para compatibilidad total.
✅ Soporta claves con año, puntos y sufijos alfabéticos (bis, e, ter, etc.).
✅ 100 % compatible con LEGITIMUS PRO y el NormativeCitationProcessor.
"""

import pandas as pd
import sqlite3
import re
import sys
import os
from pathlib import Path

# Mapeo de códigos especiales
CODIGOS_ESPECIALES = {
    'codigo civil dfl 1 2000 articulo 2 con doble articulado': 'CCCH',
    'codigo penal': 'CPCH',
    'codigo de comercio': 'CCOM',
    'codigo del trabajo': 'CTCH',
    'codigo tributario': 'CTRIB',
    'codigo sanitario': 'CSAN',
    'codigo organico de tribunales': 'COT',
    'codigo procesal penal': 'CPP',
    'codigo de procedimiento civil': 'CPC',
    'constitucion politica': 'CRCH',
    'constitucion': 'CRCH',
    'ley de abandono de familia y pensiones dfl 1 2000 articulo 7 con doble articulado': 'LAFP',
    'ley de cambio de nombres dfl 1 2000 articulo 4 con doble articulado': 'LCN',
    'ley de impuesto a la herencia y donaciones dfl 1 2000 articulo 8 con doble articulado': 'LIHD',
    'ley de menores dfl 1 2000 articulo 6 con doble articulado': 'LM',
    'ley del registro civil dfl 1 2000 articulo 3 con doble articulado': 'LRC',
}

def limpiar_numero(texto):
    if pd.isna(texto):
        return ''
    return re.sub(r'[^\d]', '', str(texto))

def generar_clave(row):
    if 'clave_manual' in row and not pd.isna(row['clave_manual']):
        clave_manual = str(row['clave_manual']).strip()
        if clave_manual:
            return clave_manual.upper()

    norma = str(row.get('norma', '')).lower().strip()
    norma_tipo = str(row.get('norma_tipo', '')).lower().strip()
    norma_numero = row.get('norma_numero', '')

    for patron, clave in CODIGOS_ESPECIALES.items():
        if patron in norma or patron in norma_tipo:
            return clave

    if 'decreto con fuerza de ley' in norma_tipo or 'dfl' in norma:
        match = re.search(r'dfl\s*(\d+)\s*(\d{4})?', norma, re.IGNORECASE)
        if match:
            num, year = match.group(1), match.group(2) or ''
            return f"DFL{num}{year}" if year else f"DFL{num}"

    if 'decreto ley' in norma_tipo or 'decreto ley' in norma:
        match = re.search(r'(?:decreto\s*ley|dl)\s*(\d+)\s*(\d{4})?', norma, re.IGNORECASE)
        if match:
            num, year = match.group(1), match.group(2) or ''
            return f"DL{num}{year}" if year else f"DL{num}"

    if 'ley' in norma_tipo or 'ley' in norma:
        match = re.search(r'ley\s*(?:n[uú]m\.?\s*)?(\d+[\.\d]*)', norma, re.IGNORECASE)
        if match:
            num = limpiar_numero(match.group(1))
            return f"L{num}"
        if norma_numero and not pd.isna(norma_numero):
            num = limpiar_numero(norma_numero)
            if num:
                return f"L{num}"

    if 'decreto supremo' in norma_tipo or 'decreto supremo' in norma:
        match = re.search(r'decreto\s*supremo\s*(?:n[°º]?\s*)?(\d+)', norma, re.IGNORECASE)
        if match:
            return f"DS{match.group(1)}"

    idnorma = row.get('norma_idnorma', '')
    if idnorma and not pd.isna(idnorma):
        return f"N{int(idnorma)}"

    return 'UNKNOWN'

def normalizar_nombreparte(texto):
    if pd.isna(texto):
        return ''
    texto = str(texto).lower().strip()
    texto = re.sub(r'art[íi]culo', 'articulo', texto)
    texto = re.sub(r'^art\.?\s*', 'articulo ', texto)
    texto = re.sub(r'\s+', ' ', texto)
    return texto.strip()

def extraer_numero_articulo(texto):
    if pd.isna(texto):
        return ''
    texto = str(texto).lower().strip()
    match = re.search(r'(?:art[íi]culo|art\.?)\s*(\d+(?:\s*(?:bis|ter|quater|quinquies|sexies))?)', texto)
    if match:
        return match.group(1).strip()
    match = re.search(r'^(\d+)$', texto.strip())
    if match:
        return match.group(1)
    return ''

def separar_clave_y_articulo(clave_str):
    """Divide claves como CTRIB.Art31, DL824.1974.Art41e → (base, artículo)"""
    if pd.isna(clave_str):
        return None, None
    clave_str = str(clave_str).strip().upper()

    match = re.match(r'^([A-Z0-9\.]+)\.ART(\d+[A-Z]*)$', clave_str, re.IGNORECASE)
    if match:
        base = match.group(1).upper()
        articulo = match.group(2)
        return base, articulo

    return clave_str, None

def convertir_excel_a_sqlite(excel_path, sqlite_path=None):
    if not os.path.exists(excel_path):
        print(f"❌ No se encontró el archivo {excel_path}")
        return False

    if sqlite_path is None:
        sqlite_path = os.path.join(os.path.dirname(excel_path), 'normas.sqlite')

    print(f"📘 Leyendo Excel: {excel_path}")
    df = pd.read_excel(excel_path)

    rename_map = {
        'ulr_norma_pdf': 'url_norma_pdf',
        'ulr_norma_xml': 'url_norma_xml',
        'reseña': 'resena'
    }
    df.rename(columns={k: v for k, v in rename_map.items() if k in df.columns}, inplace=True)

    print("🔑 Usando clave_manual si existen; generando automáticas solo si faltan...")
    df['clave'] = df.apply(generar_clave, axis=1)

    base_claves, articulos_extraidos = zip(*df['clave'].map(separar_clave_y_articulo))
    df['clave'] = base_claves

    if 'numero_articulo' not in df.columns:
        df['numero_articulo'] = articulos_extraidos
    else:
        df['numero_articulo'] = df['numero_articulo'].fillna(pd.Series(articulos_extraidos))

    if 'nombreparte' in df.columns:
        df['nombreparte_normalizado'] = df['nombreparte'].apply(normalizar_nombreparte)

    if 'url_norma_pdf' not in df.columns:
        df['url_norma_pdf'] = None

    print(f"💾 Guardando base SQLite en: {sqlite_path}")
    if os.path.exists(sqlite_path):
        os.remove(sqlite_path)

    conn = sqlite3.connect(sqlite_path)
    df.to_sql('articulos', conn, index=False, if_exists='replace')

    cursor = conn.cursor()
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_clave ON articulos(clave)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_nombreparte ON articulos(nombreparte_normalizado)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_numero_articulo ON articulos(numero_articulo)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_clave_nombreparte ON articulos(clave, nombreparte_normalizado)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_clave_numero ON articulos(clave, numero_articulo)')
    conn.commit()
    conn.close()

    print(f"✅ Conversión completada. Total registros: {len(df)}")
    return True

def main():
    script_dir = Path(__file__).parent
    default_excel = script_dir / 'normas_source.xlsx'
    default_sqlite = script_dir / 'normas.sqlite'

    excel_path = sys.argv[1] if len(sys.argv) > 1 else str(default_excel)
    sqlite_path = sys.argv[2] if len(sys.argv) > 2 else str(default_sqlite)

    convertir_excel_a_sqlite(excel_path, sqlite_path)

if __name__ == '__main__':
    main()
