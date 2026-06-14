"use strict";
const pptxgen = require("pptxgenjs");
const path    = require("path");

// ─── Paleta MeuChapa ─────────────────────────────────────────────────────────
const C = {
  or:  "FF6600",  dk:  "1A1A1A",  dk2: "2D2D2D",  dk3: "3D3D3D",
  or2: "FF8833",  orP: "FFF0E6",  orB: "FFE0CC",
  wh:  "FFFFFF",  bg:  "F8F7F5",  bdr: "E5E0D8",
  gy:  "666666",  gyL: "999999",  gyB: "F2F1EF",
  rd:  "D32F2F",  rdP: "FFF3F3",  rdB: "FFCDD2",
  gn:  "2E7D32",  gnP: "F1FFF4",  gnB: "C8E6C9",
};
const FH   = "Arial Black";
const FB   = "Calibri";
const LOGO = path.resolve(__dirname, "../src/assets/logo-meuchapa.png");

// ─── Helpers ─────────────────────────────────────────────────────────────────
const makeShadow = () => ({ type:"outer", color:"000000", blur:8, offset:3, angle:135, opacity:0.08 });

function topBar(s, color) {
  color = color || C.or;
  s.addShape(pres.shapes.RECTANGLE, { x:0, y:0, w:10, h:0.07, fill:{color}, line:{color,width:0} });
}
function logoSmall(s) { s.addImage({ path:LOGO, x:0.3, y:0.18, w:1.3, h:0.45 }); }
function slideTitle(s, title, sub) {
  s.addText(title, { x:0.3, y:0.75, w:9.4, h:0.55, fontSize:24, bold:true, color:C.dk, fontFace:FH });
  if (sub) s.addText(sub, { x:0.3, y:1.3, w:9.4, h:0.3, fontSize:10.5, color:C.gy, fontFace:FB });
}
function footer(s) {
  s.addShape(pres.shapes.RECTANGLE, { x:0, y:5.44, w:10, h:0.185, fill:{color:C.bdr}, line:{color:C.bdr,width:0} });
  s.addImage({ path:LOGO, x:8.4, y:5.45, w:1.25, h:0.44 });
}
function timeChip(s, text, x, y, w, green) {
  var bg  = green ? C.gnP : C.orP;
  var brd = green ? C.gnB : C.or;
  var cl  = green ? C.gn  : C.or;
  s.addShape(pres.shapes.RECTANGLE, { x:x, y:y, w:w, h:0.28, fill:{color:bg}, line:{color:brd,width:0.75} });
  s.addText("⏱  "+text, { x:x, y:y, w:w, h:0.28, fontSize:8.5, bold:true, color:cl, fontFace:FB, align:"center", valign:"middle", margin:0 });
}
function painBox(s, lines, x, y, w, h) {
  s.addShape(pres.shapes.RECTANGLE, { x:x, y:y, w:w, h:h, fill:{color:C.rdP}, line:{color:C.rdB,width:1} });
  s.addShape(pres.shapes.RECTANGLE, { x:x, y:y, w:0.06, h:h, fill:{color:C.rd}, line:{color:C.rd,width:0} });
  s.addText("GARGALO", { x:x+0.12, y:y+0.1, w:w-0.2, h:0.25, fontSize:7.5, bold:true, color:C.rd, fontFace:FB, charSpacing:1.5 });
  s.addText(lines, { x:x+0.12, y:y+0.35, w:w-0.2, h:h-0.45, fontSize:9.5, color:C.dk2, fontFace:FB, align:"left", valign:"top" });
}

function stepRow(s, num, title, tool, detail, sx, sy, sw, sh) {
  sw = sw || 5.8; sh = sh || 0.7;
  var isRed = num === "!" ;
  var col   = isRed ? C.rd : C.or;
  s.addShape(pres.shapes.RECTANGLE, { x:sx, y:sy, w:sw, h:sh, fill:{color:C.wh}, line:{color: isRed ? C.rdB : C.bdr,width:1}, shadow:makeShadow() });
  s.addShape(pres.shapes.RECTANGLE, { x:sx, y:sy, w:0.06, h:sh, fill:{color:col}, line:{color:col,width:0} });
  s.addShape(pres.shapes.OVAL, { x:sx+0.13, y:sy+0.17, w:0.28, h:0.28, fill:{color:col}, line:{color:col,width:0} });
  s.addText(String(num), { x:sx+0.13, y:sy+0.17, w:0.28, h:0.28, fontSize:9, bold:true, color:C.wh, fontFace:FH, align:"center", valign:"middle", margin:0 });
  s.addText(title, { x:sx+0.5, y:sy+0.08, w:sw-0.6, h:0.28, fontSize:10.5, bold:true, color: isRed ? C.rd : C.dk, fontFace:FB });
  if (tool) {
    s.addShape(pres.shapes.RECTANGLE, { x:sx+0.5, y:sy+0.38, w:1.4, h:0.19, fill:{color:C.orP}, line:{color:C.orB,width:0.5} });
    s.addText(tool, { x:sx+0.5, y:sy+0.38, w:1.4, h:0.19, fontSize:7.5, bold:true, color:C.or, fontFace:FB, align:"center", valign:"middle", margin:0 });
  }
  if (detail) s.addText(detail, { x:sx+1.99, y:sy+0.35, w:sw-2.08, h:0.28, fontSize:8.5, color:C.gy, fontFace:FB });
}

// ─── Apresentação ────────────────────────────────────────────────────────────
const pres = new pptxgen();
pres.layout = "LAYOUT_16x9";
pres.title  = "Mapeamento de Processo BID — MCM";

// ════════════════════════════════════════════════════════════════════════════
// SLIDE 1 — CAPA
// ════════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.dk };
  s.addShape(pres.shapes.RECTANGLE, { x:0, y:0, w:0.55, h:5.625, fill:{color:C.or}, line:{color:C.or,width:0} });
  s.addShape(pres.shapes.RECTANGLE, { x:0, y:5.27, w:10, h:0.355, fill:{color:C.or}, line:{color:C.or,width:0} });
  s.addImage({ path:LOGO, x:0.78, y:0.35, w:2.1, h:0.74 });

  s.addShape(pres.shapes.RECTANGLE, { x:0.78, y:1.28, w:2.4, h:0.3, fill:{color:C.or}, line:{color:C.or,width:0} });
  s.addText("AS-IS  ×  TO-BE  |  BID", { x:0.78, y:1.28, w:2.4, h:0.3, fontSize:9, bold:true, color:C.wh, fontFace:FB, align:"center", valign:"middle", margin:0, charSpacing:0.8 });

  s.addText("Mapeamento de\nProcesso BID", { x:0.78, y:1.72, w:7.2, h:2.3, fontSize:52, bold:true, color:C.wh, fontFace:FH });
  s.addText("Captação de Chapas — Fluxo Operacional do Analista de BID", { x:0.78, y:3.95, w:7.2, h:0.45, fontSize:13, color:C.gyL, fontFace:FB });

  s.addShape(pres.shapes.RECTANGLE, { x:0.78, y:4.52, w:3.4, h:0.38, fill:{color:C.dk2}, line:{color:C.dk3,width:1} });
  s.addText("MCM — Meu Chapa Manager", { x:0.78, y:4.52, w:3.4, h:0.38, fontSize:11, bold:true, color:C.or, fontFace:FB, align:"center", valign:"middle", margin:0 });

  s.addText("Junho 2026", { x:0.78, y:5.3, w:3, h:0.25, fontSize:9, bold:true, color:C.wh, fontFace:FB, margin:0 });

  s.addShape(pres.shapes.RECTANGLE, { x:7.6, y:1.1, w:2.1, h:4.0, fill:{color:C.dk2}, line:{color:C.dk2,width:0} });
  s.addShape(pres.shapes.RECTANGLE, { x:7.6, y:1.1, w:2.1, h:0.06, fill:{color:C.or}, line:{color:C.or,width:0} });
  [
    { val:"+160K",  lbl:"chapas na base" },
    { val:"200",    lbl:"máx. por busca" },
    { val:"<10%",   lbl:"sucesso via 3C" },
    { val:"7 dias", lbl:"janela de BID" },
  ].forEach(function(st, i) {
    s.addText(st.val, { x:7.6, y:1.28+i*0.95, w:2.1, h:0.58, fontSize:26, bold:true, color:C.or, fontFace:FH, align:"center" });
    s.addText(st.lbl, { x:7.6, y:1.82+i*0.95, w:2.1, h:0.28, fontSize:9, color:C.gyL, fontFace:FB, align:"center" });
  });
}

