'use strict';
/* FREEAIM — aim trainer em HTML5 + CSS3 + JavaScript puro.
   Tudo é salvo em localStorage (sem servidor). Veja o backlog para o que depende de backend. */

// <sha>
/* SHA-256 em JS puro (fallback quando crypto.subtle não existe, ex.: página fora de contexto seguro) */
function sha256js(msg){
  const bytes = new TextEncoder().encode(msg);
  const primes = [];
  for (let n = 2; primes.length < 64; n++) { if (primes.every(p => n % p)) primes.push(n); }
  const frac = x => Math.floor((x - Math.floor(x)) * 4294967296) >>> 0;
  const K = primes.map(p => frac(Math.cbrt(p)));
  let H = primes.slice(0, 8).map(p => frac(Math.sqrt(p)));
  const l = bytes.length, nb = ((l + 9 + 63) >> 6) << 6;
  const buf = new Uint8Array(nb); buf.set(bytes); buf[l] = 0x80;
  const dv = new DataView(buf.buffer);
  dv.setUint32(nb - 8, Math.floor(l * 8 / 4294967296)); dv.setUint32(nb - 4, (l * 8) >>> 0);
  const w = new Uint32Array(64);
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let o = 0; o < nb; o += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i-15], 7) ^ rotr(w[i-15], 18) ^ (w[i-15] >>> 3);
      const s1 = rotr(w[i-2], 17) ^ rotr(w[i-2], 19) ^ (w[i-2] >>> 10);
      w[i] = (w[i-16] + s0 + w[i-7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H = [H[0]+a, H[1]+b, H[2]+c, H[3]+d, H[4]+e, H[5]+f, H[6]+g, H[7]+h].map(x => x >>> 0);
  }
  return H.map(x => x.toString(16).padStart(8, '0')).join('');
}
// </sha>

(() => {
/* ===================== utilidades ===================== */
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const isObj = o => o && typeof o === 'object' && !Array.isArray(o);
const fmtDate = ts => new Date(ts).toLocaleString('pt-BR', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'});
const fmtDur = s => !s ? '∞' : s < 60 ? s + 's' : s % 60 === 0 ? (s / 60) + 'min' : Math.floor(s / 60) + 'min ' + (s % 60) + 's';
const fmtClock = ms => { const t = Math.floor(ms / 1000); return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); };
const fmtNum = n => Number(n).toLocaleString('pt-BR');
const todayStr = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); };
function deepFill(t, d) {
  for (const k in d) {
    if (t[k] === undefined || t[k] === null) t[k] = JSON.parse(JSON.stringify(d[k]));
    else if (isObj(d[k]) && isObj(t[k])) deepFill(t[k], d[k]);
  }
}
function toast(msg, kind) {
  const box = $('toasts'); if (!box) return;
  const d = document.createElement('div');
  d.className = 'toast ' + (kind || ''); d.textContent = msg; box.appendChild(d);
  setTimeout(() => d.classList.add('out'), 2800);
  setTimeout(() => d.remove(), 3300);
}

/* ===================== dados do jogo ===================== */
const REF360 = 5760;          // pixels virtuais em um giro de 360°
const BOX_COST = 750;         // caixa (era 1000)
const DAILY = 1000;           // bônus diário (era 200)
const COIN_TARGET = 50;       // moedas por alvo destruído (era 2)
const TRACK_COIN_MS = 2000;   // Tracking: 1 "alvo" a cada 2 s com a mira no alvo (era 5 s)

const MODES = [
  {id:'fixed',     name:'Alvos fixos',   desc:'Um alvo por vez. Acerte rápido.',help:'Um alvo aparece por vez. Acerte, e outro surge em outro lugar. Acerto +15, erro −10.'},
  {id:'moving',    name:'Alvos móveis',  desc:'O alvo se move e quica nas bordas.',help:'O alvo se move pela arena e quica nas bordas. Acompanhe e clique nele. A velocidade você muda em Configurar.'},
  {id:'grid',      name:'Gridshot',      desc:'5 alvos ao mesmo tempo.',help:'Cinco alvos na tela ao mesmo tempo. Cada acerto repõe o alvo. Treina troca rápida de alvo.'},
  {id:'tracking',  name:'Tracking',      desc:'Segure o botão do tiro sobre o alvo. +3 pts/s, sem perdas.',help:'Mantenha a mira sobre um alvo em movimento COM o botão do tiro pressionado. Ganha 3 pontos por segundo e nunca perde pontos.'},
  {id:'flick',     name:'Reflexo',       desc:'O alvo some em 700 ms.',help:'O alvo some depois de um tempo curto (você pode mudar). Se sumir sem ser acertado, conta como erro. Treina o reflexo.'},
  {id:'survival',  name:'Sobrevivência', desc:'3 vidas. O alvo encolhe e fica mais difícil a cada 5 acertos.',help:'Você tem 3 vidas. O alvo encolhe até sumir; se sumir, perde uma vida. A cada 5 acertos ele fica menor e mais rápido.'},
  // Precisão: retirada da lista (código mantido em MODE_HIDDEN)
  {id:'reflex',    name:'Flickshot',     desc:'O alvo surge do nada. Reagiu rápido? +5 pontos.',help:'O alvo some e reaparece do nada. Clicar antes de ele aparecer é erro. Reagir em menos de 0,5 s vale +5 pontos.'},
  {id:'rain',      name:'Chuva',         desc:'Os alvos caem. Se um chegar ao chão, conta como erro.',help:'Os alvos caem de cima, até 5 ao mesmo tempo e cada vez mais rápido. Alvo que chega ao chão conta como erro, sem tirar pontos.'},
  // Micro ajuste: retirado da lista por enquanto (código mantido em MODE_HIDDEN para voltar fácil)
  {id:'decoy',     name:'Foco',          desc:'Acerte só o alvo certo. Os falsos (com X) tiram pontos.',help:'Aparecem 3 alvos: 1 certo e 2 falsos marcados com X. Acertar um falso é erro e tira 10 pontos.'}
];
const MODE_HIDDEN = [
  {id:'precision', name:'Precisão',      desc:'Alvos bem pequenos e parados. Cada tiro conta.',help:'Alvos bem pequenos e parados. Cada tiro conta, então mire com calma.'},
  {id:'micro',     name:'Micro ajuste',  desc:'5 alvos pequenos sempre juntos. Treina o ajuste fino da mira.',help:'Cinco alvos pequenos ficam na tela, sempre bem perto uns dos outros, numa arena menor. Cada acerto repõe o alvo ao lado dos demais, nunca no mesmo lugar do que acabou de sumir. Cada alvo some depois de 2 s e conta como erro. Treina pequenos ajustes da mira.'}
];   // modos desligados: não aparecem no menu, mas sessões antigas ainda os reconhecem
const MODE_BY_ID = Object.fromEntries(MODES.concat(MODE_HIDDEN).map(m => [m.id, m]));
const DURS = [30, 60, 90, 120];   // tempos rápidos do Setup (há também tempo personalizado e infinito)
const COMP_DUR = 60;              // Modo Competitivo: regras padrão, sempre 60 s
const DUR_MIN = 10, DUR_MAX = 3600;
const FLICK_COMP_MS = 700;   // tempo do alvo no Reflexo (Competitivo)
const INF_LIVES = 5;              // tempo infinito: o jogo só termina quando as vidas acabam
const MIN_GAP = 12;               // espaço mínimo (px) entre as bordas de dois alvos

const FORMATS = [
  {id:'circle',   name:'Círculo'},
  {id:'triangle', name:'Triângulo'},
  {id:'diamond',  name:'Losango'},
  {id:'pentagon', name:'Pentágono'},
  {id:'hexagon',  name:'Hexágono'},
  {id:'octagon',  name:'Octógono'},
  {id:'star5',    name:'Estrela'},
  {id:'cross',    name:'Cruz'},
  {id:'star4',    name:'Brilho'},
  {id:'square',   name:'Quadrado'}
];
const FMT_BY_ID = Object.fromEntries(FORMATS.map(f => [f.id, f]));
const SHAPE_SCALE = {triangle:1.3, diamond:1.1, pentagon:1.05, hexagon:1, octagon:1, star5:1.25, cross:1.1, star4:1.35};

const RARITY = {
  common:    {name:'Comum',    color:'#8b98a8', odds:60, cash:50},
  rare:      {name:'Rara',     color:'#4da3ff', odds:25, cash:100},
  epic:      {name:'Épica',    color:'#b266ff', odds:11, cash:200},
  legendary: {name:'Lendária', color:'#f5b421', odds:4,  cash:300},
  secret:    {name:'Secreta',  color:'#ff0055', odds:0,  cash:0}
};

/* 52 skins: 20 comuns, 15 raras, 10 épicas, 5 lendárias (animadas), 2 secretas.
   Todas são desenhadas no canvas por código (um único loop), sem animações CSS. */
const SKINS = [];
const addSkin = (id, name, rarity, kind, c, animated) => SKINS.push({id, name, rarity, kind, c, animated: !!animated});
[['azul','Azul Padrão','#2f7bff','#a9c9ff'],['vermelho','Vermelho','#e5384b','#ffb3bb'],['laranja','Laranja','#ff8a1f','#ffd2a1'],
 ['amarelo','Amarelo','#f5d21f','#fff3a8'],['verde','Verde','#2fc75a','#a8f2bd'],['ciano','Ciano','#19c7d9','#a5f0f7'],
 ['roxo','Roxo','#8f4dff','#d1b8ff'],['rosa','Rosa','#ff4fa3','#ffc0e0'],['branco','Branco','#f2f4f8','#9aa4b2'],
 ['grafite','Grafite','#4a5260','#b0b8c4']].forEach(([k,n,a,b]) => addSkin('comum-'+k, n, 'common', 'solid', [a,b]));
[['azul','Anel Azul','#2f7bff','#ffffff'],['vermelho','Anel Vermelho','#e5384b','#ffffff'],['verde','Anel Verde','#2fc75a','#0d1117'],
 ['amarelo','Anel Amarelo','#f5d21f','#0d1117'],['roxo','Anel Roxo','#8f4dff','#ffffff'],['laranja','Anel Laranja','#ff8a1f','#0d1117'],
 ['ciano','Anel Ciano','#19c7d9','#0d1117'],['rosa','Anel Rosa','#ff4fa3','#ffffff'],['cinza','Anel Cinza','#8b98a8','#0d1117'],
 ['noturno','Anel Noturno','#161b22','#00ffcc']].forEach(([k,n,a,b]) => addSkin('comum-anel-'+k, n, 'common', 'rings', [a,b]));
[['por-do-sol','Pôr do Sol','#ff7a18','#af002d'],['oceano','Oceano','#00c6ff','#0050c8'],['floresta','Floresta','#a8e063','#2e7d32'],
 ['lavanda','Lavanda','#c4a8ff','#6a3df0'],['chiclete','Chiclete','#ffb3d9','#ff2d8f']].forEach(([k,n,a,b]) => addSkin('rara-'+k, n, 'rare', 'gradient', [a,b]));
[['ciano','Brilho Ciano','#00ffcc'],['rosa','Brilho Rosa','#ff0055'],['ouro','Brilho Ouro','#f5b421'],
 ['verde','Brilho Verde','#39ff6a'],['azul','Brilho Azul','#4da3ff']].forEach(([k,n,a]) => addSkin('rara-brilho-'+k, n, 'rare', 'glow', [a]));
[['meia-noite','Meia-Noite','#1b2a49','#00ffcc'],['duelo','Duelo','#ff0055','#00ffcc'],['ouro-preto','Ouro e Preto','#f5b421','#111111'],
 ['gelo-fogo','Gelo e Fogo','#4da3ff','#ff5a2e'],['tigre','Tigre','#ff8a1f','#222222']].forEach(([k,n,a,b]) => addSkin('rara-'+k, n, 'rare', 'split', [a,b]));
addSkin('epica-vidro-ciano', 'Vidro Ciano', 'epic', 'shine', ['#00ffcc','#006b58']);
addSkin('epica-vidro-rosa', 'Vidro Rosa', 'epic', 'shine', ['#ff3d83','#7a0030']);
addSkin('epica-neon-ciano', 'Neon Ciano', 'epic', 'neon', ['#00ffcc']);
addSkin('epica-neon-rosa', 'Neon Rosa', 'epic', 'neon', ['#ff0055']);
addSkin('epica-neon-ouro', 'Neon Ouro', 'epic', 'neon', ['#f5b421']);
addSkin('epica-pulso-verde', 'Pulso Verde', 'epic', 'pulse', ['#39ff6a','#0b3d1a'], true);
addSkin('epica-pulso-roxo', 'Pulso Roxo', 'epic', 'pulse', ['#b266ff','#2a0f4d'], true);
addSkin('epica-radar', 'Listras Radar', 'epic', 'stripes', ['#39ff6a','#0d1117']);
addSkin('epica-perigo', 'Listras Perigo', 'epic', 'stripes', ['#f5b421','#111111']);
addSkin('epica-alvo', 'Alvo Clássico', 'epic', 'bullseye', ['#e5384b','#ffffff']);
addSkin('lendaria-chama', 'Chama Viva', 'legendary', 'fire', [], true);
addSkin('lendaria-arco-iris', 'Arco-íris', 'legendary', 'rainbow', [], true);
addSkin('lendaria-galaxia', 'Galáxia', 'legendary', 'galaxy', [], true);
addSkin('lendaria-plasma', 'Plasma', 'legendary', 'plasma', [], true);
addSkin('lendaria-aurora', 'Aurora', 'legendary', 'aurora', [], true);
addSkin('secreta-eclipse', 'Eclipse Solar', 'secret', 'eclipse', ['#f5b421'], true);
addSkin('secreta-glitch', 'Glitch Ômega', 'secret', 'glitch', ['#00f0ff'], true);
const SKIN_BY_ID = Object.fromEntries(SKINS.map(s => [s.id, s]));
const DEFAULT_SKIN = 'comum-azul';
const SECRET_SKIN = 'secreta-eclipse', SECRET_SKIN2 = 'secreta-glitch';

const TIMBRES = [
  {id:'seco', name:'Seco'}, {id:'metalico', name:'Metálico'}, {id:'digital', name:'Digital'},
  {id:'impacto', name:'Impacto'}, {id:'plasma', name:'Plasma'}, {id:'cristal', name:'Cristal'}, {id:'eletrico', name:'Elétrico'}
];
const ICONS = [
  {id:'target', ch:'🎯'}, {id:'bolt', ch:'⚡'}, {id:'fire', ch:'🔥'}, {id:'alien', ch:'👾'}, {id:'brain', ch:'🧠'},
  {id:'pad', ch:'🎮'}, {id:'rocket', ch:'🚀'}, {id:'fox', ch:'🦊'}, {id:'wolf', ch:'🐺'}, {id:'dragon', ch:'🐉'},
  // os de baixo são desbloqueados por conquistas (campo "ach")
  {id:'ninja', ch:'🥷', ach:'acc90'}, {id:'crown', ch:'👑', ach:'rich'}, {id:'gem', ch:'💎', ach:'skins10'}, {id:'robot', ch:'🤖', ach:'allmodes'},
  {id:'ghost', ch:'👻', ach:'immortal'}, {id:'boom', ch:'💥', ach:'combo20'}, {id:'eagle', ch:'🦅', ach:'score1000'}, {id:'trophy', ch:'🏆', ach:'sess50'},
  {id:'star', ch:'🌟', ach:'lvl5'}, {id:'medal', ch:'🏅', ach:'hits1000'}, {id:'shades', ch:'😎', ach:'vip'}, {id:'planet', ch:'🪐', ach:'legend'}
];
const ICON_BY_ID = Object.fromEntries(ICONS.map(i => [i.id, i.ch]));
const BG_OPTIONS = ['grid','black','dark','light','blue','purple','green','wine'];

