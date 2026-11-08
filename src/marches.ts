import type { March, Place, Scene } from './types'
import type { Point } from './tactical-layout'

type Coordinates = [number,number]
export type MappedMarch = {march:March; from:Coordinates; to:Coordinates}
export type MarchArrow = {
  march:March; from:Point; to:Point; control:Point; tip:Point; tailLeft:Point; tailRight:Point
}

export function marchesForPhase(scene:Scene, phaseId:string|undefined):March[] {
  if (!phaseId) return []
  return (scene.marches ?? []).filter(march => march.phaseIds.includes(phaseId))
    .sort((a,b) => a.faction.localeCompare(b.faction) || a.order-b.order)
}

export function mappedMarches(marches:March[], places:Map<string,Place>):MappedMarch[] {
  return marches.flatMap(march => {
    if (march.precision!=='schematic' || !march.from || !march.to) return []
    const from = places.get(march.from)?.coordinates
    const to = places.get(march.to)?.coordinates
    return from && to ? [{march,from,to}] : []
  })
}

export function projectMarches(routes:MappedMarch[], project:(position:Coordinates)=>Point):MarchArrow[] {
  return routes.flatMap(route => {
    const from = project(route.from)
    const to = project(route.to)
    const dx = to.x-from.x, dy = to.y-from.y
    const length = Math.hypot(dx,dy)
    if (length<3) return []
    const ux = dx/length, uy = dy/length
    const bend = Math.min(22,length*.13)
    const clearance = Math.min(11,length*.20)
    const tip = {x:to.x-ux*clearance,y:to.y-uy*clearance}
    const control = {x:(from.x+tip.x)/2-uy*bend,y:(from.y+tip.y)/2+ux*bend}
    const tangent = Math.hypot(tip.x-control.x,tip.y-control.y)
    const vx = (tip.x-control.x)/tangent, vy = (tip.y-control.y)/tangent
    const headLength = Math.min(14,length*.31), headWidth = headLength*.52
    const tail = {x:tip.x-vx*headLength,y:tip.y-vy*headLength}
    return [{march:route.march,from,to,control,tip,
      tailLeft:{x:tail.x-vy*headWidth,y:tail.y+vx*headWidth},
      tailRight:{x:tail.x+vy*headWidth,y:tail.y-vx*headWidth}}]
  })
}

export function marchPoint(arrow:MarchArrow, t:number):Point {
  const r = 1-t
  const {from,control,tip} = arrow
  return {
    x:r*r*from.x+2*r*t*control.x+t*t*tip.x,
    y:r*r*from.y+2*r*t*control.y+t*t*tip.y,
  }
}
