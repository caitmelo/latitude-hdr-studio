import {exposureBlend} from './render.mjs?v=9';
/** Linear RGB HDR core. All exposure values express log2 of sensor exposure. */
export const luma=(r,g,b)=>.2126*r+.7152*g+.0722*b;
export const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
export function exposure(meta){const {shutter,aperture,iso_speed}=meta;return shutter>0&&aperture>0&&iso_speed>0?Math.log2(shutter*iso_speed/(aperture*aperture)):null;}
export function groupFrames(frames,{count=0,gap=12}={}){
 const sorted=[...frames].sort((a,b)=>(a.meta.timestamp||0)-(b.meta.timestamp||0)||a.name.localeCompare(b.name,undefined,{numeric:true}));
 const groups=[];let current=[];
 for(const f of sorted){const last=current.at(-1);const compatible=last&&['camera_make','camera_model','width','height'].every(k=>last.meta[k]===f.meta[k]);const repeated=current.some(a=>a.ev!==null&&f.ev!==null&&Math.abs(a.ev-f.ev)<.12);const dt=last?(f.meta.timestamp-last.meta.timestamp):0;
 const split=last&&(!compatible||(count?current.length>=count:dt>gap||repeated||!f.meta.timestamp||!last.meta.timestamp));
 if(split){groups.push(current);current=[];}current.push(f);
 }if(current.length)groups.push(current);return groups;
}
function pyramid(img){let {width:w,height:h,data}=img;let g=new Float32Array(w*h);for(let i=0;i<g.length;i++)g[i]=luma(data[i*3],data[i*3+1],data[i*3+2]);const levels=[{w,h,g}];while(Math.min(w,h)>48){const nw=Math.floor(w/2),nh=Math.floor(h/2),next=new Float32Array(nw*nh);for(let y=0;y<nh;y++)for(let x=0;x<nw;x++){const k=y*2*w+x*2;next[y*nw+x]=(g[k]+g[k+1]+g[k+w]+g[k+w+1])/4;}w=nw;h=nh;g=next;levels.push({w,h,g});}return levels;}
function threshold(level){const sample=[];const step=Math.max(1,Math.floor(level.g.length/12000));for(let i=0;i<level.g.length;i+=step)sample.push(level.g[i]);sample.sort((a,b)=>a-b);return sample[Math.floor(sample.length/2)];}
/** Ward-style median threshold alignment; translation only, with quality checks. */
export function align(reference,image){
 if(reference.width!==image.width||reference.height!==image.height)throw Error('Bracket dimensions do not match.');
 const a=pyramid(reference),b=pyramid(image);let dx=0,dy=0,bestError=1,valid=0;
 for(let level=a.length-1;level>=0;level--){if(level<a.length-1){dx*=2;dy*=2;}const A=a[level],B=b[level],ta=threshold(A),tb=threshold(B);let best={x:dx,y:dy,error:Infinity,n:0};
 const stride=Math.max(1,Math.floor(Math.sqrt(A.w*A.h/65000)));
 for(let oy=-2;oy<=2;oy++)for(let ox=-2;ox<=2;ox++){const sx=dx+ox,sy=dy+oy;let err=0,n=0;for(let y=Math.max(0,-sy);y<Math.min(A.h,A.h-sy);y+=stride)for(let x=Math.max(0,-sx);x<Math.min(A.w,A.w-sx);x+=stride){const va=A.g[y*A.w+x],vb=B.g[(y+sy)*B.w+x+sx];if(Math.abs(va-ta)<Math.max(.004,ta*.08)||Math.abs(vb-tb)<Math.max(.004,tb*.08))continue;err+=(va>ta)!==(vb>tb)?1:0;n++;}const score=n>50?err/n+1e-7*(sx*sx+sy*sy):Infinity;if(score<best.error){best={x:sx,y:sy,error:score,n};}}
 if(Number.isFinite(best.error)){dx=best.x;dy=best.y;bestError=best.error;valid=best.n;}
 }
 if(valid<50||bestError>.22||Math.abs(dx)>reference.width*.12||Math.abs(dy)>reference.height*.12)throw Error('Alignment is unreliable. Use a matching static scene, or disable alignment for tripod brackets.');
 return {dx,dy,error:bestError};
}
/** Refine nominal EXIF exposure using reliable, aligned midtone samples. */
export function estimateExposure(ref,img,expected,shift={dx:0,dy:0}){const ratios=[],{width:w,height:h}=ref;const step=Math.max(1,Math.floor(Math.sqrt(w*h/30000)));for(let y=Math.max(0,-shift.dy);y<Math.min(h,h-shift.dy);y+=step)for(let x=Math.max(0,-shift.dx);x<Math.min(w,w-shift.dx);x+=step){const p=y*w+x,q=(y+shift.dy)*w+x+shift.dx,i=p*3,j=q*3;if(ref.clip?.[p]||img.clip?.[q])continue;const a=luma(...ref.data.subarray(i,i+3)),b=luma(...img.data.subarray(j,j+3));if(a<.015||b<.015||Math.max(...ref.data.subarray(i,i+3))>.8||Math.max(...img.data.subarray(j,j+3))>.8)continue;ratios.push(Math.log2(b/a));}if(ratios.length<256)return expected;ratios.sort((a,b)=>a-b);const measured=ratios[Math.floor(ratios.length/2)];return Math.abs(measured-expected)<.8?measured:expected;}
export function cameraToRGB(img,matrix,wb){if(!matrix||matrix.length<3||!matrix.slice(0,3).every(row=>row?.slice(0,3).length===3&&row.slice(0,3).every(Number.isFinite)&&row.slice(0,3).some(v=>Math.abs(v)>.001)))throw Error('Camera colour matrix unavailable.');const green=wb[1]||1,gains=wb.slice(0,3).map(v=>v/green);for(let i=0;i<img.data.length;i+=3){const a=img.data[i]*gains[0],b=img.data[i+1]*gains[1],c=img.data[i+2]*gains[2];for(let j=0;j<3;j++)img.data[i+j]=matrix[j][0]*a+matrix[j][1]*b+matrix[j][2]*c;const risk=img.highlightRisk?.[i/3]||0;if(risk>0){const neutral=Math.max(img.data[i],img.data[i+1],img.data[i+2],0);for(let c=0;c<3;c++)img.data[i+c]=img.data[i+c]*(1-risk)+neutral*risk;}}return img;}
export function createAccumulator(ref,referenceEV){const n=ref.width*ref.height;return {ref,referenceEV,sum:new Float32Array(n*3),weight:new Float32Array(n),fallback:new Float32Array(n*3),best:new Float32Array(n).fill(-1),motion:new Uint8Array(n),reliable:new Uint8Array(n),minPeak:new Float32Array(n).fill(Infinity),autoSettings:[],bounds:{x0:0,y0:0,x1:ref.width,y1:ref.height},clipped:0};}
/** Robust residual calibration per frame. Cap tolerance so widespread motion is not learned away. */
export function motionTolerance(ref,img,ratio,dx=0,dy=0){
 const errors=[],w=ref.width,h=ref.height,step=Math.max(1,Math.floor(Math.sqrt(w*h/16000)));
 for(let y=Math.max(0,-dy);y<Math.min(h,h-dy);y+=step)for(let x=Math.max(0,-dx);x<Math.min(w,w-dx);x+=step){const p=y*w+x,q=(y+dy)*w+x+dx,i=p*3,j=q*3;
 if(ref.clip?.[p]||img.clip?.[q])continue;const a=luma(ref.data[i],ref.data[i+1],ref.data[i+2]),b=luma(img.data[j],img.data[j+1],img.data[j+2]);
 if(a>.025&&b>.025&&Math.max(...ref.data.subarray(i,i+3))<.85&&Math.max(...img.data.subarray(j,j+3))<.85)errors.push(Math.abs(Math.log2(b/(ratio*a))));}
 errors.sort((a,b)=>a-b);const median=errors[Math.floor(errors.length*.5)]||0;const deviations=errors.map(x=>Math.abs(x-median)).sort((a,b)=>a-b);const mad=deviations[Math.floor(deviations.length*.5)]||0;
 return {tolerance:clamp(median+3*1.4826*mad,.25,.85),samples:errors.length,medianResidual:median};
}
export function addFrame(acc,img,ev,{dx=0,dy=0,deghost=0,isReference=false}={}){
 if(!Number.isFinite(ev)||Math.abs(ev-acc.referenceEV)>30)throw Error('Enter valid exposure values within 30 stops.');
 const {width:w,height:h}=acc.ref;if(img.width!==w||img.height!==h)throw Error('Bracket dimensions do not match.');
 const ratio=2**(ev-acc.referenceEV),a=acc.ref.data,b=img.data;
 const automatic=deghost===4?motionTolerance(acc.ref,img,ratio,dx,dy):null;if(automatic&&!isReference)acc.autoSettings.push(automatic);
 const x0=Math.max(0,-dx),y0=Math.max(0,-dy),x1=Math.min(w,w-dx),y1=Math.min(h,h-dy);acc.bounds.x0=Math.max(acc.bounds.x0,x0);acc.bounds.y0=Math.max(acc.bounds.y0,y0);acc.bounds.x1=Math.min(acc.bounds.x1,x1);acc.bounds.y1=Math.min(acc.bounds.y1,y1);
 for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const p=y*w+x,i=p*3,j=((y+dy)*w+x+dx)*3;const clipped=img.clip?.[(y+dy)*w+x+dx]||0;const refClipped=acc.ref.clip?.[p]||0;const r=b[j],g=b[j+1],bl=b[j+2],v=Math.max(r,g,bl),lo=Math.min(r,g,bl),rv=Math.max(a[i],a[i+1],a[i+2]);const lum=luma(r,g,bl),rl=luma(a[i],a[i+1],a[i+2]);
 acc.minPeak[p]=Math.min(acc.minPeak[p],v);
 // Shared RGB weights avoid per-channel hue shifts; reject saturated samples.
 let weight=clipped||v>=.95?0:Math.max(0,Math.min(lum/.15,(.95-v)/.25,1));if(lo<0||!Number.isFinite(lum))weight=0;
 if(!clipped&&v<.95)acc.reliable[p]=1;
 const score=!clipped&&v<.95?lum:1e-6/(ratio+1);if(score>acc.best[p]){acc.best[p]=score;for(let c=0;c<3;c++)acc.fallback[i+c]=b[j+c]/ratio;}
 // Reference-frame motion gating is restricted to mutually reliable pixels.
 if(deghost>0&&!isReference&&!clipped&&!refClipped&&rv<.90&&rv>.025&&v<.97&&v>.025){const delta=Math.abs(Math.log2((lum/ratio+.003)/(rl+.003)));let tolerance=automatic?.tolerance??(deghost===1?.7:deghost===2?.4:.22);
 if(automatic){const noise=.006/Math.max(.015,Math.min(lum,rl));let gradient=0;
 for(const offset of [-1,1,-w,w]){const n=p+offset;if(n>=0&&n<w*h&&Math.abs(n%w-x)<=1){const k=n*3;gradient=Math.max(gradient,Math.abs(Math.log2((luma(a[k],a[k+1],a[k+2])+.003)/(rl+.003))));}}
 tolerance+=Math.min(.35,noise)+Math.min(.35,gradient*.25);}
if(delta>tolerance){acc.motion[p]=1;weight=0;}}
 acc.weight[p]+=weight;for(let c=0;c<3;c++)acc.sum[i+c]+=b[j+c]/ratio*weight;
 }
}
export function finish(acc,{crop=true,deghost=0}={}){const {width:w,height:h,data:ref}=acc.ref;const box=crop?acc.bounds:{x0:0,y0:0,x1:w,y1:h};const width=box.x1-box.x0,height=box.y1-box.y0;if(width<1||height<1)throw Error('Frames have no common image area.');const data=new Float32Array(width*height*3),unrecoveredMask=new Uint8Array(width*height),highlightRisk=new Float32Array(width*height);let motion=0,unrecovered=0;const radius=Math.min(w,h)<8?0:Math.max(1,Math.round(Math.min(w,h)/600));const softMask=deghost?boxBlur(acc.motion,w,h,radius):null;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const p=(y+box.y0)*w+x+box.x0,i=p*3,j=(y*width+x)*3;const confidence=softMask?clamp((softMask[p]-.15)/.65):0;const useRef=deghost&&!acc.ref.clip?.[p]&&Math.max(ref[i],ref[i+1],ref[i+2])<.90?confidence*confidence*(3-2*confidence):0;const risk=clamp((acc.minPeak[p]-.88)/.11);highlightRisk[y*width+x]=risk*risk*(3-2*risk);if(useRef>.5)motion++;if(!acc.reliable[p]){unrecovered++;unrecoveredMask[y*width+x]=1;}for(let c=0;c<3;c++)data[j+c]=Math.max(0,ref[i+c]*useRef+(1-useRef)*(acc.weight[p]>0?acc.sum[i+c]/acc.weight[p]:acc.fallback[i+c]));}
 return {width,height,data,highlightRisk,unrecovered:unrecoveredMask,motionPercent:100*motion/(width*height),unrecoveredPercent:100*unrecovered/(width*height),crop:box,autoSettings:acc.autoSettings};
}
// Area averaging is performed in linear light, before the display curve.
export function resizeLinear(img,maxWidth){
 const scale=Math.min(1,maxWidth/img.width);if(scale>=1)return img;
 const width=Math.max(1,Math.round(img.width*scale)),height=Math.max(1,Math.round(img.height*scale)),data=new Float32Array(width*height*3),sx=img.width/width,sy=img.height/height;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const ax=x*sx,bx=(x+1)*sx,ay=y*sy,by=(y+1)*sy,j=(y*width+x)*3;let total=0;
  for(let yy=Math.floor(ay);yy<Math.ceil(by);yy++)for(let xx=Math.floor(ax);xx<Math.ceil(bx);xx++){const weight=(Math.min(bx,xx+1)-Math.max(ax,xx))*(Math.min(by,yy+1)-Math.max(ay,yy));const i=(Math.min(yy,img.height-1)*img.width+Math.min(xx,img.width-1))*3;for(let c=0;c<3;c++)data[j+c]+=img.data[i+c]*weight;total+=weight;}
  for(let c=0;c<3;c++)data[j+c]/=total;
 }return {width,height,data};
}
function boxBlur(src,w,h,r){const temp=new Float32Array(src.length),out=new Float32Array(src.length);for(let y=0;y<h;y++){let sum=0;for(let x=0;x<=Math.min(r,w-1);x++)sum+=src[y*w+x];for(let x=0;x<w;x++){temp[y*w+x]=sum/(Math.min(w-1,x+r)-Math.max(0,x-r)+1);if(x-r>=0)sum-=src[y*w+x-r];if(x+r+1<w)sum+=src[y*w+x+r+1];}}for(let x=0;x<w;x++){let sum=0;for(let y=0;y<=Math.min(r,h-1);y++)sum+=temp[y*w+x];for(let y=0;y<h;y++){out[y*w+x]=sum/(Math.min(h-1,y+r)-Math.max(0,y-r)+1);if(y-r>=0)sum-=temp[(y-r)*w+x];if(y+r+1<h)sum+=temp[(y+r+1)*w+x];}}return out;}
/** Scene-adaptive photographic rendering. Neutral RGB remains neutral. */
export function toneMap(img,{ev=0,compression=1.2,saturation=1.15,shadows=.85,contrast=1.08,warmth=0,tint=0,windowPull=.5,maxWidth=0,natural=false}={}){
 const image=maxWidth?resizeLinear(img,maxWidth):img;if(natural)return exposureBlend(image,{ev,compression,saturation,shadows,warmth,tint,windowPull});const {width:w,height:h}=image,rgba=new Uint8ClampedArray(w*h*4),histogram=new Uint32Array(64);
 // Global statistics only: no spatial gain field that could bleed across edges.
 const small=resizeLinear(img,384),logs=new Float32Array(small.width*small.height),values=[];
 for(let i=0;i<logs.length;i++){const L=luma(small.data[i*3],small.data[i*3+1],small.data[i*3+2]);logs[i]=Math.log2(Math.max(L,1e-6));if(L>1e-5)values.push(L);}
 values.sort((a,b)=>a-b);const median=values[Math.floor(values.length*.5)]||.18,black=(values[Math.floor(values.length*.002)]||0)*.45;
 const autoGain=clamp(.22/median,.5,2);
 const film=x=>(x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),gain=autoGain*2**ev;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*3,j=(y*w+x)*4;let r=Math.max(0,image.data[i]-black)*2**(warmth*.25),g=Math.max(0,image.data[i+1]-black)*2**(-tint*.25),b=Math.max(0,image.data[i+2]-black)*2**(-warmth*.25);const L=luma(r,g,b);
  const rawT=L*gain,k=clamp(windowPull,0,1)*8;
  const t=k>0&&rawT>.25?.25+Math.log1p(k*(rawT-.25))/k:rawT,shadowStrength=clamp(shadows,0,1)*.8;
  const lifted=t*(1+shadowStrength/(1+t/.12));
  const exposed=lifted/(1+clamp(compression,0,3)*.10*lifted);let mapped=clamp(film(exposed));
  // A gentle S curve anchors blacks without lifting a grey pedestal.
  if(mapped>0&&mapped<1)mapped=1/(1+((1-mapped)/mapped)**contrast);
  const factor=L>1e-9?mapped/L:0;let rr=(L+(r-L)*saturation)*factor,gg=(L+(g-L)*saturation)*factor,bb=(L+(b-L)*saturation)*factor;
  // Compress out-of-gamut chroma toward the same luminance, rather than clipping channels.
  const hi=Math.max(rr,gg,bb),lo=Math.min(rr,gg,bb);let chroma=1;if(hi>1)chroma=Math.min(chroma,(1-mapped)/Math.max(hi-mapped,1e-9));if(lo<0)chroma=Math.min(chroma,mapped/Math.max(mapped-lo,1e-9));
  const channels=[mapped+(rr-mapped)*chroma,mapped+(gg-mapped)*chroma,mapped+(bb-mapped)*chroma];
  for(let c=0;c<3;c++){const v=clamp(channels[c]);rgba[j+c]=255*(v<=.0031308?12.92*v:1.055*v**(1/2.4)-.055);}rgba[j+3]=255;histogram[Math.min(63,Math.floor(luma(rgba[j],rgba[j+1],rgba[j+2])/4))]++;
 }return {width:w,height:h,data:rgba,histogram};
}

