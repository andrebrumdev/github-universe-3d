# GitHub Universe 3D

Visualização 3D interativa que transforma um perfil do GitHub em uma galáxia: o sol é o perfil, cada planeta é um
repositório, as luas são as linguagens, a superfície do planeta é o grid de contribuições e um Octocat piloto guia a visita.

> Status: MVP em desenvolvimento. Site estático (Vite + React Three Fiber) publicado no GitHub Pages.

## O que tem no universo

- **Planetas = repositórios**, com tamanho relativo ao perfil. A superfície mostra as 52 semanas de contribuição como
  quadradinhos brilhantes, de polo a polo, divididos em dois hemisférios.
- **Luas = linguagens**, com o logo de cada uma.
- **Órbitas de Kepler** com orientação de Euler, precessão apsidal e ressonâncias.
- **Sol** com rosto de LED no estilo "Sphere": olhar com personalidade (segue a nave, o mouse, a frente, admira planetas),
  squash and stretch, névoa e aberração cromática.
- **Octocat na nave, com o Clawd na cabeça**: escolta perto da lente, transferências de Hohmann com assistência
  gravitacional, câmera de perseguição puxada pela nave, propulsor com shader de fogo e rastro, tentáculos com Verlet.
- **Cometas** para atividade recente e **troianos** para forks.
- **Hover com o README** do repositório em um cartão.
- **Tutorial guiado** (abre na primeira visita; reabra em "? Tutorial") e **modo apresentação** ("▶ Apresentação" ou
  `?apresentacao` na URL para compartilhar o link já em tour).
- **Reduzir movimento**: respeita `prefers-reduced-motion`.
- **Bloom** só no desktop; `?nobloom` desliga. `?perf` mostra o FPS.

## Rodar localmente

```bash
pnpm install
pnpm dev            # http://localhost:5173/github-universe-3d/ (usa public/universe.json de exemplo)
pnpm sample         # regenera o public/universe.json de exemplo
pnpm lint
pnpm typecheck
pnpm test           # testes unitários (Vitest)
pnpm e2e            # smoke test (Playwright, WebGL por software)
```

Para ver o seu próprio perfil: copie `.env.example` para `.env.local`, preencha `UNIVERSE_TOKEN` (token fine-grained, só
leitura de repositórios públicos) e `UNIVERSE_LOGIN`, e rode `pnpm snapshot`. Não commite o `universe.json` gerado assim;
o commitado vem de `pnpm sample`. O token nunca vai para o cliente (nenhuma variável `VITE_`).

Na URL: `?nobloom` (sem bloom), `?perf` (FPS), `?apresentacao` (começa o tour). Em desenvolvimento,
`?preview=octocat` abre só o Octocat 3D.

## Deploy

O workflow `Deploy` roda em push na `main`, a cada 6 horas e manualmente. Ele gera `universe.json` com o GitHub GraphQL,
faz o build e publica no GitHub Pages. Se o snapshot falhar (ou o secret não existir), nada é publicado e o site anterior
continua no ar. O workflow `CI` roda lint, typecheck, testes, build e o smoke e2e em PRs e em branches fora da `main`.

### Configuração única no GitHub (para o dono do repositório)

1. Garantir que o repositório é público (o Pages gratuito exige) e que o remoto `origin` existe.
2. Criar um token fine-grained de leitura de repositórios públicos e salvá-lo em Settings → Secrets and variables →
   Actions → secret `UNIVERSE_TOKEN`. O token expira (no máximo 1 ano): renove antes disso.
3. Settings → Pages → Source: **GitHub Actions**.
4. Dar push na `main`, o que dispara o primeiro deploy, e abrir `https://<usuário>.github.io/github-universe-3d/`.
5. O GitHub desativa workflows agendados em repositórios sem atividade por 60 dias; um push ou um disparo manual reativa.

## Checklist visual

- [ ] Planetas em anéis, mais rápidos perto do sol, eixos inclinados, quadradinhos quadrados no equador.
- [ ] Hover em planeta do top 10 mostra data e commits.
- [ ] Clique em planeta: o sistema para e o painel abre à direita (bottom sheet no mobile).
- [ ] Rosto do sol segue a nave e o mouse, com atraso, e olha para cima e para baixo.
- [ ] Octocat com nave roxo clara, falas contextuais, tutorial guiado.
- [ ] "▶ Apresentação" e `?apresentacao` percorrem o perfil e os repositórios.
- [ ] "Reduzir movimento" no sistema deixa tudo parado.
- [ ] Lighthouse: performance ≥ 80 no desktop; `?perf` mostra ~60 fps.

## Conteúdo do repositório

- [`docs/brief.md`](docs/brief.md): brief completo do projeto.
- [`demo/index.html`](demo/index.html): demo antiga em Three.js com dados de exemplo.
- [`design/`](design): artboards do Octocat piloto, da nave retrô e do gorro-Clawd (formato `.dc.html` do Claude Design).

## Stack

Vite, React, TypeScript, React Three Fiber, drei, postprocessing, Zustand, Tailwind, Framer Motion, GitHub GraphQL API,
GitHub Actions, GitHub Pages.

## Aviso

Octocat é marca do GitHub e o Clawd é do Claude Code (Anthropic). Este é um projeto de portfólio sem fins comerciais e não é afiliado a nenhuma das duas empresas.
