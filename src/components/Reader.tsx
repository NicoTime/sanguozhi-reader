import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ClipboardEvent, MouseEvent } from 'react'
import { sceneYear } from '../engine'
import { readProgress, saveProgress } from '../progress'
import { prefersStill, relatedScenes } from '../geo'
import type { Chapter, Scene } from '../types'
import { AnnotationPanel } from './AnnotationPanel'
import { Icon } from './Icons'
import { LocationCard } from './LocationCard'
import { MapPanel } from './MapPanel'
import { Sources } from './Sources'
import { PersonDialog, SceneDirectory, sectionKey, sectionLabel } from './ReaderDialogs'
import { PortraitImage, PronouncedText } from './ReadingAids'
import { indexPronunciations, portraitForScene, portraitSchema, pronunciationSchema } from '../reading-aids'
import type { Portrait, Pronunciations } from '../reading-aids'
import { useReaderResource } from '../use-reader-resource'
import { getDramaRegistration, dramaSchema, indexDrama } from '../drama'
import type { DramaClip } from '../drama'
import { DramaPlayer } from './DramaPlayer'
import type { DramaActions } from './DramaPlayer'
import { DramaEntries } from './DramaEntries'
import { CreatorCredit } from './CreatorCredit'

const narrow = '(max-width: 860px)'
const browserStorage = {getItem:(key:string)=>localStorage.getItem(key),setItem:(key:string,value:string)=>localStorage.setItem(key,value)}
const numbered = (n:number) => String(n+1).padStart(2,'0')

function copyOriginal(event:ClipboardEvent<HTMLElement>) {
  const selection = window.getSelection()
  if (!selection?.rangeCount || selection.isCollapsed) return
  const range = selection.getRangeAt(0)
  const parent = range.commonAncestorContainer
  const element = parent instanceof Element ? parent : parent.parentElement
  if (!element?.closest('[data-scene-original],[data-note-original]')) return
  const copy = range.cloneContents()
  copy.querySelectorAll('rt,rp,.inline-note').forEach(node=>node.remove())
  event.clipboardData.setData('text/plain',copy.textContent ?? '')
  event.preventDefault()
}

