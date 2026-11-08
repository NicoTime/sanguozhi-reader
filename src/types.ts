import { z } from 'zod'

const text = z.string().min(1).refine(s => !!s.trim(), '不可只有空白')
export const identifier = z.string().regex(/^[a-zA-Z0-9_-]+$/, '无效 ID')
const id = identifier
const refs = z.array(id)
const offset = z.number().int().nonnegative()
const sha256 = z.string().regex(/^[0-9a-f]{64}$/)
const sourceTag = z.literal('dd').optional()
const noteProvenance = z.object({sourceId:id,chapterPath:text,paragraphIndex:offset,blockIndex:offset,
  bodyOffset:offset,epubAnchor:z.string(),sourceTag,paragraphStart:offset.optional(),paragraphEnd:offset.optional()})
const sourced = { sourceIds: refs.min(1) }
export const contentPath = z.string().regex(/^\/(?:data|maps)\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)+$/,
  '只允许 /data 或 /maps 下的本地静态文件')
const imagePath = contentPath.regex(/\.(?:jpe?g|png|webp|avif)$/i,'地形图须为静态图片')
const jsonPath = contentPath.regex(/\.(?:geojson|json)$/i,'地理数据须为 JSON')
export const chapterDataPath = contentPath.regex(/^\/data\/.+\.json$/i,'章节须引用 /data 下的 JSON')
const coordinates = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)])

const source = z.object({
  id, title: text, kind: z.enum(['epub', 'web', 'dataset', 'editorial']),
  locator: text, note: text.optional(), license: text.optional(),
})
const person = z.object({ id, name: text, courtesyName: text.optional(), description: text, ...sourced })
const place = z.object({
  id, name: text, modernName: text, kind: z.enum(['city', 'county', 'ford', 'battlefield', 'region', 'other']),
  coordinates: coordinates.nullable(), precision: z.enum(['site', 'approximate-area', 'uncertain', 'unlocated']),
  note: text, ...sourced,
})
const note = z.object({
  id, kind: z.literal('pei'), anchorText: text, original: text,
  sourceTitles: z.array(text), summary: text.optional(),
  variants: z.array(z.object({baseText:text, reading:text, textOffset:offset})).optional(),
  provenance:noteProvenance.optional(),
  ...sourced,
})
const part = z.object({ text: z.string().min(1), placeId: id.optional(), personId: id.optional(), noteIds: refs.optional() })
const deployment = z.object({
  id, label: text, faction: id, commanderId: id.optional(), role: text,
  placeId: id.nullable(), coordinates: coordinates.nullable(),
  precision: z.enum(['approximate-area','relative-only','unlocated']),
  positionBasis: text, action: text, ...sourced,
})
const battlePhase = z.object({id, title:text, summary:text, deployments:z.array(deployment), ...sourced})
const march = z.object({
  id, order:z.number().int().positive(), faction:id, commanderId:id.optional(),
  from:id.nullable(), to:id.nullable(), fromLabel:text, toLabel:text, label:text, description:text,
  phaseIds:refs.min(1), precision:z.enum(['schematic','unlocated']), ...sourced,
})
const scene = z.object({
  id, title: text, sectionTitle:text.optional(), sectionPath:z.array(text).min(1).optional(), kind:z.enum(['narrative','battle','journey','document']).optional(),
  time: z.object({ year: z.number().int().nullable(), era: text, label: text, certainty: z.enum(['explicit', 'inferred', 'unknown']) }),
  originalText: text, parts: z.array(part).min(1), translation: text,
  glosses: z.array(z.object({term: text, explanation: text})).optional(),
  summary: text, placeIds: refs, personIds: refs, noteIds: refs, focusPlaceId: id.nullable(),
  battlePhases: z.array(battlePhase).min(1).optional(),
  marches: z.array(march).optional(),
  mapProfileId: id.optional(), historicalRiverIds: refs.optional(),
  movements: z.array(z.object({ from: id, to: id, personId: id.optional(), label: text, status: z.literal('schematic'), ...sourced })),
  provenance: z.object({sourceId: id, chapterPath: text, paragraphIndex: z.number().int().nonnegative(),
    excerptStart: text, excerptEnd: text, sourceTag, note: text.optional(), startOffset:offset.optional(), endOffsetExclusive:offset.optional() }),
})

