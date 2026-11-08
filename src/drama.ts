import { z } from 'zod'
import { identifier } from './types'
import type { Chapter } from './types'

export const dramaRegistrations = [
  {chapterId:'wudi',speakerId:'cao-cao',manifestPath:'/media/drama-v8/manifest.json',mediaRoot:'media/drama-v8',schemaVersion:1},
  {chapterId:'zhuge-liang',speakerId:'zhuge-liang',manifestPath:'/media/drama-zhuge-v1/manifest.json',mediaRoot:'media/drama-zhuge-v1',schemaVersion:2},
] as const
export const dramaManifestPath = dramaRegistrations[0].manifestPath
export const getDramaRegistration = (chapterId:string) => dramaRegistrations.find(item=>item.chapterId===chapterId)
const text = z.string().trim().min(1)
const quoteText = z.string().min(1).refine(value=>!!value.trim(),'引文不可只有空白')
const quoteFields = {textOffset:z.number().int().nonnegative(),text:quoteText}
const audioMimeByExtension = {
  mp3:['audio/mpeg'], wav:['audio/wav','audio/wave','audio/x-wav'],
  m4a:['audio/mp4','audio/x-m4a'], mp4:['audio/mp4'], aac:['audio/aac'],
  ogg:['audio/ogg'], opus:['audio/ogg','audio/opus'], webm:['audio/webm'],
}
function clipFields(root:string) {
  return {
    id:z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),sceneId:identifier,title:text,
    audio:z.object({
      path:z.string().regex(new RegExp(`^/?${root}/audio/[a-z0-9-]+\\.(?:mp3|wav|m4a|mp4|aac|ogg|opus|webm)$`)),
      mimeType:text,durationSeconds:z.number().finite().positive(),
    }).strict(),
    illustration:z.object({path:z.string().regex(new RegExp(`^/?${root}/images/[a-z0-9-]+\\.webp$`)),alt:text}).strict(),
    contextNote:text,sourceIds:z.array(identifier).min(1),
  }
}
const v1Clip=z.object({...clipFields('media/drama-v8'),speakerId:z.literal('cao-cao'),quote:z.object(quoteFields).strict()}).strict()
const v2Clip=z.object({
  ...clipFields('media/drama-zhuge-v1'),speakerId:z.literal('zhuge-liang'),
  quote:z.discriminatedUnion('target',[
    z.object({target:z.literal('body'),...quoteFields}).strict(),
    z.object({target:z.literal('note'),noteId:identifier,...quoteFields}).strict(),
  ]),
  attribution:z.object({label:text,note:text.optional()}).strict(),
}).strict()
const common={endHoldMs:z.literal(4000),disclaimer:text}
export const dramaSchema=z.discriminatedUnion('schemaVersion',[
  z.object({...common,schemaVersion:z.literal(1),chapterId:z.literal('wudi'),clips:z.array(v1Clip).min(1)}).strict(),
  z.object({...common,schemaVersion:z.literal(2),chapterId:z.literal('zhuge-liang'),clips:z.array(v2Clip).min(1)}).strict(),
]).superRefine(({clips},ctx)=>{
  const ids = new Set<string>()
  for (const [i,item] of clips.entries()) {
    const fail = (field:string,message:string)=>ctx.addIssue({code:'custom',path:['clips',i,field],message})
    if (ids.has(item.id)) fail('id','演绎编号重复')
    ids.add(item.id)
    if (new Set(item.sourceIds).size!==item.sourceIds.length) fail('sourceIds','演绎来源不存在或重复')
    const file = item.audio.path.split('/').at(-1)!
    const extension = file.split('.').at(-1) as keyof typeof audioMimeByExtension
    if (file!==`${item.id}.${extension}` || !audioMimeByExtension[extension]?.includes(item.audio.mimeType))
      fail('audio','音频名称或 MIME 与编码约定不符')
    if (item.illustration.path.split('/').at(-1)!==`${item.id}.webp`)
      fail('illustration','插画名称与演绎不匹配')
  }
})

export type DramaBundle = z.infer<typeof dramaSchema>
export type DramaClip = DramaBundle['clips'][number]
export const dramaNoteKey = (noteId:string) => `note:${noteId}`
export function dramaNoteId(clip:DramaClip) {
  return 'target' in clip.quote && clip.quote.target==='note' ? clip.quote.noteId : undefined
}

// Body keys retain the v1 sceneId API; notes use a separate key namespace.
export function indexDrama(bundle:DramaBundle,chapter:Chapter) {
  const registration=getDramaRegistration(chapter.id)
  if (chapter.id!==bundle.chapterId) throw new Error('演绎所属篇章不匹配')
  if (registration?.schemaVersion!==bundle.schemaVersion) throw new Error('演绎版本与篇章注册不匹配')
  const scenes = new Map(chapter.scenes.map(scene=>[scene.id,scene]))
  const notes = new Map(chapter.notes.map(note=>[note.id,note]))
  const people = new Set(chapter.persons.map(person=>person.id))
  const sources = new Set(chapter.sources.map(source=>source.id))
  const indexed = new Map<string,DramaClip[]>()
  for (const item of bundle.clips) {
    const scene = scenes.get(item.sceneId)
    if (item.speakerId!==registration.speakerId || !scene || !people.has(item.speakerId) || !scene.personIds.includes(item.speakerId))
      throw new Error(`${item.id} 的场景或说话人不存在`)
    if (item.sourceIds.some(id=>!sources.has(id)) || new Set(item.sourceIds).size!==item.sourceIds.length)
      throw new Error(`${item.id} 的来源不存在或重复`)
    const noteId=dramaNoteId(item)
    let original=scene.originalText, key=scene.id
    if (noteId!==undefined) {
      const note=notes.get(noteId)
      if (!note || !scene.noteIds.includes(noteId)) throw new Error(`${item.id} 的裴注不存在或不属于所选场景`)
      if (item.sourceIds.some(id=>!note.sourceIds.includes(id)) ||
          (note.provenance && !item.sourceIds.includes(note.provenance.sourceId)))
        throw new Error(`${item.id} 的来源与目标裴注不一致`)
      original=note.original
      key=dramaNoteKey(noteId)
    } else if (bundle.schemaVersion===2 && !item.sourceIds.includes(scene.provenance.sourceId)) {
      throw new Error(`${item.id} 的来源未包含正文底本`)
    }
    const {textOffset,text} = item.quote
    if (Array.from(original).slice(textOffset,textOffset+Array.from(text).length).join('')!==text)
      throw new Error(`${item.id} 的引文与原文偏移不一致`)
    const group = indexed.get(key) ?? []
    group.push(item)
    indexed.set(key,group)
  }
  for (const group of indexed.values()) {
    group.sort((a,b)=>a.quote.textOffset-b.quote.textOffset)
    for (let i=1;i<group.length;i++) {
      const previous=group[i-1],item=group[i]
      if (previous.quote.textOffset+Array.from(previous.quote.text).length>item.quote.textOffset)
        throw new Error(`${previous.id} 与 ${item.id} 的引文范围重叠`)
    }
  }
  return indexed
}
