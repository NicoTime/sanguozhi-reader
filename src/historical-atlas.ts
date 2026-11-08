import { z } from 'zod'
import { identifier } from './types'
import type { Scene } from './types'

const text = z.string().trim().min(1)
const path = z.string().regex(/^\/?data\/atlas-v7\/[a-zA-Z0-9_-]+\.geojson$/)
const point = z.tuple([z.number().min(-180).max(180),z.number().min(-85.05).max(85.05)])
const line = z.array(point).min(2)
const ring = z.array(point).min(4).refine(points=>points[0][0]===points.at(-1)![0] && points[0][1]===points.at(-1)![1],
  '多边形必须闭合')
const polygon = z.array(ring).min(1)
const geometry = z.discriminatedUnion('type',[
  z.object({type:z.literal('Point'),coordinates:point}),
  z.object({type:z.literal('LineString'),coordinates:line}),
  z.object({type:z.literal('MultiLineString'),coordinates:z.array(line).min(1)}),
  z.object({type:z.literal('Polygon'),coordinates:polygon}),
  z.object({type:z.literal('MultiPolygon'),coordinates:z.array(polygon).min(1)}),
])
export const atlasManifestSchema = z.object({
  schemaVersion:z.literal(1), title:text, description:text, geojsonPath:path,
  snapshots:z.array(z.object({id:identifier,year:z.number().int(),label:text,description:text})).length(2),
  sources:z.array(z.object({id:identifier,title:text,url:z.string().url().regex(/^https?:\/\//i),
    license:text,note:text.optional()})).min(1),
}).superRefine((manifest,ctx)=>{
  const years = new Set(manifest.snapshots.map(item=>item.year))
  if (!years.has(200) || !years.has(262) || new Set(manifest.snapshots.map(item=>item.id)).size!==2)
    ctx.addIssue({code:'custom',path:['snapshots'],message:'图集须有独立的 200 年和 262 年参考断面'})
  if (new Set(manifest.sources.map(item=>item.id)).size!==manifest.sources.length)
    ctx.addIssue({code:'custom',path:['sources'],message:'图集来源 ID 重复'})
})
export type AtlasManifest = z.infer<typeof atlasManifestSchema>

const atlasProperties = z.object({
  id:identifier, name:text, kind:z.enum(['region','seat','river','lake','coast','island','sea']),
  basis:z.enum(['historical-schematic','modern-reference']),
  snapshotIds:z.array(identifier).min(1), precision:z.enum(['schematic-area','approximate-point','schematic-line']),
  sourceIds:z.array(identifier).min(1), note:text, periodLabel:text,
  parentName:text.optional(), seatFor:text.optional(), faction:text.optional(), labelPoint:point.optional(),
  priority:z.number().int().min(1).max(3),
})
const atlasGeoSchema = z.object({
  type:z.literal('FeatureCollection'),
  features:z.array(z.object({type:z.literal('Feature'),properties:atlasProperties,geometry})).min(1),
})
export type AtlasFeature = z.infer<typeof atlasGeoSchema>['features'][number]
export type AtlasProperties = AtlasFeature['properties']
export type AtlasSnapshot = AtlasManifest['snapshots'][number]
export type AtlasData = z.infer<typeof atlasGeoSchema>
export type AtlasLayers = {region:boolean;seat:boolean;water:boolean}

export function parseAtlas(raw:unknown,manifest:AtlasManifest):AtlasData {
  const knownSnapshots = new Set(manifest.snapshots.map(item=>item.id))
  const knownSources = new Set(manifest.sources.map(item=>item.id))
  const ids = new Set<string>()
  return atlasGeoSchema.superRefine(({features},ctx)=>{
    for (const [index,feature] of features.entries()) {
      const {id,snapshotIds,sourceIds,kind,basis,precision} = feature.properties
      const type = feature.geometry.type
      const fail = (message:string)=>ctx.addIssue({code:'custom',path:['features',index],message:`${id} ${message}`})
      if (ids.has(id)) fail('要素 ID 重复')
      ids.add(id)
      if (new Set(snapshotIds).size!==snapshotIds.length || snapshotIds.some(item=>!knownSnapshots.has(item)))
        fail('参考断面不存在或重复')
      if (new Set(sourceIds).size!==sourceIds.length || sourceIds.some(item=>!knownSources.has(item)))
        fail('来源不存在或重复')
      const shape = type==='Point' ? 'approximate-point' : type.endsWith('LineString') ? 'schematic-line' : 'schematic-area'
      if (shape!==precision) fail('几何与精度不一致')
      if (kind==='seat' && type!=='Point' || (kind==='river' || kind==='coast') && shape!=='schematic-line' ||
          (kind==='region' || kind==='lake') && shape==='schematic-line') fail('要素类别与几何不一致')
      if (kind==='island' && (basis!=='modern-reference' || snapshotIds.length!==knownSnapshots.size))
        fail('岛屿参照须适用于全部断面')
    }
  }).parse(raw)
}

export function referenceSnapshot(manifest:AtlasManifest,time:Scene['time']) {
  const year = time.year ?? 200
  return [...manifest.snapshots].sort((a,b)=>Math.abs(a.year-year)-Math.abs(b.year-year)||a.year-b.year)[0]
}

export function atlasFeatures(data:AtlasData, snapshotId:string, layers:AtlasLayers, modern:boolean) {
  return data.features.filter(({properties:{kind,basis,snapshotIds}})=>{
    if (!snapshotIds.includes(snapshotId)) return false
    if (kind==='island') return true
    if (basis==='modern-reference') return modern
    if (kind==='region') return layers.region
    if (kind==='seat') return layers.seat
    return layers.water
  })
}

export const atlasKindLabels = {
  region:'州郡概略',seat:'治所',river:'古河',lake:'古湖',coast:'已考海岸',island:'岛屿',sea:'海域',
}
