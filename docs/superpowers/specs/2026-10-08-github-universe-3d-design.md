# GitHub Universe 3D — Design (MVP)

Data: 2026-10-08
Base: `docs/brief.md`

## 1. Objetivo e escopo

Projeto de portfólio: o perfil do GitHub do autor vira uma galáxia 3D interativa. O sucesso do MVP é uma demo online, fluida e bonita, que impressiona um recrutador em ~30 segundos.

**Mapeamento:** galáxia = perfil · planeta = repositório · luas = linguagens · textura do planeta = grid 52×7 de atividade · sol = globo interativo do perfil · Octocat = guia em nave.

### Decisões fechadas
| Tema | Decisão |
|---|---|
| Stack | Next.js, React Three Fiber + drei, TypeScript, Tailwind, Framer Motion, Zustand |
| Atividade dos planetas | Híbrido: top 10 repos com commits reais por dia; demais com padrão derivado de `pushedAt` e stars |
| Fonte de dados | Só o perfil do autor, buscado no servidor com cache (ISR, revalidate ~6h) |
| Info do planeta | Painel lateral à direita (bottom sheet no mobile), em DOM fora do `<Canvas>`; drei cuida de câmera, estrelas e hover |
| Superfície do planeta | `CanvasTexture` por planeta (grid 52×7), isolada em `PlanetSurface` |
| Defaults assumidos | Lua proporcional a bytes por linguagem; posição por mix stars+recência (mais relevantes perto do sol); intensidade do quadradinho variável com commits; hover mostra data e contagem |

### Fora do MVP (V2)
Múltiplas galáxias, nível "universo", link `/<username>`, tema claro, LOD/instancing, Redis, username dinâmico. A arquitetura não bloqueia nenhum: `fetchUniverse(username)` já recebe o usuário, fixo no MVP.

## 2. Arquitetura e fluxo de dados

```
src/
  app/
    page.tsx              # Server Component: busca dados em cache e entrega ao client
    api/universe/route.ts # GET → JSON normalizado (debug)
    api/repo/[name]/route.ts # detalhes sob demanda (último commit, total de commits)
  lib/github/
    queries.ts            # GraphQL: perfil, repos, linguagens, calendário
    fetchUniverse.ts      # orquestra as queries, devolve o modelo de domínio
    normalize.ts          # GraphQL cru → tipos do app (puro)
  lib/universe/
    layout.ts             # posições, tamanhos, órbitas (puro)
    activity.ts           # top 10: commits reais; demais: padrão derivado (puro)
  components/three/       # Scene, Sun, Planet, PlanetSurface, Moon, CameraRig
  components/ui/          # ProfilePanel, PlanetPanel, Tooltip, Octocat, Tutorial
  store/universe.ts       # Zustand: seleção, foco, tutorial, hover
```

**Fluxo**
1. `page.tsx` (servidor) chama `fetchUniverse()` com `revalidate` de poucas horas. O token fica só no servidor.
2. `fetchUniverse` faz 1 query de perfil+repos (linguagens, stars, forks, `pushedAt`) e 1 query por repo do top 10 para commits das últimas 52 semanas, em paralelo, agrupados por dia.
3. O dado normalizado vai ao client como props. O 3D não faz fetch. Último commit e total de commits vêm sob demanda.
4. Falha do GitHub: serve o último cache válido (stale-while-revalidate); sem cache, usa `public/universe.snapshot.json`.

**Princípio:** `layout.ts` e `activity.ts` são funções puras, sem Three.js, testáveis sem GPU.

**Nota técnica:** o `contributionCalendar` do GitHub existe só por usuário, não por repo. A atividade por repo exige paginar o histórico de commits, daí o limite de 10 repos reais.

## 3. Cena 3D, sol e câmera

**Scene:** `<Canvas>` único em tela cheia, fundo `#0a0e27`, `<Stars>` do drei, luz pontual no sol. `dpr` em `[1, 2]`, `<Suspense>` com loader.

**Planeta:** raio por escala logarítmica de stars+forks com mínimo e máximo. `PlanetSurface` recebe `weeks[52][7]` e devolve o material com `CanvasTexture` (células `#10b981`, opacidade proporcional aos commits, respiro entre células). Hover: raycast → `uv` → semana/dia → tooltip (data + commits). Rotação lenta no eixo; drag gira o planeta em foco. Repos fora do top 10 usam o mesmo componente, sem tooltip de data real.

**Luas:** uma por linguagem, órbita em plano levemente inclinado, raio ∝ √bytes, cor oficial da linguagem. Órbita animada em `useFrame` (ângulo + velocidade). Clique abre card com linguagem e percentual.

