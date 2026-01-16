const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const { nanoid } = require('nanoid');
const prompt = require('prompt-sync')();

const DATA = path.join(__dirname, '../auth/users.store.json');

function readStore(){ try { return JSON.parse(fs.readFileSync(DATA,'utf8')); } catch { return { users: [] }; } }
function writeStore(s){ fs.writeFileSync(DATA, JSON.stringify(s,null,2)); }

function listUsers(){
  const s = readStore();
  console.log("Usuarios registrados:");
  s.users.forEach(u=> console.log(`- ${u.id} | ${u.username} | ${u.email} | créditos=${u.credits}`));
}

async function createUser(){
  const username = prompt('Nombre de usuario: ');
  const email = prompt('Email: ');
  const password = prompt('Password: ', {echo: '*'});
  const credits = parseInt(prompt('Créditos iniciales: '),10) || 0;
  const pass_hash = await bcrypt.hash(password, 10);
  const s = readStore();
  s.users.push({ id:nanoid(), username, email, pass_hash, credits, createdAt:new Date().toISOString() });
  writeStore(s);
  console.log("Usuario creado con éxito.");
}

function setCredits(){
  const email = prompt('Email del usuario: ');
  const credits = parseInt(prompt('Nuevos créditos: '),10);
  const s = readStore();
  const u = s.users.find(x=>x.email===email);
  if(!u){ console.log("Usuario no encontrado"); return; }
  u.credits = credits;
  writeStore(s);
  console.log("Créditos actualizados.");
}

async function main(){
  console.log("=== Admin Usuarios ===");
  console.log("1) Listar usuarios");
  console.log("2) Crear usuario");
  console.log("3) Cambiar créditos");
  const choice = prompt('Opción: ');
  if(choice==='1') listUsers();
  else if(choice==='2') await createUser();
  else if(choice==='3') setCredits();
  else console.log("Opción inválida");
}
main();
