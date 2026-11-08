import {deepEqual,equal,throws} from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {test} from 'node:test'
import {dramaSchema,dramaNoteKey,indexDrama,getDramaRegistration} from '../src/drama.ts'
import {normalizeChapter} from '../src/types.ts'

const read=async (file:string)=>JSON.parse(await readFile(new URL(file,import.meta.url),'utf8'))
const zhuge=normalizeChapter(await read('../public/data/chapters/zhuge-liang/chapter.json'))
const wudi=normalizeChapter(await read('../public/data/chapters/wudi/chapter.json'))
const legacy=await read('../public/media/drama-v8/manifest.json')
const body={id:'body-longzhong',sceneId:'zhuge-liang-p1',speakerId:'zhuge-liang',title:'隆中对',
  quote:{target:'body',textOffset:229,text:'今操已拥百万之众，挟天子而令诸侯，此诚不可与争锋。孙权据有江东，已历三世，国险而民附，贤能为之用，此可以为援而不可图也。'},
  audio:{path:'media/drama-zhuge-v1/audio/body-longzhong.wav',mimeType:'audio/wav',durationSeconds:21.48},
  illustration:{path:'media/drama-zhuge-v1/images/body-longzhong.webp',alt:'诸葛亮艺术想象'},
  contextNote:'隆中对语境',sourceIds:['epub'],attribution:{label:'《诸葛亮传》正文'}}
const note={...body,id:'note-youth',sceneId:'zhuge-liang-p0',title:'早年游学',
  quote:{target:'note',noteId:'zhuge-liang-p0-note2',textOffset:90,text:'卿三人仕进可至刺史郡守也。'},
  audio:{...body.audio,path:'media/drama-zhuge-v1/audio/note-youth.wav'},
  illustration:{...body.illustration,path:'media/drama-zhuge-v1/images/note-youth.webp'},
  attribution:{label:'裴注引《魏略》',note:'早年确切年龄未载，少年音龄为艺术处理'}}
const fixture={schemaVersion:2,chapterId:'zhuge-liang',endHoldMs:4000,disclaimer:'AI艺术演绎',clips:[body,note]}
const parseIndex=(raw:unknown,chapter=zhuge)=>indexDrama(dramaSchema.parse(raw),chapter)

test('v13 旧43条原样解析，新旧章节路径及人物注册隔离',()=>{
  deepEqual(dramaSchema.parse(legacy),legacy)
  equal([...indexDrama(dramaSchema.parse(legacy),wudi).values()].flat().length,43)
  equal(getDramaRegistration('wudi')?.manifestPath,'/media/drama-v8/manifest.json')
  equal(getDramaRegistration('zhuge-liang')?.manifestPath,'/media/drama-zhuge-v1/manifest.json')
  equal(getDramaRegistration('wendi'),undefined)
  throws(()=>parseIndex(fixture,wudi),/所属篇章不匹配/)
  const bad=structuredClone(fixture);bad.clips[0].speakerId='cao-cao'
  equal(dramaSchema.safeParse(bad).success,false)
  equal(dramaSchema.safeParse({...fixture,chapterId:'wudi'}).success,false)
})

test('v13 正文与注原文各自精确定位，文献归属和争议原样保留',()=>{
  const bundle=dramaSchema.parse(fixture);const index=indexDrama(bundle,zhuge)
  equal(index.get(body.sceneId)?.[0].id,body.id)
  equal(index.get(dramaNoteKey(note.quote.noteId))?.[0].id,note.id)
  equal(index.get(note.sceneId),undefined)
  const indexed=index.get(dramaNoteKey(note.quote.noteId))![0]
  if(!('attribution' in indexed))throw new Error('v2 attribution missing')
  deepEqual(indexed.attribution,note.attribution)
  const another=structuredClone(fixture)
  another.clips[1].sceneId=body.sceneId
  throws(()=>parseIndex(another),/裴注不存在或不属于/)
  const wrong=structuredClone(fixture)
  wrong.clips[1].quote.textOffset++
  throws(()=>parseIndex(wrong),/引文与原文偏移/)
})

test('v13 同一目标多条排序、不覆盖，相邻可用而重叠拒绝',()=>{
  const early={...note,quote:{...note.quote,text:'卿三人仕进'}}
  const late={...note,id:'note-later',quote:{...note.quote,textOffset:95,text:'可至刺史郡守也。'},
    audio:{...note.audio,path:'media/drama-zhuge-v1/audio/note-later.wav'},
    illustration:{...note.illustration,path:'media/drama-zhuge-v1/images/note-later.webp'}}
  const index=parseIndex({...fixture,clips:[late,body,early]})
  deepEqual(index.get(dramaNoteKey(note.quote.noteId))?.map(item=>item.id),['note-youth','note-later'])
  throws(()=>parseIndex({...fixture,clips:[note,{...late,quote:note.quote}]}),/引文范围重叠/)
})