const ACH = [
  {id:'first',    name:'Primeiro disparo', desc:'Complete 1 sessão.', title:'Recruta', test:u => u.stats.sessions >= 1},
  {id:'score500', name:'Meio milhar', desc:'Faça 500 pontos em uma sessão.', title:'Atirador', test:(u,s) => s && s.score >= 500},
  {id:'acc90',    name:'Cirurgião', desc:'90% de precisão com 30+ tiros.', title:'Cirurgião', test:(u,s) => s && s.shots >= 30 && s.acc >= 90},
  {id:'combo20',  name:'Imparável', desc:'Chegue a um combo de 20.', title:'Imparável', test:u => u.stats.bestCombo >= 20},
  {id:'hits1000', name:'Veterano', desc:'Destrua 1.000 alvos.', title:'Veterano', test:u => u.stats.targets >= 1000},
  {id:'allmodes', name:'Versátil', desc:'Jogue todos os modos.', title:'Versátil', test:u => MODES.every(m => (u.stats.modes[m.id] || 0) > 0)},
  {id:'track150', name:'Grudado', desc:'150 pontos no Tracking em uma sessão.', title:'Grudado', test:(u,s) => s && s.mode === 'tracking' && s.score >= 150},
  {id:'immortal', name:'Imortal', desc:'Sobrevivência de 2min+ sem perder vida.', title:'Imortal', test:(u,s) => s && s.mode === 'survival' && s.dur >= 120 && s.livesLeft === 3 && !s.early},
  {id:'rich',     name:'Magnata', desc:'Ganhe 5.000 moedas no total.', title:'Magnata', test:u => u.coinsEarned >= 5000},
  {id:'skins10',  name:'Colecionador', desc:'Tenha 10 skins.', title:'Colecionador', test:u => u.owned.skins.length >= 10},
  {id:'legend',   name:'Lendário', desc:'Obtenha uma skin lendária.', title:'Lendário', test:u => u.owned.skins.some(id => SKIN_BY_ID[id].rarity === 'legendary')},
  {id:'secret',   name:'???', desc:'Conquista secreta.', title:'Enigma', secret:true, test:u => u.owned.skins.includes(SECRET_SKIN) || u.owned.skins.includes(SECRET_SKIN2)},
  {id:'score1000', name:'Mil pontos', desc:'Faça 1.000 pontos em uma sessão.', title:'Milhar', test:(u,s) => s && s.score >= 1000},
  {id:'perfect',  name:'Perfeição', desc:'100% de precisão com 30+ tiros.', title:'Perfeito', test:(u,s) => s && s.mode !== 'tracking' && s.shots >= 30 && s.acc === 100},
  {id:'combo50',  name:'Frenesi', desc:'Chegue a um combo de 50.', title:'Frenético', test:u => u.stats.bestCombo >= 50},
  {id:'hits5000', name:'Lenda do alvo', desc:'Destrua 5.000 alvos.', title:'Lenda', test:u => u.stats.targets >= 5000},
  {id:'sess10',   name:'Aquecido', desc:'Complete 10 sessões.', title:'Aquecido', test:u => u.stats.sessions >= 10},
  {id:'sess50',   name:'Dedicado', desc:'Complete 50 sessões.', title:'Dedicado', test:u => u.stats.sessions >= 50},
  {id:'grid80',   name:'Cinco de uma vez', desc:'Destrua 80 alvos no Gridshot em uma sessão.', title:'Multitarefa', test:(u,s) => s && s.mode === 'grid' && s.hits >= 80},
  {id:'rain40',   name:'Guarda-chuva', desc:'Destrua 40 alvos na Chuva em uma sessão.', title:'Guarda-chuva', test:(u,s) => s && s.mode === 'rain' && s.hits >= 40},
  {id:'react',    name:'Reflexo de gato', desc:'Reação média abaixo de 350 ms no Flickshot (10+ alvos).', title:'Felino', test:(u,s) => s && s.mode === 'reflex' && s.hits >= 10 && s.avgReact > 0 && s.avgReact < 350},
  {id:'focus',    name:'Olho clínico', desc:'95% de precisão com 30+ tiros no Foco.', title:'Olho clínico', test:(u,s) => s && s.mode === 'decoy' && s.shots >= 30 && s.acc >= 95},
  {id:'prec300',  name:'Mira de elite', desc:'300 pontos no modo Alvos móveis.', title:'Elite', test:(u,s) => s && s.mode === 'moving' && s.score >= 300},
  {id:'marathon', name:'Maratona', desc:'Conclua uma sessão de 5 minutos.', title:'Maratonista', test:(u,s) => s && s.dur === 300 && !s.early},
  {id:'lefty',    name:'Canhoto', desc:'Conclua uma sessão no modo canhoto.', title:'Canhoto', test:(u,s) => s && s.left},
  {id:'rich100k', name:'Milionário', desc:'Ganhe 100.000 moedas no total.', title:'Milionário', test:u => u.coinsEarned >= 100000},
  {id:'vip',      name:'VIP', desc:'Compre o Passe Premium.', title:'VIP', test:u => u.premium},
  {id:'lvl5',     name:'Nível 5', desc:'Chegue ao nível 5.', title:'Experiente', test:u => levelInfo(u.xp).L >= 5},
  {id:'lvl10',    name:'Nível 10', desc:'Chegue ao nível 10.', title:'Mestre', test:u => levelInfo(u.xp).L >= 10},
  {id:'skins25',  name:'Acervo', desc:'Tenha 25 skins.', title:'Acervo', test:u => u.owned.skins.length >= 25},
  {id:'epic',     name:'Épico!', desc:'Obtenha uma skin épica.', title:'Épico', test:u => u.owned.skins.some(id => SKIN_BY_ID[id].rarity === 'epic')}
];

const PASSES = [
  {id:'luck',   ico:'🍀', name:'Passe da Sorte',   price:40000, desc:'Chances melhores na caixa: mais Raras, Épicas e Lendárias (Lendária sobe de 4% para 10%).'},
  {id:'triple', ico:'3×', name:'Giro Triplo',       price:70000, desc:'Abre 3 caixas ao mesmo tempo, em 3 roletas.'},
  {id:'fast',   ico:'⚡', name:'Giro Rápido',       price:15000, desc:'A roleta gira muito mais rápido.'},
  {id:'auto',   ico:'🔁', name:'Giro Automático',   price:20000, desc:'Abre caixas sozinho, uma depois da outra, até você parar ou as moedas acabarem.'}
];
const LUCK_ODDS = {common:40, rare:33, epic:17, legendary:10};
const PREMIUM_PRICE = 100000;   // Passe Premium: item da loja (dobra moedas e XP)
const TIPS = [
  {text:'Você pode comprar itens na loja com as moedas que ganha jogando.'},
  {text:'Está errando muito? Experimente mudar a sensibilidade.'},
  {text:'Abra a caixa de skins e descubra skins raras, épicas e lendárias.'},
  {text:'Cada alvo destruído rende 50 moedas. Colete também o bônus diário na loja.'},
  {text:'Combo de 5 acertos seguidos passa a valer +20 pontos por alvo.'},
  {text:'No Tracking, segure o botão do tiro com a mira no alvo: +3 pontos por segundo e nenhum desconto.'},
  {text:'Canhoto? Ligue o modo canhoto em Configurações para inverter os botões do mouse.'},
  {text:'Novos modos: Precisão, Flickshot, Chuva e Foco. Teste todos!'},
  {text:'Seu progresso fica só neste navegador. Faça backup em Configurações.'},
  {text:'Monte sua retícula e compartilhe o código FA2 com os amigos.'},
  {text:'Prefere outro som? Teste os 7 timbres em Configurações.'},
  {text:'Treinar 10 minutos por dia já melhora sua precisão.'},
  {text:'Esc cancela a sessão atual. Nada é contabilizado.'},
  {text:'O Passe Premium da loja (100.000 moedas) dobra as moedas e o XP que você ganha.', premium:true}
];
/* Nível: 100 XP para o nível 2, 400 para o 3, 900 para o 4... */
const lvlBase = L => 100 * (L - 1) * (L - 1);
function levelInfo(xp) {
  const L = Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1, a = lvlBase(L), b = lvlBase(L + 1);
  return {L, cur: xp - a, need: b - a, pct: clamp((xp - a) / (b - a) * 100, 0, 100)};
}

/* ===================== banco local ===================== */
const KEY = 'freeaim.v1';
function defaultXH() { return {shape:'empty', color:'#00ffcc', size:10, thick:2, gap:4, opacity:100, outline:true, dot:true, dotSize:2, pulse:true}; }
function defaultsUser() {
  return {
    v:2, coins:0, coinsEarned:0, xp:0, premium:false, icon:'target', title:'', unlocked:[],
    modeCfg:{}, owned:{skins:[DEFAULT_SKIN], formats:['circle']}, passes:{luck:false, triple:false, fast:false, auto:false}, boxFast:true, adminBox:'',
    equip:{skin:DEFAULT_SKIN, format:'circle'},
    stats:{sessions:0, bestScore:0, bestAcc:0, bestCombo:0, targets:0, timeMs:0, modes:{}},
    best:{}, history:[], coinLog:[], boxLog:[], lastDaily:'',
    last:{mode:'fixed', dur:60, comp:false},
    settings:{sound:true, timbre:'seco', volume:60, speed:5, bg:'grid', leftHanded:false, tips:true},
    xh:defaultXH(), sens:{dpi:800, cm:30, lock:true}
  };
}
/* conta administradora (modo de demonstração local): usuário e senha ADM01.
   Tudo desbloqueado e moedas que nunca acabam. Como o jogo é 100% local, isso vale só neste navegador. */
/* ----- personalização por modo: cada modo pode ter as suas opções (user.modeCfg[modo]) ----- */
const MODE_OPTS = {
  moving:   {speed: true},
  tracking: {speed: true},
  rain:     {speed: true},
  grid:     {count:  {min: 1, max: 12, step: 1, def: 5, label: 'Alvos na tela', unit: ''}},
  flick:    {vanish: {min: 300, max: 2000, step: 50, def: 700, label: 'Tempo até o alvo sumir', unit: ' ms'}},
  survival: {vanish: {min: 800, max: 4000, step: 100, def: 2000, label: 'Tempo até o alvo sumir (nível 1)', unit: ' ms'}},
  micro:    {vanish: {min: 1000, max: 5000, step: 100, def: 2000, label: 'Tempo até o alvo sumir', unit: ' ms'}},
  reflex:   {wait:   {min: 500, max: 3000, step: 100, def: 1300, label: 'Atraso máximo até o alvo aparecer', unit: ' ms'}}
};
const ARENA_DEF = {micro: 70};   // tamanho padrão da arena (%) por modo; os outros usam 100
const arenaDef = id => ARENA_DEF[id] || 100;
function modeCfg(id) {
  const comp = !!(user && user.last && user.last.comp);   // Modo Competitivo: sempre as regras padrão
  const o = MODE_OPTS[id] || {}, c = (!comp && user && user.modeCfg && user.modeCfg[id]) || {}, out = {};
  out.shape = c.shape === 'square' ? 'square' : 'circle';   // formato do alvo: vale para todos os modos
  out.ashape = c.ashape === 'square' ? 'square' : 'rect';   // formato da arena: retangular ou quadrada
  out.arena = clamp(Math.round(+c.arena || arenaDef(id)), 50, 100);   // tamanho da arena em %
  if (o.speed) out.speed = clamp(Math.round(+c.speed || (comp ? 5 : user.settings.speed)), 1, 10);
  for (const k of ['count', 'vanish', 'wait']) if (o[k]) out[k] = clamp(Math.round(+c[k] || o[k].def), o[k].min, o[k].max);
  if (comp && id === 'flick') out.vanish = FLICK_COMP_MS;   // Reflexo competitivo: o alvo some em 700 ms
  return out;
}
/* modo "personalizado": mudou a quantidade, o tempo ou o tamanho da arena (velocidade e formato não contam) */
function isCustom(id) {
  if (user && user.last && user.last.comp) return false;   // competitivo usa as regras padrão do ranking
  const o = MODE_OPTS[id] || {}, c = modeCfg(id);
  return c.arena !== arenaDef(id) || c.ashape === 'square' || ['count', 'vanish', 'wait'].some(k => o[k] && c[k] !== o[k].def);
}
const ADMIN_NAME = 'ADM01', ADMIN_KEY = 'adm01', ADMIN_COINS = 999999999;
function applyAdmin(u) {
  u.admin = true; u.coins = ADMIN_COINS;
  if (!isObj(u.adminOff)) u.adminOff = {};   // a conta admin pode desligar o Premium e cada passe
  u.premium = !u.adminOff.premium;
  u.unlocked = ACH.map(a => a.id);
  u.owned.skins = SKINS.map(k => k.id);
  for (const p of PASSES) u.passes[p.id] = !u.adminOff[p.id];
  return u;
}
const XH_SHAPES = ['empty','cross','dot','circle','chevron'];
function hydrate(u) {
  const legacy = u.v !== 2;   // contas da versão de teste: o premium de teste não vale
  deepFill(u, defaultsUser());
  const mig = id => (id === 'default' || id === 'padrao' || id === 'padrão') ? DEFAULT_SKIN : id;
  u.owned.skins = [...new Set(u.owned.skins.map(mig).filter(id => SKIN_BY_ID[id]))];
  if (!u.owned.skins.includes(DEFAULT_SKIN)) u.owned.skins.unshift(DEFAULT_SKIN);
  u.equip.skin = mig(u.equip.skin);
  if (!u.owned.skins.includes(u.equip.skin)) u.equip.skin = DEFAULT_SKIN;
  u.owned.formats = [...new Set(u.owned.formats.filter(id => FMT_BY_ID[id]))];
  u.owned.formats = ['circle']; u.equip.format = 'circle';   // formatos de alvo foram removidos da loja: só o círculo
  if (!MODE_BY_ID[u.last.mode]) u.last.mode = 'fixed';
  u.last.dur = (u.last.dur === 0 || (u.last.dur >= DUR_MIN && u.last.dur <= DUR_MAX)) ? Math.round(u.last.dur) : 60;
  u.last.comp = !!u.last.comp;
  if (!XH_SHAPES.includes(u.xh.shape)) u.xh.shape = 'empty';
  if (!BG_OPTIONS.includes(u.settings.bg)) u.settings.bg = 'grid';
  if (!TIMBRES.some(t => t.id === u.settings.timbre)) u.settings.timbre = 'seco';
  for (const p of PASSES) u.passes[p.id] = u.passes[p.id] === true;
  if (!isObj(u.modeCfg)) u.modeCfg = {};
  u.coins = Math.max(0, Math.floor(+u.coins || 0));
  u.xp = Math.max(0, Math.floor(+u.xp || 0));
  delete u.settings.autoFs;
  if (legacy) { u.premium = false; u.v = 2; }
  if (u.admin) applyAdmin(u);
  return u;
}
function loadDB() {
  let r = null;
  try { r = JSON.parse(localStorage.getItem(KEY)); } catch (e) { r = null; }
  if (!r || !isObj(r.users)) r = {users:{}};
  if (!isObj(r.ranking)) r.ranking = {};
  if (!Array.isArray(r.rankLog)) r.rankLog = [];   // registro de TODAS as partidas competitivas
  if (!isObj(r.ui)) r.ui = {};
  deepFill(r.ui, {theme:'dark', colorblind:'none', lang:'pt'});
  if (typeof r.session !== 'string') r.session = null;
  for (const k in r.users) hydrate(r.users[k]);
  return r;
}
let db = loadDB();
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); }
  catch (e) { toast('Não foi possível salvar (armazenamento cheio ou bloqueado).', 'warn'); }
}
let user = null;

/* ===================== hash e login ===================== */
async function sha256(str) {
  try {
    if (window.crypto && crypto.subtle) {
      const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
      return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
    }
  } catch (e) { /* cai no fallback */ }
  return sha256js(str);
}
const randHex = n => { const a = new Uint8Array(n); (window.crypto || {getRandomValues: x => x.forEach((_, i) => x[i] = Math.random() * 256)}).getRandomValues(a); return [...a].map(b => b.toString(16).padStart(2, '0')).join(''); };
const hashPass = (salt, pass) => sha256((salt ? salt + ':' : '') + pass);

let authMode = 'login';
function setAuthMode(m) {
  authMode = m;
  $('tab-login').classList.toggle('active', m === 'login');
  $('tab-register').classList.toggle('active', m === 'register');
  $('auth-submit').textContent = m === 'login' ? 'Entrar' : 'Criar conta';
  $('auth-pass').autocomplete = m === 'login' ? 'current-password' : 'new-password';
  authMsg('');
}
function authMsg(t, ok) { const m = $('auth-msg'); m.textContent = t; m.classList.toggle('ok', !!ok); }
$('tab-login').addEventListener('click', () => setAuthMode('login'));
$('tab-register').addEventListener('click', () => setAuthMode('register'));
$('auth-form').addEventListener('submit', async e => {
  e.preventDefault();
  const name = $('auth-user').value.trim(), pass = $('auth-pass').value;
  if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) return authMsg('Nome: 3 a 16 caracteres (letras, números e _).');
  const key = name.toLowerCase();
  const isAdminLogin = name.toUpperCase() === ADMIN_NAME && pass.trim().toUpperCase() === ADMIN_NAME;   // vale nas duas abas (Entrar ou Criar conta), sem diferenciar maiúsculas
  $('auth-submit').disabled = true;
  try {
    if (authMode === 'register' && !isAdminLogin) {
      if (pass.length < 8 || !/[A-Za-z]/.test(pass) || !/\d/.test(pass)) return authMsg('Senha: 8+ caracteres, com letras e números.');
      if (db.users[key] || key === 'convidado' || key === ADMIN_KEY) return authMsg('Esse nome já está em uso.');
      const salt = randHex(8);
      db.users[key] = hydrate({name, salt, hash: await hashPass(salt, pass), createdAt: Date.now()});
    } else if (isAdminLogin) {
      if (!db.users[ADMIN_KEY]) db.users[ADMIN_KEY] = hydrate({name: ADMIN_NAME, admin: true, salt: '', hash: '', createdAt: Date.now()});
      applyAdmin(db.users[ADMIN_KEY]);
    } else {
      const u = db.users[key];
      if (!u || u.admin || (await hashPass(u.salt, pass)) !== u.hash) return authMsg('Usuário ou senha incorretos.');
    }
    db.session = key; save();
    $('auth-pass').value = '';
    enterApp();
  } finally { $('auth-submit').disabled = false; }
});
$('btn-guest').addEventListener('click', () => {
  const key = '@convidado';   // o @ não passa na regra de nome, então nunca colide com uma conta
  if (!db.users[key]) db.users[key] = hydrate({name: 'Convidado', guest: true, createdAt: Date.now()});
  db.session = key; save(); enterApp();
});
$('btn-logout').addEventListener('click', () => {
  cancelSession(); closeFocus(); stopTips(); db.session = null; save(); user = null;
  $('app').classList.add('hidden'); $('auth-screen').classList.remove('hidden');
  setAuthMode('login');
});

/* ===================== tema e daltonismo ===================== */
function buildCbFilters() {
  const I = [[1,0,0],[0,1,0],[0,0,1]];
  const mul = (A, B) => A.map(r => [0,1,2].map(j => r[0]*B[0][j] + r[1]*B[1][j] + r[2]*B[2][j]));
  const sims = {
    protanopia:   [[.567,.433,0],[.558,.442,0],[0,.242,.758]],
    deuteranopia: [[.625,.375,0],[.7,.3,0],[0,.3,.7]],
    tritanopia:   [[.95,.05,0],[0,.433,.567],[0,.475,.525]]
  };
  const shifts = {
    protanopia:   [[0,0,0],[.7,1,0],[.7,0,1]],
    deuteranopia: [[0,0,0],[.7,1,0],[.7,0,1]],
    tritanopia:   [[1,0,.7],[0,1,.7],[0,0,0]]
  };
  const defs = $('cb-defs'), NS = 'http://www.w3.org/2000/svg';
  for (const k in sims) {
    const E = I.map((r, i) => r.map((v, j) => v - sims[k][i][j]));
    const SE = mul(shifts[k], E);
    const M = I.map((r, i) => r.map((v, j) => v + SE[i][j]));
    const f = document.createElementNS(NS, 'filter'); f.setAttribute('id', 'cb-' + k);
    f.setAttribute('color-interpolation-filters', 'sRGB');
    const m = document.createElementNS(NS, 'feColorMatrix'); m.setAttribute('type', 'matrix');
    m.setAttribute('values', M.map(r => r.map(v => v.toFixed(3)).join(' ') + ' 0 0').join(' ') + ' 0 0 0 1 0');
    f.appendChild(m); defs.appendChild(f);
  }
}
function applyTheme() {
  document.documentElement.dataset.theme = db.ui.theme;
  document.documentElement.style.filter = db.ui.colorblind === 'none' ? '' : `url(#cb-${db.ui.colorblind})`;
}

