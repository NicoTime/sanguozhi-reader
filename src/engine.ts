import { mappedMarches, marchesForPhase } from './marches'
import type { Chapter, Deployment, HistoricalRivers, MapProfile, Place } from './types'

type Selection = {sceneId?:string|null;phaseId?:string|null}
export function withinProfile(point:[number,number], profile:MapProfile) {
  const {west,south,east,north} = profile.bounds
  return point[0]>=west && point[0]<=east && point[1]>=south && point[1]<=north
}
const isPositioned = (deployment:Deployment):deployment is Deployment & {coordinates:[number,number]} => deployment.coordinates!==null

export function resolveScene(chapter:Chapter, selection:Selection) {
  const scene = chapter.scenes.find(item=>item.id===selection.sceneId) ?? chapter.scenes[0]
  const phases = scene.battlePhases ?? []
  const phase = phases.find(item=>item.id===selection.phaseId) ?? phases[0] ?? null
  const mapProfile = chapter.mapProfiles.find(item=>item.id===(scene.mapProfileId ?? chapter.defaultMapProfileId))!
  const factions = new Map(chapter.factions.map(item=>[item.id,item]))
  const places = new Map<string,Place>(chapter.places.map(item=>[item.id,item]))
  const marches = marchesForPhase(scene,phase?.id)
  const routes = mappedMarches(marches,places)
  const deployments = phase?.deployments ?? []
  const mapDeployments = deployments.filter(isPositioned)
  const positions = scene.placeIds.flatMap(id => {
    const coordinates = places.get(id)?.coordinates
    return coordinates ? [coordinates] : []
  })
  const focus = scene.focusPlaceId ? places.get(scene.focusPlaceId)?.coordinates : null
  const points = [...positions,...mapDeployments.map(flag=>flag.coordinates),...routes.flatMap(route=>[route.from,route.to])]
    .filter(point=>withinProfile(point,mapProfile))
  const center = focus && withinProfile(focus,mapProfile) ? focus : points[0] ?? mapProfile.center
  return {scene,phase,phases,mapProfile,factions,places,marches,routes,deployments,mapDeployments,
    unlocatedMarches:marches.filter(march=>march.precision==='unlocated'),
    camera:{center,points}, historicalRiverIds:scene.historicalRiverIds}
}

export type ResolvedScene = ReturnType<typeof resolveScene>
export function riversForScene(rivers:HistoricalRivers|null, ids:ResolvedScene['historicalRiverIds']):HistoricalRivers|null {
  if (!rivers || ids===undefined) return rivers
  const features = rivers.features.filter(river=>ids.includes(river.properties.id))
  return features.length ? {type:'FeatureCollection',features} : null
}

export function sceneYear(time:Chapter['scenes'][number]['time']) {
  if (time.year===null) {
    if (time.label.includes('跨年') || time.era.includes('跨年')) return '跨年叙述'
    return /未详|不详|未知|失考/.test(time.era) ? '年代未详' : '具体年份未定'
  }
  const period = time.year>0 ? `公元 ${time.year} 年` : `公元前 ${1-time.year} 年`
  return time.certainty==='inferred' ? `${period}（推定）` : period
}
