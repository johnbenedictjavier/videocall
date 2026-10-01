import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Check, CircleUserRound } from 'lucide-react'
import { cn } from '../utils/cn'
import { getInitials } from '../utils/format'

export function Avatar({ src, name, size = 'md', online = false, className }: { src?: string; name: string; size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'; online?: boolean; className?: string }) {
  const [failed, setFailed] = useState(false)
  const sizes = { xs: 'h-7 w-7 text-[9px]', sm: 'h-9 w-9 text-[11px]', md: 'h-11 w-11 text-xs', lg: 'h-14 w-14 text-sm', xl: 'h-20 w-20 text-lg' }
  return (
    <span className={cn('relative inline-flex shrink-0 items-center justify-center overflow-visible rounded-full bg-mint font-extrabold text-moss', sizes[size], className)}>
      {!failed && src ? <img src={src} alt={name} className="h-full w-full rounded-full object-cover" onError={() => setFailed(true)} /> : <span>{getInitials(name)}</span>}
      {online && <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-[#55b97e]" />}
    </span>
  )
}

export function Button({ variant = 'primary', size = 'md', className, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'soft' | 'danger'; size?: 'sm' | 'md' | 'lg' }) {
  const customLightBackground = variant === 'primary' && typeof className === 'string' && /(^|\s)!?bg-white(\s|$)/.test(className)
  return (
    <button className={cn('inline-flex items-center justify-center gap-2 rounded-2xl font-bold transition duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50', {
      'bg-moss text-white shadow-[0_8px_20px_rgba(46,107,76,0.2)] hover:bg-[#245a3f]': variant === 'primary' && !customLightBackground,
      'border border-[#dfe8df] bg-white text-ink hover:border-moss/40 hover:bg-cream': variant === 'secondary',
      'text-ink hover:bg-mist': variant === 'ghost',
      'bg-mint text-moss hover:bg-[#d7eddd]': variant === 'soft',
      'bg-[#fff0ec] text-[#bb5c42] hover:bg-[#ffe2db]': variant === 'danger',
      'px-3 py-2 text-xs': size === 'sm',
      'px-4 py-3 text-sm': size === 'md',
      'px-5 py-3.5 text-sm': size === 'lg',
    }, className)} {...props}>{children}</button>
  )
}

export function IconButton({ label, className, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button aria-label={label} title={label} className={cn('inline-flex h-10 w-10 items-center justify-center rounded-2xl text-[#6a786f] transition hover:bg-mist hover:text-ink', className)} {...props}>{children}</button>
}

export function Pill({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'green' | 'orange' | 'blue'; className?: string }) {
  return <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.12em]', {
    'bg-mist text-[#6d7a71]': tone === 'neutral',
    'bg-mint text-moss': tone === 'green',
    'bg-[#fff0d9] text-[#ae6b1d]': tone === 'orange',
    'bg-[#e9f2ff] text-[#4774b9]': tone === 'blue',
  }, className)}>{children}</span>
}

export function ProgressBar({ value, color = 'bg-moss', className }: { value: number; color?: string; className?: string }) {
  return <div className={cn('h-2 overflow-hidden rounded-full bg-mist', className)}><div className={cn('h-full rounded-full transition-all duration-700', color)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>
}

export function ScoreRing({ score, size = 'md' }: { score: number; size?: 'sm' | 'md' | 'lg' }) {
  const dimensions = size === 'lg' ? 'h-28 w-28' : size === 'sm' ? 'h-14 w-14' : 'h-20 w-20'
  const text = size === 'lg' ? 'text-2xl' : size === 'sm' ? 'text-sm' : 'text-lg'
  return <div className={cn('relative flex shrink-0 items-center justify-center rounded-full bg-[conic-gradient(#2e6b4c_0deg,#2e6b4c_calc(var(--score)*3.6deg),#e8efe8_calc(var(--score)*3.6deg),#e8efe8_360deg)]', dimensions)} style={{ '--score': score } as React.CSSProperties}><div className={cn('flex h-[78%] w-[78%] flex-col items-center justify-center rounded-full bg-white font-display font-bold text-ink', text)}><span>{score}%</span><span className="text-[8px] font-sans font-extrabold uppercase tracking-[0.12em] text-moss">match</span></div></div>
}

export function SectionTitle({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return <div className="mb-4 flex items-end justify-between gap-4"><div>{eyebrow && <p className="mb-1 text-[10px] font-extrabold uppercase tracking-[0.2em] text-moss">{eyebrow}</p>}<h2 className="font-display text-xl font-semibold tracking-[-0.03em] text-ink">{title}</h2></div>{action}</div>
}

export function EmptyState({ icon: Icon = CircleUserRound, title, body, action }: { icon?: typeof CircleUserRound; title: string; body: string; action?: ReactNode }) {
  return <div className="flex flex-col items-center justify-center rounded-[28px] border border-dashed border-[#dce6dc] bg-white px-6 py-12 text-center"><div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-mint text-moss"><Icon size={25} /></div><h3 className="font-display text-lg font-semibold text-ink">{title}</h3><p className="mt-2 max-w-sm text-sm leading-6 text-[#758178]">{body}</p>{action && <div className="mt-5">{action}</div>}</div>
}

export function ReadState({ read }: { read: boolean }) {
  return <span className={cn('inline-flex text-[10px]', read ? 'text-moss' : 'text-[#a5b0a8')}><Check size={12} strokeWidth={3} /><Check className="-ml-1.5" size={12} strokeWidth={3} /></span>
}
