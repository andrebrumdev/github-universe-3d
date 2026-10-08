import {
  siC,
  siCplusplus,
  siCss,
  siDart,
  siDocker,
  siElixir,
  siGnubash,
  siGo,
  siHaskell,
  siHtml5,
  siJavascript,
  siJupyter,
  siKotlin,
  siLua,
  siOpenjdk,
  siPerl,
  siPhp,
  siPython,
  siR,
  siRuby,
  siRust,
  siSass,
  siScala,
  siSvelte,
  siSwift,
  siTypescript,
  siVuedotjs,
  siZig,
} from 'simple-icons'

// Só ícones nomeados (ESM) para o bundle ficar pequeno. Ícones em viewBox 24x24.
// Fora do pacote (removidos ou inexistentes): C#, Objective-C, Makefile, Java (só OpenJDK) — C#/Objective-C/Makefile caem no texto.
const ICONS: Record<string, { path: string }> = {
  TypeScript: siTypescript,
  JavaScript: siJavascript,
  CSS: siCss,
  HTML: siHtml5,
  Go: siGo,
  Shell: siGnubash,
  Python: siPython,
  Rust: siRust,
  Kotlin: siKotlin,
  Java: siOpenjdk,
  C: siC,
  'C++': siCplusplus,
  Ruby: siRuby,
  PHP: siPhp,
  Swift: siSwift,
  Dart: siDart,
  Vue: siVuedotjs,
  Svelte: siSvelte,
  Lua: siLua,
  Elixir: siElixir,
  Haskell: siHaskell,
  Scala: siScala,
  'Jupyter Notebook': siJupyter,
  Dockerfile: siDocker,
  SCSS: siSass,
  Zig: siZig,
  R: siR,
  Perl: siPerl,
}

export type LanguageBadge = { kind: 'icon'; path: string } | { kind: 'text'; text: string }

/** Sigla de 1–2 caracteres: palavra única → primeira letra + primeira consoante seguinte ("Hs", "Mk"); várias palavras → iniciais ("OC"). */
export function abbreviate(name: string): string {
  const words = name.split(/[\s\-_]+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length > 1) return (words[0][0] + words[1][0]).toUpperCase()
  const w = words[0]
  if (w.length === 1) return w.toUpperCase()
  const rest = w.slice(1).toLowerCase()
  const consonant = rest.match(/[b-df-hj-np-tv-z]/)
  return w[0].toUpperCase() + (consonant ? consonant[0] : rest[0])
}

export function languageBadge(name: string): LanguageBadge {
  const icon = ICONS[name]
  return icon ? { kind: 'icon', path: icon.path } : { kind: 'text', text: abbreviate(name) }
}
