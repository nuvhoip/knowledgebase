// Duotone-thin icon from the Nuvho brand library (public/icons/<name>.svg, pre-tinted
// Blue Slate / Tropical Teal). `onDark` retints both layers white per nuvho-brand.
interface IconProps {
  name: string
  size?: number
  onDark?: boolean
  className?: string
  alt?: string
}

export default function Icon({ name, size = 16, onDark = false, className = '', alt = '' }: IconProps) {
  const file = name.endsWith('.svg') ? name : `${name}.svg`
  const classes = ['nv-ic', onDark ? 'nv-ic--w' : '', className].filter(Boolean).join(' ')
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/icons/${file}`}
      alt={alt}
      aria-hidden={alt ? undefined : true}
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className={classes}
    />
  )
}
