import type { Deployment, HistoricalRiver } from './types'
import { marchPoint } from './marches'
import type { MarchArrow } from './marches'

export type Point = {x:number;y:number}
export type Box = Point & {width:number;height:number}
export type FlagInput = {deployment:Deployment;anchor:Point}
export type RiverInput = {river:HistoricalRiver; paths:Point[][]}
export type FlagLabel = FlagInput & {box:Box}
export type RiverLabel = {river:HistoricalRiver;box:Box;anchor:Point}

function overlaps(a:Box,b:Box,gap=0) {
  return a.x < b.x+b.width+gap && a.x+a.width+gap > b.x &&
    a.y < b.y+b.height+gap && a.y+a.height+gap > b.y
}

const center = (box:Box):Point => ({x:box.x+box.width/2,y:box.y+box.height/2})
function distance(a:Point,b:Point) { return Math.hypot(a.x-b.x,a.y-b.y) }

function clamped(box:Box,width:number,height:number):Box {
  return {...box,x:Math.max(5,Math.min(width-box.width-5,box.x)),y:Math.max(5,Math.min(height-box.height-5,box.y))}
}

function candidates(anchor:Point,width:number,height:number,dir:number) {
  const choices:Box[] = []
  for (const radius of [16,32,49,68,90,120,150]) {
    for (const [dx,dy] of [[dir,-.55],[-dir,-.55],[0,-1],[dir,.55],[-dir,.55],[0,1],[dir,0],[-dir,0]]) {
      const x = anchor.x+dx*(radius+width/2)-width/2
      const y = anchor.y+dy*(radius+height/2)-height/2
      choices.push({x,y,width,height})
    }
  }
  return choices
}

function pointAt(a:Point,b:Point,t:number) {
  return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t}
}

export function layoutTactics(width:number,height:number,flags:FlagInput[],rivers:RiverInput[],obstacles:Box[],arrows:MarchArrow[] = []) {
  const occupied = [...obstacles]
  const visible = (point:Point,padding=0) => point.x>=padding && point.y>=padding &&
    point.x<=width-padding && point.y<=height-padding
  const flagLabels:FlagLabel[] = []
  const riverLabels:RiverLabel[] = []
  for (const [index,flag] of flags.entries()) {
    if (!visible(flag.anchor)) continue
    const labelWidth = Math.min(138, Math.max(104, 68 + Array.from(flag.deployment.label).length * 14))
    const labelHeight = 31
    const choices = candidates(flag.anchor,labelWidth,labelHeight,index%2===0 ? -1 : 1)
      .map(box => clamped(box,width,height))
    const free = choices.find(box => !occupied.some(item => overlaps(box,item,4)))
    if (free) {
      flagLabels.push({...flag,box:free})
      occupied.push(free)
    }
  }

  for (const entry of rivers) {
    const labelWidth = Math.min(186,50+Array.from(entry.river.properties.name).length*12)
    const labelHeight = 23
    const points:Point[] = []
    for (const path of entry.paths) {
      for (let i=1;i<path.length;i++) {
        const steps = Math.max(1,Math.min(160,Math.ceil(distance(path[i-1],path[i])/22)))
        for (let j=0;j<=steps;j++) {
          const point = pointAt(path[i-1],path[i],j/steps)
          if (visible(point,12)) points.push(point)
        }
      }
    }
    const ideal = {x:width*.52,y:height*.42}
    points.sort((a,b) => distance(a,ideal)-distance(b,ideal))
    let found = false
    for (const anchor of points) {
      for (const offset of [-30,7,-43,19]) {
        const box = clamped({x:anchor.x-labelWidth/2,y:anchor.y+offset,width:labelWidth,height:labelHeight},width,height)
        if (occupied.some(item => overlaps(box,item,3))) continue
        riverLabels.push({river:entry.river,box,anchor})
        occupied.push(box)
        found = true
        break
      }
      if (found) break
    }
  }
  const marchLabels: {arrow:MarchArrow; box:Box; anchor:Point}[] = []
  for (const [index,arrow] of arrows.entries()) {
    const anchors = [.52,.38,.65,.25,.77,.14,.87].map(t=>marchPoint(arrow,t)).filter(point=>visible(point,10))
    if (!anchors.length) continue
    const outward = index%2===0 ? -1 : 1
    const offsets = [[0,-18],[0,18],[outward*18,0],[-outward*18,0],[0,-33],[0,33],
      [outward*28,-25],[-outward*28,25],[outward*47,0],[-outward*47,0],
      [outward*65,-13],[-outward*65,13],[outward*79,-23],[-outward*79,23]]
    const free = (box:Box) => !occupied.some(item=>overlaps(box,item,4))
    let label: {box:Box;anchor:Point}|undefined
    for (const anchor of anchors) {
      const box = offsets.map(([dx,dy]) => clamped({x:anchor.x+dx-13,y:anchor.y+dy-13,width:26,height:26},width,height))
        .find(free)
      if (box) { label = {box,anchor}; break }
    }
    // Dense maps can box in the whole short arrow. Find the nearest clear
    // badge slot in that case, with a leader back to the route.
    if (!label) {
      let shortest = Infinity
      for (let y=5; y+31<=height; y+=10) {
        for (let x=5; x+31<=width; x+=10) {
          const box = {x,y,width:26,height:26}
          if (!free(box)) continue
          for (const anchor of anchors) {
            const gap = distance(center(box),anchor)
            if (gap<shortest) { shortest=gap; label={box,anchor} }
          }
        }
      }
    }
    if (label) {
      marchLabels.push({arrow,...label})
      occupied.push(label.box)
    }
  }
  return {flagLabels,riverLabels,marchLabels}
}
