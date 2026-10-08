import {cp,mkdir,readFile,writeFile,rm,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url)),output=path.join(root,'public');
if(path.dirname(output)!==root||path.basename(output)!=='public')throw Error('Unsafe build output path.');
await rm(output,{recursive:true,force:true});
await mkdir(path.join(output,'static'),{recursive:true});
await cp(path.join(root,'index.html'),path.join(output,'index.html'));
await cp(path.join(root,'.nojekyll'),path.join(output,'.nojekyll'));
await cp(path.join(root,'static/style.css'),path.join(output,'static/style.css'));
await cp(path.join(root,'web'),path.join(output,'web'),{recursive:true,filter:source=>!source.endsWith('.test.js')});
// Version the entire module graph together. Updating only app.js can still
// import a cached old worker, detector or export adapter after a Pages deploy.
async function filesIn(directory){const result=[];for(const entry of await readdir(directory,{withFileTypes:true})){const file=path.join(directory,entry.name);if(entry.isDirectory())result.push(...await filesIn(file));else result.push(file);}return result.sort();}
const modules=(await filesIn(path.join(output,'web'))).filter(file=>/\.m?js$/.test(file));
const hash=createHash('sha256');for(const file of modules){hash.update(path.relative(output,file).replaceAll('\\','/'));hash.update(await readFile(file));}
hash.update(await readFile(path.join(output,'static/style.css')));hash.update(await readFile(path.join(output,'web/site.css')));
const version=hash.digest('hex').slice(0,16);
for(const file of modules){const code=await readFile(file,'utf8');await writeFile(file,code.replace(/(['"])(\.{1,2}\/[^'"]+\.m?js)\1/g,(_,quote,specifier)=>`${quote}${specifier}?v=${version}${quote}`));}
let html=await readFile(path.join(output,'index.html'),'utf8');
if(/clearframe|powered\s+by|made\s+with|floating.?badge/i.test(html))throw Error('Unexpected project branding in production HTML.');
html=html.replace(/((?:src|href)=["'])(\.\/[^"']+\.(?:css|m?js))(["'])/g,`$1$2?v=${version}$3`).replace('</head>',`<meta name="build-version" content="${version}"></head>`);
await writeFile(path.join(output,'index.html'),html);
await writeFile(path.join(output,'build-info.json'),JSON.stringify({version,entry:'index.html',backend:false,userMediaIncluded:false},null,2));
console.log('Production website built in public/; project branding check passed.');
