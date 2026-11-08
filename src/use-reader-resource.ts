import { useEffect, useState } from 'react'
import { assetUrl } from './geo'

type Resource<T> = {state:'loading'} | {state:'error';error:unknown} | {state:'ready';data:T}

export function useReaderResource<T>(path:string|null,parse:(raw:unknown)=>T,requestVersion=0):Resource<T> {
  const [result,setResult] = useState<Resource<T>>({state:'loading'})
  useEffect(() => {
    setResult({state:'loading'})
    if (path===null) return
    const controller = new AbortController()
    fetch(assetUrl(path),{signal:controller.signal,cache:'no-cache'})
      .then(response=>{
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json()
      }).then(raw=>{
        if (!controller.signal.aborted) setResult({state:'ready',data:parse(raw)})
      }).catch((error:unknown)=>{
        if (!controller.signal.aborted) setResult({state:'error',error})
      })
    return () => controller.abort()
  },[path,parse,requestVersion])
  return result
}
