let worker,seq=0,pending=new Map();
function reset(){worker?.terminate();worker=null;for(const p of pending.values()){clearTimeout(p.timer);p.reject(new DOMException('Straightening stopped','AbortError'));}pending.clear();}
function request(operation,blob,params,signal){return blob.arrayBuffer().then(bytes=>{
 if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
 if(!worker){worker=new Worker('/straighten/python-worker.js?v=13');worker.onmessage=({data})=>{const p=pending.get(data.id);if(!p)return;pending.delete(data.id);clearTimeout(p.timer);data.ok?p.resolve({result:data.result,blob:new Blob([data.bytes],{type:'image/png'})}):p.reject(Error(data.error));};worker.onerror=()=>reset();}
 const id=++seq;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{reset();},300000);pending.set(id,{resolve,reject,timer});worker.postMessage({id,operation,bytes,params},[bytes]);});});}
export async function straightenInput(input,signal){
 const abort=()=>reset();signal?.addEventListener('abort',abort,{once:true});
 try{const blob=await (await fetch(input.image)).blob();const {result}=await request('process',blob,null,signal);
 if(result.status!=='corrected')return {input,result};
 const exported=await request('export',blob,result.params,signal);const bitmap=await createImageBitmap(exported.blob);const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;canvas.getContext('2d').drawImage(bitmap,0,0);bitmap.close();const image=canvas.toDataURL('image/jpeg',.88);if(image.length>1700000)throw Error('Straightened preview exceeds the editing size limit.');return {input:{image,width:canvas.width,height:canvas.height},result};
 }finally{signal?.removeEventListener('abort',abort);}
}
