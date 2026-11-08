import { useEffect, useId, useRef, useState } from 'react'
import './CreatorCredit.css'

// Keep profile links explicit: a public account number is not necessarily a profile URL ID.
const accounts: {platform:string;name:string;label:string;account:string;url?:string}[] = [
  {platform:'抖音',name:'旋转五花肉',label:'抖音号',account:'xunshan11853'},
  {platform:'B站',name:'爱巡山的大王',label:'UID',account:'3043064',url:'https://space.bilibili.com/3043064'},
  {platform:'小红书',name:'爱巡山的大王',label:'小红书号',account:'613044745',url:'https://www.xiaohongshu.com/user/profile/5c53be6b000000001003506f'},
]

export function CreatorCredit({art=false,onOpen}:{art?:boolean;onOpen?:()=>void}) {
  const [open,setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  return <>
    <button ref={trigger} className={`creator-credit${art?' creator-credit--art':''}`} type="button"
      aria-label="爱巡山的大王 · 查看创作者账号" aria-haspopup="dialog"
      onClick={()=>{onOpen?.();setOpen(true)}}>
      <span className="creator-stamp" aria-hidden="true">山</span>
      <span>爱巡山的大王<small>制作</small></span>
    </button>
    {open && <CreatorCard close={()=>{
      setOpen(false)
      requestAnimationFrame(()=>trigger.current?.focus({preventScroll:true}))
    }}/>}
  </>
}

function CreatorCard({close}:{close:()=>void}) {
  const ref = useRef<HTMLDialogElement>(null)
  const heading = useId()
  const [feedback,setFeedback] = useState('')
  useEffect(()=>{
    const dialog = ref.current!
    dialog.showModal()
    return ()=>dialog.close()
  },[])
  async function copy(account:string) {
    try {
      await navigator.clipboard.writeText(account)
      setFeedback(`已复制 ${account}，可在对应 App 中搜索。`)
    } catch {
      setFeedback('暂时无法自动复制，请选中或长按账号复制。')
    }
  }
  return <dialog ref={ref} className="creator-dialog" aria-labelledby={heading}
    onCancel={event=>{event.preventDefault();event.stopPropagation();close()}}
    onClick={event=>{if(event.target===event.currentTarget) close()}}>
    <div className="creator-card">
      <header className="creator-card-heading">
        <div><p className="eyebrow">三国志 · 原文伴读</p><h2 id={heading}>一起读三国</h2></div>
        <button type="button" className="icon-button" aria-label="关闭创作者信息" onClick={close}>×</button>
      </header>
      <p className="creator-intro">应用制作与音画编排 · 爱巡山的大王</p>
      <ul className="creator-accounts">
        {accounts.map(account=><li key={account.platform}>
          <div className="creator-account-title"><span>{account.platform}</span><strong>{account.name}</strong></div>
          <p className="creator-account-id">{account.label}：<span>{account.account}</span></p>
          <div className="creator-account-actions">
            {account.url && <a className="quiet-button" href={account.url} target="_blank" rel="noopener noreferrer">访问主页 ↗</a>}
            <button className="quiet-button" type="button" onClick={()=>void copy(account.account)}>复制{account.label}</button>
          </div>
        </li>)}
      </ul>
      <p className="creator-feedback" role="status">{feedback || '欢迎在这些平台找到我，交流阅读与创作。'}</p>
    </div>
  </dialog>
}