/* ===================== som (Web Audio) ===================== */
let actx = null;
function audio() {
  if (!actx) { const A = window.AudioContext || window.webkitAudioContext; if (!A) return null; actx = new A(); }
  if (actx.state === 'suspended') actx.resume();
  return actx;
}
function playTimbre(name, vol) {
  const a = audio(); if (!a || vol <= 0) return;
  const t = a.currentTime, out = a.createGain(); out.gain.value = vol; out.connect(a.destination);
  const tone = (type, f0, f1, dur, gain, delay = 0) => {
    const o = a.createOscillator(), g = a.createGain(); o.type = type;
    o.frequency.setValueAtTime(f0, t + delay);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + delay + dur);
    g.gain.setValueAtTime(0.0001, t + delay);
    g.gain.exponentialRampToValueAtTime(gain, t + delay + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + delay + dur);
    o.connect(g); g.connect(out); o.start(t + delay); o.stop(t + delay + dur + 0.03);
  };
  const noise = (dur, gain, freq, q, type, delay = 0) => {
    const n = Math.floor(a.sampleRate * dur), b = a.createBuffer(1, n, a.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const s = a.createBufferSource(); s.buffer = b;
    const f = a.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = a.createGain(); g.gain.setValueAtTime(gain, t + delay); g.gain.exponentialRampToValueAtTime(0.0001, t + delay + dur);
    s.connect(f); f.connect(g); g.connect(out); s.start(t + delay);
  };
  switch (name) {
    case 'metalico': tone('triangle', 1800, 1700, .18, .6); tone('square', 2710, 2700, .12, .22); break;
    case 'digital':  tone('square', 880, 880, .05, .3); tone('square', 1320, 1320, .07, .3, .05); break;
    case 'impacto':  tone('sine', 180, 45, .16, 1); noise(.06, .6, 800, .8, 'lowpass'); break;
    case 'plasma':   tone('sawtooth', 300, 1800, .14, .35); tone('sine', 600, 2400, .14, .3); break;
    case 'cristal':  tone('sine', 2093, 2093, .35, .5); tone('sine', 3136, 3136, .28, .3); tone('sine', 4186, 4186, .2, .15); break;
    case 'eletrico': noise(.12, .8, 3500, 3, 'bandpass'); tone('sawtooth', 90, 60, .1, .3); noise(.05, .7, 5000, 2, 'highpass', .06); break;
    default:         noise(.05, .9, 2500, 1.2, 'bandpass'); tone('square', 1200, 400, .04, .2); // seco
  }
}
function soundVol() { return user && user.settings.sound ? user.settings.volume / 100 : 0; }
function playHit() { if (user) playTimbre(user.settings.timbre, soundVol()); }
function playMiss() {
  const a = audio(), v = soundVol(); if (!a || v <= 0) return;
  const o = a.createOscillator(), g = a.createGain(), t = a.currentTime;
  o.type = 'sine'; o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(90, t + .08);
  g.gain.setValueAtTime(.25 * v, t); g.gain.exponentialRampToValueAtTime(.0001, t + .09);
  o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + .1);
}

/* ===================== desenho: formatos, skins, retícula ===================== */
function makePath(shape, x, y, r) {
  r *= SHAPE_SCALE[shape] || 1;
  const p = new Path2D();
  const poly = (n, rot) => { for (let i = 0; i < n; i++) { const a = rot + i * 2 * Math.PI / n, px = x + Math.cos(a) * r, py = y + Math.sin(a) * r; i ? p.lineTo(px, py) : p.moveTo(px, py); } p.closePath(); };
  const star = (n, k) => { for (let i = 0; i < n * 2; i++) { const a = -Math.PI / 2 + i * Math.PI / n, rr = i % 2 ? r * k : r, px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr; i ? p.lineTo(px, py) : p.moveTo(px, py); } p.closePath(); };
  switch (shape) {
    case 'square': { const h = r * .9; p.moveTo(x - h, y - h); p.lineTo(x + h, y - h); p.lineTo(x + h, y + h); p.lineTo(x - h, y + h); p.closePath(); break; }
    case 'triangle': poly(3, -Math.PI / 2); break;
    case 'diamond':  poly(4, -Math.PI / 2); break;
    case 'pentagon': poly(5, -Math.PI / 2); break;
    case 'hexagon':  poly(6, 0); break;
    case 'octagon':  poly(8, Math.PI / 8); break;
    case 'star5':    star(5, .45); break;
    case 'star4':    star(4, .36); break;
    case 'cross': {
      const w = r * .36;
      [[-w,-r],[w,-r],[w,-w],[r,-w],[r,w],[w,w],[w,r],[-w,r],[-w,w],[-r,w],[-r,-w],[-w,-w]]
        .forEach(([dx, dy], i) => i ? p.lineTo(x + dx, y + dy) : p.moveTo(x + dx, y + dy));
      p.closePath(); break;
    }
    default: p.arc(x, y, r, 0, Math.PI * 2);
  }
  return p;
}

function skinColor(skin, t) {
  if (skin.kind === 'rainbow') return `hsl(${(t * .12) % 360},100%,60%)`;
  if (skin.kind === 'fire') return '#ff9a1f';
  if (skin.kind === 'galaxy') return '#b266ff';
  if (skin.kind === 'plasma') return '#ff3df0';
  if (skin.kind === 'aurora') return '#00ffcc';
  return skin.c[0];
}

function drawTarget(c, shape, skin, x, y, r, t) {
  const P = k => makePath(shape, x, y, r * k);
  const col = skin.c;
  c.save(); c.lineJoin = 'round'; c.lineWidth = Math.max(2, r * .08);
  switch (skin.kind) {
    case 'solid':
      c.fillStyle = col[0]; c.fill(P(1)); c.strokeStyle = col[1]; c.stroke(P(1));
      c.globalAlpha = .45; c.stroke(P(.55)); break;
    case 'rings':
      c.fillStyle = col[0]; c.fill(P(1)); c.fillStyle = col[1]; c.fill(P(.68)); c.fillStyle = col[0]; c.fill(P(.36)); break;
    case 'gradient': {
      const g = c.createRadialGradient(x, y, 0, x, y, r * 1.1); g.addColorStop(0, col[0]); g.addColorStop(1, col[1]);
      c.fillStyle = g; c.fill(P(1)); c.strokeStyle = 'rgba(255,255,255,.55)'; c.stroke(P(1)); break;
    }
    case 'glow':
      c.shadowColor = col[0]; c.shadowBlur = r * .7; c.fillStyle = col[0]; c.fill(P(1));
      c.shadowBlur = 0; c.fillStyle = 'rgba(255,255,255,.35)'; c.fill(P(.45)); break;
    case 'split':
      c.save(); c.clip(P(1)); c.fillStyle = col[0]; c.fillRect(x - r * 1.5, y - r * 1.5, r * 1.5, r * 3);
      c.fillStyle = col[1]; c.fillRect(x, y - r * 1.5, r * 1.5, r * 3); c.restore();
      c.strokeStyle = 'rgba(255,255,255,.6)'; c.stroke(P(1)); break;
    case 'stripes':
      c.save(); c.clip(P(1)); c.fillStyle = col[1]; c.fillRect(x - r * 1.5, y - r * 1.5, r * 3, r * 3);
      c.translate(x, y); c.rotate(-Math.PI / 4); c.fillStyle = col[0];
      for (let i = -4; i <= 4; i += 2) c.fillRect(-r * 2, i * r * .22, r * 4, r * .22);
      c.restore(); c.strokeStyle = col[0]; c.stroke(P(1)); break;
    case 'shine': {
      const g = c.createRadialGradient(x - r * .3, y - r * .3, r * .1, x, y, r * 1.1); g.addColorStop(0, col[0]); g.addColorStop(1, col[1]);
      c.fillStyle = g; c.fill(P(1));
      c.save(); c.clip(P(1)); c.fillStyle = 'rgba(255,255,255,.4)'; c.beginPath(); c.ellipse(x - r * .25, y - r * .38, r * .5, r * .26, -.5, 0, 6.283); c.fill(); c.restore();
      c.strokeStyle = 'rgba(255,255,255,.6)'; c.stroke(P(1)); break;
    }
    case 'neon':
      c.fillStyle = '#0d1117'; c.fill(P(1));
      c.shadowColor = col[0]; c.shadowBlur = r * .6; c.strokeStyle = col[0]; c.lineWidth = r * .16; c.stroke(P(.86));
      c.lineWidth = r * .06; c.stroke(P(.45)); break;
    case 'pulse': {
      const k = .5 + .5 * Math.sin(t * .005);
      c.shadowColor = col[0]; c.shadowBlur = r * (.25 + .75 * k); c.fillStyle = col[1]; c.fill(P(1));
      c.strokeStyle = col[0]; c.stroke(P(1)); c.shadowBlur = 0; c.fillStyle = col[0]; c.fill(P(.35 + .2 * k)); break;
    }
    case 'bullseye':
      c.shadowColor = col[0]; c.shadowBlur = r * .4;
      c.fillStyle = col[0]; c.fill(P(1)); c.shadowBlur = 0;
      c.fillStyle = col[1]; c.fill(P(.72)); c.fillStyle = col[0]; c.fill(P(.45)); c.fillStyle = col[1]; c.fill(P(.18)); break;
    case 'fire': {
      const f = 1 + .05 * Math.sin(t * .02);
      c.shadowColor = '#ff6a00'; c.shadowBlur = r * .8;
      const g = c.createRadialGradient(x, y, 0, x, y, r * 1.1); g.addColorStop(0, '#fff3b0'); g.addColorStop(.5, '#ff9a1f'); g.addColorStop(1, '#e5381e');
      c.fillStyle = g; c.fill(makePath(shape, x, y, r * f)); c.shadowBlur = 0;
      c.fillStyle = 'rgba(255,230,140,.85)';
      for (let i = 0; i < 6; i++) { const a = t * .004 + i * Math.PI / 3, d = r * (.45 + .15 * Math.sin(t * .006 + i)); c.beginPath(); c.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, r * .09, 0, 6.283); c.fill(); }
      break;
    }
    case 'rainbow': {
      const h = (t * .12) % 360, g = c.createRadialGradient(x, y, 0, x, y, r * 1.1);
      g.addColorStop(0, `hsl(${h},100%,70%)`); g.addColorStop(1, `hsl(${h + 70},100%,50%)`);
      c.fillStyle = g; c.fill(P(1)); c.strokeStyle = `hsl(${h + 180},100%,75%)`; c.lineWidth = r * .1; c.stroke(P(.6));
      c.strokeStyle = '#fff'; c.lineWidth = Math.max(2, r * .06); c.stroke(P(1)); break;
    }
    case 'galaxy': {
      c.shadowColor = '#7b5cff'; c.shadowBlur = r * .5;
      const g = c.createRadialGradient(x, y, 0, x, y, r * 1.1); g.addColorStop(0, '#3a2480'); g.addColorStop(1, '#070614');
      c.fillStyle = g; c.fill(P(1)); c.shadowBlur = 0;
      c.save(); c.clip(P(1));
      for (let i = 0; i < 14; i++) {
        const a = i * 2.399 + t * .0004 * (1 + i % 3), d = r * ((i * 37 % 100) / 100) * .95;
        c.globalAlpha = .5 + .5 * Math.sin(t * .004 + i); c.fillStyle = '#fff';
        c.beginPath(); c.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, Math.max(1, r * .05), 0, 6.283); c.fill();
      }
      c.restore(); c.strokeStyle = '#b266ff'; c.stroke(P(1)); break;
    }
    case 'plasma': {
      const ox = Math.cos(t * .004) * r * .3, oy = Math.sin(t * .005) * r * .3, k = .5 + .5 * Math.sin(t * .006);
      c.shadowColor = '#ff3df0'; c.shadowBlur = r * (.4 + .5 * k);
      const g = c.createRadialGradient(x + ox, y + oy, 0, x, y, r * 1.1); g.addColorStop(0, '#ffffff'); g.addColorStop(.35, '#00e5ff'); g.addColorStop(1, '#a100ff');
      c.fillStyle = g; c.fill(P(1)); c.shadowBlur = 0; c.strokeStyle = 'rgba(255,255,255,.7)'; c.stroke(P(1)); break;
    }
    case 'aurora': {
      const a = t * .002, dx = Math.cos(a) * r, dy = Math.sin(a) * r;
      const g = c.createLinearGradient(x - dx, y - dy, x + dx, y + dy);
      g.addColorStop(0, '#00ffcc'); g.addColorStop(.5, '#7b5cff'); g.addColorStop(1, '#39ff6a');
      c.shadowColor = '#00ffcc'; c.shadowBlur = r * .5; c.fillStyle = g; c.fill(P(1));
      c.shadowBlur = 0; c.strokeStyle = 'rgba(255,255,255,.55)'; c.stroke(P(1)); break;
    }
    case 'eclipse': {   // secreta 1: eclipse solar, coroa com raios girando, anel de plasma e faíscas em órbita
      const k = .5 + .5 * Math.sin(t * .004), rot = t * .0011;
      c.save(); c.shadowColor = '#ffb21f'; c.shadowBlur = r * (.6 + .9 * k); c.lineCap = 'round';
      for (let i = 0; i < 20; i++) {
        const a = rot * (i % 2 ? 1 : -1) + i * Math.PI / 10, len = r * (1.08 + .17 * Math.sin(t * .007 + i * 1.9));
        c.strokeStyle = i % 3 ? '#ffb21f' : '#fff4b8'; c.lineWidth = Math.max(1.5, r * (i % 3 ? .06 : .1));
        c.beginPath(); c.moveTo(x + Math.cos(a) * r * .86, y + Math.sin(a) * r * .86); c.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); c.stroke();
      }
      c.strokeStyle = '#ffb21f'; c.lineWidth = r * .15; c.stroke(P(.9));
      c.restore();
      c.save(); c.shadowBlur = 0; c.setLineDash([r * .34, r * .16]); c.lineDashOffset = -t * .04;
      c.strokeStyle = '#ffffff'; c.lineWidth = Math.max(1.5, r * .05); c.stroke(P(.7)); c.restore();
      const g = c.createRadialGradient(x, y, r * .1, x, y, r * .66); g.addColorStop(0, '#000000'); g.addColorStop(.8, '#05060f'); g.addColorStop(1, '#2a0a5e');
      c.fillStyle = g; c.fill(P(.64));
      c.strokeStyle = `rgba(166,77,255,${.55 + .4 * k})`; c.lineWidth = Math.max(1.5, r * .05); c.stroke(P(.64));
      c.fillStyle = '#fff4b8'; c.shadowColor = '#ffb21f'; c.shadowBlur = r * .3;
      for (let i = 0; i < 3; i++) { const a = -rot * 3 + i * 2.094, d = r * (.42 + .06 * Math.sin(t * .008 + i)); c.beginPath(); c.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, Math.max(1.5, r * .06), 0, 6.283); c.fill(); }
      break;
    }
    case 'glitch': {   // secreta 2: glitch com separação de cores (RGB), fatias deslocadas, linhas de varredura e onda de choque
      const step = Math.floor(t / 90), burst = step % 7 === 0, sh = r * (.06 + .06 * Math.abs(Math.sin(t * .01))) * (burst ? 2.6 : 1);
      const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, '#1a0a3d'); g.addColorStop(1, '#05030d');
      c.fillStyle = g; c.fill(P(1));
      c.globalCompositeOperation = 'lighter'; c.lineWidth = Math.max(2, r * .17);
      [[-sh, 0, '#ff0040'], [sh, 0, '#00f0ff'], [0, sh * .7, '#6a1bff']].forEach(([dx, dy, col2]) => { c.strokeStyle = col2; c.stroke(makePath(shape, x + dx, y + dy, r * .86)); });
      c.save(); c.clip(P(.96));
      c.fillStyle = 'rgba(0,240,255,.16)';
      for (let i = 0; i < 7; i++) c.fillRect(x - r, y - r + ((t * .09 + i * r * .31) % (2 * r)), r * 2, Math.max(1.5, r * .07));
      c.fillStyle = 'rgba(255,0,64,.22)';
      for (let i = 0; i < 4; i++) c.fillRect(x - r + Math.sin(t * .004 + i) * r * .3, y - r + ((t * .14 + i * r * .53) % (2 * r)), r * 2, Math.max(1.5, r * .05));
      if (burst) {
        for (let i = 0; i < 3; i++) { const o = ((step * 37 + i * 53) % 100) / 100; c.fillStyle = i % 2 ? 'rgba(0,240,255,.8)' : 'rgba(255,0,64,.8)'; c.fillRect(x - r + (o - .5) * r * .8, y - r + o * r * 1.7, r * 2, Math.max(2, r * .1)); }
      }
      c.restore();
      c.globalCompositeOperation = 'source-over';
      c.shadowColor = '#00f0ff'; c.shadowBlur = r * .5; c.fillStyle = '#ffffff';
      c.beginPath(); c.arc(x, y, r * (.13 + .04 * Math.sin(t * .02)), 0, 6.283); c.fill(); c.shadowBlur = 0;
      const w = (t % 900) / 900; c.globalAlpha = 1 - w; c.strokeStyle = '#00f0ff'; c.lineWidth = Math.max(1.5, r * .05); c.stroke(P(1 + w * .3));
      c.globalAlpha = 1; c.strokeStyle = '#ffffff'; c.lineWidth = Math.max(1.5, r * .045); c.stroke(P(1)); break;
    }
    default: c.fillStyle = col[0] || '#fff'; c.fill(P(1));
  }
  c.restore();
}

function drawCrosshair(c, x, y, cfg, pk) {
  const k = cfg.pulse ? 1 + .4 * pk : 1, size = cfg.size * k, gap = cfg.gap * k, th = cfg.thick;
  c.save(); c.globalAlpha = cfg.opacity / 100;
  const paint = (extra, col) => {
    c.strokeStyle = col; c.fillStyle = col; c.lineWidth = th + extra * 2; c.lineCap = extra ? 'square' : 'butt'; c.lineJoin = 'miter';
    if (cfg.shape === 'cross') {
      c.beginPath();
      c.moveTo(x - gap - size, y); c.lineTo(x - gap, y); c.moveTo(x + gap, y); c.lineTo(x + gap + size, y);
      c.moveTo(x, y - gap - size); c.lineTo(x, y - gap); c.moveTo(x, y + gap); c.lineTo(x, y + gap + size); c.stroke();
    } else if (cfg.shape === 'dot') {
      c.beginPath(); c.arc(x, y, size / 3 + extra, 0, 6.283); c.fill();
    } else if (cfg.shape === 'circle') {
      c.beginPath(); c.arc(x, y, size, 0, 6.283); c.stroke();
    } else if (cfg.shape === 'chevron') {
      c.beginPath(); c.moveTo(x - size, y + gap + size * .6); c.lineTo(x, y + gap); c.lineTo(x + size, y + gap + size * .6); c.stroke();
    }
    if (cfg.dot) { c.beginPath(); c.arc(x, y, cfg.dotSize + extra, 0, 6.283); c.fill(); }
  };
  if (cfg.outline) paint(1, '#000');
  paint(0, cfg.color);
  c.restore();
}

