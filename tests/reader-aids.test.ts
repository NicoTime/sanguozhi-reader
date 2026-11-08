import { deepEqual, equal, ok, throws } from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { atlasFeatures, atlasManifestSchema, parseAtlas, referenceSnapshot } from '../src/historical-atlas.ts'
import { indexPronunciations, portraitForScene, portraitSchema, readingRuns } from '../src/reading-aids.ts'
import type { Pronunciation } from '../src/reading-aids.ts'
import { normalizeChapter } from '../src/types.ts'

const json = (path:string) => readFile(new URL(`../public/${path}`,import.meta.url),'utf8').then(JSON.parse)
const chapter = normalizeChapter(await json('data/chapters/wudi/chapter.json'))

test('读音按码点校验原字和冲突，跨链接保留文本和分节读音',()=>{
  const entry:Pronunciation = {id:'sample',chapterId:'wudi',targetType:'scene',targetId:'wudi-p0',
    textOffset:1,baseText:'𫏋音',pinyin:'jué yīn',sourceIds:['sample']}
  const left = readingRuns('有𫏋',[entry])
  const right = readingRuns('音。',[entry],2)
  deepEqual([...left,...right].map(({text,reading})=>[text,reading]),
    [['有',undefined],['𫏋','jué'],['音','yīn'],['。',undefined]])

  const target = chapter.scenes[0]
  const value = {...entry,targetId:target.id,textOffset:0,baseText:Array.from(target.originalText)[0]}
  const bundle = {schemaVersion:1 as const,sources:[],entries:[value]}
  equal(indexPronunciations(bundle,chapter).scene.get(target.id)?.[0].id,entry.id)
  throws(()=>indexPronunciations({...bundle,entries:[{...value,baseText:'𫏋'}]},chapter),/偏移/)
  throws(()=>indexPronunciations({...bundle,entries:[value,{...value,id:'overlap'}]},chapter),/重叠/)
})

test('曹操肖像按卷内单年选阶段，跨年和家世叙事保留人物示意',async()=>{
  const [cao] = portraitSchema.parse(await json('portraits/manifest.json')).persons
  for (const [id,stage] of [['wudi-p4','young'],['wudi-baima-relief','middle'],['wudi-p105','late']] as const) {
    const scene = chapter.scenes.find(item=>item.id===id)!
    equal(portraitForScene(cao,scene)?.id,stage)
  }
  const family = chapter.scenes[0]
  equal(portraitForScene(cao,family),undefined)
  const dated = chapter.scenes.find(item=>item.id==='wudi-p105')!
  equal(portraitForScene(cao,{...dated,time:{...dated.time,label:'跨年记事'}}),undefined)
})

test('参考断面和三个历史图层可独立选择，台湾和海南作为地理参照保留',async()=>{
  const manifest = atlasManifestSchema.parse(await json('data/atlas-v7/manifest.json'))
  const data = parseAtlas(await json('data/atlas-v7/features.geojson'),manifest)
  const none = {region:false,seat:false,water:false}
  const all = {region:true,seat:true,water:true}
  equal(referenceSnapshot(manifest,chapter.scenes[0].time).year,200)
  equal(referenceSnapshot(manifest,{year:260,era:'景元',label:'景元元年',certainty:'explicit'}).year,262)
  for (const snapshot of manifest.snapshots) {
    const islands = atlasFeatures(data,snapshot.id,none,false)
    ok(islands.every(feature=>feature.properties.kind==='island'))
    ok(['台湾','海南'].every(name=>islands.some(feature=>feature.properties.name===name)))
  }
  ok(atlasFeatures(data,'three-262',all,false).some(feature=>feature.properties.id==='seat-pengcheng-262'))
  ok(atlasFeatures(data,'han-200',all,false).every(feature=>feature.properties.id!=='seat-pengcheng-262'))
})
