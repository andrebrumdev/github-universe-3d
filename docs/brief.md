# GitHub Universe 3D — Project Brief

## 1. Visão geral

Visualização 3D interativa que transforma um perfil do GitHub em um universo:

- **Galáxia** = perfil do GitHub
- **Planeta** = repositório
- **Luas** = linguagens usadas no repositório
- **Textura do planeta** = grid de quadradinhos verdes de atividade (estilo gráfico de contribuições do GitHub)
- **Sol** = globo interativo e brincalhão que representa o perfil, no centro da galáxia
- **Octocat piloto** = mascote-guia em uma nave, com gorro de neve estilo Claude Code

**Objetivo:** projeto de portfólio que mostra domínio de front-end 3D, React, integração com API, performance e criatividade.

---

## 2. Estrutura do universo

### Galáxia
- Cada perfil GitHub vira uma galáxia.
- O usuário começa com a própria galáxia.
- Outras galáxias podem ser adicionadas via username.
- *Em aberto:* galáxias lado a lado no espaço, ou um índice que o usuário clica para trocar.

### Planeta (repositório)
- Cada repositório é um planeta.
- Tamanho sugerido: popularidade (stars, forks).
- Posição: distribuição orgânica dentro da galáxia.

### Luas (linguagens)
- Luas orbitam cada planeta, uma por linguagem presente no repo.
- Ex.: um repo com 100 linhas de Java e outras de JavaScript ganha uma lua Java e uma lua JavaScript.
- Tamanho da lua proporcional ao volume de código naquela linguagem (*a confirmar: linhas de código, presença ou commits*).
- Cor da lua segue a cor oficial da linguagem.

### Textura do planeta (atividade)
- O planeta é coberto por uma malha de quadradinhos verdes.
- Replica o padrão do GitHub: 52 semanas × 7 dias.
- Todos os quadradinhos na mesma cor verde, para manter o visual limpo e associado ao GitHub.
- Ao girar o planeta, o usuário vê diferentes períodos de contribuição.
- *Em aberto:* a intensidade (opacidade) variar com o número de commits, ou tudo com a mesma intensidade.

---

## 3. Sol interativo (globo do perfil)

**Conceito:** um globo brincalhão no centro da galáxia, inspirado no globo de Nova York. Ele representa o perfil do usuário.

### Comportamento
- Segue suavemente o movimento do mouse, com um pequeno delay para parecer vivo.
- Quando o mouse se aproxima: expressão feliz, brilho aumenta, leve rotação.
- Quando o mouse se afasta: expressão triste ou pensativa, brilho diminui, volta ao centro.
- Ao clicar: pula ou vibra, expressão surpresa, abre o painel de perfil.
- Piscadas naturais a cada 3 a 5 segundos.

### Estados
| Estado | Posição | Expressão | Brilho | Animação |
|---|---|---|---|---|
| Idle | Centro | Neutra / feliz | Normal | Respiração suave |
| Hover | Segue o mouse | Muito feliz | Aumenta | Rotação leve |
| Click | Pula / vibra | Surpresa | Flash | Abre painel |
| Away | Volta ao centro | Triste / esperando | Diminui | Parado |

### Painel de perfil (ao clicar)
- Avatar e nome do GitHub
- Bio
- Stats: stars, forks, seguidores, total de repositórios
- Top linguagens
- Último commit (tempo e mensagem)

---

## 4. Octocat piloto — guia interativo

**Conceito:** o Octocat (mascote do GitHub) pilota uma pequena nave no estilo Astrobot. Usa um gorro de neve com o logo do Claude Code. Ele não substitui o sol: é um personagem separado que funciona como guia.

### Posição
- Canto inferior direito (recomendado), fixo na tela e fora da câmera 3D.
- Em mobile: menor, em um canto que não atrapalhe.

### Comportamentos
- **Entrada:** nave desce com efeito de parallax e o Octocat acena.
- **Hover:** acena e pisca.
- **Clique:** abre o tutorial.
- **Inatividade:** pisca e pergunta "oi, tá aí?".
- **Ações do usuário:** comenta o que acabou de acontecer.

### Falas contextuais
- Clica no sol: "Esse é você! Seu perfil GitHub."
- Clica num planeta: "Olha que legal esse repo aqui!"
- Clica numa lua: "Essa linguagem é importante nesse projeto!"
- Primeiro zoom: "Uau, dá pra ver bem mais de perto!"
- Adiciona outra galáxia: "Ooh, mais uma galáxia!"
- Fica parado por muito tempo: "Ei, se precisar de ajuda, é comigo!"

