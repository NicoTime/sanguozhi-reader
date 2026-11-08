import { deepEqual, equal, throws } from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { dramaSchema,indexDrama } from '../src/drama.ts'
import { normalizeChapter } from '../src/types.ts'

const approved = JSON.parse(await readFile(new URL('./fixtures/wudi-drama-v11-approved.json',import.meta.url),'utf8')) as {
  id:string;sceneId:string;quote:{textOffset:number;text:string};sourceIds:string[]
}[]
const coverage = (await readFile(new URL('../docs/content/wudi-voice-coverage.md',import.meta.url),'utf8'))
  .split('## 正文覆盖清单')[1].split('\n## ')[0]
const chapter = normalizeChapter(JSON.parse(await readFile(new URL('../public/data/chapters/wudi/chapter.json',import.meta.url),'utf8')))
const key = (sceneId:string,start:number,end:number) => `${sceneId}:${start}:${end}`
const bundleFixture={schemaVersion:1,chapterId:'wudi',endHoldMs:4000,disclaimer:'仅用于验收测试',
  clips:approved.map(item=>({...item,speakerId:'cao-cao',title:item.id,contextNote:'测试场景',
    audio:{path:`media/drama-v8/audio/${item.id}.wav`,mimeType:'audio/wav',durationSeconds:1},
    illustration:{path:`media/drama-v8/images/${item.id}.webp`,alt:'测试图片'},
  })),
}

test('v11 批准43个 ID 精确覆盖独立正文范围和来源，无漏项、重项或截短',()=>{
  const rows = [...coverage.matchAll(/^\| `(wudi-[^`]+)` \| `\[(\d+),(\d+)\)` \| [^|]+ \| [^|]+ \| (.+) \|$/gm)]
  equal(rows.length,43)
  equal(approved.length,43)
  equal(new Set(approved.map(item=>item.id)).size,43)
  const expected=new Map(rows.map(([,scene,start,end,text])=>[key(scene,Number(start),Number(end)),text]))
  const actual=new Map(approved.map(item=>[key(item.sceneId,item.quote.textOffset,
    item.quote.textOffset+Array.from(item.quote.text).length),item.quote.text]))
  equal(actual.size,43)
  deepEqual([...actual.entries()].sort(),[...expected.entries()].sort())
  for (const item of approved) {
    const scene=chapter.scenes.find(scene=>scene.id===item.sceneId)!
    equal(Array.from(scene.originalText).slice(item.quote.textOffset,
      item.quote.textOffset+Array.from(item.quote.text).length).join(''),item.quote.text,item.id)
    deepEqual(item.sourceIds,['epub-simplified'])
  }
  const bundle=dramaSchema.parse(bundleFixture)
  equal(bundle.clips.length,43)
})

test('v11 p73 显式补充元数据后43条全部索引，缺失或不合法说话人仍拒绝',async()=>{
  const editorial=JSON.parse(await readFile(new URL('../content/wudi/editorial.json',import.meta.url),'utf8'))
  deepEqual(editorial.scenes.find((row:{paragraphIndex:number})=>row.paragraphIndex===73).personIds,['cao-cao'])
  deepEqual(chapter.scenes.find(scene=>scene.id==='wudi-p73')!.personIds,['cao-cao'])
  const bundle=dramaSchema.parse(bundleFixture)
  const indexed=indexDrama(bundle,chapter)
  equal([...indexed.values()].flat().length,43)
  deepEqual([...indexed.values()].flat().map(item=>item.id).sort(),approved.map(item=>item.id).sort())
  for (const sceneId of ['wudi-p41','wudi-yanjin-counterattack','wudi-p76']) {
    const group=indexed.get(sceneId)!
    equal(group.length,3)
    deepEqual(group.map(item=>item.quote.textOffset),[...group.map(item=>item.quote.textOffset)].sort((a,b)=>a-b))
  }
  const missingAssociation=structuredClone(chapter)
  missingAssociation.scenes.find(scene=>scene.id==='wudi-p73')!.personIds=[]
  throws(()=>indexDrama(bundle,missingAssociation),/p73-43 的场景或说话人不存在/)
  const invalidSpeaker=structuredClone(bundleFixture)
  invalidSpeaker.clips.find(clip=>clip.id==='p73-43')!.speakerId='yuan-shao'
  equal(dramaSchema.safeParse(invalidSpeaker).success,false)
})