/* ===================== retícula: código FA2 e presets ===================== */
function encodeFA2(c) { return 'FA2-' + [c.shape, c.color.replace('#', ''), c.size, c.thick, c.gap, c.opacity, c.outline ? 1 : 0, c.dot ? 1 : 0, c.dotSize, c.pulse ? 1 : 0].join('.'); }
function decodeFA2(s) {
  s = String(s).trim();
  if (!/^FA2-/i.test(s)) return null;
  const p = s.slice(4).split('.');
  if (p.length !== 10) return null;
  const [shape, col, size, thick, gap, op, o, d, ds, pu] = p;
  if (!XH_SHAPES.includes(shape) || !/^[0-9a-fA-F]{6}$/.test(col)) return null;
  const n = (v, a, b) => { v = +v; return Number.isFinite(v) ? clamp(Math.round(v), a, b) : null; };
  const v = [n(size, 2, 40), n(thick, 1, 8), n(gap, 0, 20), n(op, 10, 100), n(ds, 1, 8)];
  if (v.includes(null)) return null;
  return {shape, color: '#' + col.toLowerCase(), size: v[0], thick: v[1], gap: v[2], opacity: v[3], outline: o === '1', dot: d === '1', dotSize: v[4], pulse: pu === '1'};
}
const XH_PRESETS = [
  {name:'Padrão (vazia)', code:'FA2-empty.00ffcc.10.2.4.100.1.1.2.1'},
  {name:'Clássica',       code:'FA2-cross.00ffcc.8.2.4.100.1.0.2.1'},
  {name:'Ponto',          code:'FA2-dot.39ff6a.9.2.0.100.1.0.2.1'},
  {name:'Círculo',        code:'FA2-circle.ff0055.10.2.0.100.1.1.2.1'},
  {name:'Chevron',        code:'FA2-chevron.f5b421.8.2.3.100.1.1.2.1'}
];

/* ===================== estado do jogo ===================== */
const stage = $('arena-stage'), wrap = $('arena-wrap'), cv = $('game-canvas'), ctx = cv.getContext('2d');
const hctx = document.createElement('canvas').getContext('2d');
let W = 800, H = 500, DPR = 1;
const cursor = {x: 400, y: 250};
const lastMouse = {x: -1, y: -1};
const G = {
  state: 'idle', token: 0, mode: 'fixed', dur: 30, targets: [], parts: [], lastPos: null,
  score: 0, hits: 0, misses: 0, combo: 0, maxCombo: 0, lives: 3, trackOn: 0,
  startT: 0, elapsed: 0, pulse: 0, hadLock: false, hoverOn: false, timeStr: '',
  btn: false, counting: false, reactSum: 0, reactN: 0, rainT: 0
};

/* Poki: se o PokiSDK estiver na página, avisa quando o jogo começa e para. Sem o SDK, nada acontece. */
let pokiOn = false;
function pokiStart() { if (pokiOn) return; pokiOn = true; try { window.PokiSDK && window.PokiSDK.gameplayStart(); } catch (e) {} }
function pokiStop() { if (!pokiOn) return; pokiOn = false; try { window.PokiSDK && window.PokiSDK.gameplayStop(); } catch (e) {} }
const leftHanded = () => !!(user && user.settings.leftHanded);
const shotButton = () => leftHanded() ? 2 : 0;   // 0 = esquerdo, 2 = direito

function resizeCanvas() {
  const r = wrap.getBoundingClientRect();
  if (r.width < 10 || r.height < 10) return;
  DPR = window.devicePixelRatio || 1;
  W = Math.round(r.width); H = Math.round(r.height);
  if (cv.width !== Math.round(W * DPR) || cv.height !== Math.round(H * DPR)) { cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR); }
  G.targets.forEach(t => { t.x = clamp(t.x, t.r, W - t.r); t.y = clamp(t.y, t.r, H - t.r); });
  cursor.x = clamp(cursor.x, 0, W); cursor.y = clamp(cursor.y, 0, H);
}
if (window.ResizeObserver) new ResizeObserver(resizeCanvas).observe(wrap);
window.addEventListener('resize', resizeCanvas);

function sensFactor() { const s = user.sens; return REF360 / (s.dpi * s.cm / 2.54); }

/* --- alvos --- */
const speedPx = () => (80 + modeCfg(G.mode).speed * 50) * (G.mode === 'tracking' ? .75 : 1);
const baseR = () => G.mode === 'micro' ? 17 : G.mode === 'grid' ? 26 : G.mode === 'tracking' ? 34 : G.mode === 'moving' ? 28 : G.mode === 'precision' ? 14 : G.mode === 'rain' ? 26 : 30;
const fallSpeed = () => 70 + modeCfg('rain').speed * 30 + Math.min(120, G.elapsed / 1000 * 2);
const isLive = t => !t.wait || t.age >= t.wait;   // Flickshot (id reflex): o alvo só aparece depois do atraso
function survivalParams() {
  const lv = Math.floor(G.hits / 5);
  return {lv, r0: Math.max(18, 42 * Math.pow(.94, lv)), life: Math.max(Math.min(650, modeCfg('survival').vanish), modeCfg('survival').vanish * Math.pow(.9, lv))};
}
function spawn(replace, opts) {
  const t = {x: 0, y: 0, r: baseR(), age: 0, life: Infinity, r0: 0, ang: rnd(0, 6.283), turn: rnd(.5, 1.4), wait: 0, vy: 0, decoy: !!(opts && opts.decoy)};
  if (G.mode === 'flick') t.life = modeCfg('flick').vanish;
  if (G.mode === 'micro') t.life = modeCfg('micro').vanish;   // Micro ajuste: cada alvo some depois de 2 s (ajustável)
  if (G.mode === 'survival') { const p = survivalParams(); t.r0 = p.r0; t.r = p.r0; t.life = p.life; }
  if (G.mode === 'rain') {   // Chuva: afastamento horizontal garante que alvos que caem em velocidades diferentes nunca se sobreponham
    t.y = -t.r; t.vy = fallSpeed();
    for (let i = 0; i < 50; i++) { t.x = rnd(t.r + 10, W - t.r - 10); if (G.targets.every(o => o === replace || Math.abs(o.x - t.x) >= o.r + t.r + MIN_GAP)) break; }
    return t;
  }
  const m = t.r * 1.4 + 10;
  if (G.mode === 'micro') {   // Micro ajuste: o alvo nasce a poucos pixels de outro, formando um grupo (sem encostar: MIN_GAP)
    const others = G.targets.filter(o => o !== replace);
    const fits = (x, y) => x >= m && x <= W - m && y >= m && y <= H - m && !(G.lastPos && Math.hypot(G.lastPos.x - x, G.lastPos.y - y) < t.r * 3.2) && others.every(o => Math.hypot(o.x - x, o.y - y) >= o.r + t.r + MIN_GAP);
    if (!others.length) { t.x = rnd(W * .3, W * .7); t.y = rnd(H * .3, H * .7); return t; }
    // escolhe, entre vários pontos válidos, o que deixa menos alvos longe dos vizinhos (o grupo não se espalha)
    const lim = (t.r + t.r) * 2.1;
    const nn = (o, list) => Math.min(...list.filter(q => q !== o).map(q => Math.hypot(q.x - o.x, q.y - o.y)));
    let best = null, bestScore = Infinity;
    for (let i = 0; i < 160; i++) {
      const a = others[Math.floor(Math.random() * others.length)], ang = rnd(0, 6.283), d = a.r + t.r + MIN_GAP + rnd(0, MIN_GAP * 1.2);
      const x = a.x + Math.cos(ang) * d, y = a.y + Math.sin(ang) * d;
      if (!fits(x, y)) continue;
      const all = others.concat([{x, y}]);
      const score = all.filter(o => nn(o, all) > lim).length * 1000 + all.reduce((m, o) => m + nn(o, all), 0) / all.length;
      if (score < bestScore) { bestScore = score; best = {x, y}; }
    }
    if (best) { t.x = best.x; t.y = best.y; return t; }
    for (let d = t.r * 2 + MIN_GAP; d < Math.max(W, H); d += 6)   // grupo apertado: procura o ponto livre mais próximo
      for (let k = 0; k < 24; k++) { const ang = k / 24 * 6.283, x = others[0].x + Math.cos(ang) * d, y = others[0].y + Math.sin(ang) * d; if (fits(x, y)) { t.x = x; t.y = y; return t; } }
    return t;
  }
  for (let i = 0; i < 90; i++) {   // as 40 primeiras tentativas pedem folga maior; depois basta o espaço mínimo
    t.x = rnd(m, W - m); t.y = rnd(m, H - m);
    const f = i < 40 ? 1.7 : 1;
    const clash = G.targets.some(o => o !== replace && Math.hypot(o.x - t.x, o.y - t.y) < Math.max((o.r + t.r) * f, o.r + t.r + MIN_GAP));
    const near = i < 40 && G.lastPos && Math.hypot(G.lastPos.x - t.x, G.lastPos.y - t.y) < 140;
    if (!clash && !near) break;
  }
  if (G.mode === 'reflex' && G.state === 'playing') { const w = modeCfg('reflex').wait; t.wait = rnd(w * .31, w); }
  return t;
}
/* Quantos alvos cada modo mostra e quais são falsos (Foco). Chuva começa com um alvo parado no alto. */
function fillTargets() {
  G.targets = [];
  const n = G.mode === 'grid' ? modeCfg('grid').count : G.mode === 'decoy' ? 3 : G.mode === 'micro' ? 5 : 1;
  for (let i = 0; i < n; i++) G.targets.push(spawn(null, {decoy: G.mode === 'decoy' && i > 0}));
  if (G.mode === 'rain' && G.state === 'countdown') G.targets[0].y = rnd(H * .15, H * .4);
}
function hitTest(t, x, y) {
  const d = Math.hypot(x - t.x, y - t.y), shape = modeCfg(G.mode).shape;
  if (shape === 'circle') return d <= t.r + 1;
  if (shape === 'square') return Math.abs(x - t.x) <= t.r * .9 + 1 && Math.abs(y - t.y) <= t.r * .9 + 1;   // mesmo tamanho do desenho em makePath()
  if (d <= t.r * .4) return true;
  if (d > t.r * 1.45) return false;
  return hctx.isPointInPath(makePath(shape, t.x, t.y, t.r), x, y);
}

/* --- efeitos --- */
function burst(x, y, color) {
  for (let i = 0; i < 12; i++) { const a = rnd(0, 6.283), s = rnd(80, 260); G.parts.push({x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0, max: rnd(.3, .6), c: color, s: rnd(2, 4)}); }
}
function floatText(x, y, txt, color) { G.parts.push({x, y, vx: 0, vy: -60, life: 0, max: .7, c: color, txt}); }

/* --- acertos e erros --- */
function currentCoins() {
  const m = user.premium ? 2 : 1;
  return (G.mode === 'tracking' ? Math.floor(G.trackOn / TRACK_COIN_MS) : G.hits) * COIN_TARGET * m;
}
function updateHud() {
  $('hud-score').textContent = fmtNum(Math.floor(G.score));
  $('hud-combo').textContent = 'x' + G.combo;
  $('hud-coins').textContent = fmtNum(currentCoins());
  $('hud-miss').textContent = fmtNum(G.misses);
  $('hud-btn-pill').classList.toggle('hidden', G.mode !== 'tracking');
  $('hud-btn-pill').classList.toggle('on', G.counting);
  $('hud-btn').textContent = leftHanded() ? 'Botão direito' : 'Botão esquerdo';
  if (G.mode === 'survival' || G.infinite) $('hud-lives').textContent = '♥'.repeat(Math.max(0, G.lives)) + '♡'.repeat(Math.max(0, G.maxLives - G.lives)) + (G.mode === 'survival' ? '  Nv ' + (survivalParams().lv + 1) : '');
}
/* Tempo infinito: sem Sobrevivência, cada erro tira 1 vida (INF_LIVES). Devolve true se a sessão acabou. */
function loseLife() {
  if (!G.infinite || G.mode === 'survival' || G.state !== 'playing') return false;
  G.lives--; updateHud();
  if (G.lives <= 0) { endSession(true); return true; }
  return false;
}
function shoot() {
  if (G.state !== 'playing' || G.mode === 'tracking') return;
  let hit = null, best = Infinity;
  for (const t of G.targets) { if (isLive(t) && hitTest(t, cursor.x, cursor.y)) { const d = Math.hypot(t.x - cursor.x, t.y - cursor.y); if (d < best) { best = d; hit = t; } } }
  if (hit && hit.decoy) {
    // Foco: acertar um alvo falso conta como erro
    G.misses++; G.combo = 0; G.score = Math.max(0, G.score - 10);
    floatText(hit.x, hit.y - hit.r, 'Falso! -10', '#ff0055'); playMiss();
    G.targets[G.targets.indexOf(hit)] = spawn(hit, {decoy: true});
    if (loseLife()) return;
  } else if (hit) {
    G.hits++; G.combo++; G.maxCombo = Math.max(G.maxCombo, G.combo);
    let pts = G.combo >= 5 ? 20 : 15;
    if (G.mode === 'reflex') { const rt = hit.age - hit.wait; G.reactSum += rt; G.reactN++; if (rt < 500) pts += 5; }
    G.score += pts; G.pulse = 1;
    const now = performance.now(), sk = SKIN_BY_ID[user.equip.skin];
    burst(hit.x, hit.y, skinColor(sk, now)); floatText(hit.x, hit.y - hit.r, '+' + pts, '#ffffff');
    if (G.combo > 0 && G.combo % 10 === 0) floatText(W / 2, H * .2, 'COMBO x' + G.combo + '!', '#f5b421');
    playHit();
    G.lastPos = {x: hit.x, y: hit.y};
    if (G.mode === 'rain') G.targets.splice(G.targets.indexOf(hit), 1);
    else if (G.mode === 'decoy') fillTargets();
    else G.targets[G.targets.indexOf(hit)] = spawn(hit);
  } else {
    G.misses++; G.combo = 0; G.score = Math.max(0, G.score - 10);
    floatText(cursor.x, cursor.y - 14, '-10', '#ff0055'); playMiss();
    if (loseLife()) return;
  }
  updateHud();
}

/* --- atualização por quadro --- */
function update(dt, now) {
  G.elapsed = now - G.startT;
  if (!G.infinite && G.elapsed >= G.dur * 1000) { endSession(false); return; }
  const mv = G.mode === 'moving' || G.mode === 'tracking';
  if (G.mode === 'rain') {
    // Chuva: novos alvos entram por cima; o que passa do chão vira erro
    G.rainT -= dt;
    if (G.rainT <= 0 && G.targets.length < 5) { G.targets.push(spawn()); G.rainT = rnd(.55, 1.1); }
    for (let i = G.targets.length - 1; i >= 0; i--) {
      const t = G.targets[i]; t.age += dt * 1000; t.y += t.vy * dt;
      if (t.y - t.r > H) { G.targets.splice(i, 1); G.misses++; G.combo = 0; floatText(t.x, H - 24, 'Perdeu', '#ff0055'); playMiss(); updateHud(); if (loseLife()) return; }
    }
  }
  for (let i = 0; i < G.targets.length && G.mode !== 'rain'; i++) {
    const t = G.targets[i]; t.age += dt * 1000;
    if (mv) {
      if (G.mode === 'tracking') { t.turn -= dt; if (t.turn <= 0) { t.ang += rnd(-1.5, 1.5); t.turn = rnd(.5, 1.4); } }
      const sp = speedPx(); t.x += Math.cos(t.ang) * sp * dt; t.y += Math.sin(t.ang) * sp * dt;
      if (t.x < t.r) { t.x = t.r; t.ang = Math.PI - t.ang; } else if (t.x > W - t.r) { t.x = W - t.r; t.ang = Math.PI - t.ang; }
      if (t.y < t.r) { t.y = t.r; t.ang = -t.ang; } else if (t.y > H - t.r) { t.y = H - t.r; t.ang = -t.ang; }
    }
    if ((G.mode === 'flick' || G.mode === 'micro') && t.age >= t.life) {
      G.misses++; G.combo = 0; G.lastPos = {x: t.x, y: t.y}; G.targets[i] = spawn(t); updateHud();
      if (loseLife()) return;
    } else if (G.mode === 'survival') {
      t.r = Math.max(10, t.r0 * (1 - t.age / t.life));
      if (t.age >= t.life) {
        G.lives--; G.misses++; G.combo = 0; burst(t.x, t.y, '#ff0055'); playMiss();
        if (G.lives <= 0) { updateHud(); endSession(true); return; }
        G.lastPos = {x: t.x, y: t.y}; G.targets[i] = spawn(t); updateHud();
      }
    }
  }
  if (G.mode === 'tracking' && G.targets[0]) {
    // Tracking: só pontua com a mira no alvo E o botão do tiro pressionado
    G.hoverOn = hitTest(G.targets[0], cursor.x, cursor.y);
    G.counting = G.hoverOn && G.btn;
    if (G.counting) { G.trackOn += dt * 1000; G.score += 3 * dt; G.hits = Math.floor(G.trackOn / TRACK_COIN_MS); G.offT = 0; }
    else if (G.infinite) {   // tempo infinito: 2 s seguidos fora do alvo (ou sem o botão) custam 1 vida
      G.offT = (G.offT || 0) + dt;
      if (G.offT >= 2) { G.offT = 0; G.misses++; playMiss(); if (loseLife()) return; }
    }
    updateHud();
  }
  G.pulse = Math.max(0, G.pulse - dt / .18);
  for (let i = G.parts.length - 1; i >= 0; i--) { const p = G.parts[i]; p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.life >= p.max) G.parts.splice(i, 1); }
  const ts = G.infinite ? fmtClock(G.elapsed) : Math.max(0, G.dur - G.elapsed / 1000).toFixed(1);   // infinito: relógio que sobe (00:00)
  if (ts !== G.timeStr) { G.timeStr = ts; $('hud-time').textContent = ts; $('hud-time-pill').classList.toggle('urgent', !G.infinite && +ts <= 5); }
}

