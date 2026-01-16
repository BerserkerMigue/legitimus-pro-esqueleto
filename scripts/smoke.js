
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
(async ()=>{
  function log(label, ok){ console.log(label + ': ' + (ok?'OK':'FAIL')); }
  try{
    const h = await fetch('http://localhost:3000/healthz'); log('healthz', h.ok);
    const inv = await fetch('http://localhost:3000/api/knowledge/inventory'); log('inventory', inv.ok);
    const search = await fetch('http://localhost:3000/api/knowledge/search?q=test'); log('search', search.ok);
  }catch(e){
    console.error('smoke failed', e);
    process.exit(1);
  }
})();
