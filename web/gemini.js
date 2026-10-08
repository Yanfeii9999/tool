import {removeWatermark} from './vendor/gemini/src/core/blendModes.js';
import {selectVideoWatermarkDetectionForFrame} from './vendor/gemini/src/video/videoWatermarkDetector.js';
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
export async function geminiImage(source,destination){
  const ctx=source.getContext('2d',{willReadFrequently:true}),imageData=ctx.getImageData(0,0,source.width,source.height);
  const result=await request('image',{imageData},[imageData.data.buffer]);
  destination.width=source.width;destination.height=source.height;
  destination.getContext('2d').putImageData(result.imageData,0,0);
  return result.meta;
}
export function detectGeminiVideo(frames,width,height){return request('video',{frames,width,height},frames.map(f=>f.imageData.data.buffer));}
export function applyGeminiVideo(source,destination,detection,gain=1){
  if(destination.width!==source.width)destination.width=source.width;
  if(destination.height!==source.height)destination.height=source.height;
  const ctx=destination.getContext('2d',{willReadFrequently:true});ctx.drawImage(source,0,0);
  const selection=selectVideoWatermarkDetectionForFrame(ctx,detection);
  if(!selection)return false;
  // Do not subtract a white logo on frames without positive evidence for that logo.
  if(selection.frameScore.confidence<.08)return false;
  const chosen=selection.detection,p=chosen.position,roi=ctx.getImageData(p.x,p.y,p.width,p.height);
  removeWatermark(roi,chosen.alphaMap,{x:0,y:0,width:p.width,height:p.height},{alphaGain:(chosen.alphaSeed?.seedGain??1)*gain});
  ctx.putImageData(roi,p.x,p.y);return true;
}
