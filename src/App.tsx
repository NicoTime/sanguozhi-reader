import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { catalogSchema, chapterHref, fetchChapter, parseRoute, publicUrl } from './catalog'
import type { Catalog, CatalogEntry } from './catalog'
import { Icon } from './components/Icons'
import { Reader } from './components/Reader'
import { CreatorCredit } from './components/CreatorCredit'
import type { Chapter } from './types'

type Loading<T> = {state:'loading'} | {state:'ready';data:T} | {state:'error'}

export function App() {
  const [route,setRoute] = useState(() => parseRoute(location.hash))
  const [catalog,setCatalog] = useState<Loading<Catalog>>({state:'loading'})
  const [attempt,setAttempt] = useState(0)
  useEffect(() => {
    const change = () => setRoute(parseRoute(location.hash))
    window.addEventListener('hashchange',change)
    return () => window.removeEventListener('hashchange',change)
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    void (async () => {
      try {
        const response = await fetch(publicUrl(import.meta.env.BASE_URL,'/data/catalog.json'),
          {signal:controller.signal,cache:'no-cache'})
        if (!response.ok) throw new Error(`目录读取失败：HTTP ${response.status}`)
        const data = catalogSchema.parse(await response.json())
        if (!controller.signal.aborted) setCatalog({state:'ready',data})
      } catch (error) {
        if (controller.signal.aborted) return
        console.error('无法读取三国志目录',error)
        setCatalog({state:'error'})
      }
    })()
    return () => controller.abort()
  }, [attempt])

  if (catalog.state==='loading') return <Status title="三国志"><p role="status">正在展开目录…</p></Status>
  if (catalog.state==='error') return <Status title="三国志">
    <p role="alert">暂时无法载入目录。</p>
    <button className="quiet-button" onClick={() => {setCatalog({state:'loading'});setAttempt(value=>value+1)}}>重新载入</button>
  </Status>
  if (route.kind==='catalog') return <Library catalog={catalog.data}/>
  const entry = route.kind==='read' ? catalog.data.entries.find(item=>item.id===route.id) : undefined
  if (!entry) return <Status title="找不到这篇">
    <p role="alert">此链接未对应阅读目录中的篇章。</p><a className="quiet-button" href="#/">返回目录</a>
  </Status>
  return <ChapterScreen key={entry.id} entry={entry}/>
}

function ChapterScreen({entry}:{entry:CatalogEntry}) {
  const [status,setStatus] = useState<Loading<Chapter>>({state:'loading'})
  const [attempt,setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    document.title = `${entry.workTitle}｜三国志原文伴读`
    void fetchChapter(entry,import.meta.env.BASE_URL,controller.signal).then(data => {
      if (!controller.signal.aborted) setStatus({state:'ready',data})
    }).catch(error => {
      if (controller.signal.aborted) return
      console.error(`无法读取篇章 ${entry.id}`,error)
      setStatus({state:'error'})
    })
    return () => controller.abort()
  }, [entry,attempt])
  if (status.state==='ready') return <Reader chapter={status.data}/>
  return <Status title={entry.workTitle}>
    {status.state==='loading' ? <p role="status">正在展开卷页…</p> : <>
      <p role="alert">暂时无法载入这篇。可重试或返回目录阅读其他篇章。</p>
      <button className="quiet-button" onClick={() => {setStatus({state:'loading'});setAttempt(value=>value+1)}}>重新载入</button>
    </>}
    <a className="quiet-button" href="#/">返回目录</a>
  </Status>
}

function Status({title,children}:{title:string;children:ReactNode}) {
  return <main className="reading-status">
    <div className="seal" aria-hidden="true">志</div><h1>{title}</h1>{children}
  </main>
}

function Library({catalog}:{catalog:Catalog}) {
  useEffect(() => { document.title = catalog.title }, [catalog.title])
  const divisions = new Map<string,{entry:Catalog['entries'][number];index:number}[]>()
  catalog.entries.forEach((entry,index) => {
    const group = divisions.get(entry.division) ?? []
    group.push({entry,index})
    divisions.set(entry.division,group)
  })
  return <div className="library">
    <header className="library-masthead">
      <div className="imprint"><div className="seal" aria-hidden="true">志</div><p className="imprint-title">{catalog.title}</p></div>
      <span>纪传 · 目录</span>
    </header>
    <main className="library-body">
      <div className="library-intro">
        <p className="eyebrow">陈寿撰 · 裴松之注</p>
        <h1>三国志<span>原文伴读</span></h1>
        <p>从纪传原文出发，对读人物、地望与战事。</p>
        <CreatorCredit/>
      </div>
      <nav className="library-stacks" aria-label="阅读目录">
        {Array.from(divisions,([division,items],groupIndex) => <section className="library-group" data-division={division}
          aria-labelledby={`division-${groupIndex}`} key={division}>
          <div className="library-group-heading"><h2 id={`division-${groupIndex}`}>{division}</h2><span>{items.length} 卷</span></div>
          <div className="library-shelf">
            {items.map(({entry,index}) => <a className="library-entry" href={chapterHref(entry.id)} key={entry.id}>
              <div className="library-entry-top"><span>{entry.division} · {entry.volume}</span><i>{String(index+1).padStart(2,'0')}</i></div>
              <div className="library-entry-main">
                <div className="library-entry-seal" aria-hidden="true">{Array.from(entry.division)[0]}</div>
                <div><h3>{entry.workTitle}</h3><p>{entry.protagonist}</p></div>
              </div>
              <p className="library-description">{entry.description}</p>
              <div className="library-entry-bottom">
                <span>{entry.coverageLabel} <small>· {entry.coverage==='complete' ? '全文' : '精选'}</small></span>
                <span>展开卷页 <Icon name="arrow"/></span>
              </div>
            </a>)}
          </div>
        </section>)}
      </nav>
    </main>
  </div>
}
