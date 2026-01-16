
'use strict';
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');

const SUPPORTED_EXTS = ['.txt','.md','.json','.pdf'];

function listKnowledgeDirs(){
  const base1 = path.join(__dirname, '..','lexcode_instances','general','conocimiento');
  const base2 = path.join(__dirname, '..','lexcode_instances','general','conocimiento_index');
  const base3 = path.join(__dirname, '..','lexcode_instances','general','conocimiento_rag_only');
  const base4 = path.join(__dirname, '..','files','anon');
  return [base1, base2, base3, base4].filter(d => fs.existsSync(d));
}

function listKnowledgeFiles(){
  const dirs = listKnowledgeDirs();
  const files = [];
  for (const d of dirs){
    for (const f of fs.readdirSync(d)){
      const p = path.join(d,f);
      if (fs.statSync(p).isFile()){
        const ext = path.extname(f).toLowerCase();
        if (SUPPORTED_EXTS.includes(ext)){
          
          files.push({ name:f, path:p, ext });
        }
      }
    }
  }
  // dedupe by name, prefer files/anon over bot_base
  const map = new Map();
  for (const f of files){
    if (!map.has(f.name) || map.get(f.name).path.includes('/lexcode_instances/general/')){
      map.set(f.name, f);
    }
  }
  return Array.from(map.values());
}

function readTextSync(filePath){
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.txt' || ext === '.md'){
    return fs.readFileSync(filePath,'utf-8');
  }
  if (ext === '.json'){
    try{
      const obj = JSON.parse(fs.readFileSync(filePath,'utf-8'));
      return JSON.stringify(obj,null,2);
    }catch(e){
      return fs.readFileSync(filePath,'utf-8');
    }
  }
  throw new Error('readTextSync: unsupported extension for sync path=' + filePath);
}

async function extractPdfText(filePath){
  const data = await pdfParse(fs.readFileSync(filePath));
  // Build page index by splitting by form feed if present, else naive chunking
  const pages = [];
  if (Array.isArray(data?.text?.split)){
    const raw = data.text;
    if (raw.includes('\f')){
      const parts = raw.split('\f');
      for (let i=0;i<parts.length;i++){
        pages.push({page:i+1, text:parts[i]});
      }
    }else{
      // Fallback: single page
      pages.push({page:1, text:raw || ''});
    }
  }
  return { text: data.text || '', pages };
}

function summarizePlain(text, maxChars=500){
  const clean = (text || '').replace(/\s+/g,' ').trim();
  return clean.slice(0, maxChars);
}

function findHitsInText(text, query, opts={}){
  const q = (query||'').trim();
  if (!q) return [];
  const hay = text || '';
  const idxs = [];
  const lcHay = hay.toLowerCase();
  const lcQ = q.toLowerCase();
  let pos = 0;
  const maxHits = opts.maxHits || 5;
  while (idxs.length < maxHits){
    const i = lcHay.indexOf(lcQ, pos);
    if (i === -1) break;
    idxs.push(i);
    pos = i + lcQ.length;
  }
  const hits = idxs.map(i=>{
    const start = Math.max(0, i - 120);
    const end = Math.min(hay.length, i + q.length + 120);
    const preview = hay.slice(start, end).replace(/\n/g,' ');
    const line = (hay.slice(0, i).match(/\n/g)||[]).length + 1;
    return { index:i, line, preview };
  });
  return hits;
}

async function searchFile(file, query){
  const ext = file.ext;
  if (ext === '.pdf'){
    const parsed = await extractPdfText(file.path);
    // Search per page for page numbers
    let hits = [];
    for (const pg of parsed.pages){
      for (const h of findHitsInText(pg.text, query, {maxHits:2})){
        hits.push({ file: file.name, page: pg.page, preview: h.preview });
      }
      if (hits.length >= 5) break;
    }
    // Fallback to whole text if no page-specific hits
    if (!hits.length){
      for (const h of findHitsInText(parsed.text, query, {maxHits:3})){
        hits.push({ file: file.name, page: 1, preview: h.preview });
      }
    }
    return hits.slice(0,5);
  }
  if (ext === '.json'){
    // Try structured search for value matches and provide a "path"
    try{
      const obj = JSON.parse(fs.readFileSync(file.path,'utf-8'));
      const q = (query||'').toLowerCase();
      const paths = [];
      const maxHits = 5;
      function walk(node, p){
        if (paths.length >= maxHits) return;
        if (typeof node === 'string' || typeof node === 'number' || typeof node === 'boolean'){
          const s = String(node).toLowerCase();
          if (s.includes(q)){
            paths.push({ file: file.name, jsonPath: p.join('.'), preview: String(node).slice(0,180) });
          }
          return;
        }
        if (Array.isArray(node)){
          for (let i=0;i<node.length;i++){
            walk(node[i], [...p, i]);
            if (paths.length >= maxHits) return;
          }
          return;
        }
        if (node && typeof node === 'object'){
          for (const k of Object.keys(node)){
            walk(node[k], [...p, k]);
            if (paths.length >= maxHits) return;
          }
        }
      }
      walk(obj, ['$']);
      if (paths.length) return paths;
    }catch(e){}
    // Fallback to plain text
    const text = readTextSync(file.path);
    return findHitsInText(text, query).map(h=>({ file: file.name, line: h.line, preview: h.preview }));
  }
  // txt/md
  const text = readTextSync(file.path);
  return findHitsInText(text, query).map(h=>({ file: file.name, line: h.line, preview: h.preview }));
}

async function searchAll(query){
  const files = listKnowledgeFiles();
  const results = [];
  for (const f of files){
    const hits = await searchFile(f, query);
    for (const h of hits) results.push(h);
    if (results.length >= 20) break;
  }
  return results;
}

module.exports = {
  SUPPORTED_EXTS,
  listKnowledgeFiles,
  readTextSync,
  summarizePlain,
  searchAll
};
