# GitHub Universe 3D — Design (MVP)

Data: 2026-10-08 (revisado no mesmo dia: GitHub Pages, órbitas de Kepler, Octocat 3D)
Base: `docs/brief.md`

## 1. Objetivo e escopo

Projeto de portfólio: o perfil do GitHub do autor vira uma galáxia 3D interativa, publicada como site estático no GitHub Pages. O sucesso do MVP é uma demo online, fluida e bonita, que impressiona um recrutador em ~30 segundos.

**Mapeamento:** galáxia = perfil · planeta = repositório · luas = linguagens · textura do planeta = grid 52×7 de atividade · sol = globo interativo do perfil · Octocat = guia em nave.

### Decisões fechadas
| Tema | Decisão |
|---|---|
| Stack | Vite, React 19, TypeScript, React Three Fiber 9 + drei, Tailwind v4, Framer Motion, Zustand |
| Hospedagem | GitHub Pages, site estático, sem servidor |
| Dados | Só o perfil do autor; snapshot `universe.json` gerado no GitHub Action (push, a cada 6h, manual) |
| Atividade dos planetas | Híbrido: top 10 repos com commits reais por dia; demais com padrão derivado de `pushedAt` e stars |
| Info do planeta | Painel lateral à direita (bottom sheet no mobile), DOM fora do `<Canvas>`; drei cuida de câmera e estrelas |
| Superfície do planeta | `CanvasTexture` 2:1 (832×416) com a grade 52×7 numa faixa do equador |
| Movimento dos planetas | Órbitas de Kepler em anéis + eixo inclinado por ângulos de Euler |
| Rosto do sol | Segue a câmera com atraso (mola) e inclina para cima e para baixo, como o globo de NY |
| Octocat | Modelo 3D low-poly na cena (a partir de `design/`), nave roxo claro, viaja entre planetas com câmera de perseguição (estilo Astro Bot); estilo inspirado no Jetpacktocat |
| Defaults assumidos | Lua ∝ √bytes da linguagem; planetas mais relevantes (stars + recência) no anel interno; intensidade do quadradinho varia com os commits; hover mostra data e contagem |

### Fora do MVP (V2)
Múltiplas galáxias, nível "universo", link `#/username` (o Pages não tem rewrite, então a rota é por hash), tema claro, LOD/instancing, username dinâmico. `fetchUniverse(login)` já recebe o usuário.

## 2. Arquitetura e fluxo de dados

```
scripts/snapshot.ts        # Node, roda no build: GitHub GraphQL → public/universe.json
src/lib/github/            # queries, cliente GraphQL, fetchUniverse, normalize (só o script usa)
src/lib/universe/          # funções puras: activity, ranking, orbits (Kepler), layout das luas
src/data/loadUniverse.ts   # navegador: fetch(`${import.meta.env.BASE_URL}universe.json`)
src/components/three/      # Scene, Sun, Planet, PlanetSurface, Moon, OrbitLines, CameraRig, octocat/ (OctocatShip, ShipRig)
src/components/ui/         # SidePanel, PlanetPanel, ProfilePanel, Tooltip, Octocat, Tutorial
src/store/                 # Zustand: seleção, hover, tutorial, relógio de simulação
```

**Fluxo**
1. O workflow `deploy.yml` roda em push na `main`, no cron `17 */6 * * *` e manualmente.
2. `pnpm snapshot` consulta o GitHub GraphQL com o token do secret `UNIVERSE_TOKEN` (o GitHub não aceita nomes de secret começando com `GITHUB_`):
   - 1 query de perfil e repos (linguagens, stars, forks, watchers, `pushedAt`, e `history(first: 1)` para último commit e total de commits de cada repo);
   - até 10 queries de histórico do autor nas últimas 52 semanas (top 10, paginadas), agrupadas por dia.
3. O resultado vai para `public/universe.json`, com `schemaVersion: 1`. `vite build` usa `base: '/github-universe-3d/'` e `actions/deploy-pages` publica.
4. O navegador baixa o JSON. Enquanto carrega, o Octocat mostra a expressão "pensando".
5. Não existe busca sob demanda: todos os dados dos painéis estão no JSON.

**Dado de exemplo:** um `public/universe.json` commitado serve para o dev local e o e2e. `pnpm snapshot` o regenera quando há token em `.env.local`. No Action, o arquivo é sobrescrito antes do build e não é commitado.

**Princípio:** tudo em `src/lib/universe/` é puro, sem Three.js, e testável sem GPU.

**Nota técnica:** o `contributionCalendar` do GitHub existe só por usuário, não por repo. A atividade por repo exige paginar o histórico de commits, daí o limite de 10 repos reais.

**Limitação:** o GitHub desativa cron de repositórios sem atividade por 60 dias.