function drawArena(now) {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.clearRect(0, 0, W, H);
  if (!user) return;
  const skin = SKIN_BY_ID[user.equip.skin], shape = modeCfg(G.mode).shape;
  const pre = G.state === 'countdown';
  const decoySkin = SKIN_BY_ID[user.equip.skin === 'comum-grafite' ? 'comum-vermelho' : 'comum-grafite'];
  for (const t of G.targets) {
    if (!isLive(t)) continue;   // Flickshot: ainda escondido
    const k = pre || G.mode === 'survival' ? 1 : Math.min(1, .5 + t.age / 140 * .5);   // alvo "nasce" em 140 ms
    ctx.globalAlpha = pre ? .65 : 1;
    drawTarget(ctx, shape, t.decoy ? decoySkin : skin, t.x, t.y, t.r * k, now);
    if (t.decoy) { ctx.save(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.lineCap = 'round'; const q = t.r * .5; ctx.beginPath(); ctx.moveTo(t.x - q, t.y - q); ctx.lineTo(t.x + q, t.y + q); ctx.moveTo(t.x + q, t.y - q); ctx.lineTo(t.x - q, t.y + q); ctx.stroke(); ctx.restore(); }
    if (pre) { ctx.save(); ctx.strokeStyle = 'rgba(0,255,204,.8)'; ctx.lineWidth = 2; ctx.setLineDash([7, 6]); ctx.beginPath(); ctx.arc(t.x, t.y, t.r * 1.5, 0, 6.283); ctx.stroke(); ctx.restore(); }
    ctx.globalAlpha = 1;
    if (G.mode === 'tracking' && G.hoverOn) {
      // verde = contando pontos; dourado tracejado = na mira, mas sem o botão pressionado
      ctx.save(); ctx.lineWidth = 3;
      if (G.counting) ctx.strokeStyle = 'rgba(57,255,106,.9)'; else { ctx.strokeStyle = 'rgba(245,180,33,.9)'; ctx.setLineDash([6, 5]); }
      ctx.beginPath(); ctx.arc(t.x, t.y, t.r * 1.35, 0, 6.283); ctx.stroke(); ctx.restore();
    }
  }
  for (const p of G.parts) {
    ctx.globalAlpha = 1 - p.life / p.max;
    if (p.txt) { ctx.font = '800 20px "Baloo 2", sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = p.c; ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 4; ctx.fillText(tr(p.txt), p.x, p.y); ctx.shadowBlur = 0; }
    else { ctx.fillStyle = p.c; ctx.fillRect(p.x, p.y, p.s, p.s); }
  }
  ctx.globalAlpha = 1;
  if (G.state === 'playing' || G.state === 'countdown') drawCrosshair(ctx, cursor.x, cursor.y, user.xh, G.pulse);
}

/* --- entrada do mouse --- */
window.addEventListener('mousemove', e => { lastMouse.x = e.clientX; lastMouse.y = e.clientY; });
wrap.addEventListener('mousemove', e => {
  if (G.state !== 'playing' && G.state !== 'countdown') return;
  if (document.pointerLockElement === wrap) {
    const f = sensFactor();
    cursor.x = clamp(cursor.x + e.movementX * f, 0, W); cursor.y = clamp(cursor.y + e.movementY * f, 0, H);
  } else {
    const r = wrap.getBoundingClientRect();
    cursor.x = clamp(e.clientX - r.left, 0, W); cursor.y = clamp(e.clientY - r.top, 0, H);
  }
});
// Botão do tiro: esquerdo (padrão) ou direito (modo canhoto). O outro botão não faz nada.
wrap.addEventListener('mousedown', e => { if (e.button === shotButton() && G.state === 'playing') { e.preventDefault(); G.btn = true; shoot(); } });
window.addEventListener('mouseup', e => { if (e.button === shotButton()) G.btn = false; });
window.addEventListener('blur', () => { G.btn = false; });
wrap.addEventListener('contextmenu', e => { if (G.state === 'playing' || G.state === 'countdown') e.preventDefault(); });

/* --- sessão: iniciar, cancelar, terminar --- */
function setUILocked(l) { $('view-play').classList.toggle('locked', l); }
/* Semicheia: a arena ocupa quase a janela, com borda e o resto escurecido (sem tela cheia do navegador) */
function enterFocus() { wrap.classList.add('focus'); stage.classList.add('focus'); document.body.classList.add('focus-open'); }
function closeFocus() {
  wrap.classList.remove('focus'); stage.classList.remove('focus'); document.body.classList.remove('focus-open');
  $('btn-close-focus').classList.add('hidden');
  requestAnimationFrame(resizeCanvas);
}
function teardown() {
  setUILocked(false); wrap.classList.remove('live'); stage.classList.remove('live', 'cd'); $('countdown').classList.add('hidden');
  G.btn = false; G.counting = false; pokiStop();
  if (document.pointerLockElement) document.exitPointerLock();
  G.hadLock = false; G.targets = []; G.parts = [];
}
const defaultHint = () => 'Clique para começar. Tiro: botão ' + (leftHanded() ? 'direito (modo canhoto)' : 'esquerdo') + '. Esc cancela a sessão.';
function showOverlay(msg, label, hint) {
  $('overlay-msg').textContent = msg || '';
  $('btn-start').textContent = label;
  $('overlay-hint').textContent = hint || defaultHint();
  $('result-panel').classList.toggle('hidden', G.state !== 'ended');
  $('btn-close-focus').classList.toggle('hidden', !wrap.classList.contains('focus'));
}
$('btn-close-focus').addEventListener('click', closeFocus);

function cancelSession(msg) {
  if (G.state !== 'countdown' && G.state !== 'playing') return;
  G.state = 'idle'; G.token++;
  teardown(); closeFocus();
  showOverlay(msg || 'Sessão cancelada. Nada foi contabilizado.', 'Começar sessão');
}
async function runCountdown(token) {
  const el = $('countdown'), num = $('cd-num'), lab = $('cd-label');
  el.classList.remove('hidden'); stage.classList.add('cd');   // a contagem aparece na barra de cima, fora da arena
  for (const n of ['3', '2', '1', 'GO']) {
    if (G.token !== token) return false;
    num.textContent = n; lab.classList.toggle('hidden', n === 'GO');
    num.classList.remove('pop'); void num.offsetWidth; num.classList.add('pop');
    await sleep(n === 'GO' ? 450 : 900);
  }
  el.classList.add('hidden'); stage.classList.remove('cd');
  return G.token === token;
}
async function startSession() {
  if (G.state === 'countdown' || G.state === 'playing') return;
  audio();
  G.mode = user.last.mode; G.comp = !!user.last.comp;
  G.infinite = !G.comp && user.last.dur === 0;
  G.dur = G.comp ? COMP_DUR : G.infinite ? Infinity : user.last.dur;
  G.custom = isCustom(G.mode) || G.infinite;   // infinito e opções diferentes do padrão: sem ranking, recorde nem skin secreta
  G.maxLives = G.mode === 'survival' || !G.infinite ? 3 : INF_LIVES; G.offT = 0;
  G.state = 'countdown'; const token = ++G.token;
  G.parts = []; G.hoverOn = false; G.hadLock = false;
  G.score = 0; G.hits = 0; G.misses = 0; G.combo = 0; G.maxCombo = 0; G.lives = G.maxLives; G.trackOn = 0; G.lastPos = null; G.pulse = 0;
  G.btn = false; G.counting = false; G.reactSum = 0; G.reactN = 0; G.rainT = .5;
  setUILocked(true); enterFocus(); wrap.classList.add('live'); stage.classList.add('live');
  $('hud-lives-pill').classList.toggle('hidden', !(G.mode === 'survival' || G.infinite));
  $('hud-time').textContent = G.infinite ? '00:00' : G.dur.toFixed(1); G.timeStr = '';
  if (user.sens.lock && wrap.requestPointerLock) {
    try { const p = wrap.requestPointerLock({unadjustedMovement: true}); if (p && p.catch) p.catch(() => { try { wrap.requestPointerLock(); } catch (e) {} }); } catch (e) {}
  }
  resizeCanvas();   // já no tamanho semicheio
  const r = wrap.getBoundingClientRect();
  if (!document.pointerLockElement && lastMouse.x >= r.left && lastMouse.x <= r.right && lastMouse.y >= r.top && lastMouse.y <= r.bottom) {
    cursor.x = lastMouse.x - r.left; cursor.y = lastMouse.y - r.top;
  } else { cursor.x = W / 2; cursor.y = H / 2; }
  // o(s) alvo(s) já aparecem durante a contagem, para ninguém começar no susto (ainda não dá para acertar)
  fillTargets();
  updateHud();
  if (!(await runCountdown(token))) return;
  G.targets.forEach((t, i) => { t.age = 0; if (G.mode === 'micro') t.life = modeCfg('micro').vanish + i * 300; if (G.mode === 'reflex') { const w = modeCfg('reflex').wait; t.wait = rnd(w * .38, w * .92); } });
  G.startT = performance.now(); G.elapsed = 0; G.state = 'playing'; pokiStart();
}
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === wrap) G.hadLock = true;
  else if (G.hadLock && (G.state === 'countdown' || G.state === 'playing')) cancelSession('Sessão cancelada: o ponteiro foi liberado.');
});
document.addEventListener('visibilitychange', () => { if (document.hidden) cancelSession('Sessão invalidada: você saiu da aba.'); });
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (G.state === 'countdown' || G.state === 'playing') cancelSession('Sessão cancelada. Nada foi contabilizado.');
  else if (wrap.classList.contains('focus')) closeFocus();
});
document.addEventListener('keydown', e => {   // R reinicia o mapa em qualquer modo (nada é contabilizado)
  if ((e.key !== 'r' && e.key !== 'R') || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
  if (G.state !== 'countdown' && G.state !== 'playing') return;
  e.preventDefault(); G.state = 'idle'; G.token++; $('countdown').classList.add('hidden'); stage.classList.remove('cd');
  startSession();
});
document.addEventListener('keydown', e => {   // T abre o Setup direto (durante a partida, cancela a sessão sem contabilizar)
  if ((e.key !== 't' && e.key !== 'T') || e.ctrlKey || e.metaKey || e.altKey || e.repeat || !user) return;
  const tg = e.target && e.target.tagName; if (tg === 'INPUT' || tg === 'TEXTAREA' || tg === 'SELECT') return;
  if (cfgOpen || !$('view-play').classList.contains('active')) return;
  e.preventDefault();
  if (G.state === 'countdown' || G.state === 'playing') cancelSession('Sessão cancelada. Nada foi contabilizado.');
  openCfg();
});
$('btn-start').addEventListener('click', startSession);

function rankKey(m, d) { return m + '|' + d; }
function submitRank(mode, dur, score, acc) {
  const k = rankKey(mode, dur), list = db.ranking[k] || (db.ranking[k] = []), low = user.name.toLowerCase();
  const ex = list.find(e => e.user.toLowerCase() === low);
  if (ex) { if (score > ex.score) { ex.score = score; ex.acc = acc; ex.ts = Date.now(); } }
  else list.push({user: user.name, score, acc, ts: Date.now()});
  db.rankLog.unshift({user: user.name, mode, score, acc, ts: Date.now()});   // toda partida competitiva fica registrada
  if (db.rankLog.length > 200) db.rankLog.length = 200;
  list.sort((a, b) => b.score - a.score);
  db.ranking[k] = list.slice(0, 10);
  return db.ranking[k].findIndex(e => e.user.toLowerCase() === low) + 1;
}
function addCoins(n, why) {
  if (!n) return;
  if (user.admin) { if (n > 0) user.coinsEarned += n; user.coins = ADMIN_COINS; save(); renderCoins(); return; }   // admin: moedas infinitas
  user.coins += n; if (n > 0) user.coinsEarned += n;
  user.coinLog.unshift({ts: Date.now(), amt: n, why, bal: user.coins});
  if (user.coinLog.length > 100) user.coinLog.length = 100;
  save(); renderCoins();
}
function checkAch(sess) {
  const got = [];
  for (const a of ACH) {
    if (user.unlocked.includes(a.id)) continue;
    let ok = false; try { ok = !!a.test(user, sess); } catch (e) {}
    if (ok) { user.unlocked.push(a.id); got.push(a); toast(`Conquista: ${a.name} (título "${a.title}")`, 'gold'); }
  }
  return got;
}
function endSession(early) {
  if (G.state !== 'playing') return;
  G.state = 'ended'; G.token++;
  const mode = G.mode, dur = G.infinite ? 0 : G.dur, tracking = mode === 'tracking', comp = !!G.comp;
  const score = Math.floor(G.score), shots = G.hits + G.misses;
  const elapsed = G.infinite ? G.elapsed : Math.min(G.elapsed, dur * 1000);
  const acc = tracking ? Math.round(Math.min(100, G.trackOn / Math.max(1, elapsed) * 100) * 10) / 10
                       : (shots ? Math.round(G.hits / shots * 1000) / 10 : 0);
  const coins = currentCoins();
  const xp = Math.floor(score / 2) * (user.premium ? 2 : 1);
  const k = rankKey(mode, dur), prevBest = user.best[k] || 0;
  const custom = !!G.custom;   // modo personalizado: sem ranking, recorde nem skin secreta
  const newRecord = !custom && score > 0 && score > prevBest;
  if (newRecord) user.best[k] = score;
  const st = user.stats;
  st.sessions++; st.targets += G.hits; st.timeMs += Math.round(elapsed);
  st.bestScore = Math.max(st.bestScore, score); st.bestCombo = Math.max(st.bestCombo, G.maxCombo);
  if (shots >= 10 || tracking) st.bestAcc = Math.max(st.bestAcc, acc);
  st.modes[mode] = (st.modes[mode] || 0) + 1;
  user.history.unshift({ts: Date.now(), mode, dur, score, acc, hits: G.hits, combo: G.maxCombo, coins, xp, comp: comp && !custom});
  if (user.history.length > 20) user.history.length = 20;
  const pos = comp && !custom ? submitRank(mode, COMP_DUR, score, acc) : 0;   // só o Modo Competitivo entra no ranking
  if (coins > 0) addCoins(coins, `Sessão: ${MODE_BY_ID[mode].name} ${fmtDur(dur)}`);
  const lv0 = levelInfo(user.xp).L; user.xp += xp; const lv1 = levelInfo(user.xp).L;
  const badges = [];
  if (lv1 > lv0) { badges.push(['Nível ' + lv1 + '!', 'green']); toast('Você subiu para o nível ' + lv1 + '!', 'gold'); }
  if (newRecord) badges.push(['Novo recorde pessoal!', '']);
  if (comp) badges.push(['Modo Competitivo', 'green']);
  if (comp && !custom) badges.push([pos ? `Ranking competitivo #${pos}` : 'Partida registrada (fora do top 10)', '']);
  if (G.infinite) badges.push(['Você durou ' + fmtClock(elapsed), 'green']);
  let secret = false;
  const avgReact = G.reactN ? Math.round(G.reactSum / G.reactN) : 0;
  if (!custom && !tracking && dur === 60 && acc === 100 && G.hits >= 40 && !user.owned.skins.includes(SECRET_SKIN)) {
    user.owned.skins.push(SECRET_SKIN); secret = true; badges.push(['Skin secreta desbloqueada: Eclipse Solar!', 'pink']);
  }
  if (!custom && mode === 'reflex' && dur === 60 && acc === 100 && G.hits >= 25 && avgReact > 0 && avgReact < 350 && !user.owned.skins.includes(SECRET_SKIN2)) {
    user.owned.skins.push(SECRET_SKIN2); secret = true; badges.push(['Skin secreta desbloqueada: Glitch Ômega!', 'pink']);
  }
  if (mode === 'reflex' && avgReact) badges.push(['Reação média: ' + avgReact + ' ms', '']);
  if (custom) badges.push([G.infinite ? 'Tempo infinito: sem recorde nem ranking' : 'Modo personalizado: sem recorde nem skin secreta', '']);
  const got = checkAch(custom ? null : {mode, dur, score, acc, shots, hits: G.hits, maxCombo: G.maxCombo, livesLeft: G.lives, early, avgReact, left: leftHanded()});
  got.forEach(a => badges.push(['Conquista: ' + a.name, 'green']));
  save();
  // resultado
  $('res-title').textContent = early ? 'Fim de jogo' : 'Sessão concluída';
  $('res-score').textContent = fmtNum(score); $('res-acc').textContent = acc.toFixed(1).replace('.', ',') + '%';
  $('res-hits').textContent = tracking ? Math.round(G.trackOn / 100) / 10 + 's no alvo' : G.hits;
  $('res-combo').textContent = tracking ? '—' : G.maxCombo;
  $('res-coins').textContent = fmtNum(coins); $('res-xp').textContent = '+' + fmtNum(xp);
  $('res-badges').innerHTML = badges.map(([t, c]) => `<span class="badge ${c}">${esc(t)}</span>`).join('');
  teardown(); updateHud(); renderTop();
  showOverlay('', 'Jogar novamente', 'Jogue de novo ou volte ao menu para trocar modo e configuração.');
  renderMiniRank();
  if (secret) toast('Você desbloqueou uma skin secreta!', 'gold');
}

/* ===================== interface: modos, duração, ranking ===================== */
const modeHelp = m => m.id === 'tracking' ? `Mantenha a mira sobre um alvo em movimento COM o botão ${leftHanded() ? 'direito' : 'esquerdo'} pressionado. Ganha 3 pontos por segundo e nunca perde pontos.` : m.help;
const modeDesc = m => m.id === 'tracking' ? `Segure o botão ${leftHanded() ? 'direito' : 'esquerdo'} sobre o alvo. +3 pts/s, sem perdas.`
  : m.id === 'grid' ? `${modeCfg('grid').count} alvo${modeCfg('grid').count > 1 ? 's' : ''} ao mesmo tempo.`
  : m.id === 'flick' ? `O alvo some em ${modeCfg('flick').vanish} ms.` : m.desc;
function renderModeList() {
  $('mode-list').innerHTML = MODES.map(m => `<div class="mode-item"><button class="mode-btn ${m.id === user.last.mode ? 'active' : ''}" data-mode="${m.id}" type="button"><b>${m.name}</b><span>${modeDesc(m)}</span></button><button class="help-btn" data-help="${m.id}" type="button" aria-label="O que é ${m.name}?" aria-expanded="false" title="O que é este modo?">?</button><div class="help-pop hidden" role="tooltip">${modeHelp(m)}</div></div>`).join('');
  renderSetupSum();
}
let cfgCustomOpen = false;   // painel "Usar tempo personalizado" aberto
let cfgUnit = 's';   // unidade do campo de tempo personalizado: 's' ou 'min'
const cfgNote = id => user.last.comp ? 'Modo Competitivo: regras padrão e tempo fixo de 60 s. Nada pode ser alterado e a sua pontuação entra no leaderboard.'
  : isCustom(id) || user.last.dur === 0 ? 'Partida personalizada: sem recorde pessoal, skin secreta ou conquistas de sessão. Treino não entra no ranking.'
  : 'Treino: não entra no ranking. Use o Modo Competitivo para disputar o leaderboard.';
function renderSetupSum() {
  const el = $('setup-sum'); if (!el || !user) return;
  const m = MODE_BY_ID[user.last.mode], id = m.id;
  el.textContent = user.last.comp ? `${m.name} · Competitivo · ${fmtDur(COMP_DUR)}`
    : `${m.name} · ${user.last.dur === 0 ? 'Tempo infinito' : fmtDur(user.last.dur)}${isCustom(id) ? ' · personalizado' : ''}`;
}
function renderModeCfg() {
  const id = user.last.mode, o = MODE_OPTS[id] || {}, box = $('mode-cfg'), comp = !!user.last.comp, dis = comp ? ' disabled' : '';
  const c = modeCfg(id), rows = [], d = comp ? COMP_DUR : user.last.dur;
  if (o.speed) rows.push(['speed', 'Velocidade dos alvos', 1, 10, 1, '', c.speed]);
  for (const k of ['count', 'vanish', 'wait']) if (o[k]) rows.push([k, o[k].label, o[k].min, o[k].max, o[k].step, o[k].unit, c[k]]);
  const keep = $('cfg-dur-val') ? $('cfg-dur-val').value : null;
  const custom = d > 0 && !DURS.includes(d), shown = custom ? (cfgUnit === 'min' ? Math.round(d / 6) / 10 : d) : '';
  const seg = (attr, items, cur) => `<div class="seg">${items.map(([v, n]) => `<button class="seg-btn ${cur === v ? 'active' : ''}" ${attr}="${v}" type="button"${dis}>${n}</button>`).join('')}</div>`;
  box.innerHTML = `<div class="cfg-head"><b id="cfg-title" class="cfg-title">Setup · ${esc(MODE_BY_ID[id].name)}</b><button class="btn ghost" id="btn-cfg-reset" type="button"${dis}>Restaurar padrão</button></div>`
    + `<div class="cfg-sec"><span class="cfg-lab">Tipo de partida</span><div class="seg">${[['0', 'Treino'], ['1', '🏆 Competitivo']].map(([v, n]) => `<button class="seg-btn ${(comp ? '1' : '0') === v ? 'active' : ''}" data-comp="${v}" type="button">${n}</button>`).join('')}</div></div>`
    + `<div class="cfg-sec"><span class="cfg-lab">Tempo de jogo</span><div class="cfg-dur">${DURS.map(x => `<button class="chip-btn ${d === x ? 'active' : ''}" data-dur="${x}" type="button"${dis}>${fmtDur(x)}</button>`).join('')}<button class="chip-btn ${d === 0 ? 'active' : ''}" data-dur="0" type="button"${dis}>∞ Infinito</button><button class="chip-btn cfg-custom-btn ${custom || cfgCustomOpen ? 'active' : ''}" data-custom-toggle="1" type="button" aria-expanded="${cfgCustomOpen}"${dis}>✎ ${custom ? 'Tempo personalizado: ' + fmtDur(d) : 'Usar tempo personalizado'}</button></div>`
    + (cfgCustomOpen && !comp ? `<div class="cfg-custom-card"><label class="cc-lab" for="cfg-dur-val">Quanto tempo você quer jogar?</label><div class="cc-row"><input id="cfg-dur-val" type="number" min="1" step="any" inputmode="decimal" placeholder="Ex.: ${cfgUnit === 'min' ? '3' : '45'}" value="${shown}" autocomplete="off">${seg('data-unit', [['s', 'segundos'], ['min', 'minutos']], cfgUnit)}</div><div class="cc-hint" id="cfg-dur-hint">De ${DUR_MIN} segundos a 60 minutos.</div><div class="cc-actions"><button class="btn primary" data-dur-apply="1" type="button">Usar este tempo</button><button class="btn ghost" data-custom-close="1" type="button">Cancelar</button></div></div>` : '')
    + `<p class="muted small">${d === 0 ? `Infinito: o cronômetro começa em 00:00 e sobe. Você tem ${INF_LIVES} vidas e cada erro tira 1; o jogo só termina quando elas acabam.` : `Escolha um tempo rápido ou digite o seu (de ${DUR_MIN} segundos a 60 minutos).`}</p></div>`
    + `<div class="cfg-row"><span>Formato do alvo</span>${seg('data-shape', [['circle', 'Círculo'], ['square', 'Quadrado']], c.shape)}</div>`
    + `<div class="cfg-row"><span>Formato da arena</span>${seg('data-ashape', [['rect', 'Retangular'], ['square', 'Quadrada']], c.ashape)}</div>`
    + `<label class="cfg-row"><span>Tamanho da arena</span><input type="range" data-cfg="arena" min="50" max="100" step="10" value="${c.arena}"${dis}><output>${c.arena}%</output></label>`
    + rows.map(([k, lab, mn, mx, st, un, v]) => `<label class="cfg-row"><span>${lab}</span><input type="range" data-cfg="${k}" min="${mn}" max="${mx}" step="${st}" value="${v}"${dis}><output>${v}${un}</output></label>`).join('')
    + `<p class="muted small cfg-note">${cfgNote(id)}</p>`;
  if (keep !== null && $('cfg-dur-val') && !custom) $('cfg-dur-val').value = keep;
}
const applyArena = () => { if (user) { const mc = modeCfg(user.last.mode); wrap.style.setProperty('--a', mc.arena / 100); wrap.classList.toggle('sq', mc.ashape === 'square'); } requestAnimationFrame(resizeCanvas); };
let cfgOpen = false;
function openCfg() { if (G.state === 'countdown' || G.state === 'playing') return; renderModeCfg(); cfgOpen = true; $('cfg-modal').classList.remove('hidden'); $('btn-cfg-close').focus(); }
function closeCfg() { cfgOpen = false; cfgCustomOpen = false; $('cfg-modal').classList.add('hidden'); }
$('btn-config').addEventListener('click', openCfg);
$('btn-cfg-close').addEventListener('click', closeCfg);
$('cfg-modal').addEventListener('click', e => { if (e.target === $('cfg-modal')) closeCfg(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && cfgOpen) { e.stopImmediatePropagation(); closeCfg(); } }, true);
function renderModes() {
  renderModeList(); renderModeCfg(); applyArena();
  renderMiniRank();
}
/* Duplo clique em um modo abre a tela de Setup (tempo, competitivo e opções) antes de jogar */
$('mode-list').addEventListener('dblclick', e => {
  const m = e.target.closest && e.target.closest('[data-mode]'); if (!m || G.state === 'countdown' || G.state === 'playing') return;
  user.last.mode = m.dataset.mode; save(); renderModes(); openCfg();
});
function setDuration(sec) {
  if (user.last.comp || G.state === 'countdown' || G.state === 'playing') return false;
  sec = Math.round(+sec);
  if (!(sec === 0 || (sec >= DUR_MIN && sec <= DUR_MAX))) { toast(`Use de ${DUR_MIN} segundos a 60 minutos.`, 'warn'); return false; }
  user.last.dur = sec; save(); renderModes(); return true;
}
$('mode-cfg').addEventListener('input', e => {
  const k = e.target.dataset && e.target.dataset.cfg; if (!k || user.last.comp || G.state === 'countdown' || G.state === 'playing') return;
  const id = user.last.mode, o = MODE_OPTS[id] || {};
  (user.modeCfg[id] = user.modeCfg[id] || {})[k] = +e.target.value;
  const un = k === 'speed' ? '' : k === 'arena' ? '%' : (o[k] ? o[k].unit : ''); e.target.parentElement.querySelector('output').textContent = e.target.value + un;
  const note = $('mode-cfg').querySelector('.cfg-note'); if (note) note.textContent = cfgNote(id);
  save(); renderModeList(); applyArena();
});
$('mode-cfg').addEventListener('click', e => {
  if (!e.target.closest || G.state === 'countdown' || G.state === 'playing') return;
  const cb = e.target.closest('[data-comp]');
  if (cb) { user.last.comp = cb.dataset.comp === '1'; save(); renderModes(); return; }
  if (user.last.comp) return;   // Modo Competitivo: tudo bloqueado
  const db_ = e.target.closest('[data-dur]');
  if (db_) { setDuration(+db_.dataset.dur); return; }
  const ub = e.target.closest('[data-unit]');
  if (ub) { cfgUnit = ub.dataset.unit === 'min' ? 'min' : 's'; renderModeCfg(); if ($('cfg-dur-val')) $('cfg-dur-val').focus(); return; }
  if (e.target.closest('[data-custom-toggle]')) { cfgCustomOpen = !cfgCustomOpen; renderModeCfg(); if (cfgCustomOpen && $('cfg-dur-val')) $('cfg-dur-val').focus(); return; }
  if (e.target.closest('[data-custom-close]')) { cfgCustomOpen = false; renderModeCfg(); return; }
  if (e.target.closest('[data-dur-apply]')) { const v = parseFloat($('cfg-dur-val').value); if (!(v > 0)) return toast('Digite o tempo.', 'warn'); setDuration(cfgUnit === 'min' ? v * 60 : v) && (cfgCustomOpen = false, renderModeCfg()); return; }
  const ab = e.target.closest('[data-ashape]');
  if (ab) { (user.modeCfg[user.last.mode] = user.modeCfg[user.last.mode] || {}).ashape = ab.dataset.ashape === 'square' ? 'square' : 'rect'; save(); renderModeCfg(); renderSetupSum(); applyArena(); return; }
  const sb = e.target.closest('[data-shape]');
  if (sb) { (user.modeCfg[user.last.mode] = user.modeCfg[user.last.mode] || {}).shape = sb.dataset.shape === 'square' ? 'square' : 'circle'; save(); renderModeCfg(); renderSetupSum(); return; }
  if (!e.target.closest('#btn-cfg-reset')) return;
  delete user.modeCfg[user.last.mode]; save(); renderModes(); toast('Opções do modo restauradas.');
});
$('mode-cfg').addEventListener('change', e => { if (e.target.id === 'cfg-dur-val' && e.target.value !== '') { const v = parseFloat(e.target.value); if (v > 0 && setDuration(cfgUnit === 'min' ? v * 60 : v)) { cfgCustomOpen = false; renderModeCfg(); } } });
$('mode-cfg').addEventListener('input', e => {   // mostra na hora quanto vai durar o tempo digitado
  if (e.target.id !== 'cfg-dur-val') return;
  const v = parseFloat(e.target.value), sec = Math.round(cfgUnit === 'min' ? v * 60 : v), h = $('cfg-dur-hint'); if (!h) return;
  h.classList.remove('bad');
  if (!(v > 0)) h.textContent = `De ${DUR_MIN} segundos a 60 minutos.`;
  else if (sec < DUR_MIN || sec > DUR_MAX) { h.textContent = `Use de ${DUR_MIN} segundos a 60 minutos.`; h.classList.add('bad'); }
  else h.textContent = `Vai jogar por ${fmtDur(sec)}.`;
});
function renderMiniRank() {
  const list = (db.ranking[rankKey(user.last.mode, COMP_DUR)] || []).slice(0, 5);
  $('mini-rank-label').textContent = `${MODE_BY_ID[user.last.mode].name} · ${fmtDur(COMP_DUR)}`;
  $('mini-rank').innerHTML = list.length ? list.map(e => `<li>${esc(e.user)}<span class="sc">${fmtNum(e.score)}</span></li>`).join('') : '<li class="muted">Sem registros ainda</li>';
}
function closeHelp() { document.querySelectorAll('.help-pop').forEach(p => p.classList.add('hidden')); document.querySelectorAll('.help-btn').forEach(b => b.setAttribute('aria-expanded', 'false')); }
document.addEventListener('click', e => {
  const h = e.target.closest('[data-help]');
  const was = h && !h.parentElement.querySelector('.help-pop').classList.contains('hidden');
  closeHelp();
  if (h && !was) { h.parentElement.querySelector('.help-pop').classList.remove('hidden'); h.setAttribute('aria-expanded', 'true'); }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeHelp(); });
let lastModeClick = {id: '', t: 0};
$('view-play').addEventListener('click', e => {
  if (G.state === 'countdown' || G.state === 'playing') return;
  const m = e.target.closest('[data-mode]');
  if (m) user.last.mode = m.dataset.mode; else return;
  // duplo clique: o menu é redesenhado a cada clique, então o evento dblclick nem sempre chega; medimos o intervalo entre dois cliques no mesmo modo
  const nowT = performance.now(), dbl = lastModeClick.id === m.dataset.mode && nowT - lastModeClick.t < 450;
  lastModeClick = dbl ? {id: '', t: 0} : {id: m.dataset.mode, t: nowT};
  save(); renderModes();
  if (dbl) openCfg();
  if (G.state === 'ended') { G.state = 'idle'; $('result-panel').classList.add('hidden'); $('btn-start').textContent = 'Iniciar'; }
});

/* ===================== moedas e topo ===================== */
function renderCoins() { $('top-coins').textContent = user.admin ? '∞' : fmtNum(user.coins); if (!spinning && $('view-shop').classList.contains('active')) renderShop(); }
function renderTop() {
  $('top-icon').textContent = ICON_BY_ID[user.icon] || '🎯';
  $('top-name').textContent = (user.premium ? '★ ' : '') + user.name;
  const L = levelInfo(user.xp);
  $('top-level').textContent = 'Nv ' + L.L; $('top-xp-fill').style.width = L.pct.toFixed(1) + '%';
  $('lvl-chip').title = fmtNum(L.cur) + ' / ' + fmtNum(L.need) + ' XP para o próximo nível';
}

/* ===================== loja ===================== */
let skinFilter = 'all';
const SKIN_FILTERS = [['all','Todas'], ['owned','Minhas'], ['common','Comuns'], ['rare','Raras'], ['epic','Épicas'], ['legendary','Lendárias'], ['secret','Secretas']];
function thumb(skinId, shape, locked) {
  const sk = SKIN_BY_ID[skinId];
  return `<canvas width="160" height="160" data-skin="${skinId}" data-shape="${shape}" ${sk.animated && !locked ? 'data-anim="1"' : ''}></canvas>`;
}
function paintThumb(cn, t) {
  const c = cn.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cn.width, cn.height);
  drawTarget(c, cn.dataset.shape, SKIN_BY_ID[cn.dataset.skin], cn.width / 2, cn.height / 2, cn.width * .34, t);
}
function renderShop() {
  const done = user.lastDaily === todayStr();
  if (spinning) return;   // não revela a skin antes de a roleta parar
  const spRow = (ico, name, desc, owned, price, act, id) => `<div class="special ${owned ? 'owned' : ''}"><div class="sp-ico">${ico}</div><div class="sp-info"><b>${name}</b><span>${desc}</span></div><div class="sp-buy">${user.admin ? `<span class="badge ${owned ? 'green' : ''}">${owned ? 'Ativo' : 'Desativado'}</span><button class="btn ${owned ? '' : 'primary'}" data-act="adm-toggle" data-id="${id || 'premium'}">${owned ? 'Desativar' : 'Ativar'}</button>` : owned ? '<span class="badge green">Ativo</span>' : `<span class="baloo-coins big">${fmtNum(price)}</span><button class="btn primary" data-act="${act}"${id ? ` data-id="${id}"` : ''} ${user.coins < price ? 'disabled' : ''}>Comprar</button>`}</div></div>`;
  $('special-items').innerHTML = spRow('★', 'Passe Premium', 'Dobra as moedas e o XP que você ganha em toda sessão. Compra única.', user.premium, PREMIUM_PRICE, 'buy-premium', '')
    + PASSES.map(p => spRow(p.ico, p.name, p.desc, user.passes[p.id], p.price, 'buy-pass', p.id)).join('');
  $('btn-daily').disabled = done; $('btn-daily').textContent = `Bônus diário +${DAILY}`;
  $('daily-msg').textContent = done ? 'Já coletado hoje. Volte amanhã.' : '';
  $('box-cost').textContent = fmtNum(BOX_COST);
  updateBoxButtons(); renderAdminBox();
  $('box-odds').innerHTML = ['common', 'rare', 'epic', 'legendary'].map(r => `<div class="odd" style="border-left-color:${RARITY[r].color}"><b style="color:${RARITY[r].color}">${RARITY[r].name} · ${oddOf(r)}%</b>Repetida: +${RARITY[r].cash} moedas</div>`).join('');
  $('box-history').innerHTML = user.boxLog.slice(0, 15).map(b => { const s = SKIN_BY_ID[b.id]; return s ? `<li>${fmtDate(b.ts)} — <span style="color:${RARITY[s.rarity].color}">${esc(s.name)}</span>${b.dupe ? ` (repetida, +${b.cash})` : ' (nova)'}</li>` : ''; }).join('') || '<li>Nenhuma caixa aberta.</li>';

  const eqSkin = user.equip.skin, have = new Set(user.owned.skins);
  $('skin-count').textContent = `${have.size}/${SKINS.length}`;
  $('skin-filter').innerHTML = SKIN_FILTERS.map(([id, n]) => `<button class="chip-btn ${skinFilter === id ? 'active' : ''}" data-act="filter" data-id="${id}" type="button">${n}</button>`).join('');
  const list = SKINS.filter(s => skinFilter === 'all' ? true : skinFilter === 'owned' ? have.has(s.id) : s.rarity === skinFilter);
  $('skin-grid').innerHTML = list.map(s => {
    const owned = have.has(s.id), R = RARITY[s.rarity], eq = eqSkin === s.id;
    if (!owned && s.rarity === 'secret') return `<div class="card off" style="border-bottom-color:${R.color}"><div class="q">?</div><div class="nm">???</div><div class="st">Segredo</div></div>`;
    const btn = eq ? '<button class="btn" disabled>Equipada</button>' : owned ? `<button class="btn" data-act="equip-skin" data-id="${s.id}">Equipar</button>` : '<button class="btn" disabled>Só na caixa</button>';
    return `<div class="card ${eq ? 'equipped' : ''} ${owned ? '' : 'off'}" style="border-bottom-color:${R.color}">${thumb(s.id, user.equip.format, !owned)}<div class="nm">${esc(s.name)}</div><div class="st" style="color:${R.color}">${R.name}</div>${btn}</div>`;
  }).join('');
  document.querySelectorAll('#view-shop canvas[data-skin]').forEach(cn => paintThumb(cn, performance.now()));

  $('coin-log').innerHTML = user.coinLog.slice(0, 30).map(l => `<tr><td class="muted">${fmtDate(l.ts)}</td><td>${esc(l.why)}</td><td class="${l.amt > 0 ? 'pos' : 'neg'}">${l.amt > 0 ? '+' : ''}${fmtNum(l.amt)}</td><td class="muted">${fmtNum(l.bal)}</td></tr>`).join('') || '<tr><td class="muted">Sem movimentações.</td></tr>';
}
const oddOf = r => user && user.passes.luck ? LUCK_ODDS[r] : RARITY[r].odds;
function rollNatural() {
  let r = Math.random() * 100;
  for (const k of ['common', 'rare', 'epic', 'legendary']) { r -= oddOf(k); if (r < 0) return k; }
  return 'common';
}
/* conta ADM01: pode forçar a raridade da caixa (100%) só para testar, inclusive a secreta */
const ADMIN_BOX = [['', 'Normal'], ['common', 'Comum'], ['rare', 'Rara'], ['epic', 'Épica'], ['legendary', 'Lendária'], ['secret', 'Secreta']];
function rollRarity() { return user && user.admin && RARITY[user.adminBox] ? user.adminBox : rollNatural(); }
/* sorteia uma caixa e já aplica o resultado (skin nova ou moedas de volta) */
function rollBox() {
  const rar = rollRarity(), skin = pick(SKINS.filter(s => s.rarity === rar));
  const dupe = user.owned.skins.includes(skin.id); let cash = 0;
  if (dupe) { cash = RARITY[rar].cash; addCoins(cash, 'Skin repetida: ' + skin.name); } else user.owned.skins.push(skin.id);
  user.boxLog.unshift({ts: Date.now(), id: skin.id, dupe, cash}); if (user.boxLog.length > 30) user.boxLog.length = 30;
  return {rar, skin, dupe, cash};
}

