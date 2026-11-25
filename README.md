<div align="center">

# 🎯 FREEAIM

**Aim trainer para o navegador, feito só com HTML5, CSS3 e JavaScript puro.**
Sem instalar nada, sem framework, sem banco de dados.

![HTML5](https://img.shields.io/badge/HTML5-0D1322?style=flat&logo=html5&logoColor=3DDBC8)
![CSS3](https://img.shields.io/badge/CSS3-0D1322?style=flat&logo=css3&logoColor=3DDBC8)
![JavaScript](https://img.shields.io/badge/JavaScript-0D1322?style=flat&logo=javascript&logoColor=FFB547)
![Sem dependências](https://img.shields.io/badge/depend%C3%AAncias-0-3DDBC8?style=flat)
![Só computador](https://img.shields.io/badge/plataforma-desktop-FFB547?style=flat)

[▶ **Jogar agora**](https://guilhermelopesdeoliveira.github.io/FreeAim/) · [📄 Documentação](./Documentação/FreeAim.pdf) · [🧠 Conceitos aplicados](#-conceitos-de-programação-avançada-e-estrutura-de-dados)

</div>

---

## 📖 Sobre o projeto 

O **FREEAIM** é um jogo de treino de mira (*aim trainer*) criado para a disciplina de **Desenvolvimento de Jogos**. Você escolhe um modo, destrói os alvos o mais rápido que conseguir e ganha **pontos, moedas e XP**. Com as moedas dá para abrir caixas de skins, comprar passes e desbloquear conquistas.

Tudo roda no navegador e fica salvo no `localStorage`: contas, ranking, loja e progresso. Não existe servidor.

> ⚠️ O jogo foi pensado **só para computador, com mouse**. Funciona melhor no Chrome ou no Edge.

## 🎮 Modos de jogo

| Modo | Como funciona |
|---|---|
| **Alvos fixos** | Um alvo por vez, sempre em um lugar novo |
| **Alvos móveis** | O alvo anda e quica nas bordas |
| **Gridshot** | De 1 a 12 alvos ao mesmo tempo (padrão: 5) |
| **Tracking** | Segure o botão do tiro com a mira sobre o alvo: +3 pontos por segundo |
| **Reflexo** | O alvo some em 700 ms; se sumir sem ser acertado, é erro |
| **Sobrevivência** | 3 vidas, o alvo encolhe e fica mais difícil a cada 5 acertos |
| **Flickshot** | O alvo surge do nada; reagir em menos de 500 ms vale +5 |
| **Chuva** | Os alvos caem; o que chega ao chão conta como erro |
| **Foco** | Só um alvo é o certo; os falsos (com X) tiram pontos |

**Pontuação:** +15 por acerto, −10 por erro (nunca abaixo de zero) e combo de 5 ou mais passa a valer +20.

### ⚙️ Setup e Modo Competitivo

Dê **duplo clique** em um modo (ou clique em **Configurar**, ou aperte **T**) para abrir o Setup:

- **Tempo:** 30 s, 1 min, 1 min 30 s, 2 min, tempo personalizado ou **infinito** (cronômetro sobe e cada erro tira uma vida).
- **Formato do alvo** (círculo ou quadrado) e **da arena** (retangular ou quadrada), além do tamanho da arena (50% a 100%).
- **Opções do modo:** velocidade, quantidade de alvos, tempo até o alvo sumir.
- **Modo Competitivo:** regras padrão e 60 s, tudo bloqueado. Só ele entra no **leaderboard** (top 10 por modo).

### ⌨️ Atalhos

| Tecla | O que faz |
|---|---|
| `R` | Reinicia o jogo (a sessão atual não é contabilizada) |
| `T` | Abre o Setup direto |
| `Esc` | Cancela a sessão |

## 🪙 Progressão

- **Moedas:** 50 por alvo (no Tracking, 50 a cada 2 s com o botão pressionado) e bônus diário de 1.000.
- **Loja:** caixa de skins com **roleta estilo CS** (750 moedas), 52 skins em 5 raridades (comum, rara, épica, lendária animada e secreta) e passes:

  | Item | Preço |
  |---|---|
  | Passe Premium (dobra moedas e XP) | 100.000 |
  | Sorte | 40.000 |
  | Giro Triplo | 70.000 |
  | Giro Rápido | 15.000 |
  | Giro Automático | 20.000 |

- **Perfil:** 22 ícones (12 liberados por conquista), 31 conquistas, níveis por XP e histórico das últimas 20 sessões.
- **Personalização:** editor de retícula (com código compartilhável), sensibilidade por DPI e cm/360, 7 timbres de som, 8 fundos de arena, tema claro/escuro, modo daltonismo e **modo canhoto**.
- **Idioma:** botão **EN / PT-BR** traduz a página inteira.
- **Backup:** exportar e importar o progresso em arquivo.

## 🚀 Como rodar

Não precisa instalar nada.

**Opção 1 — arquivo único:** dê dois cliques em `freeaim.html` (o jogo inteiro está nele).

**Opção 2 — arquivos separados:** abra o `index.html`. Ele usa `style.css`, `script.js` e `i18n.js`, que precisam estar na mesma pasta.

**Opção 3 — GitHub Pages:** [`[link do GitHub Pages]`](https://guilhermelopesdeoliveira.github.io/FreeAim/)

> As fontes (Space Grotesk, Orbitron e Baloo 2) vêm do Google Fonts. Sem internet, o jogo usa as fontes do sistema.

**Conta de teste:** para conferir tudo sem jogar muito, entre com usuário e senha `ADM01` (maiúsculas). Ela libera todas as skins, conquistas e passes, tem moedas infinitas e não entra no ranking. Também dá para entrar como **convidado**, sem senha.

## 🗂️ Estrutura

```
freeaim/
├── index.html           # telas e estrutura da página
├── style.css            # visual, temas e animações
├── script.js            # todo o jogo (modos, loja, contas, ranking...)
├── i18n.js              # dicionário e tradutor PT-BR ⇄ EN
├── freeaim.html         # o mesmo jogo em um arquivo só
├── Freeaim.md           # prompts, correções e decisões do projeto
├── LICENSE
└── docs/
    ├── FREEAIM_Documentacao.pdf
    ├── menu.png
    └── gridshot.png
```

## 🧱 Como foi construído

```
Entrada (mouse, teclado, aba)  →  Estado G  →  Laço requestAnimationFrame  →  Fim da sessão  →  localStorage
```

- **Canvas 2D** com um único laço `requestAnimationFrame` que atualiza e desenha alvos, skins e efeitos.
- **Pointer Lock** para a sensibilidade do mouse e **Web Audio** para os sons (todos sintetizados por código).
- **Web Crypto** (SHA-256 com sal) para o hash das senhas e **localStorage** (chave `freeaim.v1`) para salvar tudo.
- **Sem assets de terceiros:** alvos, skins, ícones e efeitos são desenhados por código.

## 🧠 Conceitos de Programação Avançada e Estrutura de Dados

| Conceito | Onde aparece |
|---|---|
| Vetores e listas | `G.targets`, `G.parts` e o histórico das últimas 20 sessões |
| Dicionários (hash) | `MODE_BY_ID`, `ICON_BY_ID` e o dicionário PT→EN do `i18n.js` |
| Conjuntos (`Set`) | Remove skins repetidas ao carregar uma conta |
| Ordenação e busca | Ranking com `sort()` e top 10; `find`, `some` e `every` |
| Recursão | `deepFill()` completa contas antigas com campos novos |
| Máquina de estados | `parado → contagem → jogando → fim` |
| Assíncrono | `async/await` na contagem 3-2-1 e no hash SHA-256 |
| Complexidade | Acerto por distância euclidiana: O(n) por clique |

## ✅ Testes

O jogo tem **268 verificações automáticas** da lógica (contagem, modos, pontuação, loja, conquistas, idioma, persistência) e foi aberto no Chromium sem erros de página. Ainda é preciso conferir em um navegador com tela e áudio reais o **Pointer Lock**, o **som** e as skins lendárias em movimento.

## ⚠️ Limites do modo local

Sem servidor, não existe ranking global, anti-cheat nem pagamento real. O ranking compara só as contas do mesmo navegador. Quem abrir o DevTools consegue editar o `localStorage` (moedas, XP, skins), e o bônus diário usa o relógio do computador.

## 👥 Equipe

| Integrantes 
|---|
| `Guilherme Lopes de Oliveira` |
| `Lucas Duarte Pires` | 

## 🙏 Créditos

- Fontes: [Space Grotesk](https://fonts.google.com/specimen/Space+Grotesk), [Orbitron](https://fonts.google.com/specimen/Orbitron) e [Baloo 2](https://fonts.google.com/specimen/Baloo+2), do Google Fonts, sob a licença SIL OFL.
- IA: Claude Sonnet 5.5 (Anthropic).
- Nenhuma imagem ou som de terceiros.

## 📄 Licença

Distribuído sob a licença **MIT**. Veja o arquivo [`LICENSE`](LICENSE).
