import type { RefObject } from 'react'
import type { DramaClip } from '../drama'
import type { DramaActions } from './DramaPlayer'
import { Icon } from './Icons'

export function DramaEntries({clips,people,player}:{clips?:DramaClip[];people:Map<string,{name:string}>;player:RefObject<DramaActions|null>}) {
  return <>{clips?.map(clip=>{
    const name=people.get(clip.speakerId)!.name
    return <div className="drama-entry" key={clip.id} data-drama-id={clip.id}>
      <button type="button" className="quiet-button drama-entry-button" aria-haspopup="dialog"
        aria-label={`听${name}：${clip.title}`} onPointerEnter={event=>{if(event.pointerType==='mouse') player.current?.warm(clip)}}
        onFocus={()=>player.current?.warm(clip)}
        onClick={event=>player.current?.open(clip,event.currentTarget)}><Icon name="play"/>听{name}</button>
      <p>{clip.quote.text.match(/^[^。！？]+[。！？]?/u)?.[0] ?? clip.quote.text}</p>
    </div>
  })}</>
}
