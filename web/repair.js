export function pixelBox(region, width, height) {
  const x = Math.max(0, Math.floor(region.x * width));
  const y = Math.max(0, Math.floor(region.y * height));
  const right = Math.min(width, Math.ceil((region.x + region.w) * width));
  const bottom = Math.min(height, Math.ceil((region.y + region.h) * height));
  return {x, y, w: right - x, h: bottom - y};
}

function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// Match the clean border at reduced resolution. Never read the obscured interior.
export function findDonor(pixels, width, height, box, occupied) {
  const {x, y, w, h} = box;
  const margin = Math.max(2, Math.min(8, Math.floor(Math.min(w, h) / 4)));
  const border = [];
  for (let py = Math.max(0, y-margin); py < Math.min(height,y+h+margin); py += 2) {
    for (let px = Math.max(0,x-margin); px < Math.min(width,x+w+margin); px += 2) {
      if (occupied.some(b => px >= b.x && px < b.x+b.w && py >= b.y && py < b.y+b.h)) continue;
      border.push([px, py]);
    }
  }
  if (!border.length) throw Error('Cần chừa nền sạch xung quanh vùng chọn. Hãy khoanh nhỏ hơn.');
  const reach = Math.max(w,h)*3;
  const step = Math.max(2, Math.floor(Math.min(w,h)/4));
  let best = null, bestScore = Infinity;
  function scoreAt(dx,dy) {
    const candidate = {x:x+dx, y:y+dy, w,h};
    if (candidate.x<0 || candidate.y<0 || candidate.x+w>width || candidate.y+h>height || occupied.some(b=>overlaps(candidate,b))) return;
    let total=0, count=0;
    for (let k=0;k<border.length;k+=Math.max(1,Math.floor(border.length/250))) {
      const [px,py]=border[k], qx=px+dx, qy=py+dy;
      if(qx<0 || qy<0 || qx>=width || qy>=height) return;
      const a=(py*width+px)*4,b=(qy*width+qx)*4;
      total+=Math.abs(pixels[a]-pixels[b])+Math.abs(pixels[a+1]-pixels[b+1])+Math.abs(pixels[a+2]-pixels[b+2]);count++;
    }
    const score=total/(count*3)+.5*Math.hypot(dx,dy)/Math.max(1,reach);
    if(score<bestScore){bestScore=score;best=candidate;}
  }
  for(let dy=-reach;dy<=reach;dy+=step) for(let dx=-reach;dx<=reach;dx+=step) scoreAt(Math.round(dx),Math.round(dy));
  if(!best) throw Error('Không tìm được nền sạch đủ lớn. Hãy chọn nền thủ công hoặc thu nhỏ vùng xoá.');
  const bx=best.x-x,by=best.y-y;
  for(let dy=by-step;dy<=by+step;dy++) for(let dx=bx-step;dx<=bx+step;dx++) scoreAt(dx,dy);
  return best;
}

export function makePlan(source, regions) {
  const scale=Math.min(1,640/source.width);
  const small=document.createElement('canvas');
  small.width=Math.max(1,Math.round(source.width*scale));small.height=Math.max(1,Math.round(source.height*scale));
  const ctx=small.getContext('2d',{willReadFrequently:true});ctx.drawImage(source,0,0,small.width,small.height);
  const pixels=ctx.getImageData(0,0,small.width,small.height).data;
  const occupied=regions.map(r=>pixelBox(r,small.width,small.height));
  return regions.map((r,i)=>{
    const target=pixelBox(r,source.width,source.height);
    if(target.w<2 || target.h<2) throw Error('Vùng chọn quá nhỏ.');
    let donor;
    if(r.donor){
      donor={x:Math.round(r.donor.x*source.width),y:Math.round(r.donor.y*source.height),w:target.w,h:target.h};
    }else{
      const candidate=findDonor(pixels,small.width,small.height,occupied[i],occupied);
      donor={x:Math.round(candidate.x/small.width*source.width),y:Math.round(candidate.y/small.height*source.height),w:target.w,h:target.h};
    }
    donor.x=Math.min(source.width-target.w,Math.max(0,donor.x));donor.y=Math.min(source.height-target.h,Math.max(0,donor.y));
    if(regions.map(v=>pixelBox(v,source.width,source.height)).some(b=>overlaps(donor,b))) throw Error('Vùng nền thay thế chồng lên watermark. Hãy chọn vùng nền khác.');
    return {target,donor};
  });
}

export function applyPlan(source, destination, plan) {
  if(destination.width!==source.width) destination.width=source.width;
  if(destination.height!==source.height) destination.height=source.height;
  const ctx=destination.getContext('2d');ctx.drawImage(source,0,0);
  for(const {target:t,donor:d} of plan){
    ctx.drawImage(source,d.x,d.y,t.w,t.h,t.x,t.y,t.w,t.h);
  }
}
