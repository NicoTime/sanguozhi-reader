import { deepEqual, equal, ok } from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { mappedMarches, marchesForPhase, projectMarches } from '../src/marches.ts'
import { layoutTactics } from '../src/tactical-layout.ts'
import { chapterSchema } from '../src/types.ts'

const chapter = chapterSchema.parse(JSON.parse(await readFile(new URL('../public/data/guandu.json',import.meta.url),'utf8')))
const byId = new Map(chapter.scenes.map(scene=>[scene.id,scene]))
const places = new Map(chapter.places.map(place=>[place.id,place]))

test('行军只取当前阶段，延津按各阵营序号保留方向，缺地望不绘制', () => {
  const yan = byId.get('yanjin-counterattack')!
  const first = marchesForPhase(yan,'phase-yanjin-bait')
  deepEqual(first.map(({faction,order})=>[faction,order]),[['cao',1],['yuan',1]])
  deepEqual(mappedMarches(first,places).map(({march})=>[march.from,march.to]),[['baima','yanjin']])
  const second = marchesForPhase(yan,'phase-yanjin-redeploy')
  deepEqual(second.map(({faction,order,from,to})=>[faction,order,from,to]),[
    ['cao',2,'yanjin','guandu'],['yuan',2,'yanjin','yangwu'],
  ])
  deepEqual(marchesForPhase(yan,'phase-baima-relief'),[])
  const last = byId.get('burning-letters')!
  deepEqual(marchesForPhase(last,last.battlePhases?.[0].id),[])
})

test('六条可绘箭头从起点出发，箭头尖及两翼朝向终点', () => {
  const routes = mappedMarches(chapter.scenes.flatMap(scene=>scene.marches ?? []),places)
  equal(routes.length,6)
  const project = ([lon,lat]:[number,number]) => ({x:lon*200,y:-lat*240})
  const arrows = projectMarches(routes,project)
  equal(arrows.length,6)
  for (const [i,arrow] of arrows.entries()) {
    deepEqual(arrow.from,project(routes[i].from))
    deepEqual(arrow.to,project(routes[i].to))
    const direction = {x:arrow.to.x-arrow.from.x,y:arrow.to.y-arrow.from.y}
    const dot = (a:typeof direction,b:typeof direction) => a.x*b.x+a.y*b.y
    const toward = (a:typeof direction,b:typeof direction) => ({x:a.x-b.x,y:a.y-b.y})
    ok(dot(toward(arrow.to,arrow.tip),direction)>0)
    ok(dot(toward(arrow.tip,arrow.tailLeft),direction)>0)
    ok(dot(toward(arrow.tip,arrow.tailRight),direction)>0)
  }
  deepEqual(arrows.find(({march})=>march.id==='march-wuchao-cao-night')?.march.to,'wuchao')
})

test('校验拒绝串段阶段、重复阵营编号和无坐标的绘制端点', () => {
  const edited = structuredClone(chapter)
  const [original] = edited.scenes[0].marches!
  edited.scenes[0].marches!.push({...original,id:'test-invalid-march',phaseIds:['phase-yanjin-bait'],
    precision:'schematic',from:'yellow-river'})
  const result = chapterSchema.safeParse(edited)
  ok(!result.success)
  const paths = result.error.issues.map(issue=>issue.path.join('.'))
  ok(paths.includes('scenes.0.marches.3.phaseIds.0'))
  ok(paths.includes('scenes.0.marches.3.order'))
  ok(paths.includes('scenes.0.marches.3.precision'))
})

test('窄屏共享起点的两个行动编号避让军旗与沿线地名', () => {
  const scene = byId.get('yanjin-counterattack')!
  const routes = mappedMarches(marchesForPhase(scene,'phase-yanjin-redeploy'),places)
  const arrows = projectMarches(routes,([lon,lat]) => ({x:203+(lon-114.07)*202,y:152-(lat-35.14)*200}))
  // Compact map with two flags and a run of place labels around both routes.
  const occupied = [
    {x:69,y:139,width:109,height:32}, {x:75,y:192,width:109,height:32},
    {x:196,y:141,width:56,height:21}, {x:197,y:174,width:55,height:22},
    {x:194,y:218,width:56,height:23}, {x:116,y:102,width:147,height:24},
  ]
  const {marchLabels} = layoutTactics(362,302,[],[],occupied,arrows)
  deepEqual(marchLabels.map(label=>label.arrow.march.faction),['cao','yuan'])
  for (const [i,{box}] of marchLabels.entries()) {
    ok(box.x>=0 && box.y>=0 && box.x+box.width<=362 && box.y+box.height<=302)
    for (const other of [...occupied,...marchLabels.slice(i+1).map(label=>label.box)])
      ok(box.x+box.width<=other.x || box.x>=other.x+other.width ||
        box.y+box.height<=other.y || box.y>=other.y+other.height)
  }
})
