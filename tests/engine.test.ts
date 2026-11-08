import { deepEqual, equal, ok, rejects } from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { catalogSchema, fetchChapter, parseRoute } from '../src/catalog.ts'
import { resolveScene, riversForScene, sceneYear } from '../src/engine.ts'
import { progressKey, readProgress, saveProgress } from '../src/progress.ts'
import { chapterSchema, legacyProgressKey, normalizeChapter, parseHistoricalRivers } from '../src/types.ts'

const data = (path:string) => readFile(new URL(`../public/data/${path}`,import.meta.url),'utf8').then(JSON.parse)
const [rawWudi,rawXianzhu,rawWuzhu,rawCatalog,rawRivers] = await Promise.all([
  data('guandu.json'),data('chapters/xianzhu/chapter.json'),data('chapters/wuzhu/chapter.json'),
  data('catalog.json'),data('historical-rivers.geojson'),
])
const [wudi,xianzhu,wuzhu] = [rawWudi,rawXianzhu,rawWuzhu].map(normalizeChapter)
const catalog = catalogSchema.parse(rawCatalog)

test('未识别的段落和阶段退回本篇，地形范围、阵营和河道选择属于当前篇', () => {
  const state = resolveScene(xianzhu,{sceneId:'baima-relief',phaseId:'phase-baima-relief'})
  equal(state.scene.id,xianzhu.scenes[0].id)
  equal(state.phase?.id,xianzhu.scenes[0].battlePhases?.[0].id)
  equal(state.mapProfile.id,xianzhu.scenes[0].mapProfileId ?? xianzhu.defaultMapProfileId)
  equal(state.factions.get('liu')?.name,'刘备军')
  equal(state.factions.get('yuan'),undefined)
  const rivers = parseHistoricalRivers(rawRivers,wudi)
  equal(riversForScene(rivers,['han-yellow-river'])?.features[0].properties.id,'han-yellow-river')
  equal(riversForScene(rivers,[]),null)
  equal(riversForScene(rivers,undefined)?.features.length,1)
  const legacy = resolveScene(wudi,{sceneId:'baima-relief',phaseId:'phase-baima-siege'})
  equal(legacy.unlocatedMarches.length,1)
  equal(legacy.routes.length,0)
  ok(legacy.mapDeployments.every(flag=>flag.coordinates!==null))
})

test('支持多于八段，逐段可选地图配置并保留跨年范围', () => {
  const chapter = structuredClone(xianzhu)
  chapter.meta.coverage='excerpt'
  delete chapter.coverageAudit
  const [first] = chapter.scenes
  const extra = {...chapter.mapProfiles[0],id:'alternate-profile',center:[114,30] as [number,number]}
  chapter.mapProfiles.push(extra)
  const narrative = {...first,parts:[{text:first.originalText}],noteIds:[],battlePhases:undefined,marches:undefined,
    mapProfileId:extra.id}
  for (let i=0;i<8;i++) chapter.scenes.push({...narrative,id:`extra-scene-${i}`})
  const state = resolveScene(normalizeChapter(chapter),{sceneId:'extra-scene-7'})
  equal(state.mapProfile.id,extra.id)
  equal(state.phase,null)
  equal(state.routes.length,0)
  const ranged = chapter.scenes.find(scene=>scene.time.year===null && scene.time.era.includes('建安'))!
  equal(sceneYear(ranged.time),'具体年份未定')
})

test('年份为空时区分明确标注的跨年叙述和年代未知', () => {
  const time = {year:null,era:'永安',label:'前后事迹',certainty:'unknown'} as const
  equal(sceneYear({...time,label:'跨年 · 258—264 年'}),'跨年叙述')
  equal(sceneYear({...time,era:'跨年叙述'}),'跨年叙述')
  equal(sceneYear(time),'具体年份未定')
  equal(sceneYear({...time,era:'年代未详'}),'年代未详')
  equal(sceneYear({...time,year:258,label:'即位（下文跨年）',certainty:'explicit'}),'公元 258 年')
})

test('未知阵营、越界地图资源和无效坐标范围会被拒绝', () => {
  const chapter = structuredClone(wuzhu)
  const sceneIndex = chapter.scenes.findIndex(scene=>scene.battlePhases?.[0]?.deployments.length)
  chapter.scenes[sceneIndex].battlePhases![0].deployments[0].faction = 'borrowed-faction'
  chapter.mapProfiles[0].reliefPath = '/maps/../escape.png'
  chapter.mapProfiles[0].center = [-113,30]
  const result = chapterSchema.safeParse(chapter)
  ok(!result.success)
  ok(result.error.issues.some(issue=>issue.path.join('.')==='mapProfiles.0.reliefPath'))
  const unsafe = structuredClone(catalog)
  unsafe.entries[0].dataPath = 'https://example.invalid/chapter.json'
  ok(!catalogSchema.safeParse(unsafe).success)
  chapter.mapProfiles[0].reliefPath = '/maps/local.png'
  const references = chapterSchema.safeParse(chapter)
  ok(!references.success)
  ok(references.error.issues.some(issue=>issue.path.join('.')==='mapProfiles.0.center'))
  ok(references.error.issues.some(issue=>issue.path.join('.')===`scenes.${sceneIndex}.battlePhases.0.deployments.0.faction`))
})

test('快速切篇取消过期响应，hash 只允许目录或已验证的 ID 格式', async () => {
  const entries = new Map(catalog.entries.map(entry=>[entry.id,entry]))
  const first = new AbortController(), second = new AbortController()
  let finish: ((response:Response)=>void)|undefined
  const waiting:typeof fetch = async () => new Promise(resolve=>{finish=resolve})
  const abandoned = fetchChapter(entries.get('xianzhu')!,'./',first.signal,waiting)
  first.abort()
  const actual = await fetchChapter(entries.get('wuzhu')!,'./',second.signal,
    async () => Response.json(rawWuzhu))
  equal(actual.id,'wuzhu')
  finish!(Response.json(rawXianzhu))
  await rejects(abandoned,{name:'AbortError'})
  deepEqual(parseRoute('#/read/wudi'),{kind:'read',id:'wudi'})
  deepEqual(parseRoute('#/'),{kind:'catalog'})
  deepEqual(parseRoute('#/read/../wudi'),{kind:'invalid'})
})

test('官渡旧进度迁移到武帝纪，三篇之间隔离，过期 ID 安全回退', () => {
  const oldScene = wudi.scenes[3].id
  const state = new Map([[legacyProgressKey,oldScene]])
  const storage = {getItem:(key:string)=>state.get(key)??null,setItem:(key:string,value:string)=>{state.set(key,value)}}
  equal(readProgress(wudi,storage),oldScene)
  equal(readProgress(xianzhu,storage),xianzhu.scenes[0].id)
  saveProgress(wudi,oldScene,storage)
  saveProgress(wuzhu,wuzhu.scenes[2].id,storage)
  equal(state.get(progressKey(wudi.id)),oldScene)
  equal(readProgress(wuzhu,storage),wuzhu.scenes[2].id)
  state.set(progressKey(xianzhu.id),oldScene)
  equal(readProgress(xianzhu,storage),xianzhu.scenes[0].id)
})
