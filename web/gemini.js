import {removeWatermark} from './vendor/gemini/src/core/blendModes.js';
import {selectVideoWatermarkDetectionForFrame} from './vendor/gemini/src/video/videoWatermarkDetector.js';
import {restrictRestoration} from './regions.js';
import {cleanupGeminiRoi} from './cleanup.js';
import {fitStackedAlpha} from './layers.js';
let worker=null,sequence=0;
const pending=new Map();
function request(type,payload,transfer=[]){
  if(!worker){
    worker=new Worker(new URL('./gemini-worker.js',import.meta.url),{type:'module'});
    worker.onmessage=({data})=>{const task=pending.get(data.id);if(!task)return;pending.delete(data.id);clearTimeout(task.timer);data.error?task.reject(Error(data.error)):task.resolve(data.result);};
    worker.onerror=()=>{for(const task of pending.values()){clearTimeout(task.timer);task.reject(Error('Không tải được bộ xử lý Gemini. Kiểm tra các file vendor trên website.'));}pending.clear();worker.terminate();worker=null;};
  }
  return new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(Error('Phân tích Gemini quá thời gian cho phép.'));},120000);pending.set(id,{resolve,reject,timer});worker.postMessage({id,type,payload},transfer);});
}
export async function geminiImage(source,destination,regions=[]){
  const ctx=source.getContext('2d',{willReadFrequently:true}),imageData=ctx.getImageData(0,0,source.width,source.height);
  const result=await request('image',{imageData},[imageData.data.buffer]);
  const changed=restrictRestoration(ctx.getImageData(0,0,source.width,source.height),result.imageData,regions);
  destination.width=source.width;destination.height=source.height;
  destination.getContext('2d').putImageData(result.imageData,0,0);
  return {...result.meta,applied:result.meta.applied&&changed};
}
export function detectGeminiVideo(frames,width,height){return request('video',{frames,width,height},frames.map(f=>f.imageData.data.buffer));}
export function applyGeminiVideo(source,destination,detection,gain=1,regions=[],cleanup=true,stacked=true){
  if(destination.width!==source.width)destination.width=source.width;
  if(destination.height!==source.height)destination.height=source.height;
  const ctx=destination.getContext('2d',{willReadFrequently:true});ctx.drawImage(source,0,0);
  // Score every independent track on the original frame. Picking only one
  // winner leaves a second simultaneously visible logo untreated.
  const tracks=detection?.detections?.length?detection.detections:[detection];
  const selections=tracks.map(track=>selectVideoWatermarkDetectionForFrame(source.getContext('2d',{willReadFrequently:true}),{...track,detections:[track]})).filter(selection=>selection?.frameScore.confidence>=.08);
  let applied=false;
  for(const selection of selections){
  const chosen=selection.detection,p=chosen.position,roi=ctx.getImageData(p.x,p.y,p.width,p.height);
  if(regions.length&&!regions.some(r=>r.x*source.width<p.x+p.width&&(r.x+r.w)*source.width>p.x&&r.y*source.height<p.y+p.height&&(r.y+r.h)*source.height>p.y))continue;
  const padding=cleanup?Math.max(24,Math.round(p.width*.9)):0;
  const box={x:Math.max(0,p.x-padding),y:Math.max(0,p.y-padding)};
  box.width=Math.min(source.width,p.x+p.width+padding)-box.x;
  box.height=Math.min(source.height,p.y+p.height+padding)-box.y;
  const original=ctx.getImageData(box.x,box.y,box.width,box.height);
  const alphaGain=(chosen.alphaSeed?.seedGain??1)*gain;
  const fitted=stacked&&(chosen.watermarkKind==='diamond'||detection.watermarkKind==='diamond')?fitStackedAlpha(roi,chosen.alphaMap,alphaGain):{alphaMap:chosen.alphaMap,gain:alphaGain};
  removeWatermark(roi,fitted.alphaMap,{x:0,y:0,width:p.width,height:p.height},{alphaGain:fitted.gain});
  ctx.putImageData(roi,p.x,p.y);
  let restored=ctx.getImageData(box.x,box.y,box.width,box.height);
  if(cleanup&&(chosen.watermarkKind==='diamond'||detection.watermarkKind==='diamond')){
    restored=cleanupGeminiRoi(restored,fitted.alphaMap,{x:p.x-box.x,y:p.y-box.y,width:p.width,height:p.height});
  }
  const changed=restrictRestoration(original,restored,regions,{...box,width:source.width,height:source.height});
  ctx.putImageData(restored,box.x,box.y);applied=changed||applied;
  }
  return applied;
}
