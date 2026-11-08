import { useEffect, useRef, useState } from 'react'
import { assetUrl, prefersStill } from './geo'
import type { DramaClip } from './drama'

type Phase = 'ready'|'loading'|'playing'|'paused'|'buffering'|'blocked'|'error'|'holding'|'hold-paused'|'fading'
type Session = {
  clip:DramaClip; audio:HTMLAudioElement; events:AbortController; trigger:HTMLButtonElement
  phase:Phase; id:number; command:number; remaining:number; deadline:number; timer?:number
}

export function useDramaPlayback(holdMs:number) {
  const current = useRef<Session|null>(null)
  const nextId = useRef(0)
  const focusFrame = useRef(0)
  const [view,setView] = useState<{clip:DramaClip;phase:Phase;time:number;duration:number;id:number}|null>(null)

  function clearTimer(session:Session) {
    window.clearTimeout(session.timer)
    session.timer=undefined
  }

  function dispose() {
    const session = current.current
    if (!session) return
    current.current=null
    clearTimer(session)
    session.events.abort()
    session.audio.pause()
    session.audio.removeAttribute('src')
    session.audio.load()
  }

  useEffect(()=>()=>{dispose();cancelAnimationFrame(focusFrame.current)},[])

  function close() {
    const trigger = current.current?.trigger
    if (!trigger) return
    dispose()
    setView(null)
    cancelAnimationFrame(focusFrame.current)
    focusFrame.current=requestAnimationFrame(()=>{
      if (!current.current && trigger.isConnected) trigger.focus({preventScroll:true})
    })
  }

  function update(session:Session,phase=session.phase) {
    if (current.current!==session) return
    session.phase=phase
    const {audio,clip} = session
    setView({clip,phase,id:session.id,time:audio.currentTime,
      duration:Number.isFinite(audio.duration) && audio.duration>0 ? audio.duration : clip.audio.durationSeconds})
  }

  function fail(session:Session,phase:'blocked'|'error') {
    if (current.current!==session) return
    clearTimer(session)
    update(session,phase)
  }

  function play(session:Session) {
    const command = ++session.command
    update(session,'loading')
    // Keep this call in the original user click. Awaiting another resource can lose activation.
    void session.audio.play().catch((error:unknown)=>{
      if (current.current!==session || command!==session.command) return
      fail(session,error instanceof DOMException && error.name==='NotAllowedError' ? 'blocked' : 'error')
    })
  }

  function startHold(session:Session) {
    clearTimer(session)
    update(session,'holding')
    session.deadline=performance.now()+session.remaining
    session.timer=window.setTimeout(()=>{
      if (current.current!==session || session.phase!=='holding') return
      if (prefersStill()) return close()
      update(session,'fading')
      session.timer=window.setTimeout(()=>{
        if (current.current===session && session.phase==='fading') close()
      },280)
    },session.remaining)
  }

  function start(clip:DramaClip,trigger:HTMLButtonElement,autoplay:boolean) {
    dispose()
    cancelAnimationFrame(focusFrame.current)
    const audio = new Audio()
    const events = new AbortController()
    const session:Session = {clip,trigger,audio,events,phase:'ready',id:++nextId.current,command:0,remaining:holdMs,deadline:0}
    current.current=session
    audio.preload='none'
    const on = (event:string,callback:()=>void)=>audio.addEventListener(event,()=>{
      if (current.current===session) callback()
    },{signal:events.signal})
    on('playing',()=>{
      if (!audio.paused && !audio.ended) update(session,'playing')
    })
    on('waiting',()=>{
      if (!audio.paused && !audio.ended && (session.phase==='playing' || session.phase==='loading'))
        update(session,'buffering')
    })
    on('pause',()=>{
      if (audio.paused && !audio.ended && ['playing','buffering','loading'].includes(session.phase)) update(session,'paused')
    })
    on('ended',()=>{
      if (!audio.ended || ['error','blocked','holding','hold-paused','fading'].includes(session.phase)) return
      session.remaining=holdMs
      startHold(session)
    })
    on('error',()=>fail(session,'error'))
    on('loadedmetadata',()=>update(session))
    on('timeupdate',()=>update(session))
    audio.src=assetUrl(clip.audio.path)
    if (autoplay) play(session)
    else update(session)
  }

  function toggle() {
    const session = current.current
    if (!session) return
    switch (session.phase) {
      case 'playing':
      case 'buffering':
      case 'loading':
        session.command++
        update(session,'paused')
        session.audio.pause()
        break
      case 'holding':
        session.remaining=Math.max(0,session.deadline-performance.now())
        clearTimer(session)
        update(session,'hold-paused')
        break
      case 'hold-paused':
        startHold(session)
        break
      case 'error':
        start(session.clip,session.trigger,true)
        break
      case 'ready':
      case 'blocked':
      case 'paused':
        play(session)
        break
      case 'fading':
        break
    }
  }

  function replay() {
    const session = current.current
    if (session) start(session.clip,session.trigger,true)
  }

  return {view,start,close,toggle,replay}
}

export type DramaPlayback = ReturnType<typeof useDramaPlayback>
