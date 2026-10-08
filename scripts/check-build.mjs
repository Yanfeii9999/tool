import {readFile,readdir,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const output=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../public');
const {version}=JSON.parse(await readFile(path.join(output,'build-info.json'),'utf8'));
if(!/^[a-f0-9]{16}$/.test(version))throw Error('Missing production asset version.');
let modules=0;
async function visit(directory){for(const entry of await readdir(directory,{withFileTypes:true})){
  const file=path.join(directory,entry.name);
  if(entry.isDirectory()){await visit(file);continue;}
  if(/\.(mp4|mov|webm|mkv|avi|py)$|\.test\.js$/.test(entry.name))throw Error(`Unexpected source/media in build: ${file}`);
  if(!/\.m?js$/.test(entry.name))continue;
  const code=await readFile(file,'utf8');
  for(const match of code.matchAll(/(['"])(\.{1,2}\/[^'"]+\.m?js(?:\?[^'"]*)?)\1/g)){
    const target=new URL(match[2],pathToFileURL(file));
    if(target.searchParams.get('v')!==version)throw Error(`Stale module import: ${file} ${match[2]}`);
    if(!(await stat(fileURLToPath(target))).isFile())throw Error(`Missing built module: ${target}`);
  }modules++;
}}
await visit(output);
const html=await readFile(path.join(output,'index.html'),'utf8');
for(const match of html.matchAll(/(?:src|href)=["'](\.\/[^"']+\.(?:css|m?js)(?:\?[^"']*)?)["']/g)){
  const target=new URL(match[1],pathToFileURL(path.join(output,'index.html')));
  if(target.searchParams.get('v')!==version)throw Error('Unversioned entry asset.');await stat(fileURLToPath(target));
}
if(/clearframe|powered\s+by|made\s+with|floating.?badge/i.test(html))throw Error('Branding in built HTML.');
console.log(`PASS: production module graph (${modules} modules), asset versions, branding and media exclusion.`);
