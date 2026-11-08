import { deepEqual, equal, ok, throws } from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { verifyCoverage } from '../scripts/coverage-audit.ts'
import { catalogSchema } from '../src/catalog.ts'
import { normalizeChapter } from '../src/types.ts'

const read = (path:string) => readFile(new URL(`../public/data/${path}`,import.meta.url),'utf8').then(JSON.parse)
const load = async (id:string) => normalizeChapter(await read(`chapters/${id}/chapter.json`))

test('九卷目录按魏、蜀、吴卷次，新增六卷均有完整覆盖审计', async () => {
  const catalog = catalogSchema.parse(await read('catalog.json'))
  deepEqual(catalog.entries.map(item=>item.id),['wudi','wendi','mingdi','sanshaodi','xianzhu','erzhu-feizi','zhuge-liang','wuzhu','sansizhu'])
  const expected = [
    ['wendi',39,4270,47],['mingdi',44,5485,36],['sanshaodi',84,12965,33],
    ['erzhu-feizi',10,1481,6],['zhuge-liang',40,6118,36],['sansizhu',45,8104,44],
  ] as const
  for (const [id,paragraphs,characters,notes] of expected) {
    const chapter = await load(id)
    verifyCoverage(chapter)
    deepEqual([chapter.coverageAudit!.paragraphs.length,chapter.coverageAudit!.bodyCharacters,chapter.notes.length],
      [paragraphs,characters,notes])
    ok(chapter.scenes.at(-1)!.originalText.startsWith('评曰：'))
  }
})

test('两条 dd 评语及禅让段首注、明帝末独立注保留实际来源', async () => {
  const [wendi,mingdi] = await Promise.all(['wendi','mingdi'].map(load))
  for (const [chapter,index] of [[wendi,42],[mingdi,44]] as const) {
    deepEqual([chapter.scenes.at(-1)!.provenance.paragraphIndex,chapter.scenes.at(-1)!.provenance.sourceTag],[index,'dd'])
    const altered = structuredClone(chapter)
    delete altered.scenes.at(-1)!.provenance.sourceTag
    throws(()=>verifyCoverage(altered),/源节点/)
  }
  const ceded = wendi.notes.find(note=>note.provenance?.epubAnchor==='#mwt33')
  ok(ceded)
  ok(ceded.original.startsWith('《献帝传》载禅代众事曰：'))
  deepEqual([ceded.provenance?.paragraphIndex,ceded.provenance?.paragraphStart,ceded.provenance?.paragraphEnd],[12,13,13])
  const abdication = wendi.scenes.filter(scene=>scene.provenance.paragraphIndex===12).at(-1)!
  ok(abdication.parts.at(-1)?.noteIds?.includes(ceded.id))
  ok(wendi.notes.some(note=>note.provenance?.sourceTag==='dd' && note.original.includes('《典论》')))
  const trailing = mingdi.notes.find(note=>note.provenance?.paragraphStart===43)
  ok(trailing && mingdi.scenes.some(scene=>scene.provenance.paragraphIndex===42 && scene.noteIds.includes(trailing.id)))
})

test('诸葛亮的跨段注与合传原卷层级都可以核对', async () => {
  const [zhuge,erzhu] = await Promise.all(['zhuge-liang','erzhu-feizi'].map(load))
  const memorial = zhuge.notes.find(note=>note.provenance?.paragraphStart===12 && note.provenance?.paragraphEnd===14)
  ok(memorial?.original.includes('\n先帝虑汉、贼不两立') && memorial.original.endsWith('出张俨《默记》。'))
  equal(zhuge.notes.filter(note=>note.provenance?.paragraphIndex===41 && (note.provenance.paragraphStart ?? 0)>41).length,2)
  const son = erzhu.scenes.find(scene=>scene.provenance.paragraphIndex===7)!
  deepEqual(son.sectionPath,['皇子','先主子 永'])
  equal(son.sectionTitle,'先主子刘永')
  son.sectionPath = ['皇后','先主子 永']
  throws(()=>verifyCoverage(erzhu),/分节/)
})
