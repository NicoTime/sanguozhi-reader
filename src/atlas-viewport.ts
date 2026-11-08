import type { XY } from './geo'

type Bounds = {west:number; south:number; east:number; north:number}

export const atlasViewport = {
  imagePath: '/maps/national-relief.jpg',
  imageBounds: {west:67.5,south:0,east:146.25,north:61.60639637138627},
  overviewBounds: {west:73,south:17,east:136,north:54},
  panBounds: {west:25,south:-25,east:178,north:76},
  minZoom: 0,
} satisfies {imagePath:string;imageBounds:Bounds;overviewBounds:Bounds;panBounds:Bounds;minZoom:number}

export type FreeViewport = {center:XY; zoom:number}

export function corners({west,south,east,north}:Bounds):[XY,XY] {
  return [[west,south],[east,north]]
}

export function imageCorners({west,south,east,north}:Bounds):[XY,XY,XY,XY] {
  return [[west,north],[east,north],[east,south],[west,south]]
}

export function overviewPadding(width:number,height:number) {
  const horizontal = Math.min(58,Math.max(20,width*.13))
  const vertical = Math.min(53,Math.max(24,height*.14))
  return {top:vertical,right:horizontal,bottom:vertical,left:horizontal}
}
