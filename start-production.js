#!/usr/bin/env node

// Script de inicio para producción
process.env.NODE_ENV = 'production';

// Cargar variables de entorno
require('dotenv').config({ path: '.env.production' });
if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'tu_api_key_aqui') {
    require('dotenv').config(); // Fallback a .env normal
}

console.log('🚀 INICIANDO LEXCODE EN PRODUCCIÓN');
console.log('================================');
console.log('🌐 Frontend React: Integrado en servidor');
console.log('🔧 Backend Node.js: Puerto 3000');
console.log('📁 Archivos estáticos: react-src/dist/');
console.log('');

// Iniciar el servidor
require('./server.js');
