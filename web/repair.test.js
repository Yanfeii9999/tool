import test from 'node:test';
import assert from 'node:assert/strict';
import {pixelBox,findDonor} from './repair.js';

test('scaled and edge selections cover the exact target rectangle',()=>{
  assert.deepEqual(pixelBox({x:.25,y:.5,w:.1,h:.25},1920,1080),{x:480,y:540,w:192,h:270});
  assert.deepEqual(pixelBox({x:.9,y:.9,w:.1,h:.1},100,100),{x:90,y:90,w:10,h:10});
});
test('donor search avoids all selected watermark regions',()=>{
  const w=120,h=80,pixels=new Uint8ClampedArray(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;pixels[i]=x%8*25;pixels[i+1]=y%8*25;pixels[i+2]=100;pixels[i+3]=255;}
  const box={x:80,y:48,w:16,h:16},other={x:40,y:32,w:16,h:16};
  for(let y=box.y;y<box.y+box.h;y++)for(let x=box.x;x<box.x+box.w;x++)pixels.fill(255,(y*w+x)*4,(y*w+x)*4+4);
  const donor=findDonor(pixels,w,h,box,[box,other]);
  assert.ok(donor.x>=0&&donor.y>=0&&donor.x+donor.w<=w&&donor.y+donor.h<=h);
  for(const b of [box,other])assert.ok(donor.x+donor.w<=b.x||donor.x>=b.x+b.w||donor.y+donor.h<=b.y||donor.y>=b.y+b.h);
  let error=0;for(let y=0;y<16;y++)for(let x=0;x<16;x++){const value=pixels[((donor.y+y)*w+donor.x+x)*4];error+=Math.abs(value-((box.x+x)%8*25));}
  assert.equal(error,0);
});
test('full-frame removal fails clearly instead of filling with a blur',()=>{
  assert.throws(()=>findDonor(new Uint8ClampedArray(40*40*4),40,40,{x:0,y:0,w:40,h:40},[{x:0,y:0,w:40,h:40}]),/nền sạch/);
});
