import { Fragment, useState } from 'react'
import { assetUrl } from '../geo'
import { readingRuns } from '../reading-aids'
import type { Pronunciation, PortraitStage } from '../reading-aids'

export function PronouncedText({text,entries,offset=0}:{text:string;entries?:Pronunciation[];offset?:number}) {
  if (!entries?.length) return text
  return readingRuns(text,entries,offset).map(({text,reading,entry},i) =>
    reading ? <ruby className="pronunciation-ruby" key={i} title={entry?.explanation}>
      {text}<rt>{reading}</rt>
    </ruby> : <Fragment key={i}>{text}</Fragment>)
}

export function PortraitImage({stage,thumbnail=false}:{stage:PortraitStage;thumbnail?:boolean}) {
  const [failed,setFailed] = useState(false)
  if (failed) return null
  return <img className={thumbnail?'portrait-thumbnail':'portrait-image'} src={assetUrl(stage.imagePath)}
    alt={thumbnail?'':stage.alt} width={thumbnail?24:144} height={thumbnail?32:216}
    loading="lazy" decoding="async" onError={()=>setFailed(true)}/>
}