## 3. Cena 3D, órbitas e sol

**Scene:** `<Canvas>` único em tela cheia, fundo `#0a0e27`, `<Stars>` do drei, luz pontual no sol, `dpr` em `[1, 2]`.

### Órbitas de Kepler em anéis
- Com 40 planetas em órbitas elípticas separadas, a folga para não colidirem cresce de forma exponencial. Por isso os planetas ficam em **anéis**: os planetas do mesmo anel compartilham os elementos orbitais e o período, então mantêm a distância entre si para sempre.
- O anel *k* (a partir de 0) comporta `3 + 2k` planetas, distribuídos em fase igual (anomalia média com espaçamento `2π/n`). Os repos mais bem ranqueados vão para o anel interno. São cerca de 6 anéis para 40 planetas.
- Elementos por anel: excentricidade *e* entre 0,02 e 0,08, inclinação até 6°, nó Ω e argumento do periélio ω determinísticos. O semieixo *a* é calculado em sequência para que o periélio do anel externo fique além do afélio do interno, somando os maiores raios dos dois anéis e uma folga.
- **3ª lei:** período `T = T0 · (a / a0)^1.5`, com o anel interno em `T0 ≈ 60 s`.
- **2ª lei:** posição pela equação de Kepler `M = E − e·sin E`, com 4 iterações de Newton por frame. É uma fórmula fechada e não acumula erro.
- A orientação da órbita usa os três ângulos de Euler clássicos (Ω, i, ω).
- Cada anel desenha uma linha de órbita fina e translúcida.

### Eixo inclinado (ângulos de Euler)
Cada planeta tem obliquidade de 0 a 30° (determinística pelo nome do repo), rotação própria no eixo inclinado e uma precessão lenta. As luas orbitam no plano equatorial do planeta.

### Tempo
- Um relógio de simulação único move órbitas, rotações e luas.
- Ao focar um planeta, a escala do tempo cai até 0 em ~1 s. Ao sair do foco, volta a 1.
- Com `prefers-reduced-motion`, a escala fica em 0: posições fixas, linhas de órbita visíveis.

### Planeta e superfície
- Raio por escala logarítmica de stars + forks, com mínimo e máximo.
- `PlanetSurface` recebe `weeks[52][7]` e devolve o material com `CanvasTexture`. A textura é equiretangular 2:1 (832×416, células de 16px), e a grade 52×7 ocupa uma faixa no equador, para cada célula ficar quadrada na esfera (52 colunas em 360° dão ~6,9° por célula). Os polos ficam na cor-base do planeta.
- Células `#10b981` com opacidade proporcional aos commits do dia e células vazias levemente visíveis.
- Hover: raycast → `uv` → semana e dia → tooltip (data + commits). Planetas com atividade derivada não mostram tooltip.
- Geometria compartilhada: esfera unitária escalada; resolução menor fora do top 10.

### Luas
Até 6 por repo, raio ∝ √bytes, cor oficial da linguagem, órbitas circulares concêntricas no plano equatorial do planeta, geometria compartilhada. O clique seleciona a lua e o painel do planeta destaca a linguagem com o percentual.

### Sol
- Esfera azul e verde com glow ciano (esfera maior `BackSide`, aditiva). O rosto (olhos brancos, pupilas pretas, boca rosa) é desenhado numa `CanvasTexture`, redesenhada só quando a expressão ou a piscada mudam.
- **O rosto segue a câmera com atraso.** Uma mola levemente subamortecida (~0,5 s, com um pequeno balanço ao chegar) leva o yaw e o pitch do rosto até a direção da câmera. O pitch é limitado a ±35°, como o globo de NY olhando para cima e para baixo sem virar.
- A máquina de estados `idle | hover | click | away` controla a posição (segue o mouse quando ele chega perto), o brilho, a expressão, as piscadas a cada 3 a 5 s e o salto no clique, que abre o perfil.

### Câmera (`CameraControls` do drei)
Dois níveis no MVP: galáxia e planeta. No foco, a câmera acompanha o planeta a cada frame, com o alvo deslocado para abrir espaço ao painel (para a direita no desktop, para baixo no mobile). Esc, clique no vazio ou o botão "← Galáxia" voltam à visão geral. O zoom para longe é limitado.

## 4. UI, Octocat e tutorial

**Camada DOM:** fora do `<Canvas>`. Tailwind + Framer Motion, tema escuro fixo, texto branco/cinza claro, destaque ciano neon.

