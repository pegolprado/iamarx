import clsx from 'clsx'

/** Nome "MARX" no desenho original do logotipo (recorte do arquivo, sem o fundo). Padrão em todo o sistema. */
export function MarxLogo({ className, alt = 'MARX' }: { className?: string; alt?: string }) {
  return <img src="/brand/marx.webp" alt={alt} width={591} height={111} className={clsx('block w-auto select-none', className)} draggable={false} />
}

/** Símbolo (coruja) + MARX + INTELLIGENCE PRO, compacto, para barras e menus. */
export function BrandLockup({ compact }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <img src="/icon-192.png" alt="" width={192} height={192} className={clsx('rounded-lg ring-1 ring-line', compact ? 'h-7 w-7' : 'h-9 w-9')} />
      <span className="flex flex-col gap-[5px]">
        <MarxLogo className={compact ? 'h-[13px]' : 'h-[16px]'} alt="MARX Intelligence Pro" />
        <span className={clsx('font-medium tracking-[0.2em] text-gold/90', compact ? 'text-[8px]' : 'text-[9px]')}>INTELLIGENCE PRO</span>
      </span>
    </span>
  )
}
