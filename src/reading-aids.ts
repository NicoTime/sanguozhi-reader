import { z } from 'zod'
import { identifier } from './types'
import type { Chapter, Scene } from './types'

const text = z.string().trim().min(1)
const link = z.string().url().regex(/^https?:\/\//i)
const pronunciationEntry = z.object({
  id:identifier, chapterId:identifier, targetType:z.enum(['scene','note']), targetId:identifier,
  textOffset:z.number().int().nonnegative(), baseText:z.string().min(1), pinyin:text,
  sourceIds:z.array(identifier).min(1), explanation:text.optional(),
})
export const pronunciationSchema = z.object({
  schemaVersion:z.literal(1), sources:z.array(z.object({id:identifier,title:text,url:link})),
  entries:z.array(pronunciationEntry),
}).superRefine(({sources,entries},ctx) => {
  const known = new Set(sources.map(source=>source.id))
  if (known.size!==sources.length) ctx.addIssue({code:'custom',path:['sources'],message:'读音来源 ID 重复'})
  const ids = new Set<string>()
  entries.forEach((entry,i) => {
    if (ids.has(entry.id)) ctx.addIssue({code:'custom',path:['entries',i,'id'],message:'读音 ID 重复'})
    ids.add(entry.id)
    if (entry.sourceIds.some(id=>!known.has(id)))
      ctx.addIssue({code:'custom',path:['entries',i,'sourceIds'],message:'未知读音来源'})
  })
})
export type PronunciationBundle = z.infer<typeof pronunciationSchema>
export type Pronunciation = z.infer<typeof pronunciationEntry>
export type Pronunciations = {scene:Map<string,Pronunciation[]>;note:Map<string,Pronunciation[]>}

export function indexPronunciations(bundle:PronunciationBundle, chapter:Chapter):Pronunciations {
  const index:Pronunciations = {scene:new Map(),note:new Map()}
  const targets = {
    scene:new Map(chapter.scenes.map(scene=>[scene.id,scene.originalText])),
    note:new Map(chapter.notes.map(note=>[note.id,note.original])),
  }
  const partBoundaries = new Map<string,number[]>()
  for (const entry of bundle.entries.filter(item=>item.chapterId===chapter.id).sort((a,b)=>a.textOffset-b.textOffset)) {
    const value = targets[entry.targetType].get(entry.targetId)
    if (value===undefined) throw new Error(`${entry.id} 未知读音目标 ${entry.targetId}`)
    const end = entry.textOffset+Array.from(entry.baseText).length
    if (Array.from(value).slice(entry.textOffset,end).join('')!==entry.baseText)
      throw new Error(`${entry.id} 读音底字与原文偏移不一致`)
    if (entry.targetType==='scene') {
      let boundaries = partBoundaries.get(entry.targetId)
      if (!boundaries) {
        let offset = 0
        boundaries = chapter.scenes.find(scene=>scene.id===entry.targetId)!.parts.map(part=>offset+=Array.from(part.text).length)
        partBoundaries.set(entry.targetId,boundaries)
      }
      if (boundaries.some(boundary=>entry.textOffset<boundary && boundary<end) &&
          entry.pinyin.split(/\s+/).length!==end-entry.textOffset)
        throw new Error(`${entry.id} 跨文本链接的注音须可逐字拆分`)
    }
    const group = index[entry.targetType].get(entry.targetId) ?? []
    const previous = group.at(-1)
    if (previous && previous.textOffset+Array.from(previous.baseText).length>entry.textOffset)
      throw new Error(`${entry.id} 读音与 ${previous.id} 重叠`)
    group.push(entry)
    index[entry.targetType].set(entry.targetId,group)
  }
  return index
}

export type ReadingRun = {text:string; reading?:string; entry?:Pronunciation}

export function readingRuns(value:string, entries:Pronunciation[], offset=0):ReadingRun[] {
  const points = Array.from(value)
  const runs:ReadingRun[] = []
  let cursor = 0
  for (const entry of entries) {
    const start = entry.textOffset-offset
    const count = Array.from(entry.baseText).length
    const from = Math.max(0,start), to = Math.min(points.length,start+count)
    if (from>=to) continue
    const syllables = entry.pinyin.split(/\s+/)
    const whole = from===start && to===start+count
    if (!whole && syllables.length!==count) continue
    if (cursor<from) runs.push({text:points.slice(cursor,from).join('')})
    runs.push({text:points.slice(from,to).join(''),entry,
      reading:whole ? entry.pinyin : syllables.slice(from-start,to-start).join(' ')})
    cursor = to
  }
  if (cursor<points.length) runs.push({text:points.slice(cursor).join('')})
  return runs
}

const age = z.number().int().nonnegative()
export const portraitPath = z.string().regex(/^\/?portraits\/[a-zA-Z0-9_-]+\.(?:webp|jpe?g|png|avif)$/i)
const portraitStage = z.object({
  id:z.enum(['young','middle','late']), label:text, ageMin:age, ageMax:age, imagePath:portraitPath, alt:text,
})
const portraitPerson = z.object({
  personId:identifier, name:text, birthYear:z.number().int(), deathYear:z.number().int(),
  disclaimer:text, stages:z.array(portraitStage).length(3),
})
export const portraitSchema = z.object({schemaVersion:z.literal(1),persons:z.array(portraitPerson)})
  .superRefine(({persons},ctx) => {
    const ids = new Set<string>()
    persons.forEach((person,i) => {
      const stages = [...person.stages].sort((a,b)=>a.ageMin-b.ageMin)
      if (ids.has(person.personId) || person.deathYear<person.birthYear ||
          new Set(stages.map(stage=>stage.id)).size!==stages.length ||
          stages.some((stage,j)=>stage.ageMin>stage.ageMax || (j>0 && stage.ageMin<=stages[j-1].ageMax)))
        ctx.addIssue({code:'custom',path:['persons',i],message:'肖像人物或年龄段无效'})
      ids.add(person.personId)
    })
  })
export type Portrait = z.infer<typeof portraitPerson>
export type PortraitStage = z.infer<typeof portraitStage>

export function portraitForScene(person:Portrait, scene:Scene) {
  const {year,era,label} = scene.time
  if (year===null || year<=person.birthYear || year>person.deathYear ||
      /跨年/.test(era+' '+label) || /家世|出生|幼年|追述|回顾|评语|去世|身后/.test(scene.title)) return undefined
  const age = year-person.birthYear
  if (age<18) return undefined
  return person.stages.find(stage=>stage.ageMin<=age && stage.ageMax>=age)
}