**Painéis**
- `PlanetPanel`: nome, descrição, stars/forks/watchers, linguagens com percentual (a linguagem da lua selecionada fica destacada), último commit, total de commits, link para o GitHub.
- `ProfilePanel`: avatar, nome, bio, stats (stars, forks, seguidores, repos), top linguagens, último commit.
- Os dois usam o mesmo `SidePanel` (lateral no desktop, bottom sheet no mobile). Só um fica aberto por vez.
- `Tooltip` do quadradinho: data e commits.

**Octocat 3D (revisado em 2026-10-08):** o Octocat e a nave são um modelo 3D dentro da cena, que viaja entre os planetas no estilo Astro Bot.

- **Modelo `OctocatShip`:** low-poly feito com a biblioteca `three-low-poly` sobre o Three.js (origem no centro do casco); as medidas ficam em `src/lib/ship/geometry.ts`.
  - **Nave (revisada):** segue o **estilo** da máquina do tempo de *A Família do Futuro* (referência do usuário; modelo próprio, sem emblemas), compacta (comprimento ≈ 1,8× altura): casco em banheira `#C4B5FD` com aro creme fino e os 7 quadradinhos de contribuição; cúpula de vidro `#A5F3FC` longa e baixa com pilar grosso e antena em mola atrás; dois faróis redondos `#FFF3C4`; motor curto e baixo (creme em cima, cinza embaixo) com faixas ciano `#67E8F9` que pulsam; bocal escuro com propulsor; asas em lâmina curva abertas para os lados (diedro, enflechadas) com faixa verde-água por baixo e luzinhas nas pontas; banco, painel com volante redondo e manche em C.
  - **Construção:** com a biblioteca `three-low-poly` (sweep, loft, `bevelConvexGeometry`, `EdgedBoxGeometry`, `GlowHalo`, `EmissivePulseEffect`) e `flatShading`, seguindo a skill `universe-low-poly`.
  - **Octocat (estilo clássico do GitHub):** corpo e cabeça `#211A2B` com orelhas de gato e bigodes; rosto pêssego `#FAD4AC` numa `CanvasTexture` com as expressões (neutro, feliz, piscadinha, surpreso, pensando) e piscada; 5 tentáculos (3 braços + 2 pernas) com face de baixo `#3B2D50` e ventosas `#9BC4C8`.
  - **Clawd:** em pé na cabeça do Octocat, entre as orelhas: corpo laranja `#D97757` em blocos, olhos, 2 bracinhos e 4 perninhas embaixo.
  - **Braços:** um enrolado na empunhadura do manche em C, um apoiado no painel e um livre, que acena e aponta.
  - **Propulsor:** cone aditivo que tremula, com rastro de partículas em viagem.
  - Nada é carregado de arquivo; um `.glb` pode substituir o modelo depois.
- **Página de preview (só em dev):** `?preview=octocat` mostra o modelo isolado, com seletor de expressão, aceno, propulsor e visibilidade por peça. Serve para o usuário aprovar o modelo parte por parte, antes da cena existir.
- **Estados (máquina pura):**
  - **Entrada:** desce do alto até a escolta e acena.
  - **Escolta:** acompanha a câmera no canto inferior direito da visão, dentro da cena, com atraso de mola e flutuando de leve. Pisca; com ~20 s de inatividade diz "Oi, tá aí?" e depois "Ei, se precisar de ajuda, é comigo!".
  - **Viagem:** ao focar um planeta ou o sol, voa por uma curva de Bézier cúbica em arco, erguida acima do plano das órbitas, que nunca passa a menos de `SUN_RADIUS + 2` do sol. Dura de 1,5 a 3 s, conforme a distância, com aceleração suave, inclinação nas curvas e rastro.
  - **Visita:** paira ao lado do alvo, virada para a câmera, com o braço livre apontando.
  - **Volta:** ao sair do foco, retorna à escolta.
- **Câmera de perseguição:** durante a viagem iniciada pelo usuário, a câmera fica atrás e acima da nave, seguindo a tangente da curva, com os controles travados. Na chegada, faz a transição para a pose do alvo (a mesma de antes, com o painel) e libera os controles. O destino é o ponto onde o planeta vai parar (o tempo desacelera no foco). No tutorial, a nave viaja junto, mas a câmera segue as poses do tutorial, sem perseguição.
- **Interação:** clique na nave abre o tutorial; hover faz acenar e piscar. Para teclado, leitores de tela e o e2e, há também um botão DOM "Abrir tutorial com o Octocat" no canto inferior direito.
- **Falas:** balão preso à nave (`<Html>` do drei) e espelhadas numa região `aria-live` invisível.
- **Reduzir movimento:** sem voo nem perseguição; a nave reaparece no destino e a câmera vai direto.
- **Loader:** antes de o Three.js carregar, o Octocat "pensando" continua sendo o SVG 2D de `design/`.

