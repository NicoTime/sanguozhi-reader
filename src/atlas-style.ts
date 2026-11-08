import type { LayerSpecification } from 'maplibre-gl'
import type { AtlasFeature } from './historical-atlas'
import type { XY } from './geo'

export const atlasSourceId = 'history-atlas'
const kind = (value:string):['==',['get','kind'],string] => ['==',['get','kind'],value]

export const atlasMapLayers:LayerSpecification[] = [
  {id:'atlas-region-fill',type:'fill',source:atlasSourceId,filter:kind('region'),
    paint:{'fill-color':['match',['get','faction'],'魏','#a87a63','蜀','#8b9d72','吴','#729ca7','#bba06f'],'fill-opacity':.22}},
  {id:'atlas-region-edge',type:'line',source:atlasSourceId,filter:kind('region'),
    paint:{'line-color':'#836a4b','line-width':1,'line-opacity':.61,'line-dasharray':[3,3]}},
  {id:'atlas-lake',type:'fill',source:atlasSourceId,filter:kind('lake'),
    paint:{'fill-color':'#4b8791','fill-opacity':.39,'fill-outline-color':'#427880'}},
  {id:'atlas-river',type:'line',source:atlasSourceId,filter:kind('river'),
    paint:{'line-color':'#396e82','line-width':2,'line-opacity':.86,'line-dasharray':[5,2]}},
  {id:'atlas-coast',type:'line',source:atlasSourceId,filter:kind('coast'),
    paint:{'line-color':'#82614c','line-width':1.75,'line-opacity':.9,'line-dasharray':[2,3]}},
  {id:'atlas-seat',type:'circle',source:atlasSourceId,filter:kind('seat'),minzoom:4.2,
    paint:{'circle-radius':3,'circle-color':'#594d3f','circle-stroke-color':'#f7f0d9','circle-stroke-width':1}},
]
export const atlasLayerIds = atlasMapLayers.map(item=>item.id)

export function atlasLabelPoint(feature:AtlasFeature):XY {
  const {geometry,properties} = feature
  if (properties.labelPoint) return properties.labelPoint
  if (geometry.type==='Point') return geometry.coordinates
  if (geometry.type==='LineString' || geometry.type==='MultiLineString') {
    const line = geometry.type==='LineString' ? geometry.coordinates : geometry.coordinates[0]
    return line[Math.floor(line.length/2)]
  }
  const ring = (geometry.type==='Polygon' ? geometry.coordinates[0] : geometry.coordinates[0][0]).slice(0,-1)
  const [x,y] = ring.reduce(([x,y],[lon,lat])=>[x+lon,y+lat],[0,0])
  return [x/ring.length,y/ring.length]
}