/** Uncompressed IEEE float RGB TIFF, relative scene-linear sRGB primaries/D65. */
export function encodeTIFF(img){const description=new TextEncoder().encode('Latitude HDR; relative scene-linear RGB; sRGB primaries; D65; no tone curve\0');const tags=13,ifd=8,extra=ifd+2+tags*12+4,bits=extra,sample=bits+6,desc=sample+6,pixels=Math.ceil((desc+description.length)/4)*4,size=img.data.length*4;const out=new ArrayBuffer(pixels+size),v=new DataView(out);v.setUint16(0,0x4949,true);v.setUint16(2,42,true);v.setUint32(4,ifd,true);v.setUint16(ifd,tags,true);let at=ifd+2;const tag=(id,type,count,value)=>{v.setUint16(at,id,true);v.setUint16(at+2,type,true);v.setUint32(at+4,count,true);if(type===3&&count===1)v.setUint16(at+8,value,true);else v.setUint32(at+8,value,true);at+=12;};tag(256,4,1,img.width);tag(257,4,1,img.height);tag(258,3,3,bits);tag(259,3,1,1);tag(262,3,1,2);tag(270,2,description.length,desc);tag(273,4,1,pixels);tag(274,3,1,1);tag(277,3,1,3);tag(278,4,1,img.height);tag(279,4,1,size);tag(284,3,1,1);tag(339,3,3,sample);for(let c=0;c<3;c++){v.setUint16(bits+c*2,32,true);v.setUint16(sample+c*2,3,true);}new Uint8Array(out,desc,description.length).set(description);for(let i=0;i<img.data.length;i++)v.setFloat32(pixels+i*4,img.data[i],true);return out;}
export function encodeHDR(img){const header=new TextEncoder().encode('#?RADIANCE\nFORMAT=32-bit_rle_rgbe\nPRIMARIES=0.640 0.330 0.300 0.600 0.150 0.060 0.3127 0.3290\n\n-Y '+img.height+' +X '+img.width+'\n');const rowBytes=4+4*(img.width+Math.ceil(img.width/128)),useRLE=img.width>=8&&img.width<=32767;const bytes=new Uint8Array(header.length+(useRLE?rowBytes:img.width*4)*img.height);bytes.set(header);let p=header.length;const row=new Uint8Array(img.width*4);for(let y=0;y<img.height;y++){for(let x=0;x<img.width;x++){const i=(y*img.width+x)*3,k=x*4,m=Math.max(img.data[i],img.data[i+1],img.data[i+2]);if(m<1e-32){row.fill(0,k,k+4);continue;}const e=Math.floor(Math.log2(m))+1,f=256/2**e;row[k]=clamp(Math.floor(img.data[i]*f),0,255);row[k+1]=clamp(Math.floor(img.data[i+1]*f),0,255);row[k+2]=clamp(Math.floor(img.data[i+2]*f),0,255);row[k+3]=clamp(e+128,0,255);}if(!useRLE){bytes.set(row,p);p+=row.length;continue;}bytes.set([2,2,img.width>>8,img.width&255],p);p+=4;for(let c=0;c<4;c++)for(let x=0;x<img.width;x+=128){const n=Math.min(128,img.width-x);bytes[p++]=n;for(let j=0;j<n;j++)bytes[p++]=row[(x+j)*4+c];}}return bytes.subarray(0,p);}

/** Fixed display rendering of the same HDR merge, without enhancement controls. */
export const BASE_TONE=Object.freeze({ev:0,compression:0,saturation:1,shadows:0,contrast:1,warmth:0,tint:0,windowPull:0});