**Falas:** `octocatLines.ts` mapeia eventos do store para falas:
- sol → "Esse é o perfil GitHub de {nome}!" (quem visita é o recrutador, não o dono do perfil);
- planeta → "Olha que legal esse repo aqui!";
- lua → "Essa linguagem é importante nesse projeto!";
- primeiro zoom → "Uau, dá pra ver bem mais de perto!".

O balão tem duração limitada, e uma fala nova substitui a anterior. Falas de primeira vez aparecem uma vez por sessão.

**Tutorial (máquina de passos no Zustand):**
1. Bem-vindo: câmera no sol.
2. Repos: planetas, tamanho = popularidade.
3. Tecnologias: planeta em foco, luas e cores, quadradinhos.
4. Explore à vontade: libera os controles.

Controles: [Próximo] e [Pular tutorial]. A câmera é conduzida pelos passos até o 4. O tutorial abre sozinho na primeira visita (flag em `localStorage`) e reabre pelo Octocat.

**Acessibilidade/mobile:** painéis navegáveis por teclado (foco, Esc), respeito a `prefers-reduced-motion`, e no toque um dedo gira, a pinça dá zoom e o toque seleciona.

## 5. Erros, testes, performance e deploy

**Erros**
| Situação | Comportamento |
|---|---|
| GitHub fora do ar, rate limit ou token expirado no Action | O job falha antes do build; o Pages mantém o último deploy; o erro aparece na aba Actions |
| Secret `UNIVERSE_TOKEN` ausente | O script falha na hora com "Defina UNIVERSE_TOKEN em Settings → Secrets" |
| Histórico de um repo do top 10 falha | Só aquele planeta usa o padrão derivado; aviso `::warning` no log |
| `universe.json` não carrega | Tela com mensagem e "tentar de novo"; Octocat "pensando" |
| `schemaVersion` diferente de 1 | Erro claro em vez de quebrar a cena |
| WebGL indisponível | Versão em lista (perfil + repos com links) com aviso |

**Testes**
- Vitest (puro):
  - normalização, atividade por dia, ranking e anéis;
  - Kepler: precisão da equação, posição igual após um período, periélio = a(1 − e), nenhuma colisão amostrada ao longo de um período;
  - mola do rosto do sol: converge, pitch limitado;
  - máquinas de estado do sol e do tutorial, e falas do Octocat.
- Contrato: `fetchUniverse` com fixtures GraphQL gravadas, sem rede.
- Playwright: 1 smoke contra `vite preview` com o JSON commitado. O canvas aparece; pular tutorial; clicar no sol abre o perfil; o botão "Abrir tutorial com o Octocat" reabre o tutorial.
- Checklist visual manual com capturas no PR.

**Performance**
- Orçamento: 60 fps em notebook comum, 30 fps estáveis em celular médio.
- Kepler para 40 planetas é barato. São 6 linhas de órbita, `dpr` limitado e texturas e geometrias compartilhadas.
- A cena 3D carrega via `React.lazy`, então o loader e o Octocat aparecem antes do Three.js. Meta: bundle inicial abaixo de 400 KB gzip.
- Medição: Lighthouse e `<Stats />` do drei com `?perf` (o `r3f-perf` não declara suporte ao R3F 9).

**Deploy**
| Workflow | Quando roda | O que faz |
|---|---|---|
| `ci.yml` | PR e push | Lint, typecheck, Vitest, build, Playwright |
| `deploy.yml` | Push na `main`, cron `17 */6 * * *`, manual | Snapshot com o token, Vitest, build com `base: '/github-universe-3d/'`, `actions/deploy-pages` |

- No repositório: Settings → Pages → Source = GitHub Actions, e o secret `UNIVERSE_TOKEN`.
- O token é fine-grained, só leitura de repositórios públicos. Ele expira em no máximo 1 ano, e o deploy agendado falha quando ele vence.

## 6. Visual

- **Cores gerais:** fundo `#0a0e27`; quadradinhos `#10b981`; luas na cor oficial da linguagem; texto branco/cinza claro com destaques ciano neon.
- **Sol:** azul e verde, olhos brancos com pupila preta, boca rosa, glow ciano.
- **Octocat e nave:** seguem a arte de `design/Octocat.dc.html` (corpo `#1F2329`, rosto `#F2C9A6`, gorro-Clawd `#D97757`, cúpula `#A5F3FC`), que substitui as cores do brief. A exceção é a nave, em roxo claro (`#C4B5FD` no casco e nas asas, em vez do vermelho `#D7263D` da arte).
- **Referência de estilo** (não de asset): o [Jetpacktocat](https://octodex.github.com/jetpacktocat/) do Octodex, para traço, proporções e expressividade. A arte continua sendo SVG próprio, com a nave.
- **Outras referências:** `demo/index.html` e `design/`.
