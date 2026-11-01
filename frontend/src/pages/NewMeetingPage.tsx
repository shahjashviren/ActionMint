import {useEffect,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {AudioLines,FileAudio2,FileText,Link2,ShieldCheck,Upload,ArrowUpRight,Info,Video,Youtube,X} from 'lucide-react';
import {createMeeting,uploadMedia,processYoutube} from '../api/client';
import {SAMPLE_TRANSCRIPT} from '../lib/sample';

type Tab='transcript'|'media'|'youtube'|'meeting';
const MAX_BYTES=100*1024*1024;
const localToday=()=>{const now=new Date();return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`};
const isMeetingUrl=(value:string)=>{try{const u=new URL(value);return u.protocol==='https:'&&u.hostname.includes('.')}catch{return false}};
export default function NewMeetingPage(){
 const[tab,setTab]=useState<Tab>('transcript');const[title,setTitle]=useState('Weekly project sync');const[date,setDate]=useState(localToday);const[text,setText]=useState('');const[file,setFile]=useState<File|null>(null);const[youtubeUrl,setYoutubeUrl]=useState('');const[meetingUrl,setMeetingUrl]=useState('');const[busy,setBusy]=useState(false);const[error,setError]=useState('');const[comingSoon,setComingSoon]=useState(false);const navigate=useNavigate();
 useEffect(()=>{if(!comingSoon)return;const close=(e:KeyboardEvent)=>{if(e.key==='Escape')setComingSoon(false)};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close)},[comingSoon]);
 async function run(){
  setError('');
  if(tab==='meeting'){if(!meetingUrl.trim())return setError('Paste your Google Meet, Zoom, or Teams link first.');if(!isMeetingUrl(meetingUrl.trim()))return setError('Use a valid HTTPS meeting link.');setComingSoon(true);return}
  setBusy(true);
  try{
   if(tab==='transcript'){
    if(!text.trim())throw new Error('Paste a transcript to continue.');
    const r=await createMeeting({source:'transcript',title,meeting_date:date,text:text.trim()});navigate(`/meet/${r.meeting_id}`);
   }else if(tab==='media'){
    if(!file)throw new Error('Choose an audio or video file to continue.');
    if(file.size>MAX_BYTES)throw new Error('This file is over the 100 MB limit. Choose a smaller recording.');
    const r=await createMeeting({source:'upload',title,meeting_date:date});await uploadMedia(r.meeting_id,file);navigate(`/meet/${r.meeting_id}`);
   }else{
    if(!youtubeUrl.trim())throw new Error('Paste a public YouTube video link to continue.');
    const r=await createMeeting({source:'youtube',title,meeting_date:date});await processYoutube(r.meeting_id,youtubeUrl.trim());navigate(`/meet/${r.meeting_id}`);
   }
  }catch(e){setError(e instanceof Error?e.message:'We couldn’t start the meeting workspace. Please try again.')}finally{setBusy(false)}
 }
 function sample(){setText(SAMPLE_TRANSCRIPT);setTab('transcript')}
 const tabs=[['transcript','Transcript',FileText],['media','Audio / video',FileAudio2],['youtube','YouTube',Youtube],['meeting','Join a meeting',Link2]] as const;
 return <><main className="workspace-page wrap"><div className="page-topline"><span className="eyebrow">WORKSPACE / NEW SESSION</span><span className="secure-note"><ShieldCheck size={14}/> Temporary meeting session</span></div><div className="workspace-heading" data-reveal><div><h1>Start with the<br/><em>conversation.</em></h1><p>Paste a transcript, upload a recording, or use a public YouTube link. ActionMint prepares a draft for you to review—not publish on your behalf.</p></div><div className="record-mark"><AudioLines size={28}/><span>01—03<br/>INPUT</span></div></div><section className="ingest-card" data-reveal><div className="input-tabs" role="tablist" aria-label="Input type">{tabs.map(([key,label,Icon])=><button key={key} className={tab===key?'input-tab active':'input-tab'} onClick={()=>{setTab(key);setError('')}} role="tab" aria-selected={tab===key}><Icon size={17}/>{label}</button>)}</div><div className="ingest-form"><div className="form-row"><label>Meeting title<input value={title} maxLength={120} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Weekly product sync"/></label><label>Meeting date<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label></div>
 {tab==='transcript'&&<><label>Transcript<textarea value={text} onChange={e=>setText(e.target.value)} maxLength={60000} rows={9} placeholder="Paste meeting notes or a transcript. Timestamped speaker lines give the clearest evidence."/></label><div className="input-foot"><span>{text.length.toLocaleString()} / 60,000 characters</span><button type="button" className="text-link sample-button" onClick={sample}>Load the 3-minute sample <ArrowUpRight size={14}/></button></div></>}
 {tab==='media'&&<><label className="upload-zone" htmlFor="meeting-media"><input id="meeting-media" type="file" accept=".mp3,.wav,.m4a,.mp4,.webm,.mkv,audio/*,video/mp4,video/webm" onChange={e=>setFile(e.target.files?.[0]||null)}/><span className="upload-symbol"><Upload size={20}/></span><strong>{file?file.name:'Drop a recording here or browse'}</strong><span>{file?`${(file.size/1024/1024).toFixed(1)} MB · Selected`:'MP3, WAV, M4A, MP4, WebM, MKV · up to 100 MB'}</span></label><p className="inline-note"><Video size={14}/> Audio is transcribed for meeting notes; visual slide content isn’t analyzed. Up to 20 minutes. Gemini free-tier quotas may apply.</p></>}
 {tab==='youtube'&&<><label>Public YouTube video URL<input type="url" value={youtubeUrl} onChange={e=>setYoutubeUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=…"/></label><p className="inline-note"><Info size={14}/> Public videos only; private and unlisted links aren’t supported. YouTube processing is a preview; longer videos may take more time or use more quota.</p></>}
 {tab==='meeting'&&<><label>Meeting link<input type="url" value={meetingUrl} onChange={e=>setMeetingUrl(e.target.value)} placeholder="https://meet.google.com/… or another meeting link"/></label><p className="inline-note"><Info size={14}/> Live meeting capture isn’t active yet. Submit a valid link to see the feature status.</p></>}
 {error&&<div className="error-banner" role="alert">{error}</div>}
 <div className="form-actions"><p><ShieldCheck size={15}/> Meeting content is temporary and isn’t saved to Supabase. Export results before leaving.</p><button className="button primary large" onClick={()=>void run()} disabled={busy||(tab==='transcript'&&!text.trim())||(tab==='media'&&!file)||(tab==='youtube'&&!youtubeUrl.trim())}>{busy?'Preparing…':tab==='meeting'?'Submit meeting link':'Build meeting workspace'}<ArrowUpRight size={17}/></button></div>
 </div></section><div className="privacy-foot" data-reveal><span className="step-dot active">1</span><span>Bring it in</span><i/><span className="step-dot">2</span><span>Review the draft</span><i/><span className="step-dot">3</span><span>Export your version</span></div></main>
 {comingSoon&&<div className="coming-soon-dialog" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setComingSoon(false)}}><section className="coming-soon-card" role="dialog" aria-modal="true" aria-labelledby="coming-title"><p className="eyebrow">LIVE MEETING CAPTURE</p><h2 id="coming-title">Coming soon</h2><p>Thanks for sharing your meeting link. Live capture for Google Meet, Zoom, Teams, and other services is being prepared. For now, you can paste a transcript, upload a recording, or use a public YouTube link.</p><div className="coming-soon-actions"><button autoFocus className="button primary" onClick={()=>setComingSoon(false)}>Got it <X size={15}/></button></div></section></div>}</>;
}
