import test from 'node:test';
import assert from 'node:assert/strict';
import {removeWatermarkFromImageDataSync} from './vendor/gemini/src/sdk/image-data.js';
import {getEmbeddedAlphaMap} from './vendor/gemini/src/core/embeddedAlphaMaps.js';
import {removeWatermark} from './vendor/gemini/src/core/blendModes.js';
import {calculateWatermarkPosition,detectWatermarkConfig} from './vendor/gemini/src/core/watermarkConfig.js';
import {detectDiamondVideoWatermarkFromFrames,getVideoAlphaMap} from './vendor/gemini/src/video/videoWatermarkDetector.js';
import {resolveVideoWatermarkCandidates} from './vendor/gemini/src/video/videoWatermarkCatalog.js';

function makeFixture(width,height,position,alpha){
  const clean=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4;clean[i]=45+x%9;clean[i+1]=80+y%7;clean[i+2]=115+(x+y)%5;clean[i+3]=255;}
  const marked=new Uint8ClampedArray(clean);
  for(let y=0;y<position.height;y++)for(let x=0;x<position.width;x++){const a=alpha[y*position.width+x],i=((y+position.y)*width+x+position.x)*4;for(let c=0;c<3;c++)marked[i+c]=Math.round(a*255+(1-a)*clean[i+c]);}
  return{clean,imageData:{width,height,data:marked}};
}
function meanError(a,b){let total=0;for(let i=0;i<a.length;i+=4)for(let c=0;c<3;c++)total+=Math.abs(a[i+c]-b[i+c]);return total/(a.length/4*3);}
test('real upstream alpha template is auto-detected and reversed without smearing',()=>{
  const width=512,height=512,config=detectWatermarkConfig(width,height),position=calculateWatermarkPosition(width,height,config),alpha=getEmbeddedAlphaMap(config.logoSize);
  const {clean,imageData}=makeFixture(width,height,position,alpha),before=meanError(clean,imageData.data);
  const result=removeWatermarkFromImageDataSync(imageData,{adaptiveMode:'auto'});
  assert.equal(result.meta.applied,true);
  assert.ok(meanError(clean,result.imageData.data)<before*.15);
  assert.equal(result.imageData.data[0],clean[0]);
});
test('video detector localizes a controlled Gemini logo and reverse alpha restores detail',()=>{
  const width=640,height=360,candidate=resolveVideoWatermarkCandidates(width,height)[0];
  const position={x:candidate.x,y:candidate.y,width:candidate.size,height:candidate.size};
  const alpha=getVideoAlphaMap(candidate.size,{candidate});
  const {clean,imageData}=makeFixture(width,height,position,alpha);
  const detection=detectDiamondVideoWatermarkFromFrames({width,height,frames:[{timestamp:0,imageData}]});
  assert.equal(detection.position.x,position.x);assert.equal(detection.position.y,position.y);
  assert.equal(detection.isConfident,true);
  const before=meanError(clean,imageData.data);
  removeWatermark(imageData,detection.alphaMap,detection.position,{alphaGain:detection.alphaSeed.seedGain});
  assert.ok(meanError(clean,imageData.data)<before*.2);
});
