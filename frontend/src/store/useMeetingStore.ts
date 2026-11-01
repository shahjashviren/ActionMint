import {create} from 'zustand';
import type {MeetingSpec,Segment,ActionItem,Decision} from '../api/types';
type Snapshot={spec:MeetingSpec|null};
type State={spec:MeetingSpec|null;segments:Segment[];provider:string;state:string;label:string;error:string|null;undoStack:Snapshot[];redoStack:Snapshot[];setSpec:(s:MeetingSpec)=>void;setSegments:(s:Segment[])=>void;setProgress:(state:string,label:string)=>void;setError:(e:string|null)=>void;editAction:(id:string,patch:Partial<ActionItem>)=>void;editDecision:(id:string,patch:Partial<Decision>)=>void;editTitle:(title:string)=>void;toggleDone:(id:string)=>void;addAction:()=>void;deleteAction:(id:string)=>void;undo:()=>void;redo:()=>void;setProvider:(p:string)=>void;reset:()=>void};
const initial={spec:null,segments:[],provider:'',state:'idle',label:'Ready',error:null,undoStack:[] as Snapshot[],redoStack:[] as Snapshot[]};
const snapshot=(spec:MeetingSpec|null):Snapshot=>({spec:spec?structuredClone(spec):null});
export const useMeetingStore=create<State>((set,get)=>({
 ...initial,
 setSpec:(spec)=>set({spec}),setSegments:(segments)=>set({segments}),setProgress:(state,label)=>set({state,label,error:null}),setError:(error)=>set({error}),setProvider:(provider)=>set({provider}),
 editAction:(id,patch)=>set(s=>{if(!s.spec)return s;return {undoStack:[...s.undoStack.slice(-49),snapshot(s.spec)],redoStack:[],spec:{...s.spec,edited:true,action_items:s.spec.action_items.map(a=>a.id===id?{...a,...patch}:a)}}}),
 editDecision:(id,patch)=>set(s=>{if(!s.spec)return s;return {undoStack:[...s.undoStack.slice(-49),snapshot(s.spec)],redoStack:[],spec:{...s.spec,edited:true,decisions:s.spec.decisions.map(d=>d.id===id?{...d,...patch}:d)}}}),
 editTitle:(title)=>set(s=>!s.spec?s:{undoStack:[...s.undoStack.slice(-49),snapshot(s.spec)],redoStack:[],spec:{...s.spec,title,edited:true}}),
 toggleDone:(id)=>{const a=get().spec?.action_items.find(x=>x.id===id);if(a)get().editAction(id,{done:!a.done})},
 addAction:()=>set(s=>{if(!s.spec)return s;return {undoStack:[...s.undoStack.slice(-49),snapshot(s.spec)],redoStack:[],spec:{...s.spec,edited:true,action_items:[...s.spec.action_items,{id:crypto.randomUUID(),task:'New action item',owner:null,due_raw:null,due_iso:null,due_resolved_from_relative:false,note:null,done:false,evidence:[],verified:false,confirmed:true}]}}}),
 deleteAction:(id)=>set(s=>!s.spec?s:{undoStack:[...s.undoStack.slice(-49),snapshot(s.spec)],redoStack:[],spec:{...s.spec,edited:true,action_items:s.spec.action_items.filter(a=>a.id!==id)}}),
 undo:()=>set(s=>{if(!s.undoStack.length)return s;const prev=s.undoStack[s.undoStack.length-1];return {...prev,undoStack:s.undoStack.slice(0,-1),redoStack:[...s.redoStack,snapshot(s.spec)]}}),
 redo:()=>set(s=>{if(!s.redoStack.length)return s;const next=s.redoStack[s.redoStack.length-1];return {...next,redoStack:s.redoStack.slice(0,-1),undoStack:[...s.undoStack,snapshot(s.spec)]}}),
 reset:()=>set({...initial}),
}));