export function Reader({chapter}: {chapter:Chapter}) {
  const {scenes,meta} = chapter
  const [activeId, setActiveId] = useState(() => readProgress(chapter,browserStorage))
  const [selection, setSelection] = useState<{id:string; fromText:boolean; serial:number}|null>(null)
  const [mobileMapOpen, setMobileMapOpen] = useState(true)
  const [sourceScene, setSourceScene] = useState<Scene|null>(null)
  const sourceTrigger = useRef<HTMLButtonElement|null>(null)
  const [directoryOpen,setDirectoryOpen] = useState(false)
  const directoryTrigger = useRef<HTMLButtonElement|null>(null)
  const [personSelection,setPersonSelection] = useState<{id:string;scene:Scene}|null>(null)
  const [showPronunciation,setShowPronunciation] = useState(()=>localStorage.getItem('sanguozhi:pronunciation')!=='off')
  const [showPortraits,setShowPortraits] = useState(()=>localStorage.getItem('sanguozhi:portraits')!=='off')
  const pronunciationResource = useReaderResource('/data/pronunciation-v7.json',pronunciationSchema.parse)
  const portraitResource = useReaderResource('/portraits/manifest.json',portraitSchema.parse)
  const [dramaRequest,setDramaRequest] = useState(0)
  const dramaRegistration=getDramaRegistration(chapter.id)
  const dramaResource = useReaderResource(dramaRegistration?.manifestPath ?? null,dramaSchema.parse,dramaRequest)
  const dramaPlayer = useRef<DramaActions>(null)
  const dramaIndex = useMemo(()=>{
    if (dramaResource.state!=='ready') return dramaResource
    try {return {state:'ready' as const,clips:indexDrama(dramaResource.data,chapter)}}
    catch (error) {return {state:'error' as const,error}}
  },[dramaResource,chapter])
  const dramaClips = dramaIndex.state==='ready' ? dramaIndex.clips : undefined
  useEffect(()=>{
    if (dramaIndex.state==='error') console.error('声音与插画资源校验失败',dramaIndex.error)
  },[dramaIndex])
  const pronunciations = useMemo(()=>{
    if (pronunciationResource.state!=='ready') return undefined
    try { return indexPronunciations(pronunciationResource.data,chapter) } catch { return null }
  },[pronunciationResource,chapter])
  const portraits = useMemo(()=>portraitResource.state==='ready'
    ? new Map(portraitResource.data.persons.map(item=>[item.personId,item])) : undefined,[portraitResource])
  const personTrigger = useRef<HTMLButtonElement|null>(null)
  const workspace = useRef<HTMLDivElement>(null)
  const reading = useRef<HTMLElement>(null)
  const navigation = useRef<HTMLElement>(null)
  const mapPanel = useRef<HTMLElement>(null)
  const headings = useRef(new Map<string, HTMLElement>())
  const active = useRef(activeId)
  const placeSerial = useRef(0)
  const mobile = useRef(matchMedia(narrow).matches)
  const index = scenes.findIndex(scene => scene.id===activeId)
  const scene = scenes[index]
  const markCount = Math.min(12,scenes.length)
  const {notes, places, people, sources} = useMemo(() => ({
    notes:new Map(chapter.notes.map(item => [item.id,item])),
    places:new Map(chapter.places.map(item => [item.id,item])),
    people:new Map(chapter.persons.map(item => [item.id,item])),
    sources:new Map(chapter.sources.map(item => [item.id,item])),
  }), [chapter])
  const currentPerson = personSelection ? people.get(personSelection.id) : undefined
  const selectedPlace = selection ? places.get(selection.id) ?? null : null

  function scrollRoot() { return mobile.current ? workspace.current : reading.current }

  function align(target:HTMLElement, padding:number, smooth = false) {
    const root = scrollRoot()
    if (!root) return
    const offset = target.getBoundingClientRect().top - root.getBoundingClientRect().top
    root.scrollTo({top:root.scrollTop+offset-padding, behavior:smooth && !prefersStill() ? 'smooth' : 'instant'})
  }

  function activate(id:string) {
    if (active.current===id) return
    active.current = id
    setActiveId(id)
    setSelection(null)
    setPersonSelection(null)
  }

  function go(id:string, focus = false) {
    const heading = headings.current.get(id)
    if (!heading) return
    activate(id)
    align(heading, mobile.current ? 22 : 42)
    if (focus) heading.focus({preventScroll:true})
  }

  useLayoutEffect(() => {
    const query = matchMedia(narrow)
    const resize = () => {mobile.current=query.matches; go(active.current)}
    const restore = active.current
    if (restore!==scenes[0].id) go(restore)
    query.addEventListener('change', resize)
    return () => query.removeEventListener('change', resize)
  }, [chapter])

  useEffect(() => {
    const roots = [workspace.current,reading.current]
    let frame = 0
    const handleScroll = (event:Event) => {
      if (event.currentTarget!==scrollRoot() || frame) return
      frame = requestAnimationFrame(() => {
        frame=0
        const root = scrollRoot()
        if (!root) return
        const bounds = root.getBoundingClientRect()
        const threshold = bounds.top + Math.min(128, Math.max(70,bounds.height*0.19))
        // Headings are in document order. Seek the last heading above the
        // reading line without measuring every preceding paragraph.
        let low=0, high=scenes.length
        while (low<high) {
          const middle=(low+high)>>>1
          const heading = headings.current.get(scenes[middle].id)
          if (heading && heading.getBoundingClientRect().top<=threshold) low=middle+1
          else high=middle
        }
        if (low>0) activate(scenes[low-1].id)
      })
    }
    roots.forEach(root => root?.addEventListener('scroll',handleScroll,{passive:true}))
    return () => {
      cancelAnimationFrame(frame)
      roots.forEach(root => root?.removeEventListener('scroll',handleScroll))
    }
  }, [chapter])

  useEffect(() => {
    saveProgress(chapter,activeId,browserStorage)
    const nav = navigation.current
    const item = nav?.querySelector<HTMLElement>('[aria-current="step"]')
    if (!nav || !item) return
    const row = nav.getBoundingClientRect()
    const box = item.getBoundingClientRect()
    if (box.left<row.left || box.right>row.right) nav.scrollLeft += box.left-row.left-12
  }, [activeId])

  function placeClick(id:string, fromText:boolean) {
    placeSerial.current += 1
    setSelection({id,fromText,serial:placeSerial.current})
  }

  function showMap() {
    setMobileMapOpen(true)
    setSelection(previous => previous && {...previous,fromText:false})
    requestAnimationFrame(() => {
      if (!mapPanel.current) return
      align(mapPanel.current, 0)
      mapPanel.current.focus({preventScroll:true})
    })
  }

  function openPerson(id:string,trigger:HTMLButtonElement,scene:Scene) {
    personTrigger.current=trigger
    setPersonSelection({id,scene})
  }

  function closePerson() {
    setPersonSelection(null)
    requestAnimationFrame(()=>personTrigger.current?.focus({preventScroll:true}))
  }

  function closeDirectory() {
    setDirectoryOpen(false)
    requestAnimationFrame(()=>directoryTrigger.current?.focus({preventScroll:true}))
  }

  function closeSources() {
    setSourceScene(null)
    requestAnimationFrame(() => sourceTrigger.current?.focus({preventScroll:true}))
  }

  return <div className="reader-shell">
    <button type="button" className="skip" onClick={() => {
      if (mobile.current && reading.current) align(reading.current,0)
      reading.current?.focus({preventScroll:true})
    }}>跳至原文</button>
    <header className="masthead">
      <div className="imprint">
        <div className="seal" aria-hidden="true">{meta.seal}</div>
        <div><p className="series">三国志 · 原文伴读</p><p className="imprint-title">{meta.workTitle}<span className="middle-dot">·</span><span className="imprint-protagonist">{meta.protagonist}</span></p><CreatorCredit/></div>
      </div>
      <div className="masthead-right">
        <div className="progress" aria-label={`阅读进度：第 ${index+1} 段，共 ${scenes.length} 段`}>
          <span className="progress-text">阅读进度</span>
          <strong>{numbered(index)}<span> / {numbered(scenes.length-1)}</span></strong>
          <div className="progress-marks" aria-hidden="true">{Array.from({length:markCount},(_,i) =>
            <i key={i} data-reached={i<Math.ceil((index+1)/scenes.length*markCount)}/>)}</div>
        </div>
        <a className="quiet-button catalog-return" href="#/" aria-label="返回目录"><Icon name="arrow"/><span>目录</span></a>
        <button className="quiet-button sources-button" onClick={event => {sourceTrigger.current=event.currentTarget;setSourceScene(scene)}}>
          <Icon name="book"/><span>版本与出处</span>
        </button>
      </div>
    </header>

    <div className="events">
      {scenes.length>12 || scenes.some(item=>item.sectionTitle)
        ? <button type="button" className="events-label directory-open" aria-haspopup="dialog"
          onClick={event=>{directoryTrigger.current=event.currentTarget;setDirectoryOpen(true)}}><Icon name="scroll"/>篇内目录</button>
        : <div className="events-label"><span>段落次序</span><small>序次 · 阅读目录</small></div>}
      <nav ref={navigation} className="events-scroll" aria-label="事件导航">
        {scenes.map((item,order) => <button key={item.id} aria-current={activeId===item.id ? 'step' : undefined} onClick={() => go(item.id,true)}>
          <span className="event-number">{numbered(order)}</span><span className="event-title">{item.title}</span>
        </button>)}
      </nav>
    </div>

    <div className="workspace" ref={workspace}>
      <MapPanel panelRef={mapPanel} chapter={chapter} scene={scene} places={places} sources={sources}
        selected={selectedPlace} cameraRequest={selection?.fromText ? selection.serial : null}
        mobileOpen={mobileMapOpen} setMobileOpen={setMobileMapOpen}
        onSelect={id => placeClick(id,false)} onClose={() => setSelection(null)} onNavigate={id => go(id,true)}/>

      <main className="reading-scroll" id="reading-pane" tabIndex={-1} ref={reading} onCopy={copyOriginal}>
        <div className="paper">
          <div className="chapter-opener">
            <div className="chapter-issue"><span className="chapter-rule"/> 三国志{meta.volume} <span>／</span> {meta.division}</div>
            <h1>{meta.displayTitle}<span className="chapter-seal" aria-hidden="true">{meta.coverage==='complete' ? '全篇' : '样章'}</span></h1>
            <p>陈寿撰　裴松之注 <span className="middle-dot">·</span>《{meta.workTitle}》 · {meta.coverageLabel}</p>
            <div className="chapter-period">{meta.periodLabel}</div>
            <div className="reading-preferences" role="group" aria-label="伴读辅助">
              <button type="button" className="quiet-button" aria-pressed={showPronunciation} onClick={()=>{
                setShowPronunciation(!showPronunciation)
                localStorage.setItem('sanguozhi:pronunciation',showPronunciation?'off':'on')
              }}>生僻字注音</button>
              <button type="button" className="quiet-button" aria-pressed={showPortraits} onClick={()=>{
                setShowPortraits(!showPortraits)
                localStorage.setItem('sanguozhi:portraits',showPortraits?'off':'on')
              }}>人物形象</button>
              {showPronunciation && (pronunciationResource.state==='error' || pronunciations===null) &&
                <span role="status">本篇注音暂不可用</span>}
              {dramaRegistration && dramaIndex.state==='error' && <>
                <span role="status">声音与插画暂不可用</span>
                <button type="button" className="quiet-button" onClick={()=>setDramaRequest(value=>value+1)}>重新载入</button>
              </>}
            </div>
          </div>
          <div className="scene-sequence">
            {scenes.map((item,i) => <ReadingScene key={item.id} scene={item} order={i} active={item.id===activeId}
              showSection={Boolean(item.sectionTitle) && (i===0 || sectionKey(item)!==sectionKey(scenes[i-1]))}
              register={node => {if(node) headings.current.set(item.id,node); else headings.current.delete(item.id)}}
              notes={notes} places={places} people={people} sources={sources}
              pronunciations={showPronunciation ? pronunciations ?? undefined : undefined}
              portraits={showPortraits ? portraits : undefined}
              dramaIndex={dramaClips} dramaPlayer={dramaPlayer}
              selectedPlace={selectedPlace?.id} openPerson={(id,trigger)=>openPerson(id,trigger,item)}
              selectPlace={id => placeClick(id,true)} showMap={() => {activate(item.id);showMap()}}
              focusNote={target => {
                const root = scrollRoot()
                if (!root) return
                const box = target.getBoundingClientRect(), viewport = root.getBoundingClientRect()
                if (box.top < viewport.top+16 || box.bottom>viewport.bottom-32) align(target, Math.min(110,viewport.height*0.22))
                target.focus({preventScroll:true})
              }}
              showSources={trigger => {sourceTrigger.current=trigger;setSourceScene(item)}}/>)}
          </div>
          <footer className="end-mark"><span/>{meta.coverageLabel} · 完<span/></footer>
        </div>
      </main>
    </div>
    {selection?.fromText && selectedPlace && <div className="mobile-place">
      <LocationCard place={selectedPlace} sources={sources} activeId={activeId} related={relatedScenes(chapter,selectedPlace.id)}
        onClose={() => setSelection(null)} onNavigate={id => {setSelection(null);go(id,true)}} onShowMap={showMap}/>
    </div>}
    {sourceScene && <Sources chapter={chapter} scene={sourceScene} close={closeSources}/>}
    {currentPerson && personSelection && <PersonDialog key={currentPerson.id} person={currentPerson} scene={personSelection.scene}
      portrait={showPortraits ? portraits?.get(currentPerson.id) : undefined} sources={sources} close={closePerson}/>}
    {directoryOpen && <SceneDirectory chapter={chapter} activeId={activeId} close={closeDirectory}
      select={id=>{setDirectoryOpen(false);requestAnimationFrame(()=>go(id,true))}}/>}
    {dramaResource.state==='ready' && dramaClips && <DramaPlayer key={chapter.id} ref={dramaPlayer} bundle={dramaResource.data}
      chapterTitle={chapter.meta.workTitle} people={people} sources={sources}/>}
  </div>
}