// ════════════════════════════════════════════════════════════════════════════
// SLIDE 2 — CONTEXTO
// ════════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.bg };
  topBar(s);
  logoSmall(s);
  slideTitle(s, "O que é o processo de BID?", "Captação ativa de chapas para preencher vagas em tarefas operacionais");

  s.addShape(pres.shapes.RECTANGLE, { x:0.3, y:1.62, w:5.9, h:1.55, fill:{color:C.wh}, line:{color:C.bdr,width:1}, shadow:makeShadow() });
  s.addShape(pres.shapes.RECTANGLE, { x:0.3, y:1.62, w:0.07, h:1.55, fill:{color:C.or}, line:{color:C.or,width:0} });
  s.addText("O que é o BID?", { x:0.5, y:1.7, w:5.5, h:0.3, fontSize:11, bold:true, color:C.or, fontFace:FB });
  s.addText(
    "BID é o processo de captação ativa de chapas (ajudantes) para preencher vagas em tarefas que ainda estão em aberto. " +
    "Diferente do FUP — que confirma a presença de quem já está alocado — o BID recruta novos ajudantes do zero, " +
    "exigindo busca, filtragem, disparo de campanha, negociação e acompanhamento de resposta em tempo real.",
    { x:0.5, y:2.02, w:5.5, h:1.0, fontSize:10.5, color:C.dk2, fontFace:FB }
  );

  s.addShape(pres.shapes.RECTANGLE, { x:6.45, y:1.62, w:3.25, h:1.55, fill:{color:C.orP}, line:{color:C.orB,width:1} });
  s.addShape(pres.shapes.RECTANGLE, { x:6.45, y:1.62, w:0.07, h:1.55, fill:{color:C.or}, line:{color:C.or,width:0} });
  s.addText("Objetivo deste documento", { x:6.62, y:1.7, w:2.95, h:0.28, fontSize:10, bold:true, color:C.or, fontFace:FB });
  [
    "Documentar o processo atual (AS-IS)",
    "Evidenciar gargalos e ineficiências",
    "Mapear como o MCM resolve cada etapa",
    "Estimar ganhos de tempo e custo",
  ].forEach(function(o, i) {
    s.addText("• "+o, { x:6.62, y:2.05+i*0.25, w:2.95, h:0.24, fontSize:9.5, color:C.dk2, fontFace:FB });
  });

  s.addShape(pres.shapes.RECTANGLE, { x:0.3, y:3.35, w:9.4, h:1.75, fill:{color:C.wh}, line:{color:C.bdr,width:1}, shadow:makeShadow() });
  s.addText("Como BID e FUP se relacionam", { x:0.5, y:3.45, w:9.0, h:0.3, fontSize:11, bold:true, color:C.dk, fontFace:FB });
  [
    { t:"BID — Captação", d:"Recruta chapas para vagas em aberto. Exige busca ativa, disparo de campanha e negociação.", c:C.or },
    { t:"FUP — Follow-Up",          d:"Confirma a presença de chapas já alocados próximos ao início da tarefa.", c:C.dk2 },
    { t:"Handoff",                       d:"Após o BID confirmar o chapa, o FUP assume o acompanhamento até a validação no local.", c:C.gn },
  ].forEach(function(col, i) {
    var cx = 0.5 + i*3.1;
    s.addShape(pres.shapes.RECTANGLE, { x:cx, y:3.82, w:0.07, h:1.06, fill:{color:col.c}, line:{color:col.c,width:0} });
    s.addText(col.t, { x:cx+0.15, y:3.82, w:2.8, h:0.3, fontSize:10, bold:true, color:col.c, fontFace:FB });
    s.addText(col.d, { x:cx+0.15, y:4.12, w:2.8, h:0.68, fontSize:9, color:C.gy, fontFace:FB });
  });

  footer(s);
}

// ════════════════════════════════════════════════════════════════════════════
// SLIDE 3 — SEÇÃO AS-IS
// ════════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.or };
  s.addShape(pres.shapes.RECTANGLE, { x:0, y:0, w:0.55, h:5.625, fill:{color:C.dk}, line:{color:C.dk,width:0} });
  s.addShape(pres.shapes.RECTANGLE, { x:0, y:5.27, w:10, h:0.355, fill:{color:C.dk}, line:{color:C.dk,width:0} });
  s.addText("Processo\nAtual", { x:0.78, y:0.65, w:8.5, h:2.8, fontSize:70, bold:true, color:C.wh, fontFace:FH });
  s.addShape(pres.shapes.RECTANGLE, { x:0.78, y:3.6, w:1.5, h:0.07, fill:{color:C.dk}, line:{color:C.dk,width:0} });
  s.addText("AS-IS", { x:0.78, y:3.75, w:4, h:0.5, fontSize:22, bold:true, color:C.dk, fontFace:FH });
  s.addText("Como o BID é feito hoje — sem o MCM", { x:0.78, y:4.3, w:6.5, h:0.35, fontSize:14, color:C.dk2, fontFace:FB });
  s.addImage({ path:LOGO, x:8.3, y:5.28, w:1.4, h:0.49 });
}

