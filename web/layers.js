// Fit the *visible* alpha imprint against a smooth local background. Extra
// layers are accepted only with strong evidence; texture cannot be recovered
// exactly when the original pixels or the watermark template are unavailable.
function solve(matrix, values) {
  const n=values.length,rows=matrix.map((row,i)=>[...row,values[i]]);
  for(let c=0;c<n;c++){
    let pivot=c;for(let r=c+1;r<n;r++)if(Math.abs(rows[r][c])>Math.abs(rows[pivot][c]))pivot=r;
    if(Math.abs(rows[pivot][c])<1e-8)return null;
    [rows[c],rows[pivot]]=[rows[pivot],rows[c]];
    const divisor=rows[c][c];for(let k=c;k<=n;k++)rows[c][k]/=divisor;
    for(let r=0;r<n;r++)if(r!==c){const gain=rows[r][c];for(let k=c;k<=n;k++)rows[r][k]-=gain*rows[c][k];}
  }
  return rows.map(row=>row[n]);
}
function fit(samples,extra=null){
  const n=extra?8:7,matrix=Array.from({length:n},()=>Array(n).fill(0)),values=Array(n).fill(0);
  for(const s of samples){const row=extra?[...s.row,extra[s.index]]:s.row;
    for(let i=0;i<n;i++){values[i]+=row[i]*s.value;for(let j=0;j<n;j++)matrix[i][j]+=row[i]*row[j];}
  }
  const coefficients=solve(matrix,values);if(!coefficients)return null;
  let error=0;for(const s of samples){const row=extra?[...s.row,extra[s.index]]:s.row;const residual=s.value-row.reduce((sum,v,i)=>sum+v*coefficients[i],0);error+=residual*residual;}
  return {coefficients,error:error/samples.length};
}
function scaledTemplate(alpha,w,h,scale,dx=0,dy=0){
  const result=new Float32Array(alpha.length),cx=(w-1)/2,cy=(h-1)/2;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const sx=(x-cx-dx)/scale+cx,sy=(y-cy-dy)/scale+cy;
    if(sx<0||sy<0||sx>w-1||sy>h-1)continue;
    const x0=Math.floor(sx),y0=Math.floor(sy),x1=Math.min(w-1,x0+1),y1=Math.min(h-1,y0+1),fx=sx-x0,fy=sy-y0;
    result[y*w+x]=(alpha[y0*w+x0]*(1-fx)+alpha[y0*w+x1]*fx)*(1-fy)+(alpha[y1*w+x0]*(1-fx)+alpha[y1*w+x1]*fx)*fy;
  }return result;
}
export function fitStackedAlpha(image,alphaMap,gain=1){
  if(alphaMap?.length!==image.width*image.height||image.data?.length!==alphaMap.length*4)throw new RangeError('Mẫu alpha không khớp ảnh.');
  const base=Float32Array.from(alphaMap,a=>Math.max(0,Math.min(.95,a*gain)));
  const fallback={alphaMap,layers:1,gain};
  if(alphaMap.some(a=>a<0)||image.width<16||image.height<16)return fallback;
  const samples=[],step=Math.max(1,Math.ceil(Math.sqrt(alphaMap.length/1600)));
  for(let y=0;y<image.height;y+=step)for(let x=0;x<image.width;x+=step){
    const index=y*image.width+x,i=index*4,luma=.2126*image.data[i]+.7152*image.data[i+1]+.0722*image.data[i+2];
    if(luma>247||luma<8)continue;
    const nx=x/(image.width-1)*2-1,ny=y/(image.height-1)*2-1;
    samples.push({index,value:Math.log(255-luma),row:[1,nx,ny,nx*nx,ny*ny,nx*ny,Math.log1p(-base[index])]});
  }
  if(samples.length<100)return fallback;
  const single=fit(samples);if(!single)return fallback;
  const repeat=single.coefficients[6];
  // A single smooth-template fit must explain the background extremely well.
  if(repeat>=1.6&&repeat<=3.15&&single.error<.0016){
    return{alphaMap:Float32Array.from(base,a=>1-(1-a)**Math.min(3,repeat)),gain:1,layers:Math.min(3,repeat)};
  }
  let best=null;
  for(const scale of [2/3,.8,1])for(const [dx,dy] of [[0,0],[-2,0],[2,0],[0,-2],[0,2]]){
    if(scale===1&&dx===0&&dy===0)continue;
    const extra=scaledTemplate(base,image.width,image.height,scale,dx,dy);
    const model=fit(samples,Float32Array.from(extra,a=>Math.log1p(-a)));if(!model)continue;
    const a=model.coefficients[6],b=model.coefficients[7];
    if(a<.65||a>1.4||b<.65||b>1.4||model.error>.0016||model.error>single.error*.35)continue;
    if(!best||model.error<best.error)best={...model,extra,a,b};
  }
  if(!best)return fallback;
  return{alphaMap:Float32Array.from(base,(a,i)=>1-(1-a)**best.a*(1-best.extra[i])**best.b),gain:1,layers:best.a+best.b};
}
