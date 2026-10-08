import { describe, expect, it } from 'vitest'
import { summarizeReadme } from './readme'

describe('summarizeReadme', () => {
  it('ignora título, badges e fica com a descrição', () => {
    const md = `# universe-3d

[![CI](https://img.shields.io/ci.svg)](https://ci) ![npm](https://img.shields.io/npm.svg)

Transforma o seu perfil do **GitHub** em uma galáxia 3D, com \`React\` e [Three.js](https://threejs.org).

## Instalação

\`\`\`bash
pnpm install
\`\`\`
`
    expect(summarizeReadme(md, 280)).toBe(
      'Transforma o seu perfil do GitHub em uma galáxia 3D, com React e Three.js.',
    )
  })

  it('lida com cabeçalho HTML centralizado', () => {
    const md = `<p align="center">
  <img src="logo.png" width="120">
</p>
<h1 align="center">api-gateway</h1>
<!-- comentário oculto -->
<p align="center">Gateway rápido para microsserviços em Go.</p>

Roteia, autentica e limita requisições.`
    expect(summarizeReadme(md)).toBe('Gateway rápido para microsserviços em Go. Roteia, autentica e limita requisições.')
  })

  it('pula código que vem primeiro e blocos indentados', () => {
    const md = '```sh\nnpm i foo\n```\n\n    indented code\n\nUma biblioteca pequena para validar formulários.'
    expect(summarizeReadme(md)).toBe('Uma biblioteca pequena para validar formulários.')
  })

  it('preserva português com acentos e corta em palavra com reticências', () => {
    const md = '# Projeto\n\nAplicação de gestão de alunos com avaliações, frequência e relatórios detalhados para coordenação pedagógica.'
    const out = summarizeReadme(md, 60)!
    expect(out.endsWith('…')).toBe(true)
    expect(out.length).toBeLessThanOrEqual(60)
    expect(out).toBe('Aplicação de gestão de alunos com avaliações, frequência e…')
  })

  it('remove front matter, tabelas e linhas horizontais', () => {
    const md = '---\ntitle: x\n---\n# T\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n---\n\nTexto útil aqui.'
    expect(summarizeReadme(md)).toBe('Texto útil aqui.')
  })

  it('descarta parágrafo que é só o nome do repo ou índice', () => {
    const md = '# notes\n\nnotes\n\nTable of contents\n\nCaderno de anotações pessoais.'
    expect(summarizeReadme(md, 280, 'notes')).toBe('Caderno de anotações pessoais.')
  })

  it('retorna null para vazio ou só badges', () => {
    expect(summarizeReadme('')).toBeNull()
    expect(summarizeReadme('   \n\n')).toBeNull()
    expect(summarizeReadme('![a](b.svg)\n[![c](d.svg)](e)\n')).toBeNull()
    expect(summarizeReadme('# Só título')).toBeNull()
  })
})