/* ----- roleta estilo CS: uma faixa de skins que desacelera e para na vencedora ----- */
let spinning = false, autoOn = false, boxMult = 1;
const RL_ITEM = 104, RL_LEN = 46, RL_WIN = 38;
const fastOn = () => !!(user.passes.fast && user.boxFast !== false);
function boxN() { return user.passes.triple && boxMult === 3 ? 3 : 1; }
function updateBoxButtons() {
  if (!user) return;
  if (!user.passes.triple) boxMult = 1;
  const n = boxN();
  $('box-cost').textContent = fmtNum(BOX_COST * n);
  $('btn-open-box').textContent = n === 3 ? 'Abrir 3 caixas' : 'Abrir caixa';
  $('btn-open-box').disabled = spinning || autoOn || (!user.admin && user.coins < BOX_COST * n);
  $('box-mult').classList.toggle('hidden', !user.passes.triple);
  $('box-mult').querySelectorAll('[data-mult]').forEach(b => b.classList.toggle('active', +b.dataset.mult === boxMult));
  $('btn-fast').classList.toggle('hidden', !user.passes.fast);
  $('btn-fast').textContent = fastOn() ? '⚡ Giro rápido: ligado' : '⚡ Giro rápido: desligado';
  $('btn-fast').classList.toggle('active', fastOn());
  $('btn-auto').classList.toggle('hidden', !user.passes.auto);
  $('btn-auto').textContent = autoOn ? '■ Parar automático' : '▶ Automático';
  $('btn-auto').disabled = !autoOn && (spinning || (!user.admin && user.coins < BOX_COST * n));
}
function renderAdminBox() {
  const el = $('admin-box'); if (!el) return;
  el.classList.toggle('hidden', !(user && user.admin));
  if (!(user && user.admin)) return;
  el.querySelector('.ab-chips').innerHTML = ADMIN_BOX.map(([v, n]) => `<button class="chip-btn ${(user.adminBox || '') === v ? 'active' : ''}" data-abox="${v}" type="button">${v ? '100% ' : ''}${n}</button>`).join('');
}
const adminBoxEl = $('admin-box');
if (adminBoxEl) adminBoxEl.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-abox]'); if (!b || !user || !user.admin || spinning) return;
  user.adminBox = RARITY[b.dataset.abox] ? b.dataset.abox : ''; save(); renderAdminBox();
});
function stripSkins(win) {
  const fill = () => { const r = rollNatural(); return pick(SKINS.filter(s => s.rarity === r)); };
  return Array.from({length: RL_LEN}, (_, i) => i === RL_WIN ? win : fill());
}
function stripHTML(res) {
  return `<div class="rl-view"><div class="rl-marker"></div><div class="rl-strip">${stripSkins(res.skin).map((sk, i) => `<div class="rl-item ${i === RL_WIN ? 'is-win' : ''}" style="--c:${RARITY[sk.rarity].color}">${thumb(sk.id, user.equip.format, false).replace('data-anim="1"', '')}</div>`).join('')}</div></div>`;
}
async function spinBoxes(n) {
  if (spinning) return false;
  if (!user.admin && user.coins < BOX_COST * n) { toast('Moedas insuficientes.', 'warn'); return false; }
  spinning = true; updateBoxButtons();
  addCoins(-BOX_COST * n, n > 1 ? `Caixas de skins (${n}x)` : 'Caixa de skins');
  const results = Array.from({length: n}, rollBox);
  checkAch(null); save();
  const R = $('roulette'), out = $('box-result');
  out.innerHTML = '';
  R.classList.remove('hidden'); R.innerHTML = results.map(stripHTML).join('');
  R.querySelectorAll('canvas').forEach(cn => paintThumb(cn, 0));
  const dur = fastOn() ? 1300 : 5200;
  try {
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    R.querySelectorAll('.rl-view').forEach(v => {
      const strip = v.querySelector('.rl-strip'), W = v.clientWidth || 600;
      const jitter = (Math.random() - .5) * RL_ITEM * .7;
      strip.style.transition = `transform ${dur}ms cubic-bezier(.08,.6,.12,1)`;
      strip.style.transform = `translateX(${-(RL_WIN * RL_ITEM + RL_ITEM / 2 - W / 2 + jitter)}px)`;
    });
  } catch (e) { /* sem animação: mostra só o resultado */ }
  await sleep(dur + 200);
  if (!user) return false;
  R.querySelectorAll('.is-win').forEach(el => el.classList.add('win'));
  out.innerHTML = `<div class="reveals">${results.map(r => `<div class="reveal">${thumb(r.skin.id, user.equip.format, false)}<div><b style="color:${RARITY[r.rar].color}">${RARITY[r.rar].name}: ${esc(r.skin.name)}</b><br><span class="muted">${r.dupe ? `Repetida. Você recebeu ${r.cash} moedas de volta.` : 'Skin nova na sua coleção!'}</span></div></div>`).join('')}</div>`;
  out.querySelectorAll('canvas').forEach(cn => paintThumb(cn, performance.now()));
  spinning = false; renderShop(); updateBoxButtons();
  return true;
}
function openBox() { return spinBoxes(boxN()); }
async function autoLoop() {
  if (autoOn) { autoOn = false; updateBoxButtons(); return; }
  if (!user.passes.auto || spinning) return;
  autoOn = true; updateBoxButtons();
  while (autoOn && user && currentView() === 'shop') {
    const n = boxN();
    if (!user.admin && user.coins < BOX_COST * n) { toast('Moedas insuficientes: automático parado.', 'warn'); break; }
    if (!(await spinBoxes(n))) break;
    await sleep(fastOn() ? 400 : 1000);
  }
  autoOn = false; if (user) updateBoxButtons();
}
$('btn-open-box').addEventListener('click', openBox);
$('btn-auto').addEventListener('click', autoLoop);
$('btn-fast').addEventListener('click', () => { if (!user || !user.passes.fast || spinning) return; user.boxFast = !fastOn(); save(); updateBoxButtons(); });
$('box-mult').addEventListener('click', e => { const b = e.target.closest('[data-mult]'); if (!b || spinning || autoOn) return; boxMult = +b.dataset.mult; updateBoxButtons(); });
$('btn-daily').addEventListener('click', () => {
  if (user.lastDaily === todayStr()) return;
  user.lastDaily = todayStr(); addCoins(DAILY, 'Bônus diário'); toast(`+${DAILY} moedas!`, 'gold'); renderShop();
});
$('view-shop').addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
  const id = b.dataset.id;
  switch (b.dataset.act) {
    case 'filter': skinFilter = id; break;
    case 'equip-skin': if (user.owned.skins.includes(id)) { user.equip.skin = id; save(); } break;
    case 'adm-toggle': {   // só a conta admin: liga/desliga o Premium e os passes
      if (!user.admin) return;
      if (!isObj(user.adminOff)) user.adminOff = {};
      user.adminOff[id] = !user.adminOff[id];
      applyAdmin(user);
      if (id === 'auto' && user.adminOff.auto) autoOn = false;
      save(); renderTop(); toast((id === 'premium' ? 'Passe Premium' : PASSES.find(x => x.id === id).name) + (user.adminOff[id] ? ' desativado.' : ' ativado.'));
      break;
    }
    case 'buy-premium':
      if (user.premium) return;
      if (user.coins < PREMIUM_PRICE) return toast('Moedas insuficientes.', 'warn');
      addCoins(-PREMIUM_PRICE, 'Item: Passe Premium'); user.premium = true; save(); renderTop();
      toast('Passe Premium ativado: moedas e XP em dobro!', 'gold'); break;
    case 'buy-pass': {
      const p = PASSES.find(x => x.id === id);
      if (!p || user.passes[p.id]) return;
      if (user.coins < p.price) return toast('Moedas insuficientes.', 'warn');
      addCoins(-p.price, 'Passe: ' + p.name); user.passes[p.id] = true; save();
      toast(p.name + ' ativado!', 'gold'); break;
    }
  }
  renderShop();
});

