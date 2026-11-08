import { createHash } from 'node:crypto'
import type { Chapter } from '../src/types.ts'

const digest = (text:string) => createHash('sha256').update(text).digest('hex')
const characters = (text:string) => Array.from(text).length

export function verifyCoverage(chapter:Chapter) {
  if (chapter.meta.coverage!=='complete') return
  const audit = chapter.coverageAudit!
  const notes = new Map(chapter.notes.map(note=>[note.id,note]))
  const byParagraph = new Map<number,Chapter['scenes']>()
  let lastParagraph = -1
  for (const scene of chapter.scenes) {
    const paragraph = scene.provenance.paragraphIndex
    if (paragraph<lastParagraph) throw new Error(`${scene.id} 源段次序反转`)
    lastParagraph = paragraph
    const group = byParagraph.get(paragraph) ?? []
    group.push(scene)
    byParagraph.set(paragraph,group)
    const translation = scene.translation.trim()
    if (translation===scene.originalText.trim() || translation===scene.summary.trim() ||
        characters(translation)<Math.max(3,characters(scene.originalText.trim())*.55))
      throw new Error(`${scene.id} 白话过短、沿用摘要或照抄原文`)
  }

  const consumedNotes = new Set<string>(), indices = new Set<number>()
  let total = 0
  for (const item of audit.paragraphs) {
    const i = item.paragraphIndex
    if (indices.has(i)) throw new Error(`coverageAudit 正文段重复 p${i}`)
    indices.add(i)
    const scenes = byParagraph.get(i)
    if (!scenes?.length) throw new Error(`coverageAudit 缺少正文 p${i}`)
    byParagraph.delete(i)
    let next = item.startOffset
    let joined = ''
    const anchors = new Map<string,number>()
    for (const scene of scenes) {
      const {startOffset,endOffsetExclusive,sourceTag} = scene.provenance
      if (sourceTag!==item.sourceTag || JSON.stringify(scene.sectionPath)!==JSON.stringify(item.sectionPath))
        throw new Error(`${scene.id} 源节点或原卷分节与覆盖清单不同`)
      const length = characters(scene.originalText)
      if (startOffset!==next || endOffsetExclusive!==next+length)
        throw new Error(`${scene.id} 正文区间存在跳段、重叠或字符数不同`)
      let offset = next
      for (const part of scene.parts) {
        offset += characters(part.text)
        for (const noteId of part.noteIds ?? []) {
          if (anchors.has(noteId)) throw new Error(`裴注 ${noteId} 在源段内重复挂载`)
          anchors.set(noteId,offset)
        }
      }
      joined += scene.originalText
      next = endOffsetExclusive
    }
    if (next!==item.endOffsetExclusive || digest(joined)!==item.sha256)
      throw new Error(`coverageAudit p${i} 正文未完整覆盖或哈希不同`)
    for (const record of item.notes) {
      const note = notes.get(record.id)
      const origin = note?.provenance
      const host = scenes[0].provenance
      if (consumedNotes.has(record.id) || !note || anchors.get(record.id)!==record.offset ||
          origin?.paragraphIndex!==i || origin.chapterPath!==host.chapterPath || origin.sourceId!==host.sourceId ||
          origin.paragraphStart!==record.paragraphStart || origin.paragraphEnd!==record.paragraphEnd || origin.sourceTag!==record.sourceTag ||
          digest(note.original)!==record.sha256) throw new Error(`coverageAudit 裴注缺失、重复、错锚或原文不同：${record.id}`)
      consumedNotes.add(record.id)
      anchors.delete(record.id)
    }
    if (anchors.size) throw new Error(`coverageAudit p${i} 含来源清单之外的裴注`)
    total += characters(joined)
  }
  for (const excluded of audit.excluded) {
    if (indices.has(excluded.paragraphIndex)) throw new Error(`coverageAudit 排除范围重复 p${excluded.paragraphIndex}`)
    indices.add(excluded.paragraphIndex)
  }
  const order = [...indices].sort((a,b)=>a-b)
  if (order.some((value,i)=>value!==i)) throw new Error('coverageAudit 源段索引不连续')
  if (total!==audit.bodyCharacters || consumedNotes.size!==audit.noteCount ||
      consumedNotes.size!==notes.size || byParagraph.size) throw new Error('coverageAudit 全文计数与正文或裴注不一致')
}