const chapterShape = z.object({
  title: text, subtitle: text, editorialNote: text,
  sources: z.array(source).min(1), persons: z.array(person), places: z.array(place), notes: z.array(note),
  scenes: z.array(scene).min(1),
  historicalRiver: z.object({
    status: z.enum(['sourced-schematic', 'unavailable']), label: text, explanation: text, sourceIds: refs,
    precisionNote: text.optional(), method: text.optional(),
    geojsonPath: jsonPath.optional(),
  }),
})

export const coverage = z.enum(['excerpt','complete'])
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/,'颜色须为 #RRGGBB')
const faction = z.object({id,name:text,color:hex,paperColor:hex,borderColor:hex})
const maxLatitude = 85.051129
const mapProfile = z.object({
  id,label:text,
  bounds:z.object({
    west:z.number().min(-180).max(180), south:z.number().min(-maxLatitude).max(maxLatitude),
    east:z.number().min(-180).max(180), north:z.number().min(-maxLatitude).max(maxLatitude),
  }),
  center:coordinates, minZoom:z.number().min(0).max(22), maxZoom:z.number().min(0).max(22),
  reliefPath:imagePath, modernRiversPath:jsonPath.optional(), modernCitiesPath:jsonPath.optional(),
  attribution:text,
})
const legacyShape = chapterShape.extend({schemaVersion:z.literal(1)})
const coverageAudit = z.object({
  sourceSha256:sha256,bodyCharacters:z.number().int().positive(),noteCount:offset,
  paragraphs:z.array(z.object({paragraphIndex:offset,startOffset:offset,endOffsetExclusive:offset,sha256,sourceTag,sectionPath:z.array(text).min(1).optional(),
    notes:z.array(z.object({id,offset,sha256,paragraphStart:offset,paragraphEnd:offset,sourceTag}))})).min(1),
  excluded:z.array(z.object({paragraphIndex:offset,reason:text,anchorParagraphIndex:offset.optional()})),
})
export const chapterV2Shape = chapterShape.extend({
  schemaVersion:z.literal(2), id,
  meta:z.object({workTitle:text,protagonist:text,volume:text,division:text,displayTitle:text,seal:text,
    periodLabel:text,coverage,coverageLabel:text}),
  coverageAudit:coverageAudit.optional(),
  factions:z.array(faction), mapProfiles:z.array(mapProfile).min(1), defaultMapProfileId:id,
})

const legacyFactions = [
  {id:'cao',name:'曹军',color:'#8b3827',paperColor:'#f6e8d6',borderColor:'#a36449'},
  {id:'yuan',name:'袁军',color:'#28465e',paperColor:'#e7eef0',borderColor:'#688596'},
]
export const legacyChapterId = 'wudi'
export const legacyProgressKey = 'sanguozhi-reader:guandu:scene:v1'