**Sol:** esfera azul e verde com glow ciano (esfera maior `BackSide`, aditiva). Rosto desenhado em `CanvasTexture`, redesenhado só quando a expressão muda. Máquina de estados `idle | hover | click | away` controla posição (lerp com delay), brilho, expressão e piscada aleatória (3–5s). Distância do mouse via pointer projetado no plano da cena. Clique: salto/vibração + `openProfile()`.

**Câmera (`CameraControls` do drei):** dois níveis no MVP — galáxia (órbita livre limitada) e planeta (zoom focado com alvo deslocado para abrir espaço ao painel). Clique em planeta → `setLookAt` suave. Esc, clique no vazio ou botão voltam. Scroll para longe da galáxia fica travado no MVP.

## 4. UI, Octocat e tutorial

**Camada DOM:** fora do `<Canvas>`, container com `pointer-events: none` e filhos interativos com `auto`. Tailwind + Framer Motion, dark fixo, texto branco/cinza claro, destaque ciano neon.

**Painéis**
- `PlanetPanel`: lateral à direita. Nome, descrição, stars/forks/watchers, linguagem principal, último commit, total de commits, link. Último commit e total via `/api/repo/[name]` com skeleton. Bottom sheet no mobile.
- `ProfilePanel`: aberto pelo sol. Avatar, nome, bio, stats, top linguagens, último commit. Mesmo contêiner/animação do `PlanetPanel`; só um painel aberto por vez.
- `Tooltip` do quadradinho: data e commits.

**Octocat:** fixo no canto inferior direito, fora da câmera 3D; SVG/React animado com Framer Motion, arte de `design/`. Sobe/recua quando o painel está aberto; menor no mobile. Entrada com nave em parallax e aceno; hover acena e pisca; clique abre o tutorial; ~20s de inatividade → "oi, tá aí?", depois "se precisar de ajuda, é comigo!".

**Falas:** `octocatLines.ts` mapeia eventos do store → falas (sol, planeta, lua, primeiro zoom). "Adicionou galáxia" fica na V2. Balão com fila e duração limitada; falas novas substituem as antigas; falas de "primeira vez" aparecem uma vez por sessão.

**Tutorial (máquina de passos no Zustand):** 1) Bem-vindo (câmera no sol); 2) Repos (planetas, tamanho = popularidade); 3) Tecnologias (planeta em foco, luas e cores); 4) Explore à vontade (libera controles). Controles: [Próximo] [Pular tutorial]. Câmera conduzida pelos passos até o 4. Abre sozinho na primeira visita (flag em `localStorage`) e reabre pelo Octocat.

**Acessibilidade/mobile:** painéis navegáveis por teclado (foco, Esc). Respeita `prefers-reduced-motion`. Touch: um dedo gira, pinça dá zoom, toque seleciona.

## 5. Erros, testes, performance e deploy

**Erros**
- GitHub fora/rate limit: cache stale; sem cache, snapshot `public/universe.snapshot.json` (gerado por `pnpm snapshot` no build).
- Histórico de um repo do top 10 falha: só aquele planeta cai no padrão derivado; falha vai ao log.
- Token ausente/inválido: build falha cedo com mensagem clara; em runtime usa o snapshot.
- WebGL indisponível: fallback estático (imagem + lista de repos) com aviso.
- `/api/repo/[name]`: skeleton, erro com "tentar de novo", timeout curto; o 3D segue funcional.

**Testes**
- Vitest (puro): `normalize`, `layout` (sem sobreposição, escala log), `activity` (agrupamento dia/semana, padrão derivado determinístico), máquinas de estado do sol e do tutorial.
- Contrato: `fetchUniverse` com fixtures GraphQL gravadas, sem rede.
- Playwright: 1 smoke (página carrega, canvas aparece, clique no sol abre painel, Octocat inicia tutorial). Sem teste de pixels.
- Validação visual manual com checklist de capturas no PR.

**Performance:** 60fps em notebook comum, 30fps estáveis em mobile médio. `dpr` limitado; texturas pequenas (~416×56); geometrias e materiais compartilhados entre luas; textura por planeta gerada uma vez; geometria de menor resolução fora do top 10. LOD/instancing só se o profiling pedir (V2). Código 3D via `dynamic import` com `ssr: false`. Medição: Lighthouse + `r3f-perf`.

**Deploy:** Vercel; `GITHUB_TOKEN` somente leitura com escopos mínimos; revalidate ~6h. CI: lint, typecheck, Vitest, build; Playwright no PR.

## 6. Visual

Fundo `#0a0e27`; quadradinhos `#10b981`; luas na cor oficial da linguagem; sol azul e verde, olhos brancos com pupila preta, boca rosa, glow ciano; Octocat laranja com gorro branco (detalhes roxo e azul); nave branca e azul retrô com antenas e glow sutil; texto branco/cinza claro com destaques ciano neon. Referências: `demo/index.html` e `design/`.
