import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Chapter, Scene, Source } from '../types'
import { Icon } from './Icons'
import { SourceLink } from './Sources'
import { PortraitImage } from './ReadingAids'
import { portraitForScene } from '../reading-aids'
import type { Portrait, PortraitStage } from '../reading-aids'
import { atlasKindLabels } from '../historical-atlas'
import type { AtlasFeature, AtlasManifest } from '../historical-atlas'

function ReaderDialog({title,kicker,close,children}:{title:string;kicker:string;close:()=>void;children:ReactNode}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current!
    dialog.showModal()
    dialog.querySelector<HTMLInputElement>('input[type="search"]')?.focus()
    return () => dialog.close()
  }, [])
  return <dialog ref={ref} className="source-dialog reader-dialog" aria-labelledby="reader-dialog-title"
    onCancel={event=>{event.preventDefault();close()}}
    onClick={event=>{if (event.target===event.currentTarget) close()}}>
    <div className="source-sheet">
      <header className="source-title">
        <div><p className="eyebrow">{kicker}</p><h2 id="reader-dialog-title">{title}</h2></div>
        <button type="button" className="icon-button" aria-label="关闭" onClick={close}><Icon name="close"/></button>
      </header>
      {children}
    </div>
  </dialog>
}

export function AtlasFeatureDialog({feature,manifest,close}:{feature:AtlasFeature;manifest:AtlasManifest;close:()=>void}) {
  const {name,kind,basis,precision,periodLabel,note,parentName,seatFor,faction,sourceIds} = feature.properties
  const precisionText = {'schematic-area':'概略范围','approximate-point':'约略位置','schematic-line':'示意线位'}[precision]
  return <ReaderDialog title={name} kicker={basis==='modern-reference'?'现代地理参考':atlasKindLabels[kind]} close={close}>
    <p>{periodLabel} · {precisionText}</p>
    {[parentName,seatFor,faction].some(Boolean) && <p>{[parentName,seatFor,faction].filter(Boolean).join(' · ')}</p>}
    <p>{note}</p>
    <h3>资料与出处</h3>
    <ul className="bibliography">{manifest.sources.filter(source=>sourceIds.includes(source.id)).map(source=><li key={source.id}>
      <a href={source.url} target="_blank" rel="noreferrer">{source.title}</a>
      {source.note && <p>{source.note}</p>}
      <p className="source-locator">{source.license}</p>
    </li>)}</ul>
  </ReaderDialog>
}

export function PersonDialog({person,scene,portrait,sources,close}:{person:Chapter['persons'][number];scene:Scene;portrait?:Portrait;
  sources:Map<string,Source>;close:()=>void}) {
  const suggested = portrait && portraitForScene(portrait,scene)
  const [chosen,setChosen] = useState<PortraitStage['id']|null>(null)
  const stage = portrait?.stages.find(item=>item.id===(chosen ?? suggested?.id ?? 'middle'))
  return <ReaderDialog title={person.name} kicker="本篇人物" close={close}>
    {portrait && stage && <figure className="person-portrait">
      <PortraitImage key={stage.id} stage={stage}/>
      <figcaption>
        <p>{portrait.disclaimer}</p>
        <p>{chosen || suggested ? stage.label : '人物示意'}{!chosen && suggested && scene.time.certainty==='inferred' ? ' · 按本段推定纪年' : ''}</p>
        <div className="portrait-stages" role="group" aria-label="肖像时期">
          {portrait.stages.map(item=><button type="button" className="person-chip" key={item.id}
            aria-pressed={stage.id===item.id} onClick={()=>setChosen(item.id)}>{item.label}</button>)}
        </div>
      </figcaption>
    </figure>}
    {person.courtesyName && <p className="person-courtesy">字 {person.courtesyName}</p>}
    <p className="person-intro">{person.description}</p>
    <p className="location-sources">出处：{person.sourceIds.map(id=><SourceLink key={id} source={sources.get(id)!}/>)}</p>
  </ReaderDialog>
}

type Entry = {scene:Scene;index:number;search:string}

export function sectionKey(scene:Scene) {
  return scene.sectionTitle ? JSON.stringify(scene.sectionPath ?? [scene.sectionTitle]) : ''
}

export function sectionLabel(scene:Scene) {
  return scene.sectionTitle ? [...(scene.sectionPath?.slice(0,-1) ?? []),scene.sectionTitle].join(' · ') : ''
}

export function SceneDirectory({chapter,activeId,select,close}:{
  chapter:Chapter;activeId:string;select:(id:string)=>void;close:()=>void
}) {
  const [query,setQuery] = useState('')
  const entries = useMemo(() => {
    const people = new Map(chapter.persons.map(item=>[item.id,item.name]))
    const places = new Map(chapter.places.map(item=>[item.id,`${item.name} ${item.modernName}`]))
    return chapter.scenes.map((scene,index) => ({
      scene,index,
      search:[scene.title,scene.sectionTitle,...(scene.sectionPath ?? []),scene.time.era,scene.time.label,scene.originalText,scene.summary,
        ...scene.personIds.map(id=>people.get(id)),...scene.placeIds.map(id=>places.get(id)),String(index+1)]
        .join(' ').toLocaleLowerCase(),
    }))
  }, [chapter])
  const key = query.trim().toLocaleLowerCase()
  const visible = key ? entries.filter(item=>item.search.includes(key)) : entries
  const hasSections = chapter.scenes.some(scene=>scene.sectionTitle)
  const groups:{key:string;label:string;entries:Entry[]}[] = []
  for (const entry of visible) {
    const label = sectionLabel(entry.scene) || entry.scene.time.era
    const key = sectionKey(entry.scene) || label
    const group = groups.at(-1)
    if (group?.key===key) group.entries.push(entry)
    else groups.push({key,label,entries:[entry]})
  }
  return <ReaderDialog title="篇内目录" kicker={chapter.meta.workTitle} close={close}>
    <label className="directory-search">检索段落
      <input type="search" autoFocus value={query} placeholder={hasSections?'分节、段名、人名或原文':'段名、人名、地名或原文'}
        onChange={event=>setQuery(event.target.value)}/>
    </label>
    <p className="directory-count" role="status">显示 {visible.length} / {entries.length} 段</p>
    <div className="directory-groups">
      {groups.map((group,index) => <section key={index} aria-label={group.label}>
        <h3>{group.label}</h3>
        <ol>{group.entries.map(({scene,index:position}) => <li key={scene.id}>
          <button type="button" aria-current={scene.id===activeId?'step':undefined} onClick={()=>select(scene.id)}>
            <i>{String(position+1).padStart(2,'0')}</i><strong>{scene.title}</strong><small>{scene.time.label}</small>
          </button>
        </li>)}</ol>
      </section>)}
      {!visible.length && <p className="directory-empty">没有匹配的段落。</p>}
    </div>
  </ReaderDialog>
}