const chapterInput = z.discriminatedUnion('schemaVersion',[legacyShape,chapterV2Shape])
export const chapterSchema = chapterInput.superRefine((chapter, ctx) => {
  type Path = (string | number)[]
  const fail = (path: Path, message: string) => ctx.addIssue({code:'custom', path, message})
  const allIds = new Set<string>()
  function unique(value:string, path:Path) {
    if (allIds.has(value)) fail(path, `重复 ID：${value}`)
    allIds.add(value)
  }
  for (const key of ['sources', 'persons', 'places', 'notes', 'scenes'] as const) {
    chapter[key].forEach((item, i) => {
      unique(item.id,[key,i,'id'])
    })
  }
  const index = <T extends {id:string}>(items:T[]) => new Map(items.map(item => [item.id,item]))
  const sources = index(chapter.sources), notes = index(chapter.notes)
  const places = index(chapter.places), persons = index(chapter.persons)
  const check = (values:string[], target:{has(id:string):boolean}, path:Path) => {
    const seen = new Set<string>()
    values.forEach((value, i) => {
      if (!target.has(value)) fail([...path, i], `找不到引用：${value}`)
      if (seen.has(value)) fail([...path, i], `重复引用：${value}`)
      seen.add(value)
    })
  }

  const factions = index(chapter.schemaVersion===2 ? chapter.factions : legacyFactions)
  const profiles = index(chapter.schemaVersion===2 ? chapter.mapProfiles : [])
  if (chapter.schemaVersion===2) {
    if (chapter.meta.coverage==='complete' && !chapter.coverageAudit)
      fail(['coverageAudit'],'全文须提供 EPUB 正文与裴注覆盖审计')
    for (const key of ['factions','mapProfiles'] as const) {
      const seen = new Set<string>()
      chapter[key].forEach((item,i) => {
        if (seen.has(item.id)) fail([key,i,'id'], `重复 ID：${item.id}`)
        seen.add(item.id)
      })
    }
    if (!profiles.has(chapter.defaultMapProfileId))
      fail(['defaultMapProfileId'],'找不到默认地图配置')
    chapter.mapProfiles.forEach(({bounds,center,minZoom,maxZoom},i) => {
      const {west,south,east,north} = bounds
      if (west>=east || south>=north) fail(['mapProfiles',i,'bounds'],'地图四至顺序无效')
      if (center[0]<west || center[0]>east || center[1]<south || center[1]>north)
        fail(['mapProfiles',i,'center'],'中心须落在地图范围内')
      if (minZoom>=maxZoom) fail(['mapProfiles',i,'maxZoom'],'最大缩放须大于最小缩放')
    })
  }

  for (const key of ['persons','places','notes'] as const) {
    chapter[key].forEach((item, i) => check(item.sourceIds, sources, [key, i, 'sourceIds']))
  }
  chapter.notes.forEach((item, i) => {
    const original = Array.from(item.original)
    item.variants?.forEach((variant, j) => {
      const actual = original.slice(variant.textOffset, variant.textOffset + Array.from(variant.baseText).length).join('')
      if (actual !== variant.baseText) fail(['notes',i,'variants',j,'textOffset'], '异文底字与原文偏移不一致')
    })
  })
  chapter.places.forEach((item, i) => {
    if ((item.coordinates === null) !== (item.precision === 'unlocated'))
      fail(['places', i, 'coordinates'], '未定位应使用 null，已定位应提供坐标')
  })
  const river = chapter.historicalRiver
  check(river.sourceIds, sources, ['historicalRiver','sourceIds'])
  if (river.status === 'sourced-schematic' && (!river.geojsonPath || !river.sourceIds.length))
    fail(['historicalRiver'], '示意河道必须有本地地理文件和来源')
  if (river.status === 'unavailable' && river.geojsonPath)
    fail(['historicalRiver','geojsonPath'], '未复原的历史河道不得提供图层')

  chapter.scenes.forEach((item, i) => {
    const at: Path = ['scenes', i]
    const profile = chapter.schemaVersion===2 ? profiles.get(item.mapProfileId ?? chapter.defaultMapProfileId) : undefined
    function checkWithin(point:[number,number]|null|undefined, path:Path) {
      if (!profile || !point) return
      const {west,south,east,north} = profile.bounds
      if (point[0]<west || point[0]>east || point[1]<south || point[1]>north)
        fail(path,'可绘锚点超出本段底图实际四至')
    }
    if (item.focusPlaceId) checkWithin(places.get(item.focusPlaceId)?.coordinates,[...at,'focusPlaceId'])
    if (item.sectionPath && !item.sectionTitle)
      fail([...at,'sectionTitle'],'原卷分节须提供显示标题')
    if (item.mapProfileId && !profiles.has(item.mapProfileId))
      fail([...at,'mapProfileId'], `找不到地图配置：${item.mapProfileId}`)
    if ((item.time.year===null) !== (item.time.certainty==='unknown'))
      fail([...at,'time'], '年代未详使用 null 和 unknown，其余时间提供公元年份')
    if (item.historicalRiverIds) {
      if (new Set(item.historicalRiverIds).size!==item.historicalRiverIds.length)
        fail([...at,'historicalRiverIds'],'重复引用历史河道')
      if (item.historicalRiverIds.length && river.status==='unavailable')
        fail([...at,'historicalRiverIds'],'该篇没有已编排的历史河道')
    }
    check(item.placeIds, places, [...at, 'placeIds'])
    check(item.personIds, persons, [...at, 'personIds'])
    check(item.noteIds, notes, [...at, 'noteIds'])
    if (item.focusPlaceId && !item.placeIds.includes(item.focusPlaceId)) fail([...at,'focusPlaceId'], '焦点须属于本片段')
    if (sources.get(item.provenance.sourceId)?.kind !== 'epub')
      fail([...at,'provenance','sourceId'], '正文出处须引用 EPUB')
    if (item.parts.map(p => p.text).join('') !== item.originalText)
      fail([...at,'parts'], 'parts 拼接与 originalText 不一致')
    const noteAnchors = new Set<string>()
    let preceding = ''
    item.parts.forEach((p, j) => {
      preceding += p.text
      if (p.placeId) check([p.placeId], new Set(item.placeIds), [...at,'parts',j,'placeId'])
      if (p.personId) check([p.personId], new Set(item.personIds), [...at,'parts',j,'personId'])
      check(p.noteIds ?? [], new Set(item.noteIds), [...at,'parts',j,'noteIds'])
      p.noteIds?.forEach(noteId => {
        const referenced = notes.get(noteId)
        if (noteAnchors.has(noteId)) fail([...at,'parts',j,'noteIds'], `片段内重复挂载裴注：${noteId}`)
        noteAnchors.add(noteId)
        if (referenced && !preceding.endsWith(referenced.anchorText))
          fail([...at,'parts',j,'noteIds'], `裴注原句须紧邻锚点：${noteId}`)
      })
    })
    item.noteIds.forEach(noteId => {
      const referenced = notes.get(noteId)
      if (!noteAnchors.has(noteId) || !referenced || !item.originalText.includes(referenced.anchorText))
        fail([...at,'noteIds'], `裴注缺少原句或标记：${noteId}`)
    })
    item.battlePhases?.forEach((phase,j) => {
      const path = [...at,'battlePhases',j]
      unique(phase.id,[...path,'id'])
      check(phase.sourceIds,sources,[...path,'sourceIds'])
      phase.deployments.forEach((flag,k) => {
        const deployPath = [...path,'deployments',k]
        unique(flag.id,[...deployPath,'id'])
        if (!factions.has(flag.faction)) fail([...deployPath,'faction'],`找不到阵营：${flag.faction}`)
        if (flag.commanderId && !persons.has(flag.commanderId))
          fail([...deployPath,'commanderId'], `找不到统帅：${flag.commanderId}`)
        if (flag.placeId && !places.has(flag.placeId))
          fail([...deployPath,'placeId'], `找不到地望：${flag.placeId}`)
        if ((flag.coordinates === null) !== (flag.precision === 'unlocated'))
          fail([...deployPath,'coordinates'], '未定位应使用 null，区域态势应提供坐标')
        checkWithin(flag.coordinates,[...deployPath,'coordinates'])
        check(flag.sourceIds,sources,[...deployPath,'sourceIds'])
      })
    })
    const phaseIds = new Set(item.battlePhases?.map(phase=>phase.id))
    const orders = new Set<string>()
    item.marches?.forEach((action,j) => {
      const path = [...at,'marches',j]
      unique(action.id,[...path,'id'])
      if (!factions.has(action.faction)) fail([...path,'faction'],`找不到阵营：${action.faction}`)
      const ordinal = `${action.faction}:${action.order}`
      if (orders.has(ordinal)) fail([...path,'order'],'本段同一阵营的行动序号须唯一')
      orders.add(ordinal)
      check(action.phaseIds,phaseIds,[...path,'phaseIds'])
      check(action.sourceIds,sources,[...path,'sourceIds'])
      if (action.commanderId && !persons.has(action.commanderId))
        fail([...path,'commanderId'],`找不到行动统帅：${action.commanderId}`)
      for (const end of ['from','to'] as const) {
        const placeId = action[end]
        if (placeId && !places.has(placeId)) fail([...path,end],`找不到行动地点：${placeId}`)
        if (placeId && action.precision==='schematic') checkWithin(places.get(placeId)?.coordinates,[...path,end])
      }
      if (action.precision==='schematic' && (!action.from || !action.to || action.from===action.to ||
        !places.get(action.from)?.coordinates || !places.get(action.to)?.coordinates))
        fail([...path,'precision'],'可绘行动需要两个不同且已定位的地点')
    })
    item.movements.forEach((move,j) => {
      const path = [...at,'movements',j]
      if (!places.has(move.from)) fail([...path,'from'], `找不到起点：${move.from}`)
      if (!places.has(move.to)) fail([...path,'to'], `找不到终点：${move.to}`)
      if (move.from === move.to) fail([...path,'to'], '行动示意的起终点不能相同')
      if (move.personId && !persons.has(move.personId)) fail([...path,'personId'], `找不到人物：${move.personId}`)
      check(move.sourceIds, sources, [...path,'sourceIds'])
    })
  })
})