// ════════════════════════════════════════════════════════════════════════════
// SLIDE 4 — AS-IS MACRO TIMELINE
// ════════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.bg };
  topBar(s);
  logoSmall(s);
  slideTitle(s, "Fluxo Geral — Processo Atual de BID (AS-IS)", "Visão macro do dia operacional do analista de BID");

  const steps = [
    { num:"1", label:"Verificar\nTarefas",     sub:"Dashboard MeuChapa",  time:"5–10 min" },
    { num:"2", label:"Busca\nChapa",           sub:"Download + Excel",    time:"10–20 min" },
    { num:"3", label:"Disparo\nUmbler",        sub:"CSV + campanha",      time:"10–20 min/tarefa" },
    { num:"4", label:"Monitorar\nRespostas",   sub:"WhatsApp + chatbot",  time:"30–60 min" },
    { num:"5", label:"Negociar\ne Confirmar",  sub:"Tabela + WhatsApp",   time:"15–30 min" },
    { num:"6", label:"Stand-by\ne Ligações", sub:"3C + Google Maps",    time:"20–40 min" },
    { num:"7", label:"Handoff\npara FUP",      sub:"Repasse ao analista", time:"Contínuo" },
  ];

  var n=7, cW=1.3, gap=0.05, sX=0.25, cY=1.75, cR=0.33, cardY=2.68, cardH=2.08;
  s.addShape(pres.shapes.RECTANGLE, { x:sX+cR, y:cY+cR-0.04, w:n*(cW+gap)-gap-cR*2, h:0.07, fill:{color:C.bdr}, line:{color:C.bdr,width:0} });

  steps.forEach(function(st, i) {
    var sx = sX + i*(cW+gap);
    var cx = sx + cW/2 - 0.02;
    s.addShape(pres.shapes.OVAL, { x:cx-cR, y:cY, w:cR*2, h:cR*2, fill:{color:C.or}, line:{color:C.wh,width:2} });
    s.addText(st.num, { x:cx-cR, y:cY, w:cR*2, h:cR*2, fontSize:14, bold:true, color:C.wh, fontFace:FH, align:"center", valign:"middle", margin:0 });
    s.addShape(pres.shapes.RECTANGLE, { x:sx, y:cardY, w:cW, h:cardH, fill:{color:C.wh}, line:{color:C.bdr,width:1}, shadow:makeShadow() });
    s.addShape(pres.shapes.RECTANGLE, { x:sx, y:cardY, w:cW, h:0.06, fill:{color:C.or}, line:{color:C.or,width:0} });
    s.addText(st.label, { x:sx+0.06, y:cardY+0.09, w:cW-0.12, h:0.78, fontSize:9.5, bold:true, color:C.dk, fontFace:FB, align:"center" });
    s.addText(st.sub,   { x:sx+0.06, y:cardY+0.9,  w:cW-0.12, h:0.48, fontSize:8,   color:C.gy, fontFace:FB, align:"center" });
    s.addShape(pres.shapes.RECTANGLE, { x:sx+0.08, y:cardY+1.48, w:cW-0.16, h:0.3, fill:{color:C.orP}, line:{color:C.or,width:0.75} });
    s.addText("⏱ "+st.time, { x:sx+0.08, y:cardY+1.48, w:cW-0.16, h:0.3, fontSize:7.5, bold:true, color:C.or, fontFace:FB, align:"center", valign:"middle", margin:0 });
  });

  s.addShape(pres.shapes.RECTANGLE, { x:0, y:5.14, w:10, h:0.485, fill:{color:C.dk}, line:{color:C.dk,width:0} });
  s.addText("TOTAL ESTIMADO  •  2 a 4 horas de BID ativo por dia  •  múltiplas tarefas e campanhas em simultâneo", {
    x:0.3, y:5.14, w:9.4, h:0.485, fontSize:10.5, bold:true, color:C.wh, fontFace:FB, align:"center", valign:"middle", margin:0
  });
}

// ════════════════════════════════════════════════════════════════════════════
// SLIDE 5 — AS-IS DETALHE: BUSCA E PREPARAÇÃO
// ════════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.bg };
  topBar(s);
  logoSmall(s);
  slideTitle(s, "Etapas 1–3: Verificação, Busca e Preparação de Dados", "Do dashboard ao CSV pronto para disparo");

  s.addShape(pres.shapes.RECTANGLE, { x:0.3, y:1.28, w:1.2, h:0.26, fill:{color:C.orP}, line:{color:C.or,width:1} });
  s.addText("AS-IS", { x:0.3, y:1.28, w:1.2, h:0.26, fontSize:8.5, bold:true, color:C.or, fontFace:FB, align:"center", valign:"middle", margin:0, charSpacing:1.5 });

  var steps5 = [
    { n:1,   t:"Abrir dashboard MeuChapa online",   tool:"MeuChapa web",     d:'Identificar tarefas em aberto — linhas que precisam ser preenchidas com chapas.' },
    { n:2,   t:'Baixar planilha "Busca Chapa"',     tool:"MeuChapa export",  d:"Filtrar por distância. Retorna até 200 contatos com 21 colunas." },
    { n:3,   t:"Editar planilha no Excel",          tool:"Microsoft Excel",   d:"Remover 19 colunas desnecessárias. Manter apenas Nome e Telefone." },
    { n:"!", t:"(Deveria) Ranquear manualmente",    tool:"Critério próprio", d:"Na correria, o ranqueamento é pulado e dispara-se para todos os 200 contatos." },
    { n:5,   t:"Exportar como CSV",                tool:"Excel — Salvar",   d:"Gerar arquivo CSV para upload na Umbler. Repetir para cada tarefa em aberto." },
  ];
  steps5.forEach(function(st, i) {
    stepRow(s, st.n, st.t, st.tool, st.d, 0.3, 1.62+i*0.77, 5.8, 0.7);
  });

  painBox(s,
    "A planilha Busca Chapa tem 21 colunas. A cada disparo o analista precisa abrir o Excel, apagar manualmente as 19 colunas desnecessárias e exportar um novo CSV. Processo repetido para cada tarefa do dia.",
    6.35, 1.62, 3.3, 1.7
  );
  timeChip(s, "10–20 min por tarefa", 6.35, 3.45, 3.3, false);

  s.addShape(pres.shapes.RECTANGLE, { x:6.35, y:3.88, w:3.3, h:1.27, fill:{color:C.wh}, line:{color:C.bdr,width:1}, shadow:makeShadow() });
  s.addText("Colunas da planilha Busca Chapa:", { x:6.5, y:3.95, w:3.0, h:0.28, fontSize:9, bold:true, color:C.dk, fontFace:FB });
  s.addShape(pres.shapes.RECTANGLE, { x:8.62, y:3.96, w:0.85, h:0.22, fill:{color:C.rdP}, line:{color:C.rdB,width:0.5} });
  s.addText("21 colunas", { x:8.62, y:3.96, w:0.85, h:0.22, fontSize:7.5, bold:true, color:C.rd, fontFace:FB, align:"center", valign:"middle", margin:0 });
  s.addText("Lat • Long • Cidade • Estado • ID Usuário • Telefone • Milhas • Cód. CEP • Distância • Últ. Nome • Apelido • 1º Nome • Referência • Complemento • Endereço • App Móvel • Tarefas • Verificação 1 • Verificação 2 • Status de Contato",
    { x:6.5, y:4.26, w:3.0, h:0.75, fontSize:7.5, color:C.gy, fontFace:FB }
  );
  footer(s);
}

