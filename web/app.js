import {makePlan, applyPlan} from './repair.js';
import {demoFiles} from './demo.js';
import {geminiImage,detectGeminiVideo,applyGeminiVideo} from './gemini.js';
const $=id=>document.getElementById(id);
const canvas=$('selection'),ctx=canvas.getContext('2d'),source=document.createElement('canvas'),player=$('player');
let items=[],current=null,busy=false,loading=false,origin=null,drag=null,stopRequested=false,activeStop=null,loadVersion=0;
const resultURLs=[];
function message(text){$('message').textContent=text;}
function controls(value){busy=value;for(const id of ['files','demo','fileList','algorithm','stacked','undo','reset','seek','drawMode','preview','start','disk']) $(id).disabled=value;$('cancel').hidden=!value;}
function isGemini(){return $('algorithm').value==='gemini';}
function syncAlgorithm(){
  $('drawMode').querySelector('option[value="donor"]').disabled=isGemini();
  if(isGemini())$('drawMode').value='target';
  $('stackedControl').hidden=!isGemini();
  $('algorithmHelp').textContent=isGemini()?'Kéo chuột khoanh logo Gemini/Veo để chỉ xử lý trong vùng chọn. Không khoanh vùng thì tự nhận diện toàn ảnh. Logo khác cần chọn chế độ ghép nền.':'Kéo chuột khoanh vùng cho mỗi file. Chọn nền thủ công nếu ghép tự động chưa khớp.';
  $('comparison').hidden=true;draw();
}
$('algorithm').onchange=syncAlgorithm;
$('stacked').onchange=()=>{$('comparison').hidden=true;};
function eventOnce(target,name){return new Promise((resolve,reject)=>{const done=e=>{cleanup();resolve(e);},error=()=>{cleanup();reject(Error('Trình duyệt không đọc được định dạng file này.'));};function cleanup(){target.removeEventListener(name,done);target.removeEventListener('error',error);}target.addEventListener(name,done,{once:true});target.addEventListener('error',error,{once:true});});}
function capture(media,width,height){source.width=width;source.height=height;source.getContext('2d').drawImage(media,0,0,width,height);}
function draw(extra){
  if(!current || !source.width) return;
  ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(source,0,0,canvas.width,canvas.height);
  $('selectionStatus').textContent=current.regions.length?`Đã chọn ${current.regions.length} vùng · ${isGemini()?'Giải alpha chỉ trong khung xanh.':'Ghép nền trong khung xanh.'}`:'Kéo chuột trực tiếp trên ảnh bên dưới để khoanh watermark.';
  for(const r of [...current.regions,...(extra?[extra]:[])]){
    ctx.lineWidth=2;ctx.strokeStyle='#64e6c2';ctx.fillStyle='#64e6c233';ctx.fillRect(r.x*canvas.width,r.y*canvas.height,r.w*canvas.width,r.h*canvas.height);ctx.strokeRect(r.x*canvas.width,r.y*canvas.height,r.w*canvas.width,r.h*canvas.height);
    if(r.donor&&!isGemini()){ctx.strokeStyle='#ffd06b';ctx.strokeRect(r.donor.x*canvas.width,r.donor.y*canvas.height,r.w*canvas.width,r.h*canvas.height);}
  }
}
function point(e){const b=canvas.getBoundingClientRect();return{x:Math.max(0,Math.min(1,(e.clientX-b.left)/b.width)),y:Math.max(0,Math.min(1,(e.clientY-b.top)/b.height))};}
canvas.onpointerdown=e=>{
  if(busy || loading || !current || e.button!==0) return;
  e.preventDefault();origin=point(e);drag=isGemini()?'target':$('drawMode').value;canvas.setPointerCapture(e.pointerId);
  if(drag==='donor'&&!current.regions.length){origin=null;message('Khoanh vùng watermark trước khi chọn nền thay thế.');}
};
function updateDonor(p){const r=current.regions.at(-1);r.donor={x:Math.max(0,Math.min(1-r.w,p.x-r.w/2)),y:Math.max(0,Math.min(1-r.h,p.y-r.h/2))};}
canvas.onpointermove=e=>{if(!origin)return;const p=point(e);if(drag==='donor'){updateDonor(p);draw();}else draw({x:Math.min(origin.x,p.x),y:Math.min(origin.y,p.y),w:Math.abs(p.x-origin.x),h:Math.abs(p.y-origin.y)});};
canvas.onpointerup=e=>{if(!origin)return;const p=point(e);if(drag==='donor')updateDonor(p);else{const r={x:Math.min(origin.x,p.x),y:Math.min(origin.y,p.y),w:Math.abs(p.x-origin.x),h:Math.abs(p.y-origin.y)};if(r.w>.003&&r.h>.003&&current.regions.length<30)current.regions.push(r);}origin=null;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);$('comparison').hidden=true;draw();};
canvas.onpointercancel=()=>{origin=null;draw();};
$('undo').onclick=()=>{current?.regions.pop();$('comparison').hidden=true;draw();};
$('reset').onclick=()=>{if(current)current.regions=[];$('comparison').hidden=true;draw();};
async function openItem(item){
  const version=++loadVersion;loading=true;$('start').disabled=true;$('preview').disabled=true;
  player.pause();current=item;$('comparison').hidden=true;$('seekControls').hidden=!item.video;
  try{
    if(item.video){
      player.src=item.url;const ready=eventOnce(player,'loadeddata');player.load();await ready;
      if(version!==loadVersion)return;
      if(!Number.isFinite(player.duration))throw Error('Không xác định được thời lượng video.');
      $('seek').value=0;$('seek').max=player.duration;$('duration').textContent=`${player.videoWidth} × ${player.videoHeight} · ${player.duration.toFixed(1)} giây`;
      capture(player,player.videoWidth,player.videoHeight);
    }else{
      const image=new Image();const ready=eventOnce(image,'load');image.src=item.url;await ready;if(version!==loadVersion)return;capture(image,image.naturalWidth,image.naturalHeight);
    }
    canvas.width=Math.min(1200,source.width);canvas.height=Math.round(canvas.width*source.height/source.width);draw();message('Kéo chuột trên ảnh để khoanh watermark, rồi bấm Xem thử kết quả.');
  }catch(e){if(version===loadVersion)message(e.message);}finally{if(version===loadVersion){loading=false;$('start').disabled=false;$('preview').disabled=false;}}
}
async function loadFiles(files){
  ++loadVersion;player.pause();player.removeAttribute('src');player.load();
  for(const item of items)URL.revokeObjectURL(item.url);for(const url of resultURLs)URL.revokeObjectURL(url);resultURLs.length=0;
  items=[...files].filter(f=>f.type.startsWith('image/')||f.type.startsWith('video/')||/\.(mp4|mov|webm|mkv|avi|png|jpe?g|webp|bmp)$/i.test(f.name)).map((file,i)=>({file,id:String(i),url:URL.createObjectURL(file),video:file.type.startsWith('video/')||/\.(mp4|mov|webm|mkv|avi)$/i.test(file.name),regions:[]}));
  $('fileList').replaceChildren();$('results').hidden=true;$('resultList').replaceChildren();
  for(const item of items){const option=document.createElement('option');option.value=item.id;option.textContent=item.file.name;$('fileList').append(option);}
  $('editor').hidden=!items.length;if(items.length)await openItem(items[0]);else message('Không có file ảnh hoặc video hợp lệ.');
}
$('files').onchange=()=>loadFiles($('files').files);
$('demo').onclick=async()=>{controls(true);message('Đang tạo ảnh và video mẫu 2,5 giây trên thiết bị…');try{await loadFiles(await demoFiles());}catch(e){message(e.message);}finally{controls(false);if(!window.showDirectoryPicker)$('disk').disabled=true;}};
$('fileList').onchange=()=>openItem(items.find(i=>i.id===$('fileList').value));
$('seek').onchange=async()=>{
  if(!current?.video || busy || loading)return;loading=true;
  try{const t=Math.min(Math.max(0,Number($('seek').value)||0),Math.max(0,player.duration-.05));if(Math.abs(t-player.currentTime)>.001){const ready=eventOnce(player,'seeked');player.currentTime=t;await ready;}capture(player,player.videoWidth,player.videoHeight);draw();$('comparison').hidden=true;}catch(e){message(e.message);}finally{loading=false;}
};
async function scanVideo(item){
  if(item.detection)return item.detection;
  const originalTime=player.currentTime,frames=[];
  for(const fraction of [0,.25,.5,.75,.9]){
    if(stopRequested&&busy)throw new DOMException('Đã dừng.','AbortError');
    const t=Math.min(player.duration*fraction,Math.max(0,player.duration-.05));
    if(Math.abs(t-player.currentTime)>.001){const ready=eventOnce(player,'seeked');player.currentTime=t;await ready;}
    capture(player,player.videoWidth,player.videoHeight);frames.push({timestamp:t,imageData:source.getContext('2d',{willReadFrequently:true}).getImageData(0,0,source.width,source.height)});
  }
  const detection=await detectGeminiVideo(frames,source.width,source.height);
  if(Math.abs(originalTime-player.currentTime)>.001){const ready=eventOnce(player,'seeked');player.currentTime=originalTime;await ready;}
  capture(player,player.videoWidth,player.videoHeight);item.detection=detection;return detection;
}
$('preview').onclick=async()=>{
  if(loading||busy||!current)return;loading=true;stopRequested=false;controls(true);$('cancel').hidden=true;
  try{
    message('Đang phân tích và phục hồi…');
    if(isGemini()){
      if(current.video){const detection=await scanVideo(current);const applied=applyGeminiVideo(source,$('after'),detection,1,current.regions,true,$('stacked').checked);$('quality').textContent=applied?`Đã giải ngược alpha và dọn viền (${detection.watermarkKind})${current.regions.length?' trong vùng đã chọn':''}${$('stacked').checked?'; đã kiểm tra lớp chồng':''}. Kiểm tra kỹ viền logo.`:'Không tìm thấy logo phù hợp trong vùng chọn ở khung hình này. Hãy khoanh bao hết logo hoặc chọn chế độ ghép nền.';}
      else{const meta=await geminiImage(source,$('after'),current.regions);$('quality').textContent=meta.applied?'Đã giải ngược lớp watermark Gemini trong vùng xử lý. Kiểm tra chi tiết và viền logo.':'Không tìm thấy logo Gemini phù hợp trong vùng chọn. Hãy khoanh bao hết logo hoặc chọn chế độ ghép nền.';}
    }else{if(!current.regions.length)throw Error('Hãy khoanh ít nhất một vùng.');applyPlan(source,$('after'),makePlan(source,current.regions));$('quality').textContent='Đã thay vùng chọn bằng nền lân cận. Đây là ghép nền, không phải giải ngược alpha.';}
    $('comparison').hidden=false;message('Đã có kết quả xem thử. Kiểm tra trước khi xuất.');
  }catch(e){message(e.message);}finally{loading=false;controls(false);if(!window.showDirectoryPicker)$('disk').disabled=true;}
};
if(!('showDirectoryPicker' in window)){$('disk').disabled=true;$('disk').parentElement.title='Lưu trực tiếp cần Chrome/Edge trên HTTPS hoặc localhost.';}
function resultRow(item){const row=document.createElement('div');row.className='row';const name=document.createElement('strong');name.textContent=item.file.name;const state=document.createElement('p');state.className='state';state.textContent='Đang chuẩn bị…';const progress=document.createElement('progress');progress.max=100;progress.value=0;row.append(name,state,progress);$('resultList').append(row);return{row,state,progress};}
function addDownload(row,blob,name){const url=URL.createObjectURL(blob);resultURLs.push(url);const link=document.createElement('a');link.href=url;link.download=name;link.textContent=`Tải ${name} (${(blob.size/1048576).toFixed(1)} MB)`;row.append(link);}
function outputName(item,ext){return item.file.name.replace(/\.[^.]+$/,'')+'_clean.'+ext;}
async function imageOutput(item){const image=new Image();const ready=eventOnce(image,'load');image.src=item.url;await ready;capture(image,image.naturalWidth,image.naturalHeight);const output=document.createElement('canvas');if(isGemini()){const meta=await geminiImage(source,output,item.regions);if(!meta.applied)throw Error('Không tìm thấy logo Gemini phù hợp trong vùng xử lý. Khoanh lại hoặc chọn ghép nền.');}else applyPlan(source,output,makePlan(source,item.regions));return new Promise((resolve,reject)=>output.toBlob(b=>b?resolve(b):reject(Error('Không xuất được ảnh PNG.')),'image/png'));}
async function createUniqueOutput(directory,name){
  const stem=name.replace(/\.[^.]+$/,''),ext=name.split('.').pop();
  for(let n=0;n<10000;n++){
    const candidate=n?`${stem}_${n}.${ext}`:name;
    try{await directory.getFileHandle(candidate);}
    catch(e){if(e.name!=='NotFoundError')throw e;const handle=await directory.getFileHandle(candidate,{create:true});return{name:candidate,writable:await handle.createWritable()};}
  }
  throw Error('Không tạo được tên file kết quả mới.');
}
async function videoOutput(item,view,directory){
  const controller=new AbortController();activeStop=()=>controller.abort();
  let writable=null,name=outputName(item,'mp4');
  try{
    player.src=item.url;const ready=eventOnce(player,'loadeddata');player.load();await ready;
    capture(player,player.videoWidth,player.videoHeight);
    const detection=isGemini()?await scanVideo(item):null;
    if(stopRequested)controller.abort();controller.signal.throwIfAborted();
    if(detection&&!detection.isConfident)throw Error('Nhận diện logo chưa chắc chắn. Khoanh lại vùng hoặc chọn ghép nền.');
    if(directory){const created=await createUniqueOutput(directory,name);writable=created.writable;name=created.name;}
    const {exportVideo}=await import('./offline-video.js');
    const result=await exportVideo(item.file,{detection,regions:item.regions,stacked:$('stacked').checked,writable,signal:controller.signal,onProgress:p=>{
      view.progress.value=p.progress;view.state.textContent=`Đã xử lý ${p.processedFrames} khung hình · ${p.progress.toFixed(0)}%`;
    }});
    const note=`${result.processedFrames} khung hình; đã xử lý ${result.appliedFrames}${result.audioCopied?'; sao chép luồng âm thanh':''}. ${detection?'Đã giải alpha và dọn viền logo; kiểm tra kết quả.':'Ghép nền theo vùng đã chọn.'}`;
    if(writable){await writable.close();writable=null;return{name,saved:true,note};}
    return{name,blob:result.blob,note};
  }finally{activeStop=null;if(writable)await writable.abort().catch(()=>{});}
}
$('start').onclick=async()=>{
  if(loading||busy)return;const selected=isGemini()?items:items.filter(i=>i.regions.length);if(!selected.length)return message('Khoanh vùng ít nhất một file trước khi xử lý.');
  controls(true);stopRequested=false;let directory=null,wakeLock=null;const previous=current;
  try{
    if($('disk').checked){if(!window.showDirectoryPicker)throw Error('Trình duyệt không hỗ trợ lưu trực tiếp.');directory=await window.showDirectoryPicker({mode:'readwrite'});}
    if(navigator.wakeLock)wakeLock=await navigator.wakeLock.request('screen').catch(()=>null);
    $('resultList').replaceChildren();$('results').hidden=false;message('Đang xử lý tuần tự từng khung hình. Giữ tab mở đến khi xuất xong.');
    for(const item of items){
      if(stopRequested)break;const view=resultRow(item);
      if(!isGemini()&&!item.regions.length){view.state.textContent='Bỏ qua — chưa chọn vùng.';continue;}
      try{
        if(item.video){const result=await videoOutput(item,view,directory);if(result.saved)view.state.textContent=`Đã lưu ${result.name}. ${result.note}`;else{addDownload(view.row,result.blob,result.name);view.state.textContent=`Hoàn tất. ${result.note}`;}}
        else{const blob=await imageOutput(item);addDownload(view.row,blob,outputName(item,'png'));view.state.textContent='Hoàn tất ảnh PNG.';}
        view.progress.value=100;
      }catch(e){view.state.textContent=e.name==='AbortError'?'Đã dừng; không xuất bản kết quả chưa hoàn tất.':`Lỗi: ${e.message}`;}
    }
    message(stopRequested?'Đã dừng. Kết quả đã hoàn tất vẫn tải được.':'Đã kết thúc lượt xử lý. Kiểm tra kết quả và lỗi của từng file.');
  }catch(e){message(e.name==='AbortError'?'Đã huỷ chọn thư mục.':e.message);}finally{const finalMessage=$('message').textContent;await wakeLock?.release().catch(()=>{});controls(false);if(!window.showDirectoryPicker)$('disk').disabled=true;if(previous)await openItem(previous);message(finalMessage);}
};
$('cancel').onclick=()=>{stopRequested=true;activeStop?.();message('Đang dừng xử lý…');};
document.addEventListener('visibilitychange',()=>{if(document.hidden&&busy)message('Tab đang ẩn: trình duyệt có thể tạm dừng xử lý. Quay lại tab để tiếp tục nhanh hơn.');});
syncAlgorithm();