export type Chapter = z.infer<typeof chapterV2Shape>
export type ChapterInput = z.infer<typeof chapterSchema>
export type Faction = z.infer<typeof faction>
export type MapProfile = z.infer<typeof mapProfile>

export function normalizeChapter(input:unknown):Chapter {
  const chapter = chapterSchema.parse(input)
  if (chapter.schemaVersion===2) return chapter
  const profile:MapProfile = {
    id:'central-plains', label:'官渡一带',
    bounds:{west:108.28125,south:27.059125784374054,east:122.34375,north:39.909736234537185},
    center:[114.35,35.03],minZoom:5.6,maxZoom:10.4,reliefPath:'/maps/central-plains-relief.jpg',
    modernRiversPath:'/maps/modern-rivers.geojson',modernCitiesPath:'/maps/modern-cities.json',
    attribution:'Mapzen / Tilezen · USGS；现代对照 Natural Earth',
  }
  return {...chapter, schemaVersion:2,id:legacyChapterId,
    meta:{workTitle:'武帝纪',protagonist:'曹操',volume:'卷一',division:'魏书',displayTitle:'官渡',seal:'渡',
      periodLabel:'建安五年',coverage:'excerpt',coverageLabel:'官渡选读'},
    factions:legacyFactions,mapProfiles:[profile],defaultMapProfileId:profile.id,
  }
}
export type Scene = z.infer<typeof scene>
export type Place = z.infer<typeof place>
export type Note = z.infer<typeof note>
export type Source = z.infer<typeof source>