// ════════════════════════════════════════════════════════════════════════════
// SLIDE 6 — AS-IS DETALHE: DISPARO DE CAMPANHA
// ════════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.bg };
  topBar(s);
  logoSmall(s);
  slideTitle(s, "Etapa 4: Disparo de Campanha BID na Umbler", "Uma campanha por tarefa — processo inteiramente manual e repetitivo");

  s.addShape(pres.shapes.RECTANGLE, { x:0.3, y:1.28, w:1.2, h:0.26, fill:{color:C.orP}, line:{color:C.or,width:1} });
  s.addText("AS-IS", { x:0.3, y:1.28, w:1.2, h:0.26, fontSize:8.5, bold:true, color:C.or, fontFace:FB, align:"center", valign:"middle", margin:0, charSpacing:1.5 });

  var steps6 = [
    { n:1, t:"Abrir Umbler Talk",               tool:"Umbler Talk",       d:"Acessar a plataforma de disparo de campanhas WhatsApp." },
    { n:2, t:"Criar nova campanha",             tool:"Umbler Talk",       d:"Uma campanha separada para cada tarefa (empresa + horário + local)." },
    { n:3, t:"Preencher dados da tarefa",       tool:"Manual",            d:"Local de trabalho, atividades, valor da diária — tudo digitado manualmente." },
    { n:4, t:"Importar CSV com os contatos",    tool:"Arquivo CSV",       d:"Upload do arquivo gerado no Excel. Até 200 contatos por campanha." },
    { n:5, t:"Disparar e monitorar chatbot",    tool:"Umbler chatbot",    d:"Sim: chatbot sugere aceite no app (fluxo automático). Não: pergunta o motivo." },
    { n:6, t:"Aguardar respostas",             tool:"Umbler / WhatsApp", d:"Não é possível pausar o disparo em andamento." },
  ];
  var sh6 = 0.64;
  steps6.forEach(function(st, i) {
    stepRow(s, st.n, st.t, st.tool, st.d, 0.3, 1.62+i*(sh6+0.06), 5.8, sh6);
  });

  painBox(s,
    "O processo é inteiramente repetitivo: uma campanha completa do zero para cada tarefa. Com várias tarefas abertas simultaneamente, o analista pode criar e gerir 5 a 15 campanhas por dia — sem poder pausar nenhuma delas em tempo real.",
    6.35, 1.62, 3.3, 1.9
  );
  timeChip(s, "10–20 min por tarefa", 6.35, 3.65, 3.3, false);

  s.addShape(pres.shapes.RECTANGLE, { x:6.35, y:4.06, w:3.3, h:1.09, fill:{color:C.wh}, line:{color:C.bdr,width:1}, shadow:makeShadow() });
  s.addText("Fluxo do chatbot BID:", { x:6.5, y:4.13, w:3.0, h:0.28, fontSize:9, bold:true, color:C.dk, fontFace:FB });
  [
    { t:"Disparo → Pergunta de interesse", c:C.or },
    { t:"SIM → Sugere aceite no app",      c:C.gn },
    { t:"NÃO → Pergunta motivo",       c:C.rd },
    { t:"SEM RESPOSTA → Analista age",     c:C.gyL },
  ].forEach(function(row, i) {
    s.addText("• "+row.t, { x:6.5, y:4.43+i*0.17, w:3.0, h:0.17, fontSize:8.5, color:row.c, fontFace:FB, bold:i<3 });
  });
  footer(s);
}

// ════════════════════════════════════════════════════════════════════════════
// SLIDE 7 — AS-IS DETALHE: MONITORAMENTO E NEGOCIAÇÃO
// ════════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.bg };
  topBar(s);
  logoSmall(s);
  slideTitle(s, "Etapas 5–6: Monitoramento, Negociação e Handoff para FUP", "A etapa mais crítica e mais dependente de conhecimento tácito");

  s.addShape(pres.shapes.RECTANGLE, { x:0.3, y:1.28, w:1.2, h:0.26, fill:{color:C.orP}, line:{color:C.or,width:1} });
  s.addText("AS-IS", { x:0.3, y:1.28, w:1.2, h:0.26, fontSize:8.5, bold:true, color:C.or, fontFace:FB, align:"center", valign:"middle", margin:0, charSpacing:1.5 });

  var steps7 = [
    { n:1,   t:'Monitorar respostas em tempo real',    tool:"Umbler / WhatsApp",  d:'Verificar quem respondeu "Sim", quem negou e quem não respondeu.' },
    { n:"!", t:"Identificar chapas frequentes",        tool:"Memória do analista", d:"Reconhecer manualmente nomes conhecidos para priorizar o contato." },
    { n:3,   t:"Negociar valor da diária",        tool:"Tabela de cálculo",  d:"Usar planilha externa para garantir o take rate da MeuChapa." },
    { n:4,   t:"Verificar tempo de chegada",           tool:"WhatsApp direto",    d:"Confirmar com o chapa em quanto tempo consegue chegar ao local." },
    { n:5,   t:"Confirmar e repassar ao FUP",         tool:"WhatsApp / MeuChapa", d:"Comunicar ao analista de FUP os chapas confirmados para acompanhamento." },
  ];
  var sh7 = 0.69;
  steps7.forEach(function(st, i) {
    stepRow(s, st.n, st.t, st.tool, st.d, 0.3, 1.62+i*(sh7+0.06), 5.8, sh7);
  });

  painBox(s,
    "A qualidade da captação depende diretamente da memória individual do analista: quem são os frequentes, quem costuma aceitar, qual o perfil de cada chapa. Esse conhecimento não está documentado e não é compartilhado.",
    6.35, 1.62, 3.3, 2.0
  );
  timeChip(s, "30–60 min por tarefa", 6.35, 3.76, 3.3, false);

  s.addShape(pres.shapes.RECTANGLE, { x:6.35, y:4.17, w:3.3, h:0.98, fill:{color:C.wh}, line:{color:C.bdr,width:1}, shadow:makeShadow() });
  s.addText("Conhecimento tácito exigido:", { x:6.5, y:4.24, w:3.0, h:0.28, fontSize:9, bold:true, color:C.rd, fontFace:FB });
  ["Memorizar chapas frequentes", "Negociar com persuão individual", "Estimar taxa de aceite por chapa", "Decidir quando insistir ou desistir"].forEach(function(t, i) {
    s.addText("• "+t, { x:6.5, y:4.53+i*0.15, w:3.0, h:0.15, fontSize:8.5, color:C.dk2, fontFace:FB });
  });
  footer(s);
}

// ════════════════════════════════════════════════════════════════════════════
// SLIDE 8 — AS-IS DETALHE: CONTINGÊNCIAS
// ════════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.bg };
  topBar(s);
  logoSmall(s);
  slideTitle(s, "Contingências: Stand-by, Ligações 3C e Tarefas Remotas", "Situações que exigem esforço adicional significativo");

  s.addShape(pres.shapes.RECTANGLE, { x:0.3, y:1.28, w:1.2, h:0.26, fill:{color:C.orP}, line:{color:C.or,width:1} });
  s.addText("AS-IS", { x:0.3, y:1.28, w:1.2, h:0.26, fontSize:8.5, bold:true, color:C.or, fontFace:FB, align:"center", valign:"middle", margin:0, charSpacing:1.5 });

  var cards8 = [
    {
      title:"Gestão de Stand-by", icon:"01", color:C.or,
      steps:["Tarefa já completa mas respostas ainda chegam","Analista deve manter chapas em stand-by","FUP sinaliza desistências em tempo real","BID aciona o stand-by para substituição","Coordenação manual entre dois analistas"],
      time:"Contínuo",
      pain:"Coordenação exclusivamente via WhatsApp, sem sistema centralizado de stand-by.",
    },
    {
      title:"Ligações via 3C", icon:"02", color:C.rd,
      steps:["Importar lista do Busca Chapa para 3C","Ligar para chapas sem resposta ao disparo","Número de call center: baixa taxa de atendimento","Taxa de sucesso de contato: menos de 10%","Alto volume de tentativas com baixo retorno"],
      time:"20–40 min",
      pain:"Número de call center gera desconfiança. Maioria não atende ou não reconhece a chamada.",
    },
    {
      title:"Tarefas Remotas", icon:"03", color:C.dk2,
      steps:["Nenhum chapa disponível na base pelo Busca Chapa","Abrir Google Maps e localizar a região da tarefa","Identificar negócios locais nas redondezas","Ligar manualmente, um a um, por cada negócio","Perguntar se conhecem trabalhadores disponíveis"],
      time:"15–30 min",
      pain:"Processo completamente manual. Depende de prospecção visual no mapa sem nenhuma automação.",
    },
  ];

  cards8.forEach(function(card, i) {
    var cx=0.3+i*3.25, cy=1.62, cw=3.1, ch=3.7;
    s.addShape(pres.shapes.RECTANGLE, { x:cx, y:cy, w:cw, h:ch, fill:{color:C.wh}, line:{color:C.bdr,width:1}, shadow:makeShadow() });
    s.addShape(pres.shapes.RECTANGLE, { x:cx, y:cy, w:cw, h:0.06, fill:{color:card.color}, line:{color:card.color,width:0} });
    s.addText(card.icon, { x:cx+0.12, y:cy+0.1, w:0.45, h:0.42, fontSize:20, bold:true, color:card.color, fontFace:FH });
    s.addText(card.title, { x:cx+0.12, y:cy+0.55, w:cw-0.24, h:0.4, fontSize:11, bold:true, color:C.dk, fontFace:FB });
    card.steps.forEach(function(step, j) {
      s.addText("• "+step, { x:cx+0.15, y:cy+1.0+j*0.3, w:cw-0.25, h:0.3, fontSize:8.5, color:C.dk2, fontFace:FB });
    });
    s.addShape(pres.shapes.RECTANGLE, { x:cx+0.15, y:cy+2.6, w:cw-0.3, h:0.25, fill:{color:C.orP}, line:{color:C.or,width:0.5} });
    s.addText("⏱ "+card.time, { x:cx+0.15, y:cy+2.6, w:cw-0.3, h:0.25, fontSize:8, bold:true, color:C.or, fontFace:FB, align:"center", valign:"middle", margin:0 });
    s.addShape(pres.shapes.RECTANGLE, { x:cx+0.15, y:cy+2.93, w:cw-0.3, h:0.6, fill:{color:C.rdP}, line:{color:C.rdB,width:0.5} });
    s.addText(card.pain, { x:cx+0.2, y:cy+2.98, w:cw-0.4, h:0.55, fontSize:8, color:C.rd, fontFace:FB });
  });
  footer(s);
}

