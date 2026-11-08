import { Icon } from './Icons'
import { SourceLink } from './Sources'
import type { Note, Scene, Source } from '../types'
import type { Pronunciation } from '../reading-aids'
import { PronouncedText } from './ReadingAids'
import type { RefObject } from 'react'
import { dramaNoteKey } from '../drama'
import type { DramaClip } from '../drama'
import type { DramaActions } from './DramaPlayer'
import { DramaEntries } from './DramaEntries'

type Props = {
  scene: Scene
  notes: Map<string, Note>
  sources: Map<string, Source>
  translation: boolean
  setTranslation: (open:boolean) => void
  pei: boolean
  setPei: (open:boolean) => void
  expandedNotes: Set<string>
  toggleNote: (id:string) => void
  pronunciations?:Map<string,Pronunciation[]>
  dramaIndex?:Map<string,DramaClip[]>
  dramaPlayer?:RefObject<DramaActions|null>
  people?:Map<string,{name:string}>
}

export function AnnotationPanel({scene, notes, sources, translation, setTranslation, pei, setPei, expandedNotes, toggleNote, pronunciations, dramaIndex, dramaPlayer, people}: Props) {
  return <div className="annotation-panel">
    <div className="annotation-controls" aria-label="本段注释">
      <button className="annotation-button translation-button" aria-expanded={translation} aria-controls={`translation-${scene.id}`} onClick={() => setTranslation(!translation)}>
        <Icon name="book"/>白话义注<Icon name="chevron" className="toggle-arrow"/>
      </button>
      {scene.noteIds.length > 0 ? <button className="annotation-button pei-button" aria-expanded={pei} aria-controls={`pei-${scene.id}`} onClick={() => setPei(!pei)}>
        <Icon name="scroll"/>裴松之注<span className="annotation-count">{scene.noteIds.length}</span><Icon name="chevron" className="toggle-arrow"/>
      </button> : <span className="no-annotation"><Icon name="scroll"/>本片段无裴注</span>}
    </div>
    <section hidden={!translation} className="translation annotation-body" id={`translation-${scene.id}`} aria-label="白话义注">
      {translation && <>
        <p className="eyebrow">白话义注 · 本项目整理</p>
        <p className="translation-content">{scene.translation}</p>
        {scene.glosses?.length ? <dl className="glosses">{scene.glosses.map(({term, explanation}) => <div key={term}><dt>{term}</dt><dd>{explanation}</dd></div>)}</dl> : null}
      </>}
    </section>
    {scene.noteIds.length > 0 && <section hidden={!pei} className="pei annotation-body" id={`pei-${scene.id}`} aria-label="裴松之注">
      <p className="eyebrow">裴松之注 · 原文</p>
      {pei && scene.noteIds.map((noteId,i) => {
        const note = notes.get(noteId)!
        const anchorId = `pei-anchor-${scene.id}-${noteId}`
        return <div className="pei-item" key={noteId}>
          <button id={anchorId} className="pei-anchor" onClick={() => toggleNote(noteId)} aria-expanded={expandedNotes.has(noteId)} aria-controls={`pei-body-${scene.id}-${noteId}`}>
            <span className="annotation-count">{String(i+1).padStart(2,'0')}</span>
            <span>「{note.anchorText}」</span>
            <Icon name="chevron" className="toggle-arrow"/>
          </button>
          <div className="pei-text" id={`pei-body-${scene.id}-${noteId}`} hidden={!expandedNotes.has(noteId)}>
            {expandedNotes.has(noteId) && <>
            {note.sourceTitles.length > 0 && <p className="pei-source">引书：{note.sourceTitles.map(title => `《${title.replace(/^《|》$/g, '')}》`).join('、')}</p>}
            <blockquote data-note-original={note.id}><PronouncedText text={note.original} entries={pronunciations?.get(note.id)}/></blockquote>
            {dramaPlayer && people && <DramaEntries clips={dramaIndex?.get(dramaNoteKey(note.id))?.filter(clip=>clip.sceneId===scene.id)} people={people} player={dramaPlayer}/>}
            {note.variants?.length ? <p className="pei-source">底本异文：{note.variants.map(variant =>
              `「${variant.baseText}」${variant.reading}`).join('；')}</p> : null}
            {note.summary && <p className="pei-summary"><b>整理提示</b>　{note.summary}</p>}
            <p className="source-locator">底本：{note.sourceIds.map(id => <SourceLink key={id} source={sources.get(id)!}/>)}</p>
            {note.provenance?.paragraphStart!==undefined && note.provenance.paragraphEnd!==undefined &&
              (note.provenance.paragraphStart!==note.provenance.paragraphEnd
                ? <p className="source-locator">跨段裴注 · 原卷段落索引 {note.provenance.paragraphStart}–{note.provenance.paragraphEnd}</p>
                : note.provenance.sourceTag==='dd'
                  ? <p className="source-locator">原卷评语 dd 节点 · 虚拟索引 {note.provenance.paragraphStart}</p>
                  : note.provenance.paragraphStart!==note.provenance.paragraphIndex &&
                    <p className="source-locator">原卷裴注位置 · 段落索引 {note.provenance.paragraphStart}</p>)}
            </>}
          </div>
        </div>
      })}
    </section>}
  </div>
}
