import {readFile,readdir,stat} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
let checked=0;
async function visit(directory){
  for(const entry of await readdir(directory,{withFileTypes:true})){
    if(['.git','.qa','node_modules','public','__pycache__','data','outputs'].includes(entry.name))continue;
    const file=path.join(directory,entry.name);
    if(entry.isDirectory()){await visit(file);continue;}
    if(!/\.(m?js)$/.test(entry.name))continue;
    const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
    if(result.status!==0)throw Error(`${file}\n${result.stderr}`);
    const code=await readFile(file,'utf8');
    for(const match of code.matchAll(/(?:from\s*|import\s*\()\s*['"](\.[^'"]+)['"]/g)){
      if(!(await stat(path.resolve(path.dirname(file),match[1]))).isFile())throw Error(`Missing import in ${file}: ${match[1]}`);
    }
    checked++;
  }
}
await visit(root);
for(const relative of ['index.html','templates/index.html']){
  let html;try{html=await readFile(path.join(root,relative),'utf8');}catch{continue;}
  if(/clearframe|powered\s+by|made\s+with|floating.?badge/i.test(html))throw Error(`Unexpected branding: ${relative}`);
  for(const match of html.matchAll(/(?:src|href)=["'](\.[^"']+)["']/g))await stat(path.resolve(root,match[1]));
}
console.log(`PASS: ${checked} JS/MJS files parse, relative imports/assets resolve, UI branding removed.`);