// ════════════════════════════════════════════════════════════════════════════
// SLIDE 9 — GARGALOS
// ════════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.dk };
  topBar(s);
  logoSmall(s);
  s.addText("Principais Gargalos do Processo Atual", { x:0.3, y:0.75, w:9.4, h:0.5, fontSize:22, bold:true, color:C.wh, fontFace:FH });
  s.addText("9 pontos críticos que impactam a eficiência e a escalabilidade do BID", { x:0.3, y:1.28, w:9.4, h:0.28, fontSize:10.5, color:C.gyL, fontFace:FB });

  var pains9 = [
    { n:"01", t:"21 Colunas Desnecessárias",  d:"Planilha Busca Chapa exige edição manual a cada disparo." },
    { n:"02", t:"Sem Ranqueamento",               d:"Na correria, dispara-se para todos os 200 sem critério de prioridade." },
    { n:"03", t:"Sem Visib. de Ocupação",d:"Chapas já alocados em outras tarefas no mesmo dia são invisíveis." },
    { n:"04", t:"Repetição por Tarefa",  d:"Cada tarefa exige uma campanha Umbler completa do zero." },
    { n:"05", t:"Calculadora Externa",             d:"Tabela de cálculo de valor é separada, fora do fluxo de trabalho." },
    { n:"06", t:"Sem Pausa em Tempo Real",         d:"Umbler não permite pausar ou cancelar um disparo em andamento." },
    { n:"07", t:"Histórico Descentralizado",  d:"Aceites e rejeições anteriores de BID não são consultáveis." },
    { n:"08", t:"3C com Menos de 10%",             d:"Número de call center tem taxa de atendimento menor que 10%." },
    { n:"09", t:"Conhecimento Tácito",         d:"Qualidade da captação depende da memória individual do analista." },
  ];

  var cw9=3.0, ch9=1.42, gap9=0.1;
  [0,1,2].forEach(function(col) {
    [0,1,2].forEach(function(row) {
      var p  = pains9[row*3+col];
      var px = 0.3 + col*(cw9+gap9);
      var py = 1.65 + row*(ch9+gap9);
      s.addShape(pres.shapes.RECTANGLE, { x:px, y:py, w:cw9, h:ch9, fill:{color:C.dk2}, line:{color:C.dk3,width:1} });
      s.addShape(pres.shapes.RECTANGLE, { x:px, y:py, w:cw9, h:0.06, fill:{color:C.or}, line:{color:C.or,width:0} });
      s.addText(p.n, { x:px+0.12, y:py+0.1, w:0.5, h:0.42, fontSize:18, bold:true, color:C.or, fontFace:FH });
      s.addText(p.t, { x:px+0.12, y:py+0.52, w:cw9-0.22, h:0.3, fontSize:10.5, bold:true, color:C.wh, fontFace:FB });
      s.addText(p.d, { x:px+0.12, y:py+0.84, w:cw9-0.22, h:0.48, fontSize:8.5, color:C.gyL, fontFace:FB });
    });
  });

  s.addShape(pres.shapes.RECTANGLE, { x:0, y:5.44, w:10, h:0.185, fill:{color:C.or}, line:{color:C.or,width:0} });
  s.addImage({ path:LOGO, x:8.4, y:5.45, w:1.25, h:0.44 });
}

// ════════════════════════════════════════════════════════════════════════════
// SLIDE 10 — SEÇÃO TO-BE
// ════════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.or };
  s.addShape(pres.shapes.RECTANGLE, { x:0, y:0, w:0.55, h:5.625, fill:{color:C.dk}, line:{color:C.dk,width:0} });
  s.addShape(pres.shapes.RECTANGLE, { x:0, y:5.27, w:10, h:0.355, fill:{color:C.dk}, line:{color:C.dk,width:0} });
  s.addText("Processo\nImplementado", { x:0.78, y:0.5, w:8.5, h:3.1, fontSize:60, bold:true, color:C.wh, fontFace:FH });
  s.addShape(pres.shapes.RECTANGLE, { x:0.78, y:3.75, w:1.5, h:0.07, fill:{color:C.dk}, line:{color:C.dk,width:0} });
  s.addText("TO-BE", { x:0.78, y:3.9, w:4, h:0.5, fontSize:22, bold:true, color:C.dk, fontFace:FH });
  s.addShape(pres.shapes.RECTANGLE, { x:0.78, y:4.5, w:3.8, h:0.38, fill:{color:C.dk}, line:{color:C.dk,width:0} });
  s.addText("MCM — Meu Chapa Manager", { x:0.78, y:4.5, w:3.8, h:0.38, fontSize:13, bold:true, color:C.or, fontFace:FH, align:"center", valign:"middle", margin:0 });
  s.addImage({ path:LOGO, x:8.3, y:5.28, w:1.4, h:0.49 });
}

