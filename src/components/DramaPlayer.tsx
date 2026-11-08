import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import { assetUrl } from '../geo'
import type { DramaBundle, DramaClip } from '../drama'
import { dramaNoteId } from '../drama'
import { useDramaPlayback } from '../use-drama-playback'
import type { DramaPlayback } from '../use-drama-playback'
import { Icon } from './Icons'
import { SourceLink } from './Sources'
import type { Source } from '../types'
import { CreatorCredit } from './CreatorCredit'

export type DramaActions = {
  open:(clip:DramaClip,trigger:HTMLButtonElement)=>void
  warm:(clip:DramaClip)=>void
}

export const DramaPlayer = forwardRef<DramaActions,{bundle:DramaBundle;sources:Map<string,Source>;chapterTitle:string;people:Map<string,{name:string}>}>(function DramaPlayer({bundle,sources,chapterTitle,people},ref) {
  const images = useRef(new Map<string,HTMLImageElement>())
  const playback = useDramaPlayback(bundle.endHoldMs)

  function warm(clip:DramaClip) {
    const cached = images.current.get(clip.id)
    if (cached && (!cached.complete || cached.naturalWidth>0)) return cached
    const image = new Image()
    image.decoding='async'
    image.src=assetUrl(clip.illustration.path)
    images.current.set(clip.id,image)
    return image
  }

  useImperativeHandle(ref,()=>({
    open(clip,trigger) {
      const image = warm(clip)
      playback.start(clip,trigger,image.complete && image.naturalWidth>0)
    },
    warm,
  }))

  useEffect(()=>()=>{
    for (const image of images.current.values()) image.removeAttribute('src')
    images.current.clear()
  },[bundle])

  if (!playback.view) return null
  return <DramaDialog key={playback.view.clip.id} playback={playback} view={playback.view} disclaimer={bundle.disclaimer} sources={sources}
    chapterTitle={chapterTitle} speakerName={people.get(playback.view.clip.speakerId)!.name}/>
})

const statusText = {
  loading:'正在载入声音',playing:'正在播放',paused:'已暂停',buffering:'正在缓冲',
  blocked:'浏览器暂停了首次播放，请点击播放',error:'声音暂不可用，可以重试或关闭',
  holding:'播放结束 · 即将收起','hold-paused':'播放结束 · 保留画面',fading:'播放结束 · 即将收起',
}

function timestamp(seconds:number) {
  const whole = Math.max(0,Math.floor(seconds))
  return `${Math.floor(whole/60)}:${String(whole%60).padStart(2,'0')}`
}

function DramaDialog({playback,view,disclaimer,sources,chapterTitle,speakerName}:{playback:DramaPlayback;view:NonNullable<DramaPlayback['view']>;
  disclaimer:string;sources:Map<string,Source>;chapterTitle:string;speakerName:string}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const [image,setImage] = useState<'loading'|'ready'|'error'>('loading')
  const {clip,phase,time,duration} = view
  useLayoutEffect(()=>{
    const dialog=dialogRef.current!
    dialog.showModal()
    closeRef.current?.focus({preventScroll:true})
    return ()=>dialog.close()
  },[])
  const playing = phase==='playing' || phase==='buffering' || phase==='loading'
  const action = playing ? '暂停'
    : phase==='holding' ? '保留画面'
    : phase==='hold-paused' ? '继续收起'
    : phase==='paused' ? '继续播放'
    : phase==='error' ? '重试声音'
    : phase==='ready' && image==='loading' ? '先听声音' : '播放声音'
  const status = phase==='ready' ? image==='loading' ? '插画正在载入' : '可以播放声音' : statusText[phase]
  return <dialog className="drama-dialog" ref={dialogRef} aria-labelledby="drama-title" data-phase={phase}
    onCancel={event=>{event.preventDefault();playback.close()}}>
    <header className="drama-titlebar">
      <div><p className="eyebrow">{chapterTitle} · {speakerName} <span className="drama-credit-tag">AI声音与插画演绎</span></p>
        <h2 id="drama-title">{clip.title}</h2></div>
      <button className="icon-button" type="button" ref={closeRef} aria-label="关闭演绎" onClick={playback.close}><Icon name="close"/></button>
    </header>
    <div className="drama-art" data-image={image}>
      {image!=='error' && <img key={view.id} src={assetUrl(clip.illustration.path)} alt={clip.illustration.alt} width={1280} height={720}
        decoding="async" onLoad={()=>setImage('ready')} onError={()=>setImage('error')}/>}
      {image==='error' && <p>插画暂未载入</p>}
      <CreatorCredit art onOpen={()=>{if(playing || phase==='holding') playback.toggle()}}/>
    </div>
    <div className="drama-sheet">
      {'attribution' in clip && <p className="drama-context">{dramaNoteId(clip) ? '裴注引文' : '正文引文'} · {clip.attribution.label}</p>}
      <blockquote className="drama-quote">{clip.quote.text}</blockquote>
      {'attribution' in clip && clip.attribution.note && <p className="drama-context">文献说明：{clip.attribution.note}</p>}
      <div className="drama-controls">
        <div className="drama-meter">
          <progress aria-label="声音播放进度" max={duration} value={Math.min(time,duration)}/>
          <span aria-hidden="true">{timestamp(time)} / {timestamp(duration)}</span>
        </div>
        <div className="drama-actions">
          <button type="button" className="quiet-button drama-primary" disabled={phase==='fading'} onClick={playback.toggle}>
            <Icon name={playing?'pause':'play'}/>{action}
          </button>
          <button type="button" className="quiet-button" onClick={playback.replay}><Icon name="replay"/>重播</button>
          <span className="drama-status" role="status">{status}</span>
        </div>
      </div>
      <p className="drama-context">{clip.contextNote}</p>
      <p className="drama-disclaimer">{disclaimer}</p>
      <details className="drama-provenance"><summary>原文出处</summary>
        {clip.sourceIds.map(id=>{const source=sources.get(id);return source ? <p key={id}><SourceLink source={source}/></p> : null})}
      </details>
    </div>
  </dialog>
}
