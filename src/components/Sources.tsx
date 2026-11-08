import { useEffect, useRef } from 'react'
import { resolveScene } from '../engine'
import { Icon } from './Icons'
import type { Chapter, Scene, Source } from '../types'

export function SourceLink({source}: {source:Source}) {
  const href = /^https?:\/\//.test(source.locator) ? source.locator : undefined
  return href ? <a href={href} target="_blank" rel="noreferrer">{source.title}</a> : <span>{source.title}</span>
}

export function Sources({chapter, scene, close}: {chapter:Chapter; scene:Scene; close:() => void}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current!
    dialog.showModal()
    return () => dialog.close()
  }, [])
  const {mapProfile} = resolveScene(chapter,{sceneId:scene.id})
  const source = chapter.sources.find(s => s.id === scene.provenance.sourceId)!
  return <dialog ref={ref} className="source-dialog" aria-labelledby="sources-title"
    onCancel={event => {event.preventDefault(); close()}}
    onClick={event => {if(event.target === event.currentTarget) close()}}>
    <div className="source-sheet">
      <div className="source-title"><div><p className="eyebrow">{chapter.meta.workTitle} · {chapter.meta.coverageLabel}</p><h2 id="sources-title">版本与出处</h2></div>
        <button className="icon-button" aria-label="关闭出处" onClick={close}><Icon name="close"/></button></div>
      <p>{chapter.editorialNote}</p>
      <section className="source-current">
        <h3>本段正文 · {scene.title}</h3>
        <p><SourceLink source={source}/></p>
        <p className="source-locator">{scene.provenance.chapterPath} · {scene.provenance.sourceTag==='dd'
          ? `原卷评语 dd 节点 · 虚拟索引 ${scene.provenance.paragraphIndex}`
          : `段落索引 ${scene.provenance.paragraphIndex}（从 0 起）`}</p>
        <p>摘录自「{scene.provenance.excerptStart}」至「{scene.provenance.excerptEnd}」。</p>
        {scene.provenance.note && <p>{scene.provenance.note}</p>}
      </section>
      <h3>史料与现代整理</h3>
      <ul className="bibliography">{chapter.sources.map(item => <li key={item.id}><SourceLink source={item}/>
        {item.note && <p>{item.note}</p>}
        {item.license && <p className="source-locator">{item.license}</p>}
      </li>)}</ul>
      <h3>地形与现代对照</h3>
      <p>{mapProfile.label} · {mapProfile.attribution}</p>
      <p>{chapter.historicalRiver.explanation}</p>
    </div>
  </dialog>
}