// ════════════════════════════════════════════════════════════════════════════
// SLIDE 11 — TO-BE MACRO TIMELINE
// ════════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.bg };
  topBar(s);
  logoSmall(s);
  slideTitle(s, "Fluxo Geral — BID com MCM (TO-BE)", "Como o MCM transforma cada etapa do processo de captação");

  var steps11 = [
    { num:"1", label:"Dashboard\nBID Local",     sub:"MCM — tarefas + vagas", time:"1–2 min" },
    { num:"2", label:"Base +\nRanqueamento",     sub:"160K chapas + score",        time:"Automático" },
    { num:"3", label:"Configurar\ne Disparar",   sub:"Endereço + template",   time:"3–8 min/tarefa" },
    { num:"4", label:"Monitorar\nRespostas",     sub:"Status por chapa",           time:"Automático" },
    { num:"5", label:"Negociar\nIntegrado",      sub:"Calculadora + histórico",time:"5–15 min" },
    { num:"6", label:"Handoff\nDigital",         sub:"FUP assume no MCM",          time:"Instantâneo" },
  ];
  var n11=6, cW11=1.48, gap11=0.1, sX11=0.25, cY11=1.75, cR11=0.37, cardY11=2.72, cardH11=2.0;
  s.addShape(pres.shapes.RECTANGLE, { x:sX11+cR11, y:cY11+cR11-0.04, w:n11*(cW11+gap11)-gap11-cR11*2, h:0.07, fill:{color:C.bdr}, line:{color:C.bdr,width:0} });

  steps11.forEach(function(st, i) {
    var sx=sX11+i*(cW11+gap11), cx=sx+cW11/2-0.02;
    s.addShape(pres.shapes.OVAL, { x:cx-cR11, y:cY11, w:cR11*2, h:cR11*2, fill:{color:C.dk}, line:{color:C.wh,width:2} });
    s.addText(st.num, { x:cx-cR11, y:cY11, w:cR11*2, h:cR11*2, fontSize:16, bold:true, color:C.or, fontFace:FH, align:"center", valign:"middle", margin:0 });
    s.addShape(pres.shapes.RECTANGLE, { x:sx, y:cardY11, w:cW11, h:cardH11, fill:{color:C.wh}, line:{color:C.bdr,width:1}, shadow:makeShadow() });
    s.addShape(pres.shapes.RECTANGLE, { x:sx, y:cardY11, w:cW11, h:0.06, fill:{color:C.dk}, line:{color:C.dk,width:0} });
    s.addText(st.label, { x:sx+0.07, y:cardY11+0.1, w:cW11-0.14, h:0.8,  fontSize:10, bold:true, color:C.dk, fontFace:FB, align:"center" });
    s.addText(st.sub,   { x:sx+0.07, y:cardY11+0.92, w:cW11-0.14, h:0.45, fontSize:8.5, color:C.gy, fontFace:FB, align:"center" });
    s.addShape(pres.shapes.RECTANGLE, { x:sx+0.1, y:cardY11+1.48, w:cW11-0.2, h:0.3, fill:{color:C.gnP}, line:{color:C.gnB,width:0.75} });
    s.addText("⏱ "+st.time, { x:sx+0.1, y:cardY11+1.48, w:cW11-0.2, h:0.3, fontSize:8, bold:true, color:C.gn, fontFace:FB, align:"center", valign:"middle", margin:0 });
  });

  s.addShape(pres.shapes.RECTANGLE, { x:0, y:5.14, w:10, h:0.485, fill:{color:C.dk}, line:{color:C.dk,width:0} });
  s.addText("TOTAL ESTIMADO  •  40 min a 1,5 hora de BID ativo  •  ranqueamento, histórico e controle centralizados no MCM", {
    x:0.3, y:5.14, w:9.4, h:0.485, fontSize:10.5, bold:true, color:C.or, fontFace:FB, align:"center", valign:"middle", margin:0
  });
}

// ════════════════════════════════════════════════════════════════════════════
// SLIDE 12 — TO-BE DETALHE: RANQUEAMENTO
// ════════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.bg };
  topBar(s);
  logoSmall(s);
  slideTitle(s, "Diferencial MCM: Ranqueamento Automático de Chapas", "O MCM substitui o critério manual e a memória do analista por dados objetivos");

  s.addShape(pres.shapes.RECTANGLE, { x:0.3, y:1.28, w:2.6, h:0.26, fill:{color:C.gnP}, line:{color:C.gnB,width:1} });
  s.addText("TO-BE — MCM", { x:0.3, y:1.28, w:2.6, h:0.26, fontSize:8.5, bold:true, color:C.gn, fontFace:FB, align:"center", valign:"middle", margin:0, charSpacing:1 });

  var factors12 = [
    { lbl:"Distância",             desc:"Score por proximidade (haversine). Chapas mais perto = score maior.",     pts:"+60 pts máx",  c:C.or  },
    { lbl:"Tarefas finalizadas",        desc:"Mais experiência = mais pontos. Cap em 100 tarefas.",                pts:"+100 pts máx", c:C.or  },
    { lbl:"Recência de atividade", desc:"Ativo nos últimos 30 dias: +40 pts. 90 dias: +20. 180 dias: +5.",   pts:"+40 pts máx",  c:C.or  },
    { lbl:"Status no sistema",          desc:'Situação "Ativo" = +20 pts. "Ainda não ativo" = +5 pts.', pts:"+20 pts",           c:C.dk2 },
    { lbl:"ASO (verificação)",desc:"Chapa com verificação de antecedentes recebe bônus adicional.", pts:"+10 pts",       c:C.dk2 },
    { lbl:"Métricas Leo",          desc:">75% aceite: +50 pts. Recorrente: +20 pts. <20% aceite: -40 pts.",       pts:"+50 / -40 pts",    c:C.rd  },
  ];

  factors12.forEach(function(f, i) {
    var row=Math.floor(i/3), col=i%3;
    var fx=0.3+col*3.22, fy=1.65+row*1.08, fw=3.05, fh=0.98;
    s.addShape(pres.shapes.RECTANGLE, { x:fx, y:fy, w:fw, h:fh, fill:{color:C.wh}, line:{color:C.bdr,width:1}, shadow:makeShadow() });
    s.addShape(pres.shapes.RECTANGLE, { x:fx, y:fy, w:0.07, h:fh, fill:{color:f.c}, line:{color:f.c,width:0} });
    s.addText(f.lbl, { x:fx+0.15, y:fy+0.08, w:fw-0.3, h:0.28, fontSize:10.5, bold:true, color:C.dk, fontFace:FB });
    var chBg = f.c===C.rd ? C.rdP : C.orP;
    s.addShape(pres.shapes.RECTANGLE, { x:fx+0.15, y:fy+0.36, w:1.0, h:0.19, fill:{color:chBg}, line:{color:f.c,width:0.5} });
    s.addText(f.pts, { x:fx+0.15, y:fy+0.36, w:1.0, h:0.19, fontSize:7.5, bold:true, color:f.c, fontFace:FB, align:"center", valign:"middle", margin:0 });
    s.addText(f.desc, { x:fx+1.24, y:fy+0.34, w:fw-1.34, h:0.56, fontSize:8.5, color:C.gy, fontFace:FB });
  });

  s.addShape(pres.shapes.RECTANGLE, { x:0.3, y:3.88, w:9.4, h:1.2, fill:{color:C.dk}, line:{color:C.dk,width:0} });
  var extras12 = [
    { t:"Bloqueados visíveis",      d:"Aba separada com motivo de bloqueio" },
    { t:"Ocupação detectada",  d:"Flag se chapa já está em outra tarefa no mesmo dia" },
    { t:"Pausa em tempo real",           d:"Disparo em lote cancelável a qualquer momento" },
    { t:"Calc. de valor integrada",      d:"Take rate MCM garantido na negociação" },
    { t:"[Futuro] Negócios locais", d:"Mapa de estabelecimentos nas redondezas" },
  ];
  extras12.forEach(function(e, i) {
    var ex=0.5+i*1.88;
    s.addShape(pres.shapes.RECTANGLE, { x:ex, y:4.0, w:1.7, h:0.88, fill:{color:C.dk2}, line:{color:C.dk3,width:1} });
    s.addShape(pres.shapes.RECTANGLE, { x:ex, y:4.0, w:1.7, h:0.05, fill:{color:C.or}, line:{color:C.or,width:0} });
    s.addText(e.t, { x:ex+0.08, y:4.07, w:1.55, h:0.36, fontSize:8.5, bold:true, color:C.or, fontFace:FB });
    s.addText(e.d, { x:ex+0.08, y:4.44, w:1.55, h:0.36, fontSize:7.5, color:C.gyL, fontFace:FB });
  });
  footer(s);
}

