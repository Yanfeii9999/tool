import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.dirname(fileURLToPath(import.meta.url));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.md':'text/plain; charset=utf-8'};
createServer(async(req,res)=>{
  try{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname),relative=pathname==='/'?'index.html':pathname.slice(1);
    if(relative!=='index.html'&&relative!=='static/style.css'&&!relative.startsWith('web/')){res.writeHead(404);res.end('Not found');return;}
    const target=path.resolve(root,relative),inside=path.relative(root,target);
    if(inside.startsWith('..')||path.isAbsolute(inside)||!(await stat(target)).isFile()){res.writeHead(404);res.end('Not found');return;}
    res.writeHead(200,{'content-type':types[path.extname(target)]||'text/plain; charset=utf-8','cache-control':'no-cache'});res.end(await readFile(target));
  }catch{res.writeHead(404);res.end('Not found');}
}).listen(8080,'127.0.0.1',()=>console.log('Website: http://127.0.0.1:8080 — Ctrl+C to stop'));
