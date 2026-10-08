import {getEmbeddedAlphaMap} from './vendor/gemini/src/core/embeddedAlphaMaps.js';
import {getVideoAlphaMap} from './vendor/gemini/src/video/videoWatermarkDetector.js';
import {resolveVideoWatermarkCandidates} from './vendor/gemini/src/video/videoWatermarkCatalog.js';
export async function demoFiles(){
  const canvas=document.createElement('canvas');canvas.width=480;canvas.height=270;
  const ctx=canvas.getContext('2d');
  const videoCandidate=resolveVideoWatermarkCandidates(480,270)[0];
  const videoAlpha=getVideoAlphaMap(videoCandidate.size,{candidate:videoCandidate});
  function draw(time=0,video=false){
    ctx.fillStyle='#152c46';ctx.fillRect(0,0,480,270);
    for(let y=0;y<270;y+=12){ctx.fillStyle=y%24?'#247b86':'#205367';ctx.fillRect(0,y,480,7);}
    ctx.fillStyle='#f4ba68';ctx.beginPath();ctx.arc(100+time*40,95,24,0,Math.PI*2);ctx.fill();
    const size=video?videoCandidate.size:48,x=video?videoCandidate.x:400,y=video?videoCandidate.y:190;
    const alpha=video?videoAlpha:getEmbeddedAlphaMap(48),roi=ctx.getImageData(x,y,size,size);
    for(let i=0;i<alpha.length;i++)for(let c=0;c<3;c++)roi.data[i*4+c]=Math.round(alpha[i]*255+(1-alpha[i])*roi.data[i*4+c]);
    ctx.putImageData(roi,x,y);
  }
  draw();
  const png=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
  const files=[new File([png],'demo-anh.png',{type:'image/png'})];
  if(!window.MediaRecorder || !canvas.captureStream)return files;
  const mime=['video/webm;codecs=vp8,opus','video/webm'].find(t=>MediaRecorder.isTypeSupported(t));
  if(!mime)return files;
  const stream=canvas.captureStream(24),audio=new AudioContext(),destination=audio.createMediaStreamDestination(),oscillator=audio.createOscillator(),gain=audio.createGain();
  gain.gain.value=.03;oscillator.connect(gain);gain.connect(destination);oscillator.start();await audio.resume();
  stream.addTrack(destination.stream.getAudioTracks()[0]);
  const recorder=new MediaRecorder(stream,{mimeType:mime}),chunks=[];
  recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
  const stopped=new Promise(resolve=>recorder.onstop=resolve);recorder.start();
  const start=performance.now();
  await new Promise(resolve=>{function step(now){draw((now-start)/1000,true);if(now-start<2500)requestAnimationFrame(step);else resolve();}requestAnimationFrame(step);});
  recorder.stop();await stopped;oscillator.stop();for(const track of stream.getTracks())track.stop();await audio.close();
  files.push(new File(chunks,'demo-video.webm',{type:mime}));return files;
}