// ════════════════════════════════════════════════════════════════════════════
// SLIDE 13 — COMPARATIVO AS-IS × TO-BE
// ════════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.bg };
  topBar(s);
  logoSmall(s);
  slideTitle(s, "Comparativo AS-IS × TO-BE", "Estimativa de impacto por etapa do processo de BID");

  var rows13 = [
    { e:"Verificar tarefas e vagas abertas",       a:"5–10 min (dashboard web)",         t:"1–2 min (MCM local)",             g:"~85%",       tp:"tempo" },
    { e:"Busca e preparação de dados",   a:"10–20 min (Excel, 21 colunas)",    t:"Automático (chapa_registry)",     g:"~95%",       tp:"tempo" },
    { e:"Ranqueamento de candidatos",              a:"Pulado ou manual (critério próprio)", t:"Automático (score composto)", g:"Qualitativo",tp:"qual" },
    { e:"Visibilidade de ocupação",      a:"Invisível",                        t:"Flag em tempo real",                  g:"Qualitativo",tp:"qual" },
    { e:"Configuração e disparo",        a:"10–20 min/tarefa",                 t:"3–8 min/tarefa",                  g:"~65%",       tp:"tempo" },
    { e:"Pausa de disparo em tempo real",          a:"Impossível (Umbler)",              t:"Disponível (MCM)",               g:"Nova cap.",  tp:"ctx" },
    { e:"Negociação de valor",           a:"Tabela externa separada",               t:"Calculadora integrada no MCM",        g:"Qualitativo",tp:"qual" },
    { e:"Histórico de aceite/rejeição", a:"Memória do analista",         t:"Métricas Leo (banco de dados)",   g:"Qualitativo",tp:"qual" },
    { e:"Contato ativo (ligações)",      a:"3C — menos de 10% sucesso",        t:"Disparo MCM + stand-by digital",      g:"Qualitativo",tp:"qual" },
  ];

  var hY13=1.62, rH13=0.39, cX13=[0.3,3.45,5.75,8.15], cW13=[3.1,2.25,2.35,1.6];
  ["Etapa","AS-IS (atual)","TO-BE (MCM)","Ganho"].forEach(function(h, i) {
    var hc=[C.dk,C.rd,C.gn,C.or][i];
    s.addShape(pres.shapes.RECTANGLE, { x:cX13[i], y:hY13, w:cW13[i], h:0.35, fill:{color:hc}, line:{color:hc,width:0} });
    s.addText(h, { x:cX13[i]+0.1, y:hY13, w:cW13[i]-0.1, h:0.35, fontSize:9.5, bold:true, color:C.wh, fontFace:FB, valign:"middle", margin:0 });
  });

  rows13.forEach(function(r, i) {
    var ry=hY13+0.35+i*rH13, rowBg=i%2===0?C.wh:C.gyB;
    cX13.forEach(function(cx, ci) {
      s.addShape(pres.shapes.RECTANGLE, { x:cx, y:ry, w:cW13[ci], h:rH13, fill:{color:rowBg}, line:{color:C.bdr,width:0.5} });
    });
    s.addText(r.e, { x:cX13[0]+0.08, y:ry, w:cW13[0]-0.12, h:rH13, fontSize:8.5, bold:true, color:C.dk, fontFace:FB, valign:"middle" });
    s.addText(r.a, { x:cX13[1]+0.08, y:ry, w:cW13[1]-0.12, h:rH13, fontSize:8, color:C.rd, fontFace:FB, valign:"middle" });
    s.addText(r.t, { x:cX13[2]+0.08, y:ry, w:cW13[2]-0.12, h:rH13, fontSize:8, color:C.gn, fontFace:FB, bold:true, valign:"middle" });
    var gc=r.tp==="tempo"?C.gn:r.tp==="qual"?C.or:C.dk2;
    var gbg=r.tp==="tempo"?C.gnP:r.tp==="qual"?C.orP:C.gyB;
    s.addShape(pres.shapes.RECTANGLE, { x:cX13[3]+0.18, y:ry+0.07, w:cW13[3]-0.36, h:0.25, fill:{color:gbg}, line:{color:gc,width:0.75} });
    s.addText(r.g, { x:cX13[3]+0.18, y:ry+0.07, w:cW13[3]-0.36, h:0.25, fontSize:8, bold:true, color:gc, fontFace:FB, align:"center", valign:"middle", margin:0 });
  });
  footer(s);
}

