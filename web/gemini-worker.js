import {removeWatermarkFromImageDataSync} from './vendor/gemini/src/sdk/image-data.js';
import {detectVideoWatermarkFromFrames} from './vendor/gemini/src/video/videoWatermarkDetector.js';

self.onmessage=({data:{id,type,payload}})=>{
  try{
    if(type==='image'){
      const result=removeWatermarkFromImageDataSync(payload.imageData,{adaptiveMode:'auto'});
      self.postMessage({id,result},[result.imageData.data.buffer]);
    }else if(type==='video'){
      const result=detectVideoWatermarkFromFrames(payload);
      self.postMessage({id,result});
    }else throw Error('Unknown Gemini worker request');
  }catch(error){self.postMessage({id,error:error.message});}
};
