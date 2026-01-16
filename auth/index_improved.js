/**
 * Módulo de Autenticación Mejorado
 * ============================================================================
 * Proporciona autenticación segura basada en JWT con validación robusta
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { nanoid } = require('nanoid');
const { AppError } = require('../middleware/errorHandler');

const DATA = path.join(__dirname, 'users.store.json');
const JWT_SECRET = process.env.AUTH_JWT_SECRET || 'change_me_in_production';
const JWT_EXPIRY = '7d';
const BCRYPT_ROUNDS = 12; // Aumentado de 10 a 12 para mayor seguridad

/**
 * Lee el almacén de usuarios
 * @returns {Object} Objeto con array de usuarios
 */
function readStore() {
  try {
    return JSON.parse(fs.readFileSync(DATA, 'utf8'));
  } catch {
    return { users: [] };
  }
}

/**
 * Escribe el almacén de usuarios
 * @param {Object} store - Objeto con array de usuarios
 */
function writeStore(store) {
  fs.writeFileSync(DATA, JSON.stringify(store, null, 2));
}

/**
 * Busca un usuario por email
 * @param {string} email - Email del usuario
 * @returns {Object|null} Usuario encontrado o null
 */
function findUserByEmail(email) {
  const store = readStore();
  return store.users.find(u => u.email === email.toLowerCase());
}

/**
 * Busca un usuario por ID
 * @param {string} id - ID del usuario
 * @returns {Object|null} Usuario encontrado o null
 */
function findUserById(id) {
  const store = readStore();
  return store.users.find(u => u.id === id);
}

/**
 * Crea un nuevo usuario
 * @param {string} email - Email del usuario
 * @param {string} username - Nombre de usuario
 * @param {string} password - Contraseña en texto plano
 * @returns {Promise<Object>} Usuario creado
 */
async function createUser(email, username, password) {
  // Validar entrada
  if (!email || !username || !password) {
    throw new AppError('Email, username y password son requeridos', 400, 'INVALID_INPUT');
  }

  if (password.length < 8) {
    throw new AppError('La contraseña debe tener al menos 8 caracteres', 400, 'WEAK_PASSWORD');
  }

  // Verificar que el usuario no exista
  if (findUserByEmail(email)) {
    throw new AppError('El email ya está registrado', 409, 'EMAIL_EXISTS');
  }

  // Hash de la contraseña
  const pass_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  // Crear usuario
  const user = {
    id: nanoid(),
    username,
    email: email.toLowerCase(),
    pass_hash,
    credits: 0,
    credits_total_assigned: 0,
    createdAt: new Date().toISOString(),
    last_credit_update: new Date().toISOString()
  };

  // Guardar
  const store = readStore();
  store.users.push(user);
  writeStore(store);

  return {
    id: user.id,
    email: user.email,
    username: user.username,
    credits: user.credits
  };
}

/**
 * Autentica un usuario y genera un JWT
 * @param {string} email - Email del usuario
 * @param {string} password - Contraseña en texto plano
 * @returns {Promise<Object>} Token y datos del usuario
 */
async function login(email, password) {
  // Validar entrada
  if (!email || !password) {
    throw new AppError('Email y password son requeridos', 400, 'INVALID_INPUT');
  }

  // Buscar usuario
  const user = findUserByEmail(email);
  if (!user) {
    throw new AppError('Credenciales inválidas', 401, 'INVALID_CREDENTIALS');
  }

  // Verificar contraseña
  const passwordMatch = await bcrypt.compare(password, user.pass_hash);
  if (!passwordMatch) {
    throw new AppError('Credenciales inválidas', 401, 'INVALID_CREDENTIALS');
  }

  // Generar JWT
  const token = jwt.sign(
    {
      sub: user.id,
      email: user.email,
      username: user.username,
      role: 'user'
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      credits: user.credits,
      credits_total_assigned: user.credits_total_assigned,
      last_credit_update: user.last_credit_update
    }
  };
}

/**
 * Middleware de autenticación requerida
 * Verifica el JWT y extrae el userId del token
 */
function authRequired(req, res, next) {
  try {
    // Obtener el token de la cabecera Authorization
    const authHeader = req.headers.authorization || '';
    const parts = authHeader.split(' ');

    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      throw new AppError('Token no proporcionado o formato inválido', 401, 'MISSING_TOKEN');
    }

    const token = parts[1];

    // Verificar el token
    const payload = jwt.verify(token, JWT_SECRET);

    // Asignar userId y user al request
    req.userId = payload.sub;
    req.user = {
      id: payload.sub,
      email: payload.email,
      username: payload.username,
      role: payload.role || 'user'
    };

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({
        ok: false,
        error: 'TOKEN_EXPIRED',
        message: 'El token ha expirado'
      });
    }

    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({
        ok: false,
        error: 'INVALID_TOKEN',
        message: 'Token inválido'
      });
    }

    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        ok: false,
        error: error.code,
        message: error.message
      });
    }

    return res.status(401).json({
      ok: false,
      error: 'UNAUTHORIZED',
      message: 'No autorizado'
    });
  }
}

/**
 * Middleware de autenticación de administrador
 * Verifica que el usuario tenga rol de administrador
 */
function adminRequired(req, res, next) {
  // Primero verificar que esté autenticado
  authRequired(req, res, () => {
    // Luego verificar que sea administrador
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        ok: false,
        error: 'FORBIDDEN',
        message: 'Se requieren permisos de administrador'
      });
    }
    next();
  });
}

/**
 * Obtiene un usuario por ID
 * @param {string} userId - ID del usuario
 * @returns {Object|null} Usuario sin contraseña
 */
function getUser(userId) {
  const user = findUserById(userId);
  if (!user) return null;

  return {
    id: user.id,
    email: user.email,
    username: user.username,
    credits: user.credits,
    credits_total_assigned: user.credits_total_assigned,
    last_credit_update: user.last_credit_update,
    createdAt: user.createdAt
  };
}

/**
 * Descuenta créditos de un usuario
 * @param {string} userId - ID del usuario
 * @param {number} cost - Cantidad de créditos a descontar
 * @returns {boolean} true si se descuentan correctamente
 */
function charge(userId, cost = 1) {
  const store = readStore();
  const user = store.users.find(x => x.id === userId);

  if (!user) return false;
  if ((user.credits || 0) < cost) return false;

  user.credits -= cost;
  user.last_credit_update = new Date().toISOString();
  writeStore(store);

  return true;
}

/**
 * Añade créditos a un usuario
 * @param {string} userId - ID del usuario
 * @param {number} amount - Cantidad de créditos a añadir
 * @returns {boolean} true si se añaden correctamente
 */
function addCredits(userId, amount) {
  const store = readStore();
  const user = store.users.find(x => x.id === userId);

  if (!user) return false;

  user.credits = (user.credits || 0) + amount;
  user.credits_total_assigned = (user.credits_total_assigned || 0) + amount;
  user.last_credit_update = new Date().toISOString();
  writeStore(store);

  return true;
}

module.exports = {
  createUser,
  login,
  authRequired,
  adminRequired,
  getUser,
  charge,
  addCredits,
  findUserById,
  findUserByEmail
};