// ════════════════════════════════════════════════════════════════════════════
// SLIDE 14 — ROI: QUANTO CUSTA O BID ATUAL?
// ════════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.bg };
  topBar(s);
  logoSmall(s);
  slideTitle(s, "ROI: Quanto Custa o BID Hoje?", "Análise de custo real de disparos BID (janeiro — junho 2026)");

  // ── Contexto operacional ──
  s.addShape(pres.shapes.RECTANGLE, { x:0.3, y:1.62, w:9.4, h:0.55, fill:{color:C.dk}, line:{color:C.dk,width:0} });
  var ctx14 = [
    { v:"27.559", l:"tarefas realizadas" },
    { v:"60.149", l:"chapas requisitados" },
    { v:"55.997", l:"chapas entregues" },
    { v:"93,1%",  l:"fill rate" },
  ];
  ctx14.forEach(function(c, i) {
    var cx=0.4+i*2.35;
    s.addText(c.v, { x:cx, y:1.66, w:2.2, h:0.28, fontSize:15, bold:true, color:C.or, fontFace:FH, align:"center" });
    s.addText(c.l, { x:cx, y:1.92, w:2.2, h:0.2, fontSize:8, color:C.gyL, fontFace:FB, align:"center" });
  });

  // ── Card esquerdo: custo atual ──
  var lx=0.3, ly=2.32, lw=4.55, lh=2.85;
  s.addShape(pres.shapes.RECTANGLE, { x:lx, y:ly, w:lw, h:lh, fill:{color:C.wh}, line:{color:C.bdr,width:1}, shadow:makeShadow() });
  s.addShape(pres.shapes.RECTANGLE, { x:lx, y:ly, w:lw, h:0.07, fill:{color:C.rd}, line:{color:C.rd,width:0} });
  s.addText("Custo Atual (AS-IS)", { x:lx+0.15, y:ly+0.12, w:lw-0.3, h:0.3, fontSize:11, bold:true, color:C.rd, fontFace:FB });

  var stats14L = [
    { v:"172.854",   l:"disparos de template BID",        c:C.dk },
    { v:"34.519",    l:"números únicos contatados", c:C.dk },
    { v:"45,5%",     l:"taxa de aceite geral",             c:C.or },
    { v:"12.418",    l:"chapas APROVADOS (>75% aceite)",   c:C.gn },
    { v:"R$ 60.499", l:"custo estimado em 5 meses",        c:C.rd },
    { v:"R$ 144.997",l:"projeção anual",         c:C.rd },
  ];
  stats14L.forEach(function(st, i) {
    var sy = ly+0.52+i*0.37;
    s.addText(st.v, { x:lx+0.15, y:sy, w:1.5, h:0.35, fontSize:14, bold:true, color:st.c, fontFace:FH });
    s.addText(st.l, { x:lx+1.72, y:sy+0.05, w:lw-1.87, h:0.28, fontSize:9.5, color:C.gy, fontFace:FB, valign:"middle" });
    if (i<5) s.addShape(pres.shapes.RECTANGLE, { x:lx+0.15, y:sy+0.35, w:lw-0.3, h:0.01, fill:{color:C.bdr}, line:{color:C.bdr,width:0} });
  });

  // Nota de rodapé do card
  s.addShape(pres.shapes.RECTANGLE, { x:lx+0.15, y:ly+2.62, w:lw-0.3, h:0.15, fill:{color:C.orP}, line:{color:C.orB,width:0.5} });
  s.addText("Base: R$ 0,35/template (Meta Marketing Brasil, 2026) • Umbler pode aplicar markup adicional", {
    x:lx+0.15, y:ly+2.62, w:lw-0.3, h:0.15, fontSize:6.5, color:C.or, fontFace:FB, align:"center", valign:"middle", margin:0
  });

  // ── Card direito: economia com MCM ──
  var rx=5.15, ry=2.32, rw=4.55, rh=2.85;
  s.addShape(pres.shapes.RECTANGLE, { x:rx, y:ry, w:rw, h:rh, fill:{color:C.wh}, line:{color:C.gnB,width:1}, shadow:makeShadow() });
  s.addShape(pres.shapes.RECTANGLE, { x:rx, y:ry, w:rw, h:0.07, fill:{color:C.gn}, line:{color:C.gn,width:0} });
  s.addText("Economia com MCM (TO-BE)", { x:rx+0.15, y:ry+0.12, w:rw-0.3, h:0.3, fontSize:11, bold:true, color:C.gn, fontFace:FB });

  // Main saving figure
  s.addShape(pres.shapes.RECTANGLE, { x:rx+0.15, y:ry+0.52, w:rw-0.3, h:1.1, fill:{color:C.gnP}, line:{color:C.gnB,width:1} });
  s.addText("R$ 36K — R$ 51K", { x:rx+0.15, y:ry+0.58, w:rw-0.3, h:0.65, fontSize:30, bold:true, color:C.gn, fontFace:FH, align:"center" });
  s.addText("economia estimada por ano em templates BID", { x:rx+0.15, y:ry+1.22, w:rw-0.3, h:0.28, fontSize:9, color:C.gn, fontFace:FB, align:"center" });

  var sav14 = [
    { label:"Redução conservadora de disparos",  val:"25% = − 43.213 templates/ano" },
    { label:"Redução otimista de disparos",      val:"35% = − 60.499 templates/ano" },
    { label:"Custo por chapa entregue hoje",               val:"R$ 1,08 (R$ 60.499 ÷ 55.997)" },
    { label:"12.418 APROVADOS priorizados",                val:"+75% aceite → menos desperdício" },
  ];
  sav14.forEach(function(st, i) {
    var sy = ry+1.72+i*0.28;
    s.addText("• "+st.label+":", { x:rx+0.15, y:sy, w:2.55, h:0.26, fontSize:8.5, bold:true, color:C.dk2, fontFace:FB });
    s.addText(st.val, { x:rx+2.75, y:sy, w:rw-2.88, h:0.26, fontSize:8.5, color:C.gn, fontFace:FB, bold:true });
  });

  s.addShape(pres.shapes.RECTANGLE, { x:rx+0.15, y:ry+2.62, w:rw-0.3, h:0.15, fill:{color:C.gnP}, line:{color:C.gnB,width:0.5} });
  s.addText("Apenas com otimização de disparos — não inclui ganhos de tempo de analista", {
    x:rx+0.15, y:ry+2.62, w:rw-0.3, h:0.15, fontSize:6.5, color:C.gn, fontFace:FB, align:"center", valign:"middle", margin:0
  });

  footer(s);
}

// ════════════════════════════════════════════════════════════════════════════
// SLIDE 15 — CONCLUSÃO
// ════════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.dk };
  s.addShape(pres.shapes.RECTANGLE, { x:0, y:0, w:0.55, h:5.625, fill:{color:C.or}, line:{color:C.or,width:0} });
  s.addShape(pres.shapes.RECTANGLE, { x:0, y:5.27, w:10, h:0.355, fill:{color:C.or}, line:{color:C.or,width:0} });
  s.addImage({ path:LOGO, x:0.78, y:0.28, w:2.0, h:0.7 });
  s.addText("Conclusão e\nPróximos Passos", { x:0.78, y:1.08, w:5.5, h:1.7, fontSize:36, bold:true, color:C.wh, fontFace:FH });
  s.addShape(pres.shapes.RECTANGLE, { x:0.78, y:2.88, w:5.6, h:0.06, fill:{color:C.or}, line:{color:C.or,width:0} });

  [
    "O BID exige 2 a 4 horas diárias de trabalho ativo, com alta dependência de conhecimento tácito individual.",
    "O MCM reduz esse tempo para 40 min a 1,5h, com ranqueamento automático e histórico centralizado.",
    "Só com disparos: economia estimada de R$ 36K a R$ 51K por ano em templates WhatsApp.",
    "A calculadora e as métricas Leo transformam a negociação de tácita para orientada a dados.",
  ].forEach(function(p, i) {
    s.addShape(pres.shapes.OVAL, { x:0.78, y:3.05+i*0.46, w:0.2, h:0.2, fill:{color:C.or}, line:{color:C.or,width:0} });
    s.addText(p, { x:1.06, y:3.02+i*0.46, w:5.2, h:0.4, fontSize:9.5, color:C.gyL, fontFace:FB });
  });

  s.addShape(pres.shapes.RECTANGLE, { x:6.5, y:1.0, w:3.15, h:4.1, fill:{color:C.dk2}, line:{color:C.dk3,width:1} });
  s.addShape(pres.shapes.RECTANGLE, { x:6.5, y:1.0, w:3.15, h:0.06, fill:{color:C.or}, line:{color:C.or,width:0} });
  s.addText("Próximos Passos", { x:6.65, y:1.12, w:2.85, h:0.35, fontSize:12, bold:true, color:C.or, fontFace:FB });

  [
    { n:"01", t:"Validar mapeamento com analistas de BID" },
    { n:"02", t:"Coletar feedback sobre o ranqueamento MCM" },
    { n:"03", t:"Definir baseline de tempo por etapa" },
    { n:"04", t:"Implementar módulo de negócios locais" },
    { n:"05", t:"Revisão com Gestão e Operações" },
  ].forEach(function(p, i) {
    s.addText(p.n, { x:6.65, y:1.58+i*0.56, w:0.4, h:0.35, fontSize:14, bold:true, color:C.or, fontFace:FH });
    s.addText(p.t, { x:7.1, y:1.58+i*0.56, w:2.4, h:0.35, fontSize:9, color:C.gyL, fontFace:FB, valign:"middle" });
    if (i<4) s.addShape(pres.shapes.RECTANGLE, { x:6.65, y:1.93+i*0.56, w:2.85, h:0.01, fill:{color:C.dk3}, line:{color:C.dk3,width:0} });
  });

  s.addText("Junho 2026  •  MCM — Meu Chapa Manager", { x:0.78, y:5.3, w:6, h:0.25, fontSize:9, color:C.wh, fontFace:FB, bold:true, margin:0 });
  s.addImage({ path:LOGO, x:8.3, y:5.28, w:1.4, h:0.49 });
}

// ─── Exportar ─────────────────────────────────────────────────────────────────
const OUT = path.resolve(__dirname, "../Mapeamento_BID_MCM.pptx");
pres.writeFile({ fileName: OUT }).then(function() {
  console.log("Gerado: " + OUT);
}).catch(function(err) { console.error("Erro:", err); process.exit(1); });
