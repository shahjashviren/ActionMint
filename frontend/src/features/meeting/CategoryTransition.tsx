import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import type {CSSProperties} from 'react';
import {gsap} from 'gsap';
import {getCategory,type CategoryId} from './categories';
import {pickDirection,type Direction} from './categoryMotion';
import type {CategoryAnimationMode} from '../../store/useSettingsStore';

type Run={id:CategoryId;direction:Direction;reduced:boolean;key:number};

function CategoryGlyph({id,accent,title}:{id:CategoryId;accent:string;title:string}){
  const index=['overview','decisions','actions','people','timeline','flow','transcript','ask','recap'].indexOf(id);
  return <svg viewBox="0 0 120 120" role="img" aria-label={title} className="category-glyph">
    <circle cx="60" cy="60" r="43" fill={accent} fillOpacity=".14"/>
    {index%3===0?<><rect x="31" y="33" width="43" height="43" rx="13" fill="none" stroke={accent} strokeWidth="5"/><rect x="48" y="48" width="43" height="43" rx="13" fill="none" stroke={accent} strokeWidth="5"/></>:index%3===1?<><circle cx="60" cy="60" r="28" fill="none" stroke={accent} strokeWidth="5"/><path d="M44 61l11 11 23-25" fill="none" stroke={accent} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round"/></>:<><path d="M29 75c15-34 47-34 62 0" fill="none" stroke={accent} strokeWidth="5" strokeLinecap="round"/><circle cx="31" cy="77" r="8" fill={accent}/><circle cx="60" cy="44" r="8" fill={accent}/><circle cx="89" cy="77" r="8" fill={accent}/></>}
  </svg>;
}

export default function CategoryTransition({activeId,mode,lowEffects,reducedMotion}:{activeId:CategoryId;mode:CategoryAnimationMode;lowEffects:boolean;reducedMotion:boolean}){
  const node=useRef<HTMLDivElement|null>(null);
  const previousId=useRef(activeId);
  const previousDirection=useRef<Direction|null>(null);
  const serial=useRef(0);
  const [run,setRun]=useState<Run|null>(null);

  useEffect(()=>{
    const reduced=mode==='reduced'||lowEffects||reducedMotion;
    if(previousId.current===activeId){
      if(mode==='off'){setRun(null);return}
      setRun(current=>current&&current.reduced!==reduced?{...current,reduced,key:++serial.current}:current);
      return;
    }
    previousId.current=activeId;
    if(mode==='off')return;
    const direction=pickDirection(previousDirection.current);
    previousDirection.current=direction;
    setRun({id:activeId,direction,reduced,key:++serial.current});
  },[activeId,mode,lowEffects,reducedMotion]);

  useLayoutEffect(()=>{
    const element=node.current;
    if(!run||!element)return;
    element.style.willChange='transform, opacity';
    const finish=()=>setRun(current=>current?.key===run.key?null:current);
    let timeline:gsap.core.Timeline;
    if(run.reduced){
      timeline=gsap.timeline({onComplete:finish});
      timeline.fromTo(element,{autoAlpha:0,scale:.96,rotateY:0},{autoAlpha:1,scale:1,duration:.2,ease:'power1.out'}).to(element,{autoAlpha:0,scale:.98,duration:.2,ease:'power1.in'});
    }else{
      const width=window.innerWidth,height=window.innerHeight,size=Math.min(Math.min(width,height)*.46,420);
      const lane=.25+Math.random()*.5;
      const cx=width/2,cy=height/2;
      let left=cx,top=cy,sx=0,sy=0,ex=0,ey=0;
      const dx=(width+size)/2+24,dy=(height+size)/2+24;
      switch(run.direction){
        case 'l2r':top=height*lane;sx=-dx;ex=dx;break;
        case 'r2l':top=height*lane;sx=dx;ex=-dx;break;
        case 't2b':left=width*lane;sy=-dy;ey=dy;break;
        case 'b2t':left=width*lane;sy=dy;ey=-dy;break;
        case 'tl2br':sx=-dx;sy=-dy;ex=dx;ey=dy;break;
        case 'tr2bl':sx=dx;sy=-dy;ex=-dx;ey=dy;break;
        case 'bl2tr':sx=-dx;sy=dy;ex=dx;ey=-dy;break;
        case 'br2tl':sx=dx;sy=dy;ex=-dx;ey=-dy;break;
      }
      element.style.left=`${left}px`;element.style.top=`${top}px`;
      gsap.set(element,{x:sx,y:sy,scale:.9,rotateY:run.direction==='r2l'||run.direction==='tr2bl'||run.direction==='br2tl'?25:-25,rotateZ:-6,autoAlpha:.82});
      timeline=gsap.timeline({onComplete:finish});
      timeline.to(element,{x:0,y:0,scale:1.08,rotateY:0,rotateZ:0,autoAlpha:1,duration:.45,ease:'power2.out'}).to(element,{x:ex,y:ey,scale:.95,rotateY:25,rotateZ:6,autoAlpha:0,duration:.45,ease:'power2.in'});
    }
    const visibility=()=>{if(document.visibilityState==='hidden')timeline.pause();else timeline.resume()};
    document.addEventListener('visibilitychange',visibility);
    return()=>{document.removeEventListener('visibilitychange',visibility);timeline.kill();element.style.willChange='';gsap.set(element,{clearProps:'transform,opacity,visibility'});};
  },[run]);

  if(!run||mode==='off')return null;
  const category=getCategory(run.id);
  return <div className="category-transition" aria-hidden="true"><div ref={node} className="category-transition-art" style={{'--category-accent':category.accent} as CSSProperties}><CategoryGlyph id={category.id} accent={category.accent} title={category.alt}/></div></div>;
}
