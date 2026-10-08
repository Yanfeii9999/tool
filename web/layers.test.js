import test from 'node:test';
import assert from 'node:assert/strict';
import {fitStackedAlpha} from './layers.js';
import {getVideoAlphaMap} from './vendor/gemini/src/video/videoWatermarkDetector.js';
import {removeWatermark} from './vendor/gemini/src/core/blendModes.js';
const size=72,alpha=getVideoAlphaMap(size);
function fixture(layers=1,nested=false){
  const image={width:size,height:size,data:new Uint8ClampedArray(size*size*4)},original=new Uint8ClampedArray(image.data.length);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const i=y*size+x,background=100+x*.3+y*.2;
    let a=1-(1-alpha[i])**layers;
    if(nested){const sx=(x-35.5)*1.5+35.5,sy=(y-35.5)*1.5+35.5;const second=sx>=0&&sy>=0&&sx<=71&&sy<=71?alpha[Math.round(sy)*size+Math.round(sx)]:0;a=1-(1-a)*(1-second);}
    for(let c=0;c<3;c++){original[i*4+c]=background;image.data[i*4+c]=background*(1-a)+255*a;}original[i*4+3]=image.data[i*4+3]=255;
  }return{image,original};
}
function error(image,original){let sum=0;for(let i=0;i<original.length;i++)if(i%4!==3)sum+=Math.abs(image.data[i]-original[i]);return sum/(size*size*3);}
test('single logo is not mistaken for stacked copies',()=>{
  const {image}=fixture();const result=fitStackedAlpha(image,alpha);assert.equal(result.layers,1);assert.equal(result.alphaMap,alpha);
});
test('two identical alpha layers are removed together instead of leaving the second logo',()=>{
  const {image,original}=fixture(2),once={...image,data:new Uint8ClampedArray(image.data)};
  removeWatermark(once,alpha,{x:0,y:0,width:size,height:size});
  const fitted=fitStackedAlpha(image,alpha);assert.ok(fitted.layers>1.8&&fitted.layers<2.2);
  removeWatermark(image,fitted.alphaMap,{x:0,y:0,width:size,height:size},{alphaGain:fitted.gain});
  assert.ok(error(image,original)<1);assert.ok(error(image,original)<error(once,original)/10);
});
test('nested small and large diamonds are fitted as separate layers',()=>{
  const {image,original}=fixture(1,true),fitted=fitStackedAlpha(image,alpha);assert.ok(fitted.layers>1.7);
  removeWatermark(image,fitted.alphaMap,{x:0,y:0,width:size,height:size},{alphaGain:fitted.gain});assert.ok(error(image,original)<1.6);
});
test('mismatched templates are rejected and negative polarity stays on the single layer path',()=>{
  const {image}=fixture();assert.throws(()=>fitStackedAlpha(image,new Float32Array(4)),/khớp/);
  assert.equal(fitStackedAlpha(image,Float32Array.from(alpha,a=>-a)).layers,1);
});
