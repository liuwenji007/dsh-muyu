declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}

declare module '*.css'

declare module '*.svg' {
  const href: string
  export default href
}

declare module '*.png' {
  const href: string
  export default href
}

declare module '*.webp' {
  const href: string
  export default href
}

declare module '*.gif' {
  const href: string
  export default href
}