type ReadingProps = {
  scene:Scene; order:number; active:boolean; showSection:boolean; register:(node:HTMLElement|null)=>void
  notes:Map<string,Chapter['notes'][number]>; places:Map<string,Chapter['places'][number]>
  people:Map<string,Chapter['persons'][number]>; sources:Map<string,Chapter['sources'][number]>
  pronunciations?:Pronunciations; portraits?:Map<string,Portrait>
  dramaIndex?:Map<string,DramaClip[]>; dramaPlayer:React.RefObject<DramaActions|null>
  selectedPlace?:string; openPerson:(id:string,trigger:HTMLButtonElement)=>void
  selectPlace:(id:string)=>void; showMap:()=>void; focusNote:(target:HTMLElement)=>void
  showSources:(trigger:HTMLButtonElement)=>void
}
function ReadingScene({scene,order,active,showSection,register,notes,places,people,sources,pronunciations,portraits,dramaIndex,dramaPlayer,
  selectedPlace,openPerson,selectPlace,showMap,focusNote,showSources}:ReadingProps) {
  const [translation, setTranslation] = useState(false)
  const [pei, setPeiOpen] = useState(false)
  const [expandedNotes, setExpandedNotes] = useState(() => new Set<string>())
  const kind = scene.kind ?? (scene.battlePhases?.length ? 'battle' : 'narrative')
  const kindLabels = {narrative:'纪传叙事',battle:'战事',journey:'行程',document:'诏令与文书'}
  const showContext = kind!=='battle' && (scene.personIds.length>0 || scene.placeIds.length>0)
  const noteNumbers = new Map(scene.noteIds.map((noteId,i) => [noteId,i+1]))
  const scenePronunciation = pronunciations?.scene.get(scene.id)
  let partOffset = 0
  function renderPerson(id:string) {
    const portrait = active ? portraits?.get(id) : undefined
    const stage = portrait && (portraitForScene(portrait,scene) ?? portrait.stages.find(item=>item.id==='middle'))
    const open = (event:MouseEvent<HTMLButtonElement>)=>openPerson(id,event.currentTarget)
    return <button type="button" className="person-chip" aria-haspopup="dialog" key={id} onClick={open}
      aria-label={people.get(id)!.name} aria-description={stage ? portrait?.disclaimer : undefined}>
      {stage && <PortraitImage key={stage.id} stage={stage} thumbnail/>}{people.get(id)!.name}
      {stage && <small className="portrait-chip-label">艺术想象</small>}
    </button>
  }
  function setPei(open:boolean) {
    setPeiOpen(open)
    if (open && !expandedNotes.size && scene.noteIds.length) setExpandedNotes(new Set([scene.noteIds[0]]))
  }
  function toggleNote(noteId:string) {
    setExpandedNotes(previous => {
      const next = new Set(previous)
      if (next.has(noteId)) next.delete(noteId)
      else next.add(noteId)
      return next
    })
  }
  function openNote(noteId:string) {
    setPeiOpen(true)
    setExpandedNotes(previous => new Set([...previous,noteId]))
    requestAnimationFrame(() => {
      const target = document.getElementById(`pei-anchor-${scene.id}-${noteId}`)
      if (target) focusNote(target)
    })
  }
  return <article className="reading-scene" aria-labelledby={`title-${scene.id}`} data-active={active}>
    <header className="scene-heading" tabIndex={-1} ref={register}>
      {showSection && <p className="scene-section">{sectionLabel(scene)}</p>}
      <div className="scene-kicker"><span>其 {numbered(order)}</span><span className="scene-divider"/><time>{[...new Set([scene.time.era,scene.time.label])].join(' · ')}</time>
        <span className="western-year">{sceneYear(scene.time)}</span>
        {scene.kind && <span className="scene-kind" data-kind={kind}>{kindLabels[kind]}</span>}
      </div>
      <h2 id={`title-${scene.id}`}>{scene.title}</h2>
      <p className="scene-summary">{scene.summary}</p>
      <button type="button" className="text-button scene-show-map" onClick={showMap}><Icon name="compass"/>本段地图</button>
    </header>
    {showContext && <div className="scene-context">
      {scene.personIds.length>0 && <div className="people-row"><span><Icon name="people"/>相关人物</span>
        {scene.personIds.map(renderPerson)}
      </div>}
      {scene.placeIds.length>0 && <div className="people-row"><span><Icon name="pin"/>文中地点</span>
        {scene.placeIds.map(id=><button type="button" className="person-chip context-place" key={id}
          aria-pressed={selectedPlace===id} onClick={()=>selectPlace(id)}>{places.get(id)!.name}</button>)}
      </div>}
    </div>}
    <div className="reading-text">
      <div className="original-head"><span>陈寿原文</span><i/><span>标记的人名、地名可点按</span></div>
      <blockquote className="original">
        <p data-scene-original={scene.id}>{scene.parts.map((part,i) => {
          const content = <PronouncedText text={part.text} entries={scenePronunciation} offset={partOffset}/>
          partOffset += Array.from(part.text).length
          return <Fragment key={i}>
          {part.placeId ? <button className="inline-place" type="button" aria-pressed={selectedPlace===part.placeId}
            aria-label={part.text} title={`定位地名：${places.get(part.placeId)!.name}`} onClick={() => selectPlace(part.placeId!)}>{content}</button> : part.personId
            ? <button className="inline-person" type="button" aria-haspopup="dialog" title={`人物：${people.get(part.personId)!.name}`}
              aria-label={part.text} onClick={event=>openPerson(part.personId!,event.currentTarget)}>{content}</button> : content}
          {part.noteIds?.map(id => <button key={id} className="inline-note" type="button"
            aria-label={`查看裴注 ${noteNumbers.get(id)}：${notes.get(id)!.anchorText}`} onClick={() => openNote(id)}>{noteNumbers.get(id)}</button>)}
        </Fragment>})}</p>
      </blockquote>
      <DramaEntries clips={dramaIndex?.get(scene.id)} people={people} player={dramaPlayer}/>
      <AnnotationPanel scene={scene} notes={notes} sources={sources} translation={translation} setTranslation={setTranslation}
        pei={pei} setPei={setPei} expandedNotes={expandedNotes} toggleNote={toggleNote} pronunciations={pronunciations?.note}
        dramaIndex={dramaIndex} dramaPlayer={dramaPlayer} people={people}/>
    </div>
    <div className="reading-meta">
      {!showContext && scene.personIds.length>0 && <div className="people-row"><span><Icon name="people"/>相关人物</span>
        {scene.personIds.map(renderPerson)}
      </div>}
      <button type="button" className="text-button" onClick={event => showSources(event.currentTarget)}>原文出处<Icon name="arrow"/></button>
    </div>
  </article>
}