/* ===================== perfil ===================== */
function renderProfile() {
  $('prof-icon').textContent = ICON_BY_ID[user.icon] || '🎯';
  $('prof-name').textContent = (user.premium ? '★ ' : '') + user.name;
  const tt = $('title-select');
  const titles = ACH.filter(a => user.unlocked.includes(a.id));
  tt.innerHTML = '<option value="">Sem título</option>' + titles.map(a => `<option value="${esc(a.title)}" ${user.title === a.title ? 'selected' : ''}>${esc(a.title)}</option>`).join('');
  $('prof-title').textContent = user.title || 'Sem título';
  const LV = levelInfo(user.xp);
  $('prof-level').textContent = 'Nível ' + LV.L; $('prof-xp-fill').style.width = LV.pct.toFixed(1) + '%'; $('prof-xp').textContent = fmtNum(LV.cur) + ' / ' + fmtNum(LV.need) + ' XP';
  $('prof-icons').innerHTML = ICONS.map(i => {
    const lock = i.ach && !user.unlocked.includes(i.ach), need = i.ach ? ACH.find(a => a.id === i.ach) : null;
    return `<button class="icon-btn ${user.icon === i.id ? 'active' : ''} ${lock ? 'locked' : ''}" data-icon="${i.id}" type="button" ${lock ? `disabled title="Desbloqueie com a conquista: ${esc(need.name)}"` : ''}>${lock ? '🔒' : i.ch}</button>`;
  }).join('');
  const s = user.stats;
  const fav = Object.entries(s.modes).sort((a, b) => b[1] - a[1])[0];
  const mins = Math.floor(s.timeMs / 60000), secs = Math.floor(s.timeMs / 1000) % 60;
  const items = [['Sessões', s.sessions], ['Melhor pontuação', fmtNum(s.bestScore)], ['Melhor precisão', s.bestAcc.toFixed(1).replace('.', ',') + '%'], ['Maior combo', s.bestCombo],
    ['Alvos destruídos', fmtNum(s.targets)], ['Tempo jogado', `${mins}min ${secs}s`], ['Modo favorito', fav ? MODE_BY_ID[fav[0]].name : '—'], ['Moedas ganhas', fmtNum(user.coinsEarned)]];
  $('stats-grid').innerHTML = items.map(([l, v]) => `<div class="stat"><span class="lbl">${l}</span><span class="orb">${v}</span></div>`).join('');
  renderRanking();
  $('hist-body').innerHTML = user.history.map(h => `<tr><td class="muted">${fmtDate(h.ts)}</td><td>${h.comp ? '🏆 ' : ''}${MODE_BY_ID[h.mode] ? MODE_BY_ID[h.mode].name : h.mode}</td><td>${fmtDur(h.dur)}</td><td>${fmtNum(h.score)}</td><td>${h.acc.toFixed(1).replace('.', ',')}%</td><td>${h.hits}</td><td>${h.combo}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">Nenhuma sessão ainda.</td></tr>';
  $('ach-list').innerHTML = ACH.map(a => {
    const on = user.unlocked.includes(a.id), hide = a.secret && !on;
    return `<div class="ach ${on ? '' : 'off'}"><div><b>${hide ? '???' : esc(a.name)}</b><span>${hide ? 'Conquista secreta.' : esc(a.desc)}${on ? ' Título: ' + esc(a.title) : ''}</span></div></div>`;
  }).join('');
}
function renderRanking() {
  const m = $('rk-mode'), d = $('rk-dur');
  if (!m.options.length) {
    m.innerHTML = MODES.map(x => `<option value="${x.id}">${x.name}</option>`).join('');
    d.innerHTML = `<option value="${COMP_DUR}">Competitivo · ${fmtDur(COMP_DUR)}</option>`; d.disabled = true;
    m.value = user.last.mode;
  }
  const list = db.ranking[rankKey(m.value, d.value)] || [];
  $('rk-body').innerHTML = list.map((e, i) => `<tr><td>${i + 1}</td><td>${esc(e.user)}</td><td class="baloo-points">${fmtNum(e.score)}</td><td class="muted">${e.acc.toFixed(1).replace('.', ',')}%</td><td class="muted">${fmtDate(e.ts)}</td></tr>`).join('') || '<tr><td class="muted">Sem registros para este modo e duração.</td></tr>';
  const log = db.rankLog.filter(e => e.mode === m.value).slice(0, 10);
  $('rk-log').innerHTML = log.map(e => `<tr><td class="muted">${fmtDate(e.ts)}</td><td>${esc(e.user)}</td><td class="baloo-points">${fmtNum(e.score)}</td><td class="muted">${e.acc.toFixed(1).replace('.', ',')}%</td></tr>`).join('') || '<tr><td class="muted">Nenhuma partida competitiva neste modo.</td></tr>';
}
$('rk-mode').addEventListener('change', renderRanking);
$('rk-dur').addEventListener('change', renderRanking);
$('prof-icons').addEventListener('click', e => { const b = e.target.closest('[data-icon]'); if (!b || b.disabled) return; user.icon = b.dataset.icon; save(); renderTop(); renderProfile(); });
$('title-select').addEventListener('change', e => { user.title = e.target.value; save(); renderProfile(); });
$('btn-profile-chip').addEventListener('click', () => setView('profile'));

/* ===================== retícula (tela) ===================== */
const xhCv = $('xh-preview'), xhCtx = xhCv.getContext('2d');
const xhCur = {x: 320, y: 180, pulse: 0};
const XH_COLORS = ['#00ffcc', '#39ff6a', '#ffffff', '#f5b421', '#ff0055', '#ff4fa3', '#4da3ff', '#b266ff'];
const XH_SHAPE_NAMES = {empty: 'Vazia', cross: 'Cruz', dot: 'Ponto', circle: 'Círculo', chevron: 'Chevron'};
const XH_BGS = [['grid', 'Grade'], ['dark', 'Escuro'], ['light', 'Claro'], ['green', 'Verde']];
let xhBg = 'grid';
const miniCfg = c => Object.assign({}, c, {pulse: false, size: Math.min(c.size, 12), gap: Math.min(c.gap, 5), thick: Math.min(c.thick, 3), dotSize: Math.min(c.dotSize, 3)});
function paintMini(cn, cfg) {
  const c = cn.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cn.width, cn.height);
  drawCrosshair(c, cn.width / 2, cn.height / 2, miniCfg(cfg), 0);
}
function renderXhTiles() {
  $('xh-shapes').innerHTML = XH_SHAPES.map(sh => `<button class="tile ${user.xh.shape === sh ? 'active' : ''}" data-xh-shape="${sh}" type="button"><canvas width="64" height="64" data-shape="${sh}"></canvas><span>${XH_SHAPE_NAMES[sh]}</span></button>`).join('');
  $('xh-shapes').querySelectorAll('canvas').forEach(cn => paintMini(cn, Object.assign({}, user.xh, {shape: cn.dataset.shape})));
  $('xh-swatches').innerHTML = XH_COLORS.map(c => `<button class="swatch ${user.xh.color === c ? 'active' : ''}" data-xh-color="${c}" style="background:${c}" title="${c}" type="button"></button>`).join('');
  $('xh-bgs').innerHTML = XH_BGS.map(([id, n]) => `<button class="chip-btn ${xhBg === id ? 'active' : ''}" data-xh-bg="${id}" type="button">${n}</button>`).join('');
  xhCv.dataset.bg = xhBg;
}
function renderXhPresets() {
  $('xh-presets').innerHTML = XH_PRESETS.map((p, i) => `<button class="tile" data-preset="${i}" type="button"><canvas width="64" height="64" data-code="${p.code}"></canvas><span>${p.name}</span></button>`).join('');
  $('xh-presets').querySelectorAll('canvas').forEach(cn => paintMini(cn, decodeFA2(cn.dataset.code)));
}
function syncXH() {
  document.querySelectorAll('.xh-ctl').forEach(inp => { const v = user.xh[inp.dataset.key]; if (inp.type === 'checkbox') inp.checked = !!v; else inp.value = v; });
  document.querySelectorAll('[data-out]').forEach(o => { o.textContent = user.xh[o.dataset.out]; });
  $('xh-code').value = encodeFA2(user.xh);
  renderXhTiles();
}
document.querySelectorAll('.xh-ctl').forEach(inp => inp.addEventListener('input', () => {
  const k = inp.dataset.key;
  user.xh[k] = inp.type === 'checkbox' ? inp.checked : inp.type === 'range' ? +inp.value : inp.value;
  save(); syncXH();
}));
$('view-crosshair').addEventListener('click', e => {
  const sh = e.target.closest('[data-xh-shape]'), co = e.target.closest('[data-xh-color]'), bg = e.target.closest('[data-xh-bg]'), pr = e.target.closest('[data-preset]');
  if (sh) user.xh.shape = sh.dataset.xhShape;
  else if (co) user.xh.color = co.dataset.xhColor;
  else if (bg) xhBg = bg.dataset.xhBg;
  else if (pr) user.xh = decodeFA2(XH_PRESETS[+pr.dataset.preset].code);
  else return;
  save(); syncXH();
});
$('btn-xh-reset').addEventListener('click', () => { user.xh = defaultXH(); save(); syncXH(); toast('Retícula resetada.'); });
$('btn-xh-import').addEventListener('click', () => {
  const c = decodeFA2($('xh-code').value);
  if (!c) return toast('Código FA2 inválido.', 'warn');
  user.xh = c; save(); syncXH(); toast('Retícula importada.');
});
$('btn-xh-copy').addEventListener('click', async () => {
  const inp = $('xh-code');
  try { await navigator.clipboard.writeText(inp.value); toast('Código copiado.'); }
  catch (e) { inp.select(); document.execCommand('copy'); toast('Código copiado.'); }
});
xhCv.addEventListener('mousemove', e => { const r = xhCv.getBoundingClientRect(); xhCur.x = (e.clientX - r.left) * xhCv.width / r.width; xhCur.y = (e.clientY - r.top) * xhCv.height / r.height; });
xhCv.addEventListener('mousedown', () => { xhCur.pulse = 1; });
function drawXhPreview(now, dt) {
  const c = xhCtx, w = xhCv.width, h = xhCv.height, sk = SKIN_BY_ID[user.equip.skin], fm = user.equip.format;
  c.clearRect(0, 0, w, h);
  drawTarget(c, fm, sk, w * .3, h * .5, 52, now);
  drawTarget(c, fm, sk, w * .74, h * .3, 30, now);
  drawTarget(c, fm, sk, w * .62, h * .76, 16, now);
  xhCur.pulse = Math.max(0, xhCur.pulse - dt / .18);
  drawCrosshair(c, xhCur.x, xhCur.y, user.xh, xhCur.pulse);
  if (user.xh.shape === 'empty' && !user.xh.dot) { c.fillStyle = '#8b98a8'; c.font = '14px "Space Grotesk", sans-serif'; c.textAlign = 'center'; c.fillText(tr('Sem mira visível'), w / 2, h - 14); }
}

/* ===================== sensibilidade (tela) ===================== */
const sCv = $('sens-canvas'), sCtx = sCv.getContext('2d'), pad = $('sens-pad');
const sens = {x: 260, y: 140, raw: 0, trail: []};
function updateSensInfo() {
  const s = user.sens;
  $('sens-dpi').value = s.dpi; $('sens-cm').value = s.cm; $('sens-lock').checked = s.lock;
  const counts = Math.round(s.dpi * s.cm / 2.54);
  $('sens-info').textContent = `360° = ${fmtNum(counts)} contagens do mouse. Fator da mira: ${(REF360 / counts).toFixed(3).replace('.', ',')} px por contagem.`;
}
function updateSensOut() {
  const s = user.sens, cm = Math.abs(sens.raw) / s.dpi * 2.54, deg = Math.abs(sens.raw) / (s.dpi * s.cm / 2.54) * 360;
  $('sens-raw').textContent = fmtNum(Math.abs(sens.raw));
  $('sens-cmout').textContent = cm.toFixed(1).replace('.', ',') + ' cm';
  $('sens-deg').textContent = deg.toFixed(0) + '°';
}
$('sens-dpi').addEventListener('input', e => { const v = +e.target.value; if (v >= 100 && v <= 32000) { user.sens.dpi = v; save(); updateSensInfo(); updateSensOut(); } });
$('sens-cm').addEventListener('input', e => { const v = +e.target.value; if (v >= 2 && v <= 200) { user.sens.cm = v; save(); updateSensInfo(); updateSensOut(); } });
$('sens-lock').addEventListener('change', e => { user.sens.lock = e.target.checked; save(); });
$('btn-sens-reset').addEventListener('click', () => { sens.raw = 0; sens.trail = []; updateSensOut(); });
pad.addEventListener('click', () => { if (pad.requestPointerLock) { try { const p = pad.requestPointerLock({unadjustedMovement: true}); if (p && p.catch) p.catch(() => { try { pad.requestPointerLock(); } catch (e) {} }); } catch (e) {} } });
pad.addEventListener('mousemove', e => {
  if (document.pointerLockElement !== pad) return;
  const f = sensFactor();
  sens.raw += e.movementX;
  sens.x = clamp(sens.x + e.movementX * f * (sCv.width / pad.clientWidth), 0, sCv.width);
  sens.y = clamp(sens.y + e.movementY * f * (sCv.height / pad.clientHeight), 0, sCv.height);
  sens.trail.push({x: sens.x, y: sens.y}); if (sens.trail.length > 40) sens.trail.shift();
  updateSensOut();
});
function drawSens() {
  const c = sCtx, w = sCv.width, h = sCv.height;
  c.clearRect(0, 0, w, h);
  c.strokeStyle = 'rgba(0,255,204,.08)'; c.lineWidth = 1;
  for (let x = 0; x < w; x += 40) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
  for (let y = 0; y < h; y += 40) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
  c.strokeStyle = 'rgba(0,255,204,.35)'; c.beginPath(); sens.trail.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); c.stroke();
  drawCrosshair(c, sens.x, sens.y, Object.assign({}, user.xh, {shape: user.xh.shape === 'empty' ? 'cross' : user.xh.shape, size: Math.max(user.xh.size, 6)}), 0);
}

/* ===================== configurações ===================== */
const BG_NAMES = {grid: 'Grade', black: 'Preto', dark: 'Escuro', light: 'Claro', blue: 'Azul', purple: 'Roxo', green: 'Verde', wine: 'Vinho'};
const CB_OPTIONS = [['none', 'Desligado'], ['protanopia', 'Protanopia'], ['deuteranopia', 'Deuteranopia'], ['tritanopia', 'Tritanopia']];
function renderSettings() {
  const s = user.settings;
  $('set-sound').checked = s.sound; $('set-left').checked = !!s.leftHanded; $('set-tips').checked = s.tips !== false;
  $('set-volume').value = s.volume; $('set-volume-out').textContent = s.volume + '%';
  $('set-bg-tiles').innerHTML = BG_OPTIONS.map(id => `<button class="bg-tile ${s.bg === id ? 'active' : ''}" data-set="bg" data-val="${id}" data-bg="${id}" title="${BG_NAMES[id]}" type="button"><span>${BG_NAMES[id]}</span></button>`).join('');
  $('set-timbre-chips').innerHTML = TIMBRES.map(t => `<button class="chip-btn ${s.timbre === t.id ? 'active' : ''}" data-set="timbre" data-val="${t.id}" type="button">${t.name}</button>`).join('');
  $('set-theme-seg').innerHTML = [['dark', 'Escuro'], ['light', 'Claro']].map(([id, n]) => `<button class="seg-btn ${db.ui.theme === id ? 'active' : ''}" data-set="theme" data-val="${id}" type="button">${n}</button>`).join('');
  $('set-cb-chips').innerHTML = CB_OPTIONS.map(([id, n]) => `<button class="chip-btn ${db.ui.colorblind === id ? 'active' : ''}" data-set="cb" data-val="${id}" type="button">${n}</button>`).join('');
}
$('set-sound').addEventListener('change', e => { user.settings.sound = e.target.checked; save(); });
$('set-left').addEventListener('change', e => { user.settings.leftHanded = e.target.checked; G.btn = false; save(); renderModes(); showOverlay('', $('btn-start').textContent); toast(e.target.checked ? 'Modo canhoto ligado: o tiro agora é o botão direito.' : 'Modo canhoto desligado: o tiro é o botão esquerdo.'); });

/* backup do progresso (o jogo é local: sem servidor, o arquivo é a sua cópia de segurança) */
function exportProgress() {
  const key = db.session, data = {app: 'freeaim', v: 1, key, user: db.users[key]};
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], {type: 'application/json'}));
  a.download = 'freeaim-' + (user.name || 'perfil').toLowerCase().replace(/[^a-z0-9_]/g, '') + '.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  toast('Backup salvo no seu computador.');
}
function importProgress(text) {
  let d; try { d = JSON.parse(text); } catch (e) { return toast('Arquivo inválido.', 'warn'); }
  if (!d || d.app !== 'freeaim' || !isObj(d.user) || typeof d.key !== 'string' || !/^(@convidado|[a-z0-9_]{3,16})$/.test(d.key) || typeof d.user.name !== 'string')
    return toast('Esse arquivo não é um backup do FREEAIM.', 'warn');
  d.user.name = d.user.name.slice(0, 16);
  db.users[d.key] = hydrate(d.user); db.session = d.key; save(); enterApp();
  toast('Progresso importado: ' + d.user.name, 'gold');
}
$('btn-export').addEventListener('click', exportProgress);
$('btn-import').addEventListener('click', () => $('file-import').click());
$('file-import').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) f.text().then(importProgress); });
$('set-volume').addEventListener('input', e => { user.settings.volume = +e.target.value; $('set-volume-out').textContent = e.target.value + '%'; save(); });
$('btn-test-sound').addEventListener('click', playHit);
$('view-settings').addEventListener('click', e => {
  const b = e.target.closest('[data-set]'); if (!b) return;
  const v = b.dataset.val;
  switch (b.dataset.set) {
    case 'bg': user.settings.bg = v; wrap.dataset.bg = v; break;
    case 'timbre': user.settings.timbre = v; playHit(); break;
    case 'theme': db.ui.theme = v; applyTheme(); break;
    case 'cb': db.ui.colorblind = v; applyTheme(); break;
  }
  save(); renderSettings();
});
$('btn-set-reset').addEventListener('click', () => {
  user.settings = defaultsUser().settings; db.ui.theme = 'dark'; db.ui.colorblind = 'none';
  wrap.dataset.bg = user.settings.bg; applyTheme(); save(); renderSettings(); renderModes(); toast('Configurações restauradas.');
});

/* ===================== navegação ===================== */
function currentView() { const a = document.querySelector('.view.active'); return a ? a.id.slice(5) : ''; }
function setView(v) {
  cancelSession('Sessão cancelada ao sair da tela de jogo.');
  closeFocus();
  document.querySelectorAll('.view').forEach(sec => sec.classList.toggle('active', sec.id === 'view-' + v));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  if (v === 'play') requestAnimationFrame(resizeCanvas);
  if (v === 'shop') renderShop();
  if (v === 'profile') renderProfile();
  if (v === 'crosshair') { syncXH(); renderXhPresets(); }
  if (v === 'sens') { updateSensInfo(); updateSensOut(); }
  if (v === 'settings') renderSettings();
}
$('nav').addEventListener('click', e => { const b = e.target.closest('[data-view]'); if (b) setView(b.dataset.view); });

/* ===================== carrossel de dicas ===================== */
let tipIdx = 0, tipTimer = null;
const tipList = () => TIPS.filter(t => !(t.premium && user && user.premium));
function showTip(i) {
  if (!user) return;
  const list = tipList(); if (!list.length) return;
  tipIdx = ((i % list.length) + list.length) % list.length;
  const el = $('tip-text');
  el.textContent = list[tipIdx].text;
  el.classList.remove('in'); void el.offsetWidth; el.classList.add('in');
  $('tip-dots').innerHTML = list.map((_, k) => `<i class="${k === tipIdx ? 'on' : ''}"></i>`).join('');
}
function startTips() { clearInterval(tipTimer); tipTimer = setInterval(() => showTip(tipIdx + 1), 7000); }
function stopTips() { clearInterval(tipTimer); tipTimer = null; }
function applyTips() {   // dicas ligadas ou desligadas (Configurações > Aparência, ou o X no canto da dica)
  const on = !user || user.settings.tips !== false;
  $('tips').classList.toggle('hidden', !on);
  if (!on) stopTips(); else if (user && !tipTimer) { showTip(tipIdx); startTips(); }
  if ($('set-tips')) $('set-tips').checked = on;
}
function initTips() { tipIdx = Math.floor(Math.random() * tipList().length); showTip(tipIdx); startTips(); applyTips(); }
$('tip-close').addEventListener('click', () => { user.settings.tips = false; save(); applyTips(); toast('Dicas ocultas. Para ver de novo: Configurações > Aparência.'); });
$('set-tips').addEventListener('change', e => { user.settings.tips = e.target.checked; save(); applyTips(); });
$('tip-next').addEventListener('click', () => { showTip(tipIdx + 1); startTips(); });
$('tip-prev').addEventListener('click', () => { showTip(tipIdx - 1); startTips(); });
$('tips').addEventListener('mouseenter', stopTips);
$('tips').addEventListener('mouseleave', () => { if (user) startTips(); });

/* ===================== entrada no app ===================== */
function enterApp() {
  user = db.users[db.session];
  $('auth-screen').classList.add('hidden'); $('app').classList.remove('hidden');
  wrap.dataset.bg = user.settings.bg;
  G.state = 'idle'; G.targets = []; G.parts = [];
  $('result-panel').classList.add('hidden');
  showOverlay('', 'Iniciar');
  renderTop(); renderCoins(); renderModes(); initTips();
  $('rk-mode').innerHTML = ''; // força recriar com o modo atual
  setView('play');
}

/* ===================== loop principal ===================== */
let lastT = performance.now();
function frame(now) {
  const dt = Math.min(.05, (now - lastT) / 1000); lastT = now;
  if (user) {
    if (G.state === 'playing') update(dt, now);
    const v = currentView();
    if (v === 'play') drawArena(now);
    else if (v === 'shop') document.querySelectorAll('#view-shop canvas[data-anim="1"]').forEach(cn => paintThumb(cn, now));
    else if (v === 'crosshair') drawXhPreview(now, dt);
    else if (v === 'sens') drawSens();
  }
  requestAnimationFrame(frame);
}


/* ===================== idioma (PT-BR / EN) ===================== */
const I18N = window.FA_I18N || null;
let lang = 'pt';
const tr = s => (lang === 'en' && I18N) ? I18N.tr(s) : s;
const TR_ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
const trSkip = n => { const p = n.nodeType === 3 ? n.parentNode : n; return !p || /^(SCRIPT|STYLE|CANVAS|TEXTAREA)$/.test(p.nodeName) || !!(p.closest && p.closest('[data-notr]')); };
let trObs = null, trBusy = false;
function trText(n) {   // texto: guarda o original em PT no nó e mostra a tradução
  if (trSkip(n)) return;
  const v = n.nodeValue;
  if (n.__en !== undefined && v === n.__en) return;   // já traduzido por nós
  if (!v.trim()) return;
  n.__pt = v; n.__en = tr(v); if (n.__en !== v) n.nodeValue = n.__en; else n.__en = v;
}
function trAttrs(el) {
  if (!el.getAttribute || trSkip(el)) return;
  for (const a of TR_ATTRS) {
    const v = el.getAttribute(a); if (v === null) continue;
    const m = el.__pta || (el.__pta = {}), e = el.__ena || (el.__ena = {});
    if (e[a] !== undefined && v === e[a]) continue;
    m[a] = v; e[a] = tr(v); if (e[a] !== v) el.setAttribute(a, e[a]); else e[a] = v;
  }
}
function trTree(root) {
  if (root.nodeType === 3) { trText(root); return; }
  if (root.nodeType !== 1) return;
  trAttrs(root);
  const w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let n; while ((n = w.nextNode())) { if (n.nodeType === 3) trText(n); else trAttrs(n); }
}
function trRestore(root) {   // volta tudo para PT-BR
  const w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let n; while ((n = w.nextNode())) {
    if (n.nodeType === 3) { if (n.__pt !== undefined && n.nodeValue === n.__en) n.nodeValue = n.__pt; n.__pt = n.__en = undefined; }
    else if (n.__pta) { for (const a in n.__pta) if (n.getAttribute(a) === n.__ena[a]) n.setAttribute(a, n.__pta[a]); n.__pta = n.__ena = undefined; }
  }
}
function trWatch() {
  if (trObs || !window.MutationObserver) return;
  trObs = new MutationObserver(list => {
    if (lang !== 'en' || trBusy) return;
    trBusy = true;
    try {
      for (const m of list) {
        if (m.type === 'childList') m.addedNodes.forEach(trTree);
        else if (m.type === 'characterData') trText(m.target);
        else if (m.type === 'attributes') trAttrs(m.target);
      }
    } finally { trBusy = false; }
    trObs.takeRecords();
  });
  trObs.observe(document.body, {childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: TR_ATTRS});
}
function applyLang() {
  lang = (db.ui && db.ui.lang === 'en') ? 'en' : 'pt';
  document.documentElement.lang = lang === 'en' ? 'en' : 'pt-BR';
  document.title = lang === 'en' ? 'FREEAIM — Aim Trainer' : 'FREEAIM — Aim Trainer';
  if (document.body && document.createTreeWalker) {
    trBusy = true;
    try { if (lang === 'en') { trTree(document.body); trWatch(); } else trRestore(document.body); } finally { trBusy = false; }
    if (trObs) trObs.takeRecords();
  }
  (document.querySelectorAll ? document.querySelectorAll('.btn-lang') : []).forEach(b => { b.textContent = lang === 'en' ? 'PT-BR' : 'EN'; b.title = lang === 'en' ? 'Mudar para português' : 'Switch to English'; b.setAttribute('aria-label', b.title); b.__ena = b.__pta = undefined; });
}
function toggleLang() {
  db.ui.lang = lang === 'en' ? 'pt' : 'en'; save(); applyLang();
}

/* ===================== início ===================== */
document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('.btn-lang'); if (b) toggleLang(); });
buildCbFilters(); applyTheme(); setAuthMode('login'); applyLang();
if (db.session && db.users[db.session]) enterApp();
else { db.session = null; }
requestAnimationFrame(frame);
})();
