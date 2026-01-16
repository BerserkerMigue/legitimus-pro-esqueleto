
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { nanoid } = require('nanoid');

const DATA = path.join(__dirname, 'users.store.json');
const JWT_SECRET = process.env.AUTH_JWT_SECRET || 'change_me';

function readStore(){ try { return JSON.parse(fs.readFileSync(DATA,'utf8')); } catch { return { users: [] }; } }
function writeStore(s){ fs.writeFileSync(DATA, JSON.stringify(s,null,2)); }

function findUserByEmail(email){ const s=readStore(); return s.users.find(u=>u.email===email); }
function findUserById(id){ const s=readStore(); return s.users.find(u=>u.id===id); }

async function login(email,password){
  const u=findUserByEmail(email); if(!u) throw new Error('invalid_credentials');
  const ok=await bcrypt.compare(password,u.pass_hash);
  if(!ok) throw new Error('invalid_credentials');
  const token=jwt.sign({sub:u.id,email:u.email,username:u.username},JWT_SECRET,{expiresIn:'7d'});
  return { token,user:{id:u.id,email:u.email,username:u.username,credits:u.credits,credits_total_assigned:u.credits_total_assigned,last_credit_update:u.last_credit_update} };
}

function authRequired(req,res,next){
  try{
    const hdr=(req.headers.authorization||'').split(' ')[1]||'';
    const payload=jwt.verify(hdr,JWT_SECRET);
    req.userId=payload.sub; return next();
  }catch(_){
    return res.status(401).json({ok:false,error:'unauthorized'});
  }
}

function charge(userId,cost=1){
  const s=readStore(); const u=s.users.find(x=>x.id===userId);
  if(!u) return false;
  if((u.credits||0)<cost) return false;
  u.credits-=cost;
  u.last_credit_update = new Date().toISOString();
  writeStore(s);
  return true;
}

function getUser(userId){
  const u=findUserById(userId);
  if(!u) return null;
  return {id:u.id,email:u.email,username:u.username,credits:u.credits,credits_total_assigned:u.credits_total_assigned,last_credit_update:u.last_credit_update};
}

module.exports={login,authRequired,charge,getUser};
