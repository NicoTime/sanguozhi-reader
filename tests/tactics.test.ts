import { equal, ok, throws } from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { layoutTactics } from '../src/tactical-layout.ts'
import { chapterSchema, parseHistoricalRivers } from '../src/types.ts'
import type { Deployment } from '../src/types.ts'

const sample = chapterSchema.parse(JSON.parse(await readFile(new URL('../public/data/guandu.json',import.meta.url),'utf8')))
const sourceId = sample.sources[0].id
function flag(id:string,faction:Deployment['faction']):Deployment {
  return {id,label:id,faction,role:'测试',placeId:null,coordinates:[114,35],precision:'relative-only',
    positionBasis:'测试坐标',action:'测试行动',sourceIds:[sourceId]}
}
function river() {
  return {type:'FeatureCollection',features:[{type:'Feature',
    properties:{id:'test-river',name:'测试河道',period:'测试时期',precisionNote:'仅测试',method:'仅测试',sourceIds:[sourceId]},
    geometry:{type:'LineString',coordinates:[[113,35],[115,35]]}}]}
}

test('军旗与阶段校验拒绝跨记录重复 ID、悬空统帅和缺失坐标', () => {
  const chapter = structuredClone(sample)
  chapter.scenes[0].battlePhases = [{id:chapter.scenes[1].id,title:'测试阶段',summary:'仅测试',sourceIds:[sourceId],
    deployments:[{...flag('test-flag','cao'),commanderId:'missing-commander',coordinates:null}]}]
  const result = chapterSchema.safeParse(chapter)
  ok(!result.success)
  const paths = result.error.issues.map(issue=>issue.path.join('.'))
  ok(paths.includes('scenes.0.battlePhases.0.id'))
  ok(paths.includes('scenes.0.battlePhases.0.deployments.0.commanderId'))
  ok(paths.includes('scenes.0.battlePhases.0.deployments.0.coordinates'))
})

test('历史河道必须提供可绘制线位与有效来源', () => {
  equal(parseHistoricalRivers(river(),sample).features.length,1)
  const broken = river()
  broken.features[0].properties.sourceIds = ['missing-source']
  throws(() => parseHistoricalRivers(broken,sample),/找不到河道来源/)
  const invalid = river()
  invalid.features[0].geometry.coordinates[1] = [115,91]
  throws(() => parseHistoricalRivers(invalid,sample))
})

test('窄屏同点旗帜、关键地名和历史河流标签可以同时显示', () => {
  const anchor = {x:182,y:121}
  const place = {x:177,y:112,width:53,height:18}
  const {flagLabels,riverLabels} = layoutTactics(362,285,[
    {deployment:flag('曹操','cao'),anchor},{deployment:flag('袁绍','yuan'),anchor},{deployment:flag('颜良','yuan'),anchor},
  ],[{river:parseHistoricalRivers(river(),sample).features[0],paths:[[{x:-10,y:140},{x:380,y:92}]]}],[place])
  equal(flagLabels.length,3)
  equal(riverLabels.length,1)
  const boxes = [...flagLabels,...riverLabels].map(label=>label.box)
  boxes.forEach(({x,y,width,height},i) => {
    ok(x>=0 && y>=0 && x+width<=362 && y+height<=285)
    for (const other of [...boxes.slice(i+1),place])
      ok(x+width<=other.x || x>=other.x+other.width || y+height<=other.y || y>=other.y+other.height)
  })
  ok(flagLabels.every(label=>label.anchor===anchor))
})
