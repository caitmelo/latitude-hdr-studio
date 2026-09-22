export const STYLE_LABELS={natural:'Natural correction',internal:'Internal',internal_golden_hour:'Internal golden hour',dusk:'Dusk',golden_hour:'Exterior golden hour',external_day:'External day'};
export function selectedStyles(value){return value==='both'?['internal','internal_golden_hour']:value in STYLE_LABELS?[value]:['natural'];}
export function jpegBlob(data){return new Blob([Uint8Array.from(atob(data.split(',')[1]),c=>c.charCodeAt(0))],{type:'image/jpeg'});}
export async function requestEdit(input,style,signal){
 const controller=new AbortController();const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)controller.abort();const timer=setTimeout(abort,190000);
 try{const r=await fetch('/api/ai/edit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...input,style}),signal:controller.signal});const data=await r.json();if(!r.ok)throw Error(data.error||'Image editing failed.');if(typeof data.image!=='string'||!/^data:image\/jpeg;base64,\/9j\//.test(data.image))throw Error('Invalid edited image.');return data;}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
let running=false;
export async function finishVariants({input,styles,straighten=false,signal,onStatus=()=>{},onResult=()=>{},edit=requestEdit,prepare}){
 if(running)throw Error('Another photo is processing. Wait for it to finish.');running=true;
 const results={},errors=[];let prepared=input,geometry={status:'disabled'};
 try{
  if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
  if(straighten){onStatus('Checking verticals locally…');if(!prepare)throw Error('Straightening is unavailable.');const p=await prepare(input,signal);prepared=p.input;geometry=p.result;if(geometry.status==='unresolved')throw Error('Straightening could not resolve this photo. Review it or turn straightening off to continue.');}
  for(const style of styles){
   if(signal?.aborted)break;onStatus('Creating '+STYLE_LABELS[style]+'…');
   try{const data=await edit(prepared,style,signal);const result={...data,style,original:prepared.image,geometry};results[style]=result;await onResult(result);}
   catch(e){errors.push({style,message:e.name==='AbortError'?'Stopped or timed out; the provider may still bill the request.':e.message});if(signal?.aborted)break;}
  }
  return {results,errors,geometry};
 }finally{running=false;}
}