### Tutorial (passo a passo)
1. **Bem-vindo:** visão geral e aponta o sol (seu perfil).
2. **Repos:** aponta os planetas e explica que o tamanho é popularidade.
3. **Tecnologias:** aponta as luas e as cores das linguagens.
4. **Explore à vontade:** libera o usuário e o Octocat fica disponível para ajudar.

Controles do tutorial: [Próximo] [Pular tutorial].

---

## 5. Interação e navegação

### Mouse
- **Drag:** rotaciona o planeta ou a câmera.
- **Scroll para perto:** zoom em um planeta.
- **Scroll para longe:** sai da galáxia e vai para a visão macro, com várias galáxias.
- **Clique em planeta:** foca e abre info.
- **Clique em lua:** mostra info da linguagem naquele repo.
- **Hover em quadradinho:** data e número de commits daquele dia.

### Níveis de zoom
1. **Universo:** várias galáxias.
2. **Galáxia:** planetas e luas orbitando.
3. **Planeta:** quadradinhos de contribuição visíveis.

### Informações ao clicar no planeta
- Nome e descrição do repositório
- Stars, forks, watchers
- Linguagem principal
- Último commit (data e mensagem)
- Total de commits
- Link para o GitHub

---

## 6. Escopo

### MVP (V1)
- [ ] Visualização 3D da galáxia do próprio perfil
- [ ] Planetas com luas de linguagens
- [ ] Textura de quadradinhos verdes na superfície
- [ ] Interação com mouse (drag, zoom)
- [ ] Painel de info ao clicar em planeta
- [ ] Sol interativo com expressões básicas
- [ ] Octocat guia com tutorial simples
- [ ] Deploy online

### V2
- [ ] Adicionar múltiplos perfis GitHub (novas galáxias)
- [ ] Visão macro navegável entre galáxias
- [ ] Link compartilhável (`github-universe.vercel.app/<username>`)
- [ ] Animações e efeitos de luz e partículas
- [ ] Otimização de performance (LOD, instancing)
- [ ] Tema claro e escuro

---

## 7. Tecnologia

**Front-end**
- Next.js (SSR, rotas, deploy)
- React Three Fiber + Three.js (3D)
- TypeScript
- TailwindCSS (UI complementar)
- Framer Motion ou GSAP (animações do sol e do Octocat)
- Zustand (estado global: galáxias, seleção, tutorial)

**Back-end / dados**
- Next.js API Routes
- GitHub GraphQL API (v4)
- Cache com SWR ou Redis

**Deploy e performance**
- Vercel
- Lazy loading de texturas
- LOD para planetas distantes
- Instancing para muitos objetos

### Fluxo de dados
1. Usuário entra no site (perfil padrão ou username informado).
2. API Route consulta o GitHub GraphQL: repos, linguagens, commits por dia (últimas 52 semanas), stars, forks.
3. Dados são processados e cacheados.
4. Three.js cria esferas (planetas), luas em órbita e a textura de quadradinhos em canvas.
5. Usuário interage e os detalhes carregam sob demanda.

---

## 8. Visual

- **Tema:** espacial e futurista, dark mode.
- **Fundo:** `#0a0e27`
- **Quadradinhos:** `#10b981`
- **Luas:** cor de cada linguagem (ex.: JavaScript amarelo, Python azul)
- **Sol:** globo azul e verde, olhos brancos com pupila preta, boca rosa, glow ciano
- **Octocat:** corpo laranja, gorro branco com detalhe roxo e azul (Claude Code)
- **Nave:** branco e azul, forma retro, antenas pequenas, glow sutil
- **Texto:** branco e cinza claro, destaques em ciano neon

---

## 9. Perguntas em aberto

1. Galáxias lado a lado no espaço, ou um índice que o usuário clica para trocar?
2. Os quadradinhos devem ter intensidade variável ou ser sempre da mesma cor?
3. Ao clicar num quadradinho: mostrar info daquele dia (commits e mensagens)?
4. Tamanho da lua: linhas de código, presença ou número de commits?
5. Compartilhamento: link `github-universe.vercel.app/<username>` para mandar a recrutadores?
6. Clique no planeta: modal, painel lateral ou info flutuando?
7. Ordenação e posição dos planetas: por stars, recência ou mix?
8. Three.js ou Babylon.js? (Recomendação: React Three Fiber, pela integração com React.)

---

## 10. Próximos passos

1. Criar projeto Next.js com React Three Fiber
2. Montar a cena (câmera, luz, fundo estrelado)
3. Criar API Route para o GitHub GraphQL
4. Renderizar planetas e luas a partir dos dados
5. Gerar a textura de quadradinhos em canvas
6. Implementar drag, zoom e cliques
7. Criar o sol interativo com expressões
8. Criar o Octocat guia e o tutorial
9. Painéis de info e responsividade
10. Otimizar performance
11. Deploy na Vercel e teste em produção
