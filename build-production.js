#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 CONSTRUYENDO LEXCODE PARA PRODUCCIÓN');
console.log('=====================================');

// Verificar que estamos en el directorio correcto
if (!fs.existsSync('server.js')) {
    console.error('❌ Error: No se encuentra server.js. Ejecuta este script desde la carpeta raíz del proyecto.');
    process.exit(1);
}

if (!fs.existsSync('react-src')) {
    console.error('❌ Error: No se encuentra la carpeta react-src.');
    process.exit(1);
}

try {
    console.log('📦 Paso 1: Instalando dependencias del backend...');
    execSync('npm install', { stdio: 'inherit' });

    console.log('📦 Paso 2: Instalando dependencias del frontend...');
    process.chdir('react-src');
    execSync('pnpm install', { stdio: 'inherit' });

    console.log('🏗️  Paso 3: Construyendo React para producción...');
    execSync('pnpm run build', { stdio: 'inherit' });

    console.log('🔧 Paso 4: Configurando servidor para producción...');
    process.chdir('..');

    // Leer el server.js actual
    let serverContent = fs.readFileSync('server.js', 'utf8');

    // Verificar si ya tiene la configuración de producción
    if (!serverContent.includes('// PRODUCCIÓN REACT')) {
        // Agregar configuración de producción después de las importaciones
        const importSection = serverContent.indexOf('const express = require');
        const afterImports = serverContent.indexOf('\n', importSection);
        
        const productionConfig = `
// PRODUCCIÓN REACT - Configuración automática
const path = require('path');
const isProduction = process.env.NODE_ENV === 'production' || !process.env.NODE_ENV;

`;

        serverContent = serverContent.slice(0, afterImports + 1) + productionConfig + serverContent.slice(afterImports + 1);

        // Buscar donde se configura express y agregar middleware de archivos estáticos
        const appCreation = serverContent.indexOf('const app = express()');
        const afterAppCreation = serverContent.indexOf('\n', appCreation);
        
        const staticConfig = `
// Servir archivos estáticos del React construido
if (isProduction && fs.existsSync(path.join(__dirname, 'react-src/dist'))) {
    console.log('📁 Sirviendo React desde react-src/dist/');
    app.use(express.static(path.join(__dirname, 'react-src/dist')));
}

`;

        serverContent = serverContent.slice(0, afterAppCreation + 1) + staticConfig + serverContent.slice(afterAppCreation + 1);

        // Agregar ruta catch-all antes del app.listen
        const listenIndex = serverContent.lastIndexOf('app.listen');
        
        const catchAllRoute = `
// Ruta catch-all para React Router (debe ir al final)
if (isProduction) {
    app.get('*', (req, res) => {
        if (!req.path.startsWith('/api') && !req.path.startsWith('/uploads')) {
            const indexPath = path.join(__dirname, 'react-src/dist/index.html');
            if (fs.existsSync(indexPath)) {
                res.sendFile(indexPath);
            } else {
                res.status(404).send('Frontend no encontrado. Ejecuta: node build-production.js');
            }
        }
    });
}

`;

        serverContent = serverContent.slice(0, listenIndex) + catchAllRoute + serverContent.slice(listenIndex);

        // Escribir el server.js modificado
        fs.writeFileSync('server.js', serverContent);
        console.log('✅ Server.js configurado para producción');
    } else {
        console.log('✅ Server.js ya está configurado para producción');
    }

    // Crear archivo de entorno de producción
    if (!fs.existsSync('.env.production')) {
        fs.writeFileSync('.env.production', `NODE_ENV=production
OPENAI_API_KEY=${process.env.OPENAI_API_KEY || 'tu_api_key_aqui'}
PORT=3000
`);
        console.log('✅ Archivo .env.production creado');
    }

    // Crear script de inicio de producción
    const startScript = `#!/usr/bin/env node

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
`;

    fs.writeFileSync('start-production.js', startScript);
    console.log('✅ Script de inicio de producción creado');

    // Actualizar package.json con scripts de producción
    const packagePath = 'package.json';
    if (fs.existsSync(packagePath)) {
        const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
        
        packageJson.scripts = packageJson.scripts || {};
        packageJson.scripts['build'] = 'node build-production.js';
        packageJson.scripts['start:prod'] = 'node start-production.js';
        packageJson.scripts['start'] = 'node server.js';
        
        fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2));
        console.log('✅ Scripts de package.json actualizados');
    }

    console.log('');
    console.log('🎉 ¡CONSTRUCCIÓN COMPLETADA!');
    console.log('============================');
    console.log('');
    console.log('🚀 Para iniciar en PRODUCCIÓN:');
    console.log('   npm run start:prod');
    console.log('');
    console.log('🌐 Abrir en navegador:');
    console.log('   http://localhost:3000');
    console.log('');
    console.log('✅ Características de producción:');
    console.log('   • React optimizado y minificado');
    console.log('   • Un solo servidor (puerto 3000)');
    console.log('   • Archivos estáticos servidos eficientemente');
    console.log('   • Sin modo desarrollo');
    console.log('   • Listo para despliegue');
    console.log('');

} catch (error) {
    console.error('❌ Error durante la construcción:', error.message);
    process.exit(1);
}
