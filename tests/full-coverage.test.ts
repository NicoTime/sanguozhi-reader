import { deepEqual, equal, ok, throws } from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { verifyCoverage } from '../scripts/coverage-audit.ts'
import { resolveScene, riversForScene } from '../src/engine.ts'
import { readProgress, progressKey } from '../src/progress.ts'
import { normalizeChapter, parseHistoricalRivers } from '../src/types.ts'

const read = (path:string) => readFile(new URL(`../public/data/${path}`,import.meta.url),'utf8').then(JSON.parse)
const [wudi,xianzhu,wuzhu] = await Promise.all(['wudi','xianzhu','wuzhu'].map(async id =>
  normalizeChapter(await read(`chapters/${id}/chapter.json`))))

test('三篇连续正文和裴注与源审计计数一致，独立注与跨段注归入正确源段', () => {
  for (const [chapter,paragraphs,characters,notes] of [[wudi,123,13469,122],[xianzhu,37,7375,47],[wuzhu,64,10076,62]] as const) {
    verifyCoverage(chapter)
    deepEqual([chapter.coverageAudit!.paragraphs.length,chapter.coverageAudit!.bodyCharacters,chapter.notes.length],
      [paragraphs,characters,notes])
    ok(chapter.scenes.at(-1)!.originalText.startsWith('评曰：'))
  }
  for (const [start,end] of [[12,14],[36,38]]) {
    const note = xianzhu.notes.find(note=>note.provenance?.paragraphStart===start && note.provenance.paragraphEnd===end)
    ok(note)
    ok(note.original.includes('\n'))
    ok(xianzhu.scenes.some(scene=>scene.provenance.paragraphIndex===start && scene.noteIds.includes(note.id)))
  }
  equal(wudi.notes.filter(note=>note.provenance?.paragraphIndex===121 && note.provenance.paragraphStart!>=122).length,5)
  ok(xianzhu.scenes.some(scene=>scene.provenance.paragraphIndex===40))
})

test('完整包审计拒绝正文漏段、等字数篡改和跨段裴注截断', () => {
  const missing = structuredClone(wudi)
  missing.scenes.splice(2,1)
  throws(()=>verifyCoverage(missing),/缺少正文|正文未完整/)
  const changed = structuredClone(wuzhu)
  const [first] = changed.scenes
  first.originalText = '误'+first.originalText.slice(1)
  throws(()=>verifyCoverage(changed),/哈希不同/)
  const truncated = structuredClone(xianzhu)
  truncated.notes.find(note=>note.provenance?.paragraphStart===36 && note.provenance.paragraphEnd===38)!.original =
    '误将跨段注截断。'
  throws(()=>verifyCoverage(truncated),/裴注缺失、重复、错锚或原文不同/)
})

test('武帝纪黄河方向示意只在明确登记的场景显示', async () => {
  const river = parseHistoricalRivers(await read('historical-rivers.geojson'),wudi)
  const opening = resolveScene(wudi,{})
  equal(riversForScene(river,opening.historicalRiverIds),null)
  const saved = readProgress(wudi,{getItem:key=>key===progressKey(wudi.id)?'baima-relief':null})
  const baima = resolveScene(wudi,{sceneId:saved})
  equal(baima.scene.title,'白马解围')
  ok(riversForScene(river,baima.historicalRiverIds)?.features.length)
  equal(baima.mapProfile.reliefPath,'/maps/central-plains-relief.jpg')
})