const riverLine = z.array(coordinates).min(2)
const historicalRiversSchema = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(z.object({
    type:z.literal('Feature'),
    properties:z.object({id,name:text,period:text,precisionNote:text,method:text,...sourced}),
    geometry:z.discriminatedUnion('type',[
      z.object({type:z.literal('LineString'),coordinates:riverLine}),
      z.object({type:z.literal('MultiLineString'),coordinates:z.array(riverLine).min(1)}),
    ]),
  })).min(1),
})

export function parseHistoricalRivers(data:unknown, chapter:Pick<Chapter,'sources'|'scenes'>) {
  const knownSources = new Set(chapter.sources.map(source => source.id))
  return historicalRiversSchema.superRefine((collection, ctx) => {
    const rivers = new Set<string>()
    collection.features.forEach(({properties},i) => {
      if (rivers.has(properties.id)) ctx.addIssue({code:'custom',path:['features',i,'properties','id'],message:'重复河道 ID'})
      rivers.add(properties.id)
      properties.sourceIds.forEach((sourceId,j) => {
        if (!knownSources.has(sourceId)) ctx.addIssue({code:'custom',
          path:['features',i,'properties','sourceIds',j],message:`找不到河道来源：${sourceId}`})
      })
    })
    chapter.scenes.forEach((scene,i) => scene.historicalRiverIds?.forEach((riverId,j) => {
      if (!rivers.has(riverId)) ctx.addIssue({code:'custom',path:['scenes',i,'historicalRiverIds',j],
        message:`找不到历史河道：${riverId}`})
    }))
  }).parse(data)
}

export type March = z.infer<typeof march>
export type Deployment = z.infer<typeof deployment>
export type BattlePhase = z.infer<typeof battlePhase>
export type HistoricalRivers = z.infer<typeof historicalRiversSchema>
export type HistoricalRiver = HistoricalRivers['features'][number]