test('v13 严格来源与人物关联不能被正文或注目标绕过',()=>{
  const missing=structuredClone(zhuge)
  missing.scenes.find(scene=>scene.id===note.sceneId)!.personIds=[]
  throws(()=>parseIndex(fixture,missing),/场景或说话人不存在/)
  const extra=structuredClone(zhuge)
  extra.sources.push({...extra.sources[0],id:'another-source'})
  const badBody=structuredClone(fixture);badBody.clips[0].sourceIds=['another-source']
  throws(()=>parseIndex(badBody,extra),/来源未包含正文底本/)
  const badNote=structuredClone(fixture);badNote.clips[1].sourceIds=['another-source']
  throws(()=>parseIndex(badNote,extra),/来源与目标裴注不一致/)
  const absent=structuredClone(fixture);absent.clips[1].sourceIds=['missing-source']
  throws(()=>parseIndex(absent),/来源不存在或重复/)
})

test('v13 body/note字段不混用，空白/跨根路径/MIME/未知字段均拒绝',()=>{
  for(const bad of [
    {...fixture,clips:[{...body,quote:{...body.quote,noteId:note.quote.noteId}}]},
    {...fixture,clips:[{...note,quote:{target:'note',textOffset:90,text:note.quote.text}}]},
    {...fixture,clips:[{...body,quote:{...body.quote,text:'  \n '}}]},
    {...fixture,clips:[{...body,audio:{...body.audio,path:'media/drama-v8/audio/body-longzhong.wav'}}]},
    {...fixture,clips:[{...body,audio:{...body.audio,mimeType:'audio/mpeg'}}]},
    {...fixture,clips:[{...body,extra:'do not silently discard'}]},
    {...fixture,clips:[body,body]},
  ])equal(dramaSchema.safeParse(bad).success,false)
  equal(dramaSchema.safeParse({...legacy,clips:[{...legacy.clips[0],quote:{...legacy.clips[0].quote,target:'note',noteId:note.quote.noteId}}]}).success,false)
})

test('v13 冻结61段精确索引，并连续完整覆盖批准正文及裴注文献单位',async()=>{
  type Entry={id:string;sceneId:string;speakerId:string;quote:{target:string;noteId?:string;textOffset:number;text:string};sourceIds:string[];attribution:{label:string;note?:string};unitStart:number;unitEnd:number}
  const approved=await read('./fixtures/zhuge-drama-v13-approved.json') as {entries:Entry[];units:{body:number;note:number}}
  equal(approved.entries.length,61)
  equal(approved.entries.filter(item=>item.quote.target==='body').length,28)
  equal(approved.entries.filter(item=>item.quote.target==='note').length,33)
  equal(new Set(approved.entries.map(item=>item.id)).size,61)
  const bundle=dramaSchema.parse({...fixture,clips:approved.entries.map(({unitStart,unitEnd,...item})=>({...item,title:item.id,contextNote:'冻结集合测试',
    audio:{path:`media/drama-zhuge-v1/audio/${item.id}.wav`,mimeType:'audio/wav',durationSeconds:1},
    illustration:{path:`media/drama-zhuge-v1/images/${item.id}.webp`,alt:'测试图'},
  }))})
  deepEqual([...indexDrama(bundle,zhuge).values()].flat().map(item=>item.id).sort(),approved.entries.map(item=>item.id).sort())
  const units=new Map<string,Entry[]>()
  for(const item of approved.entries){
    const key=[item.sceneId,item.quote.target,item.quote.noteId??'',item.unitStart,item.unitEnd].join(':')
    const group=units.get(key)??[];group.push(item);units.set(key,group)
  }
  equal(units.size,approved.units.body+approved.units.note)
  for(const group of units.values()){
    group.sort((a,b)=>a.quote.textOffset-b.quote.textOffset)
    let cursor=group[0].unitStart
    for(const item of group){equal(item.quote.textOffset,cursor,item.id);cursor+=Array.from(item.quote.text).length}
    equal(cursor,group[0].unitEnd)
    const first=group[0]
    const original=first.quote.target==='note'
      ? zhuge.notes.find(note=>note.id===first.quote.noteId)!.original
      : zhuge.scenes.find(scene=>scene.id===first.sceneId)!.originalText
    equal(group.map(item=>item.quote.text).join(''),Array.from(original).slice(first.unitStart,first.unitEnd).join(''))
  }
})
