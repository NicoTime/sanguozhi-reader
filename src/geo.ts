import type { FeatureCollection, LineString } from 'geojson'
import type { Chapter, Place, Scene } from './types'

export const assetUrl = (path:string) => import.meta.env.BASE_URL + path.replace(/^\//,'')
export const isMapped = (place:Place):place is Place & {coordinates:[number,number]} => place.coordinates !== null
export const prefersStill = () => matchMedia('(prefers-reduced-motion: reduce)').matches

export type XY = [number,number]
export const distance = (a:XY,b:XY) => Math.hypot((a[0]-b[0])*0.82,a[1]-b[1])
export function movementLines(scene:Scene, places:Map<string,Place>): FeatureCollection<LineString> {
  return {type:'FeatureCollection', features:scene.movements.flatMap(movement => {
    const start = places.get(movement.from)?.coordinates, end = places.get(movement.to)?.coordinates
    return start && end ? [{type:'Feature' as const, geometry:{type:'LineString' as const, coordinates:[start,end]},
      properties:{label:movement.label}}] : []
  })}
}

export function relatedScenes(chapter:Chapter, id:string) {
  return chapter.scenes.filter(scene => scene.placeIds.includes(id) || scene.movements.some(move => move.from===id || move.to===id) || scene.marches?.some(move=>move.from===id || move.to===id))
}

export function mercatorY(latitude:number) {
  const limited = Math.max(-85,Math.min(85,latitude))
  return Math.asinh(Math.tan(limited * Math.PI/180))
}
