import {makePlan, applyPlan} from './repair.js';
import {demoFiles} from './demo.js';
import {geminiImage,detectGeminiVideo,applyGeminiVideo} from './gemini.js';
const $=id=>document.getElementById(id);
const canvas=$('selection'),ctx=canvas.getContext('2d'),source=document.createElement('canvas'),player=$('player');
let items=[],current=null,busy=false,loading=false,origin=null,drag=null,stopRequested=false,activeStop=null,loadVersion=0;
let audioContext=null,audioDestination=null;
const resultURLs=[];
function message(text){$('message').textContent=text;}
function controls(value){busy=value;for(const id of ['files','demo','fileList','algorithm','undo','reset','seek','drawMode','preview','start','disk']) $(id).disabled=value;$('cancel').hidden=!value;}
function isGemini(){return $('algorithm').value==='gemini';}
$('algorithm').onchange=()=>{$('manualControls').hidden=isGemini();$('algorithmHelp').textContent=isGemini()?'Gemini tự dò mẫu logo và vị trí, không cần khoanh. Xem thử trước khi xuất; không dùng cho vùng đã bị che mờ.':'Kéo chuột khoanh vùng cho mỗi file. Chọn nền thủ công nếu ghép tự động chưa khớp.';$('comparison').hidden=true;draw();};
function eventOnce(target,name){return new Promise((resolve,reject)=>{const done=e=>{cleanup();resolve(e);},error=()=>{cleanup();reject(Error('Trình duyệt không đọc được định dạng file này.'));};function cleanup(){target.removeEventListener(name,done);target.removeEventListener('error',error);}target.addEventListener(name,done,{once:true});target.addEventListener('error',error,{once:true});});}
function capture(media,width,height){source.width=width;source.height=height;source.getContext('2d').drawImage(media,0,0,width,height);}
function draw(extra){
  if(!current || !source.width) return;
  ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(source,0,0,canvas.width,canvas.height);
  for(const r of [...(isGemini()?[]:current.regions),...(extra?[extra]:[])]){
    ctx.lineWidth=2;ctx.strokeStyle='#64e6c2';ctx.fillStyle='#64e6c233';ctx.fillRect(r.x*canvas.width,r.y*canvas.height,r.w*canvas.width,r.h*canvas.height);ctx.strokeRect(r.x*canvas.width,r.y*canvas.height,r.w*canvas.width,r.h*canvas.height);
    if(r.donor){ctx.strokeStyle='#ffd06b';ctx.strokeRect(r.donor.x*canvas.width,r.donor.y*canvas.height,r.w*canvas.width,r.h*canvas.height);}
  }
}
function point(e){const b=canvas.getBoundingClientRect();return{x:Math.max(0,Math.min(1,(e.clientX-b.left)/b.width)),y:Math.max(0,Math.min(1,(e.clientY-b.top)/b.height))};}
canvas.onpointerdown=e=>{
  if(busy || loading || !current || isGemini()) return;
  origin=point(e);drag=$('drawMode').value;canvas.setPointerCapture(e.pointerId);
  if(drag==='donor'&&!current.regions.length){origin=null;message('Khoanh vùng watermark trước khi chọn nền thay thế.');}
};
function updateDonor(p){const r=current.regions.at(-1);r.donor={x:Math.max(0,Math.min(1-r.w,p.x-r.w/2)),y:Math.max(0,Math.min(1-r.h,p.y-r.h/2))};}
canvas.onpointermove=e=>{if(!origin)return;const p=point(e);if(drag==='donor'){updateDonor(p);draw();}else draw({x:Math.min(origin.x,p.x),y:Math.min(origin.y,p.y),w:Math.abs(p.x-origin.x),h:Math.abs(p.y-origin.y)});};
canvas.onpointerup=e=>{if(!origin)return;const p=point(e);if(drag==='donor')updateDonor(p);else{const r={x:Math.min(origin.x,p.x),y:Math.min(origin.y,p.y),w:Math.abs(p.x-origin.x),h:Math.abs(p.y-origin.y)};if(r.w>.003&&r.h>.003&&current.regions.length<30)current.regions.push(r);}origin=null;$('comparison').hidden=true;draw();};
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
    canvas.width=Math.min(1200,source.width);canvas.height=Math.round(canvas.width*source.height/source.width);draw();message(isGemini()?'Gemini/Veo: bấm Xem thử để tự nhận diện và giải ngược lớp logo.':'Kéo chọn vùng cần xoá. Có thể chọn nền thay thế thủ công để kiểm soát kết quả.');
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
      if(current.video){const detection=await scanVideo(current);const applied=applyGeminiVideo(source,$('after'),detection);$('quality').textContent=applied?`Đã giải ngược alpha (${detection.watermarkKind}). ${detection.isConfident?'':'Nhận diện chưa chắc chắn; kiểm tra kỹ viền logo.'}`:'Khung hình này không có đủ tín hiệu logo; đang hiển thị bản gốc.';}
      else{const meta=await geminiImage(source,$('after'));$('quality').textContent=meta.applied?'Đã giải ngược lớp watermark Gemini. Kiểm tra chi tiết vùng logo.':'Chưa nhận diện được watermark Gemini phù hợp; ảnh xem thử chưa được xoá.';}
    }else{if(!current.regions.length)throw Error('Hãy khoanh ít nhất một vùng.');applyPlan(source,$('after'),makePlan(source,current.regions));$('quality').textContent='Đã thay vùng chọn bằng nền lân cận. Đây là ghép nền, không phải giải ngược alpha.';}
    $('comparison').hidden=false;message('Đã có kết quả xem thử. Kiểm tra trước khi xuất.');
  }catch(e){message(e.message);}finally{loading=false;controls(false);if(!window.showDirectoryPicker)$('disk').disabled=true;}
};
if(!('showDirectoryPicker' in window)){$('disk').disabled=true;$('disk').parentElement.title='Lưu trực tiếp cần Chrome/Edge trên HTTPS hoặc localhost.';}
function resultRow(item){const row=document.createElement('div');row.className='row';const name=document.createElement('strong');name.textContent=item.file.name;const state=document.createElement('p');state.className='state';state.textContent='Đang chuẩn bị…';const progress=document.createElement('progress');progress.max=100;progress.value=0;row.append(name,state,progress);$('resultList').append(row);return{row,state,progress};}
function addDownload(row,blob,name){const url=URL.createObjectURL(blob);resultURLs.push(url);const link=document.createElement('a');link.href=url;link.download=name;link.textContent=`Tải ${name} (${(blob.size/1048576).toFixed(1)} MB)`;row.append(link);}
function outputName(item,ext){return item.file.name.replace(/\.[^.]+$/,'')+'_clean.'+ext;}
async function imageOutput(item){const image=new Image();const ready=eventOnce(image,'load');image.src=item.url;await ready;capture(image,image.naturalWidth,image.naturalHeight);const output=document.createElement('canvas');if(isGemini()){const meta=await geminiImage(source,output);if(!meta.applied)throw Error('Chưa nhận diện được mẫu Gemini. Chọn chế độ kéo vùng để xử lý watermark khác.');}else applyPlan(source,output,makePlan(source,item.regions));return new Promise((resolve,reject)=>output.toBlob(b=>b?resolve(b):reject(Error('Không xuất được ảnh PNG.')),'image/png'));}
async function createUniqueOutput(directory,name){
  const stem=name.replace(/\.[^.]+$/,''),ext=name.split('.').pop();
  for(let n=0;n<10000;n++){
    const candidate=n?`${stem}_${n}.${ext}`:name;
    try{await directory.getFileHandle(candidate);}
    catch(e){if(e.name!=='NotFoundError')throw e;const handle=await directory.getFileHandle(candidate,{create:true});return{name:candidate,writable:await handle.createWritable()};}
  }
  throw Error('Không tạo được tên file kết quả mới.');
}
function mimeType(){return ['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(t=>MediaRecorder.isTypeSupported(t));}
async function videoOutput(item,view,directory){
  if(!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream || !player.requestVideoFrameCallback)throw Error('Trình duyệt thiếu chức năng xuất video. Hãy dùng Chrome/Edge mới trên máy tính.');
  const type=mimeType();if(!type)throw Error('Không có bộ mã hoá video phù hợp.');
  const ext=type.startsWith('video/mp4')?'mp4':'webm';let name=outputName(item,ext);
  let writable=null,stream=null,recorder=null,callback=null,writeChain=Promise.resolve(),failure=null;
  const chunks=[];
  try{
    if(!audioContext){audioContext=new AudioContext();audioDestination=audioContext.createMediaStreamDestination();audioContext.createMediaElementSource(player).connect(audioDestination);}
    await audioContext.resume();
    player.src=item.url;const ready=eventOnce(player,'loadeddata');player.load();await ready;
    capture(player,player.videoWidth,player.videoHeight);
    const detection=isGemini()?await scanVideo(item):null;
    if(detection&&!detection.isConfident) view.state.textContent='Mẫu nhận diện chưa chắc chắn; kết quả cần xem lại.';
    if(player.currentTime>.001){const seeked=eventOnce(player,'seeked');player.currentTime=0;await seeked;capture(player,player.videoWidth,player.videoHeight);}
    const plan=isGemini()?null:makePlan(source,item.regions),output=document.createElement('canvas');
    let appliedFrames=0;
    const render=()=>{if(detection){if(applyGeminiVideo(source,output,detection))appliedFrames++;}else applyPlan(source,output,plan);};render();
    if(directory){const created=await createUniqueOutput(directory,name);writable=created.writable;name=created.name;}
    stream=output.captureStream(0);const track=stream.getVideoTracks()[0];
    if(!track.requestFrame)throw Error('Trình duyệt không hỗ trợ ghi từng khung hình canvas.');
    for(const audio of audioDestination.stream.getAudioTracks())stream.addTrack(audio.clone());
    recorder=new MediaRecorder(stream,{mimeType:type,videoBitsPerSecond:Math.min(20000000,Math.max(4000000,player.videoWidth*player.videoHeight*5)),audioBitsPerSecond:192000});
    const stopped=new Promise(resolve=>recorder.addEventListener('stop',resolve,{once:true}));
    const stop=()=>{player.pause();if(recorder.state!=='inactive')recorder.stop();};activeStop=stop;
    recorder.ondataavailable=e=>{if(!e.data.size)return;if(writable){writeChain=writeChain.then(()=>writable.write(e.data)).catch(err=>{failure=err;stop();});}else chunks.push(e.data);};
    recorder.onerror=e=>{failure=e.error||Error('Lỗi bộ mã hoá video.');stop();};
    function frame(){
      try{capture(player,player.videoWidth,player.videoHeight);render();track.requestFrame();view.progress.value=player.currentTime/player.duration*100;view.state.textContent=`Đang xuất ${player.currentTime.toFixed(1)} / ${player.duration.toFixed(1)} giây`;}catch(e){failure=e;stop();return;}
      if(!player.ended&&!stopRequested&&recorder.state==='recording')callback=player.requestVideoFrameCallback(frame);
    }
    player.onended=()=>{track.requestFrame();stop();};player.onerror=()=>{failure=Error('Không đọc tiếp được video.');stop();};
    recorder.start(1000);track.requestFrame();callback=player.requestVideoFrameCallback(frame);
    if(stopRequested)stop();else await player.play();
    await stopped;await writeChain;
    if(failure)throw failure;
    if(stopRequested)throw new DOMException('Đã dừng xử lý.','AbortError');
    if(detection&&!appliedFrames)throw Error('Không khung hình nào có đủ tín hiệu logo Gemini/Veo. Thử chế độ kéo vùng.');
    const note=detection?`Giải ngược alpha ${appliedFrames} lượt khung hình${detection.isConfident?'':'; nhận diện chưa chắc chắn, cần xem lại'}.`:'Ghép nền theo vùng đã chọn.';
    if(writable){await writable.close();writable=null;return {name,saved:true,note};}
    return {name,blob:new Blob(chunks,{type:recorder.mimeType}),note};
  }finally{
    activeStop=null;player.pause();player.onended=null;player.onerror=null;if(callback!==null)player.cancelVideoFrameCallback(callback);
    if(recorder&&recorder.state!=='inactive')recorder.stop();if(stream)for(const track of stream.getTracks())track.stop();
    if(writable)await writable.abort().catch(()=>{});
  }
}
$('start').onclick=async()=>{
  if(loading||busy)return;const selected=isGemini()?items:items.filter(i=>i.regions.length);if(!selected.length)return message('Khoanh vùng ít nhất một file trước khi xử lý.');
  controls(true);stopRequested=false;let directory=null,wakeLock=null;const previous=current;
  try{
    if($('disk').checked){if(!window.showDirectoryPicker)throw Error('Trình duyệt không hỗ trợ lưu trực tiếp.');directory=await window.showDirectoryPicker({mode:'readwrite'});}
    if(navigator.wakeLock)wakeLock=await navigator.wakeLock.request('screen').catch(()=>null);
    $('resultList').replaceChildren();$('results').hidden=false;message('Đang xử lý tuần tự. Giữ tab mở; video được xuất theo thời gian phát.');
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
document.addEventListener('visibilitychange',()=>{if(document.hidden&&busy)message('Tab đang ẩn: trình duyệt có thể giảm tốc hoặc rớt khung hình. Hãy quay lại tab khi xuất video.');});
