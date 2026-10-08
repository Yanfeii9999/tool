import {ALL_FORMATS,BlobSource,BufferTarget,CanvasSource,EncodedAudioPacketSource,EncodedPacketSink,Input,Mp4OutputFormat,Output,StreamTarget,VideoSampleSink,canEncodeVideo} from './vendor/mediabunny/mediabunny.mjs';
import {applyGeminiVideo} from './gemini.js';
import {applyPlan,makePlan} from './repair.js';

// Decode and encode in timestamp order; cleanup may take longer than one frame.
// Unlike recording video playback, this loop waits for every frame to finish.
export async function exportVideo(file,{detection=null,regions=[],stacked=true,writable=null,onProgress=()=>{},signal}={}){
  if(typeof VideoEncoder==='undefined'||typeof VideoDecoder==='undefined')throw Error('Xuất từng khung hình cần Chrome/Edge hỗ trợ WebCodecs.');
  signal?.throwIfAborted();
  const input=new Input({source:new BlobSource(file),formats:ALL_FORMATS});
  const channel=new MessageChannel();
  const yieldToUI=()=>new Promise(resolve=>{channel.port1.onmessage=resolve;channel.port2.postMessage(null);});
  let output=null,videoSource=null,audioTask=null;
  try{
    const track=await input.getPrimaryVideoTrack();
    if(!track)throw Error('File không có luồng video.');
    const [width,height,firstTimestamp,stats]=await Promise.all([track.getDisplayWidth(),track.getDisplayHeight(),track.getFirstTimestamp(),track.computePacketStats(90)]);
    const duration=await track.computeDuration(),frameRate=stats.averagePacketRate||30;
    const bitrate=Math.min(24000000,Math.max(6000000,width*height*8));
    if(!await canEncodeVideo('avc',{width,height,bitrate}))throw Error('Máy/trình duyệt không hỗ trợ xuất H.264 ở độ phân giải này.');
    const source=new OffscreenCanvas(width,height),destination=new OffscreenCanvas(width,height),ctx=source.getContext('2d',{willReadFrequently:true});
    const format=new Mp4OutputFormat({fastStart:writable?'fragmented':'in-memory'});
    // Keep the caller's file stream open so it can close on success or abort on failure.
    const target=writable?new StreamTarget(new WritableStream({write:chunk=>writable.write(chunk)}),{chunked:true,chunkSize:1024*1024}):new BufferTarget();
    output=new Output({format,target});
    videoSource=new CanvasSource(destination,{codec:'avc',bitrate,keyFrameInterval:2,latencyMode:'quality',hardwareAcceleration:'no-preference'});
    output.addVideoTrack(videoSource,{frameRate});
    const audio=[];
    for(const audioTrack of await input.getAudioTracks()){
      const codec=await audioTrack.getCodec();
      if(!format.getSupportedAudioCodecs().includes(codec))throw Error(`Âm thanh ${codec} không phù hợp MP4. Chuyển nguồn sang AAC trước khi xuất để giữ âm thanh.`);
      const packetSource=new EncodedAudioPacketSource(codec),decoderConfig=await audioTrack.getDecoderConfig();
      output.addAudioTrack(packetSource);audio.push({track:audioTrack,source:packetSource,decoderConfig,codec});
    }
    signal?.throwIfAborted();await output.start();
    audioTask=Promise.all(audio.map(async entry=>{
      let packets=0;
      for await(const packet of new EncodedPacketSink(entry.track).packets()){
        signal?.throwIfAborted();
        const timestamp=packet.timestamp-firstTimestamp;
        if(timestamp+packet.duration<=0)continue;
        await entry.source.add(packet.clone({timestamp:Math.max(0,timestamp),duration:timestamp<0?packet.duration+timestamp:packet.duration}),{decoderConfig:entry.decoderConfig});packets++;
      }
      entry.source.close();return packets;
    }));
    audioTask.catch(()=>{});
    let processedFrames=0,appliedFrames=0,plan=null,lastTimestamp=-Infinity;
    for await(const sample of new VideoSampleSink(track).samples()){
      signal?.throwIfAborted();
      let timestamp=Math.max(0,sample.timestamp-firstTimestamp);
      const frameDuration=sample.duration>0?sample.duration:1/frameRate;
      if(timestamp<lastTimestamp)throw Error('Thứ tự thời gian video không hợp lệ; đã dừng để tránh xuất sai đồng bộ.');
      try{
        sample.draw(ctx,0,0,width,height);
        if(detection){if(applyGeminiVideo(source,destination,detection,1,regions,true,stacked))appliedFrames++;}
        else{plan??=makePlan(source,regions);applyPlan(source,destination,plan);appliedFrames++;}
      }finally{sample.close();}
      signal?.throwIfAborted();await videoSource.add(timestamp,frameDuration);lastTimestamp=timestamp;processedFrames++;
      onProgress({processedFrames,appliedFrames,progress:Math.min(99,(timestamp+frameDuration)/duration*100),duration});
      // Give the UI a chance to draw progress and deliver a cancellation click.
      await yieldToUI();
    }
    videoSource.close();const audioPackets=await audioTask;
    signal?.throwIfAborted();
    if(!processedFrames||!appliedFrames)throw Error('Không tìm thấy logo phù hợp trong vùng chọn; không xuất kết quả chưa xử lý.');
    await output.finalize();signal?.throwIfAborted();
    return{blob:writable?null:new Blob([target.buffer],{type:'video/mp4'}),processedFrames,appliedFrames,audioCopied:audioPackets.some(n=>n>0),audioTracks:audio.length,width,height,duration,frameRate};
  }catch(error){
    if(output&&output.state!=='finalized'&&output.state!=='canceled')await output.cancel().catch(()=>{});
    throw error;
  }finally{
    channel.port1.close();channel.port2.close();
    input.dispose();await audioTask?.catch(()=>{});
  }
}
