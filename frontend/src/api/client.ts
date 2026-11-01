import type {MeetingSpec,Segment} from './types';
import {supabase} from '../auth/supabase';

const base=(import.meta.env.VITE_API_BASE as string|undefined)?.replace(/\/$/,'')??'';
const sessionToken=(id:string)=>typeof sessionStorage==='undefined'?'':sessionStorage.getItem(`actionmint.session.${id}`)||'';
export function setSessionToken(id:string,token:string){sessionStorage.setItem(`actionmint.session.${id}`,token)}
export function clearSessionToken(id:string){sessionStorage.removeItem(`actionmint.session.${id}`)}

async function authHeaders(id?:string,initial?:HeadersInit){
 const headers=new Headers(initial);
 if(supabase){const{data}=await supabase.auth.getSession();if(data.session?.access_token)headers.set('Authorization',`Bearer ${data.session.access_token}`)}
 if(id){const token=sessionToken(id);if(token)headers.set('X-Session-Token',token)}
 return headers;
}
function friendlyError(status:number,detail:unknown){
 if(typeof detail==='string'&&detail)return detail;
 const message=typeof detail==='object'&&detail!==null&&'message'in detail?String((detail as {message:unknown}).message):'';
 if(message)return message;
 if(status===401)return 'Your sign-in or temporary meeting session expired. Sign in and start a new workspace.';
 if(status===413)return 'This file is too large. Choose a smaller recording.';
 if(status===429)return 'The AI service or this workspace is at its usage limit. Wait a little and try again.';
 if(status>=500)return 'ActionMint’s service is temporarily unavailable. Please try again shortly.';
 return `We couldn’t complete that request (${status}). Check the details and try again.`;
}
async function fetchSafely(url:string,init:RequestInit){
 try{return await fetch(url,init)}catch(error){
  if(error instanceof TypeError)throw new Error('ActionMint could not reach its service. Check your connection and try again.');
  throw error;
 }
}
async function request<T>(path:string,init:RequestInit={},id?:string):Promise<T>{
 const headers=await authHeaders(id,init.headers);
 if(init.body&&!(init.body instanceof FormData)&&!headers.has('Content-Type'))headers.set('Content-Type','application/json');
 const response=await fetchSafely(`${base}${path}`,{...init,headers});
 if(!response.ok){let detail:unknown;try{const body=await response.json();detail=body?.detail}catch{/* Keep a safe status-based message. */}throw new Error(friendlyError(response.status,detail))}
 try{return await response.json() as T}catch{throw new Error('The service returned an unreadable response. Please try again.')}
}
export async function getHealth(){return request<{status:string;auth_configured:boolean;ai_configured:boolean;providers:{name:string;ok:boolean;latency_ms:number|null}[];default_provider:string;model:string;meeting_storage:string}>('/health')}
export async function createMeeting(input:{source:'transcript'|'upload'|'youtube'|'link';title?:string;meeting_date?:string;text?:string}){
 const result=await request<{meeting_id:string;session_token:string}>('/api/meetings',{method:'POST',body:JSON.stringify(input)});
 setSessionToken(result.meeting_id,result.session_token);return result;
}
export async function uploadMedia(id:string,file:File){const form=new FormData();form.append('file',file);return request<{ok:boolean;segments:number;duration_s:number|null;stt_provider:string}>(`/api/meetings/${id}/media`,{method:'POST',body:form},id)}
export async function processYoutube(id:string,url:string){return request<{ok:boolean;segments:number;duration_s:number|null;stt_provider:string}>(`/api/meetings/${id}/youtube`,{method:'POST',body:JSON.stringify({url})},id)}
export async function finalizeMeeting(id:string){return request<{state:string}>(`/api/meetings/${id}/finalize`,{method:'POST'},id)}
export async function getResult(id:string){return request<{spec:MeetingSpec;segments:Segment[];md:string;provider:string}>(`/api/meetings/${id}/result`,{},id)}
export async function saveResult(id:string,spec:MeetingSpec){return request<{ok:boolean;md:string}>(`/api/meetings/${id}/result`,{method:'PUT',body:JSON.stringify(spec)},id)}
export async function deleteMeeting(id:string){return request<{ok:boolean}>(`/api/meetings/${id}`,{method:'DELETE'},id)}

export type StreamEvent={event:string;data:Record<string,unknown>};
const isRecord=(value:unknown):value is Record<string,unknown>=>typeof value==='object'&&value!==null&&!Array.isArray(value);
export async function consumeSse(response:Response,onEvent:(event:StreamEvent)=>void,signal?:AbortSignal){
 if(!response.ok||!response.body){let detail:unknown;try{detail=(await response.json())?.detail}catch{/* Response may not be JSON. */}throw new Error(friendlyError(response.status,detail))}
 const reader=response.body.getReader();const decoder=new TextDecoder();let buffer='';
 try{
  while(true){const{value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});let boundary:number;
   while((boundary=buffer.indexOf('\n\n'))>=0){const block=buffer.slice(0,boundary).replace(/\r/g,'');buffer=buffer.slice(boundary+2);let event='message';const data:string[]=[];
    for(const line of block.split('\n')){if(line.startsWith('event:'))event=line.slice(6).trim();else if(line.startsWith('data:'))data.push(line.slice(5).trimStart())}
    if(data.length){try{const parsed:unknown=JSON.parse(data.join('\n'));onEvent({event,data:isRecord(parsed)?parsed:{}})}catch{onEvent({event,data:{}})}}
   }
  }
  if(buffer.trim()){const match=buffer.match(/(?:^|\n)event:\s*(\w+)/);const data=buffer.match(/(?:^|\n)data:\s*(.*)/);if(data){try{const parsed:unknown=JSON.parse(data[1]);onEvent({event:match?.[1]||'message',data:isRecord(parsed)?parsed:{}})}catch{/* Ignore a malformed final frame. */}}}
 }catch(error){if(error instanceof TypeError)throw new Error('The connection closed while processing. Your session may have expired; try again.');throw error}
 finally{if(signal?.aborted)await reader.cancel().catch(()=>undefined)}
}
export async function streamMeeting(id:string,onEvent:(event:StreamEvent)=>void,signal?:AbortSignal){
 const headers=await authHeaders(id);const response=await fetchSafely(`${base}/api/meetings/${id}/events`,{headers,signal});return consumeSse(response,onEvent,signal);
}
export async function streamAsk(id:string,question:string,onEvent:(event:StreamEvent)=>void){
 const headers=await authHeaders(id,{'Content-Type':'application/json'});const response=await fetchSafely(`${base}/api/meetings/${id}/ask`,{method:'POST',headers,body:JSON.stringify({question})});return consumeSse(response,onEvent);
}
