import { pipeline, env } from "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2";
env.allowLocalModels = false;
const $ = id => document.getElementById(id);
const video = $("video");
let videoUrl = null, recognizer = null, segments = [], selectedStyle = "word", animationFrame = 0;

function setStatus(message) { $("progressText").textContent = message; }
function escapeHTML(value) { return value.replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function currentSegment(time) { return segments.find(s => time >= s.start && time <= s.end); }
function getWords(segment, time) {
  const words = segment.text.trim().split(/\s+/);
  const fraction = Math.max(0, Math.min(.999, (time - segment.start) / Math.max(.02, segment.end - segment.start)));
  return { words, active: Math.min(words.length - 1, Math.floor(fraction * words.length)) };
}
function updateCaption() {
  const overlay = $("captionOverlay"), segment = currentSegment(video.currentTime);
  overlay.className = "caption-overlay";
  overlay.classList.add("size-" + $("textSize").value);
  const pos = $("captionPosition").value;
  if (pos === "top") overlay.classList.add("pos-top");
  if (pos === "middle") overlay.classList.add("pos-middle");
  const bg = $("textBackground").value;
  if (bg === "box") overlay.classList.add("box");
  if (bg === "none") overlay.classList.add("no-bg");
  overlay.style.setProperty("--active-color", $("highlightColor").value);
  if (!segment) { overlay.innerHTML = ""; return; }
  const {words, active} = getWords(segment, video.currentTime);
  if (selectedStyle === "plain") overlay.innerHTML = escapeHTML(segment.text);
  else if (selectedStyle === "karaoke") overlay.innerHTML = words.map((w,i)=>`<span class="caption-word ${i<=active?"active":""}">${escapeHTML(w)}</span>`).join(" ");
  else overlay.innerHTML = words.map((w,i)=>`<span class="caption-word ${i===active?"active":""}">${escapeHTML(w)}</span>`).join(" ");
}
video.addEventListener("timeupdate", updateCaption);
video.addEventListener("seeked", updateCaption);
$("videoFile").addEventListener("change", e => loadVideo(e.target.files?.[0]));
async function loadVideo(file) {
  if (!file) return;
  if (!file.type.startsWith("video/")) { alert("Please choose a video file."); return; }
  if (videoUrl) URL.revokeObjectURL(videoUrl);
  videoUrl = URL.createObjectURL(file);
  video.src = videoUrl;
  $("emptyState").hidden = true;
  $("fileName").textContent = file.name;
  $("videoDuration").textContent = "Loading…";
  video.onloadedmetadata = () => {
    $("videoDuration").textContent = formatClock(video.duration);
    $("generateBtn").disabled = false;
    $("exportBtn").disabled = false;
  };
  $("transcript").value = "";
  segments = [];
  renderSegments();
}
function formatClock(seconds) {
  if (!Number.isFinite(seconds)) return "—";
  const m = Math.floor(seconds/60), s = Math.floor(seconds%60);
  return `${m}:${String(s).padStart(2,"0")}`;
}
const dropzone = $("dropzone");
dropzone.addEventListener("dragover", e => { e.preventDefault(); dropzone.classList.add("drag"); });
dropzone.addEventListener("dragleave", () => dropzone.classList.remove("drag"));
dropzone.addEventListener("drop", e => {
  e.preventDefault(); dropzone.classList.remove("drag");
  const file = [...e.dataTransfer.files].find(f => f.type.startsWith("video/"));
  if (file) { $("videoFile").files = e.dataTransfer.files; loadVideo(file); }
});
$("aspect").addEventListener("change", () => {
  const portrait = $("aspect").value === "portrait";
  $("videoStage").classList.toggle("portrait", portrait);
  $("videoStage").style.aspectRatio = portrait ? "9 / 16" : "16 / 9";
});
$("styleOptions").addEventListener("click", e => {
  const btn = e.target.closest("[data-style]");
  if (!btn) return;
  selectedStyle = btn.dataset.style;
  document.querySelectorAll(".style-option").forEach(b => b.classList.toggle("selected", b === btn));
  updateCaption();
});
["highlightColor","textSize","captionPosition","textBackground"].forEach(id => $(id).addEventListener("change", updateCaption));

$("generateBtn").addEventListener("click", async () => {
  const file = $("videoFile").files[0];
  if (!file) return;
  $("generateBtn").disabled = true;
  $("progressWrap").hidden = false;
  $("progressBar").style.width = "8%";
  setStatus("Loading multilingual Whisper model…");
  try {
    if (!recognizer) {
      recognizer = await pipeline("automatic-speech-recognition", "Xenova/whisper-tiny", {
        progress_callback: p => {
          if (p.status) setStatus("Model: " + p.status + (p.progress ? ` ${Math.round(p.progress)}%` : ""));
        }
      });
    }
    $("progressBar").style.width = "25%";
    setStatus("Reading audio from your video…");
    const audioContext = new AudioContext();
    const decoded = await audioContext.decodeAudioData(await file.arrayBuffer());
    const mono = mixDown(decoded);
    const audio16k = resampleLinear(mono, decoded.sampleRate, 16000);
    $("progressBar").style.width = "45%";
    setStatus("Transcribing. Longer videos can take several minutes…");
    const language = $("language").value;
    const options = { chunk_length_s: 30, stride_length_s: 5, return_timestamps: true, task: "transcribe" };
    if (language !== "auto") options.language = language === "te" ? "telugu" : "english";
    const result = await recognizer(audio16k, options);
    segments = (result.chunks || []).map(chunk => ({
      start: Number(chunk.timestamp?.[0] ?? 0),
      end: Number(chunk.timestamp?.[1] ?? 0),
      text: (chunk.text || "").trim()
    })).filter(s => s.text && s.end > s.start);
    if (!segments.length && result.text) {
      segments = [{start:0,end:Number.isFinite(video.duration)?video.duration:5,text:result.text.trim()}];
    }
    $("transcript").value = segments.map(s => `${s.start.toFixed(2)}|${s.end.toFixed(2)}|${s.text}`).join("\n");
    renderSegments();
    $("progressBar").style.width = "100%";
    setStatus(`Done — ${segments.length} caption segments. Review the transcript before exporting.`);
    await audioContext.close();
  } catch (error) {
    console.error(error);
    setStatus("Transcription failed: " + error.message + ". Check your internet connection for the first model download, then try a shorter video.");
  } finally {
    $("generateBtn").disabled = false;
  }
});
function mixDown(audioBuffer) {
  const length = audioBuffer.length, output = new Float32Array(length);
  for (let c=0;c<audioBuffer.numberOfChannels;c++) {
    const data = audioBuffer.getChannelData(c);
    for (let i=0;i<length;i++) output[i] += data[i] / audioBuffer.numberOfChannels;
  }
  return output;
}
function resampleLinear(input, sourceRate, targetRate) {
  if (sourceRate === targetRate) return input;
  const length = Math.floor(input.length * targetRate / sourceRate), output = new Float32Array(length);
  const ratio = sourceRate / targetRate;
  for (let i=0;i<length;i++) {
    const pos=i*ratio, left=Math.floor(pos), right=Math.min(left+1,input.length-1), frac=pos-left;
    output[i]=input[left]*(1-frac)+input[right]*frac;
  }
  return output;
}
function parseTranscript() {
  const parsed=[];
  for (const line of $("transcript").value.split(/\r?\n/)) {
    const parts=line.split("|");
    if(parts.length<3) continue;
    const start=Number(parts[0]), end=Number(parts[1]), text=parts.slice(2).join("|").trim();
    if(Number.isFinite(start)&&Number.isFinite(end)&&end>start&&text) parsed.push({start,end,text});
  }
  return parsed.sort((a,b)=>a.start-b.start);
}
$("applyBtn").addEventListener("click", () => {
  segments=parseTranscript(); renderSegments(); updateCaption();
  setStatus(`Applied ${segments.length} edited segments.`);
});
function renderSegments() {
  $("segmentCount").textContent=String(segments.length);
  $("segmentsList").innerHTML=segments.length
    ? segments.map(s=>`<div class="segment-row"><span class="segment-time">${s.start.toFixed(2)}–${s.end.toFixed(2)}s</span><span class="segment-text">${escapeHTML(s.text)}</span></div>`).join("")
    : '<div class="empty-list">Your caption segments will be listed here.</div>';
}
function timecode(sec, comma=true) {
  const ms=Math.max(0,Math.round(sec*1000)), h=Math.floor(ms/3600000),m=Math.floor(ms%3600000/60000),s=Math.floor(ms%60000/1000),r=ms%1000;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}${comma?",":"."}${String(r).padStart(3,"0")}`;
}
function downloadFile(name, content, type) {
  const url=URL.createObjectURL(new Blob([content],{type}));
  const a=document.createElement("a");a.href=url;a.download=name;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),2500);
}
$("srtBtn").addEventListener("click",()=>{
  const data=parseTranscript();
  downloadFile("vnv-captions.srt",data.map((s,i)=>`${i+1}\n${timecode(s.start)} --> ${timecode(s.end)}\n${s.text}`).join("\n\n"),"text/plain;charset=utf-8");
});
$("vttBtn").addEventListener("click",()=>{
  const data=parseTranscript();
  downloadFile("vnv-captions.vtt","WEBVTT\n\n"+data.map(s=>`${timecode(s.start,false)} --> ${timecode(s.end,false)}\n${s.text}`).join("\n\n"),"text/vtt;charset=utf-8");
});
$("exportBtn").addEventListener("click", exportCaptionedVideo);
async function exportCaptionedVideo() {
  segments=parseTranscript();renderSegments();
  if(!video.src || !segments.length) { alert("Upload a video and generate captions first."); return; }
  if(!video.videoWidth || !video.videoHeight) { alert("Wait for the video to finish loading."); return; }
  if(!video.captureStream || !HTMLCanvasElement.prototype.captureStream || !window.MediaRecorder) {
    alert("Video recording export is not supported in this browser. Please use the latest desktop Chrome browser."); return;
  }
  const portrait=$("aspect").value==="portrait", width=portrait?720:1280, height=portrait?1280:720;
  const canvas=document.createElement("canvas");canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext("2d");
  const output=canvas.captureStream(30);
  let source;
  try {
    source=video.captureStream();
    source.getAudioTracks().forEach(track=>output.addTrack(track));
  } catch(e) { alert("Could not capture the video's audio in this browser."); return; }
  const mime=["video/webm;codecs=vp9,opus","video/webm;codecs=vp8,opus","video/webm"].find(t=>MediaRecorder.isTypeSupported(t));
  if(!mime) { alert("This browser does not support WebM export."); return; }
  const recorder=new MediaRecorder(output,{mimeType:mime}), chunks=[];
  recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
  recorder.onerror=e=>{console.error(e);setStatus("Export encountered an error.");};
  recorder.onstop=()=>{
    const blob=new Blob(chunks,{type:mime});
    downloadFile("VNV-Auto-Captions.webm",blob,mime);
    $("progressBar").style.width="100%";setStatus("Export complete — your WebM video has downloaded.");
    output.getTracks().forEach(t=>t.stop());source.getTracks().forEach(t=>t.stop());
    $("exportBtn").disabled=false;
  };
  $("exportBtn").disabled=true;$("progressWrap").hidden=false;
  $("progressBar").style.width="0%";setStatus("Recording video in real time… keep this tab open.");
  video.pause();video.currentTime=0;
  const draw=()=>{
    ctx.fillStyle="#000";ctx.fillRect(0,0,width,height);
    const scale=Math.min(width/video.videoWidth,height/video.videoHeight);
    const dw=video.videoWidth*scale,dh=video.videoHeight*scale;
    ctx.drawImage(video,(width-dw)/2,(height-dh)/2,dw,dh);
    drawExportCaption(ctx,width,height,video.currentTime);
    const pct=video.duration?Math.min(100,video.currentTime/video.duration*100):0;
    $("progressBar").style.width=pct+"%";
    if(!video.paused&&!video.ended) animationFrame=requestAnimationFrame(draw);
  };
  video.onended=()=>{cancelAnimationFrame(animationFrame);recorder.stop();};
  recorder.start(500);
  try { await video.play(); draw(); }
  catch(e) { recorder.stop();$("exportBtn").disabled=false;setStatus("Playback could not start. Press play and try export again."); }
}
function drawExportCaption(ctx,w,h,time) {
  const s=currentSegment(time);if(!s)return;
  const words=s.text.trim().split(/\s+/), {active}=getWords(s,time);
  const style=$("textBackground").value, position=$("captionPosition").value;
  const fontSize=($("textSize").value==="small"?26:$("textSize").value==="large"?48:36)*(w/1280);
  ctx.font=`800 ${fontSize}px Arial, sans-serif`;ctx.textAlign="center";ctx.textBaseline="middle";
  const gap=fontSize*.35,widths=words.map(word=>ctx.measureText(word).width);
  const total=widths.reduce((a,b)=>a+b,0)+gap*(words.length-1);
  const maxWidth=w*.9;
  if(total>maxWidth) ctx.font=`800 ${fontSize*.75}px Arial, sans-serif`;
  const adjusted=words.map(word=>ctx.measureText(word).width);
  const actual=adjusted.reduce((a,b)=>a+b,0)+gap*(words.length-1);
  let x=(w-actual)/2;
  const y=position==="top"?h*.13:position==="middle"?h*.5:h*.86;
  if(style==="box"){ctx.fillStyle="rgba(0,0,0,.72)";ctx.fillRect(Math.max(10,(w-actual)/2-14),y-fontSize*.8,Math.min(actual+28,w-20),fontSize*1.6);}
  words.forEach((word,i)=>{
    const center=x+adjusted[i]/2;
    if(style==="outline"){ctx.lineWidth=Math.max(3,fontSize*.12);ctx.strokeStyle="#000";ctx.strokeText(word,center,y);}
    ctx.fillStyle=(selectedStyle!=="plain"&&i===active)?$("highlightColor").value:"#fff";
    ctx.fillText(word,center,y);x+=adjusted[i]+gap;
  });
}
$("helpBtn").addEventListener("click",()=>$("helpDialog").showModal());
$("closeHelp").addEventListener("click",()=>$("helpDialog").close());
