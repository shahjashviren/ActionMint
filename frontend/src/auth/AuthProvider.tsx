import {useEffect,useMemo,useState,type FormEvent,type ReactNode} from 'react';
import type {Session} from '@supabase/supabase-js';
import {AuthContext,type AuthContextValue} from './AuthContext';
import {supabase} from './supabase';
function authErrorMessage(error:unknown){
 const message=error instanceof Error?error.message.toLowerCase():'';
 if(message.includes('invalid login credentials'))return 'That email and password combination was not recognized. Check them and try again.';
 if(message.includes('email not confirmed'))return 'Confirm your email using the link we sent, then sign in.';
 if(message.includes('already registered')||message.includes('user already registered'))return 'An account already exists for this email. Try signing in instead.';
 if(message.includes('password'))return 'Password must meet the requirements shown above.';
 if(message.includes('rate limit')||message.includes('too many'))return 'Too many attempts. Wait a little and try again.';
 return 'We couldn’t complete sign-in. Check your details and try again.';
}
function SignInScreen(){
 const[mode,setMode]=useState<'signin'|'signup'>('signin');
 const[email,setEmail]=useState('');const[password,setPassword]=useState('');const[busy,setBusy]=useState(false);const[error,setError]=useState('');const[notice,setNotice]=useState('');
 async function submit(event:FormEvent){
  event.preventDefault();setError('');setNotice('');
  if(!supabase){setError('Sign-in is not configured yet. Add the Supabase URL and publishable/anon key to the frontend environment.');return}
  if(password.length<8){setError('Use a password with at least 8 characters.');return}
  setBusy(true);
  try{
   if(mode==='signin'){
    const{error:authError}=await supabase.auth.signInWithPassword({email:email.trim(),password});
    if(authError)throw authError;
   }else{
    const{data,error:authError}=await supabase.auth.signUp({email:email.trim(),password});
    if(authError)throw authError;
    if(!data.session)setNotice('Check your email to confirm the account, then sign in here.');
   }
  }catch(err){setError(authErrorMessage(err))}finally{setBusy(false)}
 }
 return <main className="auth-screen"><section className="auth-card"><div className="auth-brand"><span className="brand-mark"><img src="/assets/actionmint-mark.png" alt=""/></span><strong>ActionMint</strong></div><p className="eyebrow">YOUR PRIVATE WORKSPACE</p><h1>{supabase?(mode==='signin'?'Welcome back.':'Create your account.'):'Finish setup.'}</h1><p className="auth-intro">{supabase?'Sign in to turn meeting conversations into clear, evidence-linked next steps. Meeting content is temporary and is not saved to your account history.':'Add your Supabase project URL and public anon/publishable key to the frontend environment to enable email sign-in.'}</p>
 {!supabase?<div className="auth-setup-note">Required frontend settings: <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>.</div>:<form onSubmit={submit} className="auth-form"><label>Email address<input autoComplete="email" type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></label><label>Password<input autoComplete={mode==='signin'?'current-password':'new-password'} type="password" required minLength={8} value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 8 characters"/></label>{error&&<div className="error-banner" role="alert">{error}</div>}{notice&&<div className="auth-notice" role="status">{notice}</div>}<button className="button primary large auth-submit" type="submit" disabled={busy}>{busy?'Please wait…':mode==='signin'?'Sign in':'Create account'}</button><button className="auth-switch" type="button" onClick={()=>{setMode(mode==='signin'?'signup':'signin');setError('');setNotice('')}}>{mode==='signin'?"New to ActionMint? Create an account":"Already have an account? Sign in"}</button></form>}
 <div className="auth-privacy"><strong>Meeting content isn’t saved to Supabase.</strong><span>It is sent to the configured AI provider to generate your result and held temporarily in server memory. Export your work before leaving.</span></div></section></main>
}

export default function AuthProvider({children}:{children:ReactNode}){
 const[session,setSession]=useState<Session|null>(null);const[loading,setLoading]=useState(Boolean(supabase));
 useEffect(()=>{
  if(!supabase){setLoading(false);return}
  let alive=true;
  void supabase.auth.getSession().then(({data})=>{if(alive){setSession(data.session);setLoading(false)}}).catch(()=>{if(alive){setSession(null);setLoading(false)}});
  const{data:{subscription}}=supabase.auth.onAuthStateChange((_event,newSession)=>{setSession(newSession);setLoading(false)});
  return()=>{alive=false;subscription.unsubscribe()};
 },[]);
 const value=useMemo<AuthContextValue>(()=>({session,signOut:async()=>{if(supabase)await supabase.auth.signOut({scope:'local'})}}),[session]);
 if(loading)return <main className="auth-screen"><div className="auth-loading">Checking your sign-in…</div></main>;
 if(!session)return <SignInScreen/>;
 return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
