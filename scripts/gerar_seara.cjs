"use strict";
var pptxgen = require("pptxgenjs");
var path    = require("path");

// ─── Paleta MeuChapa ─────────────────────────────────────────────────────────
var C = {
  or:  "FF6600",  dk:  "1A1A1A",  dk2: "2D2D2D",  dk3: "3D3D3D",
  or2: "FF8833",  orP: "FFF0E6",  orB: "FFE0CC",
  wh:  "FFFFFF",  bg:  "F8F7F5",  bdr: "E5E0D8",
  gy:  "666666",  gyL: "999999",  gyB: "F2F1EF",
  rd:  "D32F2F",  rdP: "FFF3F3",  rdB: "FFCDD2",
  gn:  "2E7D32",  gnP: "F1FFF4",  gnB: "C8E6C9",
  bl:  "1565C0",  blP: "E3F2FD",  blB: "BBDEFB",
};
var FH   = "Arial Black";
var FB   = "Calibri";
var LOGO = path.resolve(__dirname, "../src/assets/logo-meuchapa.png");

// ─── Helpers ─────────────────────────────────────────────────────────────────
function makeShadow() { return { type:"outer", color:"000000", blur:8, offset:3, angle:135, opacity:0.08 }; }

function topBar(s, color) {
  color = color || C.or;
  s.addShape(pres.shapes.RECTANGLE, { x:0, y:0, w:10, h:0.07, fill:{color:color}, line:{color:color,width:0} });
}
function logoSmall(s) {
  s.addImage({ path:LOGO, x:0.3, y:0.18, w:1.3, h:0.45 });
}
function slideTitle(s, title, sub) {
  s.addText(title, { x:0.3, y:0.75, w:9.4, h:0.55, fontSize:24, bold:true, color:C.dk, fontFace:FH });
  if (sub) s.addText(sub, { x:0.3, y:1.3, w:9.4, h:0.3, fontSize:10.5, color:C.gy, fontFace:FB });
}
function footer(s) {
  s.addShape(pres.shapes.RECTANGLE, { x:0, y:5.44, w:10, h:0.185, fill:{color:C.bdr}, line:{color:C.bdr,width:0} });
  s.addImage({ path:LOGO, x:8.4, y:5.45, w:1.25, h:0.44 });
}
function timeChip(s, text, x, y, w) {
  s.addShape(pres.shapes.RECTANGLE, { x:x, y:y, w:w, h:0.28, fill:{color:C.orP}, line:{color:C.or,width:0.75} });
  s.addText("⏱  "+text, { x:x, y:y, w:w, h:0.28, fontSize:8.5, bold:true, color:C.or, fontFace:FB, align:"center", valign:"middle", margin:0 });
}
function stepRow(s, num, title, tool, detail, sx, sy, sw, sh) {
  sw = sw || 5.8; sh = sh || 0.7;
  var isRed = num === "!";
  var col   = isRed ? C.rd : C.or;
  s.addShape(pres.shapes.RECTANGLE, { x:sx, y:sy, w:sw, h:sh, fill:{color:C.wh}, line:{color: isRed ? C.rdB : C.bdr, width:1}, shadow:makeShadow() });
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
var pres = new pptxgen();
pres.layout = "LAYOUT_16x9";
pres.title  = "Mapeamento de Processo SEARA";

// ════════════════════════════════════════════════════════════════════════════
// SLIDE 1 — CAPA
// ════════════════════════════════════════════════════════════════════════════
{
  var s = pres.addSlide();
  s.background = { color: C.dk };
  s.addShape(pres.shapes.RECTANGLE, { x:0, y:0, w:0.55, h:5.625, fill:{color:C.or}, line:{color:C.or,width:0} });
  s.addShape(pres.shapes.RECTANGLE, { x:0, y:5.27, w:10, h:0.355, fill:{color:C.or}, line:{color:C.or,width:0} });
  s.addImage({ path:LOGO, x:0.78, y:0.35, w:2.1, h:0.74 });

  s.addShape(pres.shapes.RECTANGLE, { x:0.78, y:1.28, w:2.2, h:0.3, fill:{color:C.dk2}, line:{color:C.dk3,width:1} });
  s.addText("MAPEAMENTO DE PROCESSO", { x:0.78, y:1.28, w:2.2, h:0.3, fontSize:8, bold:true, color:C.or, fontFace:FB, align:"center", valign:"middle", margin:0, charSpacing:0.8 });

  s.addText("Mapeamento de\nProcesso SEARA", { x:0.78, y:1.72, w:7.2, h:2.3, fontSize:52, bold:true, color:C.wh, fontFace:FH });
  s.addText("Lançamento de Tarefas Logísticas — Fluxo Operacional do Analista", { x:0.78, y:3.95, w:7.2, h:0.45, fontSize:13, color:C.gyL, fontFace:FB });

  s.addShape(pres.shapes.RECTANGLE, { x:0.78, y:4.52, w:3.4, h:0.38, fill:{color:C.dk2}, line:{color:C.dk3,width:1} });
  s.addText("AS-IS  |  Processo Atual", { x:0.78, y:4.52, w:3.4, h:0.38, fontSize:11, bold:true, color:C.or, fontFace:FB, align:"center", valign:"middle", margin:0 });

  s.addText("Junho 2026", { x:0.78, y:5.3, w:3, h:0.25, fontSize:9, bold:true, color:C.wh, fontFace:FB, margin:0 });

  // Stats panel direito
  s.addShape(pres.shapes.RECTANGLE, { x:7.6, y:1.1, w:2.1, h:4.0, fill:{color:C.dk2}, line:{color:C.dk2,width:0} });
  s.addShape(pres.shapes.RECTANGLE, { x:7.6, y:1.1, w:2.1, h:0.06, fill:{color:C.or}, line:{color:C.or,width:0} });
  [
    { val:"22h–00h", lbl:"janela de recebimento" },
    { val:"7",       lbl:"etapas do processo" },
    { val:"1",       lbl:"transportadora ativa (Framento)" },
    { val:"3",       lbl:"atores envolvidos" },
  ].forEach(function(st, i) {
    s.addText(st.val, { x:7.6, y:1.28+i*0.95, w:2.1, h:0.58, fontSize:22, bold:true, color:C.or, fontFace:FH, align:"center" });
    s.addText(st.lbl, { x:7.6, y:1.82+i*0.95, w:2.1, h:0.28, fontSize:8.5, color:C.gyL, fontFace:FB, align:"center" });
  });
}

// ════════════════════════════════════════════════════════════════════════════
// SLIDE 2 — CONTEXTO
// ════════════════════════════════════════════════════════════════════════════
{
  var s = pres.addSlide();
  s.background = { color: C.bg };
  topBar(s);
  logoSmall(s);
  slideTitle(s, "O que é o processo SEARA?", "Roteirização logística noturna — lançamento e validação de tarefas por rota");

  // Bloco descrição
  s.addShape(pres.shapes.RECTANGLE, { x:0.3, y:1.62, w:5.9, h:1.7, fill:{color:C.wh}, line:{color:C.bdr,width:1}, shadow:makeShadow() });
  s.addShape(pres.shapes.RECTANGLE, { x:0.3, y:1.62, w:0.07, h:1.7, fill:{color:C.or}, line:{color:C.or,width:0} });
  s.addText("O processo SEARA", { x:0.5, y:1.7, w:5.5, h:0.3, fontSize:11, bold:true, color:C.or, fontFace:FB });
  s.addText(
    "O processo SEARA é a rotina de lançamento de tarefas logísticas baseada na roteirização enviada " +
    "diariamente pela SEARA entre 22h e meia-noite. O analista recebe a planilha por e-mail, " +
    "filtra apenas as transportadoras em atendimento, valida cada endereço contra o Book Logístico " +
    "do MeuChapa e decide — por tipo de frota — se a tarefa deve ou não ser subida no sistema.",
    { x:0.5, y:2.02, w:5.5, h:1.2, fontSize:10, color:C.dk2, fontFace:FB }
  );

  // Objetivo
  s.addShape(pres.shapes.RECTANGLE, { x:6.45, y:1.62, w:3.25, h:1.7, fill:{color:C.orP}, line:{color:C.orB,width:1} });
  s.addShape(pres.shapes.RECTANGLE, { x:6.45, y:1.62, w:0.07, h:1.7, fill:{color:C.or}, line:{color:C.or,width:0} });
  s.addText("Objetivo deste documento", { x:6.62, y:1.7, w:2.95, h:0.28, fontSize:10, bold:true, color:C.or, fontFace:FB });
  [
    "Documentar o fluxo completo de lançamento",
    "Registrar a regra de decisão por tipo de frota",
    "Mapear atores e responsabilidades",
    "Servir como referência operacional do time",
  ].forEach(function(o, i) {
    s.addText("• "+o, { x:6.62, y:2.05+i*0.3, w:2.95, h:0.28, fontSize:9.5, color:C.dk2, fontFace:FB });
  });

  // Atores-chave (linha de baixo)
  s.addShape(pres.shapes.RECTANGLE, { x:0.3, y:3.5, w:9.4, h:1.65, fill:{color:C.wh}, line:{color:C.bdr,width:1}, shadow:makeShadow() });
  s.addText("Atores-chave do processo", { x:0.5, y:3.58, w:9.0, h:0.3, fontSize:11, bold:true, color:C.dk, fontFace:FB });
  [
    { nome:"Renato Henrique de Freitas", papel:"Envia a roteirização via e-mail (22h–00h)", cor:C.or },
    { nome:"Larissa Hieda",              papel:"Valida endereços não mapeados via Teams",   cor:C.dk2 },
    { nome:"Alex",                       papel:"Aprova rotas no grupo do 3º Turno",         cor:C.gn },
    { nome:"Analista MeuChapa",          papel:"Executa o processo e lança as tarefas",     cor:C.bl },
  ].forEach(function(a, i) {
    var cx = 0.5 + i*2.35;
    s.addShape(pres.shapes.RECTANGLE, { x:cx, y:3.95, w:0.07, h:0.98, fill:{color:a.cor}, line:{color:a.cor,width:0} });
    s.addText(a.nome, { x:cx+0.15, y:3.95, w:2.1, h:0.32, fontSize:9.5, bold:true, color:a.cor, fontFace:FB });
    s.addText(a.papel, { x:cx+0.15, y:4.27, w:2.1, h:0.62, fontSize:9, color:C.gy, fontFace:FB });
  });

  footer(s);
}

// ════════════════════════════════════════════════════════════════════════════
// SLIDE 3 — FLUXO MACRO (7 etapas)
// ════════════════════════════════════════════════════════════════════════════
{
  var s = pres.addSlide();
  s.background = { color: C.bg };
  topBar(s);
  logoSmall(s);
  slideTitle(s, "Fluxo Geral — Processo SEARA (AS-IS)", "Visão macro das 7 etapas do lançamento de tarefas logísticas");

  var steps = [
    { num:"1", label:"Receber\nRoteiriz.", sub:"E-mail SEARA",          time:"22h–00h" },
    { num:"2", label:"Filtrar\nTransport.", sub:"Framento apenas",       time:"5–10 min" },
    { num:"3", label:"Book\nLogístico",   sub:"MeuChapa export",        time:"5 min" },
    { num:"4", label:"Cara a\nCrachá",    sub:"Rota × Book",            time:"15–30 min" },
    { num:"5", label:"Regra de\nLançam.", sub:"Chapa/Própria/Mista",    time:"Imediato" },
    { num:"6", label:"Não\nMapeados",    sub:"Teams → Larissa",         time:"Variável" },
    { num:"7", label:"Finaliz.\ne Envio", sub:"Grupo 3º Turno",         time:"5–10 min" },
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

  // Nota total
  s.addShape(pres.shapes.RECTANGLE, { x:0.25, y:5.08, w:9.5, h:0.28, fill:{color:C.gyB}, line:{color:C.bdr,width:0.75} });
  s.addText("TOTAL ESTIMADO POR CICLO  •  30–50 min de trabalho ativo por roteirização  •  processo executado uma vez por noite (22h–01h)", { x:0.35, y:5.08, w:9.3, h:0.28, fontSize:8.5, bold:true, color:C.gy, fontFace:FB, align:"center", valign:"middle", margin:0 });

  footer(s);
}

// ════════════════════════════════════════════════════════════════════════════
// SLIDE 4 — ETAPAS 1–2: Recebimento + Filtragem
// ════════════════════════════════════════════════════════════════════════════
{
  var s = pres.addSlide();
  s.background = { color: C.bg };
  topBar(s);
  logoSmall(s);
  slideTitle(s, "Etapas 1–2: Recebimento da Roteirização e Filtragem", "Da chegada do e-mail à planilha limpa para análise");

  var rows = [
    { num:"1", title:"Receber a roteirização por e-mail",     tool:"E-mail corporativo", detail:"E-mail enviado diariamente por Renato Henrique de Freitas entre 22h e 00h." },
    { num:"2", title:"Baixar a planilha de roteirização",     tool:"Anexo do e-mail",    detail:"Fazer o download do arquivo de planilha anexado na mensagem." },
    { num:"3", title:"Abrir a planilha e aplicar filtro",     tool:"Excel / Sheets",     detail:"Filtrar a coluna de transportadoras — manter apenas as em atendimento (Framento)." },
    { num:"4", title:"Remover demais transportadoras",        tool:"Excel / Sheets",     detail:"Excluir da visão todas as linhas de rotas de outras transportadoras." },
  ];
  rows.forEach(function(r, i) {
    stepRow(s, r.num, r.title, r.tool, r.detail, 0.3, 1.65+i*0.82, 5.8, 0.75);
  });

  // Painel lateral
  s.addShape(pres.shapes.RECTANGLE, { x:6.35, y:1.62, w:3.35, h:3.3, fill:{color:C.wh}, line:{color:C.bdr,width:1}, shadow:makeShadow() });
  s.addShape(pres.shapes.RECTANGLE, { x:6.35, y:1.62, w:3.35, h:0.07, fill:{color:C.or}, line:{color:C.or,width:0} });
  s.addText("Detalhes do recebimento", { x:6.5, y:1.72, w:3.0, h:0.3, fontSize:10, bold:true, color:C.or, fontFace:FB });
  [
    { lbl:"Remetente", val:"Renato Henrique de Freitas" },
    { lbl:"Horário", val:"22h00 a 00h00" },
    { lbl:"Formato", val:"Planilha em anexo" },
    { lbl:"Transportadora ativa", val:"Framento" },
    { lbl:"Frequência", val:"Diária (dias úteis)" },
  ].forEach(function(item, i) {
    s.addText(item.lbl, { x:6.5, y:2.12+i*0.52, w:3.0, h:0.22, fontSize:8.5, bold:true, color:C.gy, fontFace:FB });
    s.addText(item.val, { x:6.5, y:2.34+i*0.52, w:3.0, h:0.22, fontSize:10.5, color:C.dk, fontFace:FB });
    if (i < 4) s.addShape(pres.shapes.RECTANGLE, { x:6.5, y:2.56+i*0.52, w:3.0, h:0.01, fill:{color:C.bdr}, line:{color:C.bdr,width:0} });
  });

  // Tempo
  timeChip(s, "5–15 min total das etapas 1–2", 0.3, 5.08, 5.8);
  footer(s);
}

// ════════════════════════════════════════════════════════════════════════════
// SLIDE 5 — ETAPAS 3–4: Book Logístico + Cara a Crachá
// ════════════════════════════════════════════════════════════════════════════
{
  var s = pres.addSlide();
  s.background = { color: C.bg };
  topBar(s);
  logoSmall(s);
  slideTitle(s, "Etapas 3–4: Book Logístico e Cara a Crachá", "Validação de endereços da roteirização contra a base de clientes mapeados");

  var rows = [
    { num:"3", title:"Acessar o Book Logístico do MeuChapa",       tool:"MeuChapa",       detail:"Entrar na plataforma e baixar a planilha de clientes logísticos mapeados." },
    { num:"4", title:"Baixar planilha de clientes mapeados",       tool:"Export MeuChapa", detail:"Salvar a planilha localmente para uso na comparação." },
    { num:"5", title:"Comparar rota × clientes mapeados",          tool:"Excel",           detail:"Para cada endereço da roteirização, verificar se está presente no Book Logístico." },
    { num:"6", title:"Separar endereços encontrados e não-encontrados", tool:"Excel",       detail:"Identificar e marcar quais endereços têm correspondência e quais não têm." },
  ];
  rows.forEach(function(r, i) {
    stepRow(s, r.num, r.title, r.tool, r.detail, 0.3, 1.65+i*0.82, 5.8, 0.75);
  });

  // Painel conceito Cara a Crachá
  s.addShape(pres.shapes.RECTANGLE, { x:6.35, y:1.62, w:3.35, h:3.3, fill:{color:C.orP}, line:{color:C.orB,width:1}, shadow:makeShadow() });
  s.addShape(pres.shapes.RECTANGLE, { x:6.35, y:1.62, w:3.35, h:0.07, fill:{color:C.or}, line:{color:C.or,width:0} });
  s.addText("O que é o \"Cara a Crachá\"?", { x:6.5, y:1.72, w:3.0, h:0.3, fontSize:10, bold:true, color:C.or, fontFace:FB });
  s.addText(
    "Expressão usada internamente para descrever a comparação linha a linha entre a roteirização recebida e os clientes presentes no Book Logístico.\n\n" +
    "Cada endereço da rota precisa ter um \"crachá\" — ou seja, precisa estar mapeado no sistema.\n\n" +
    "Sem mapeamento = não sobe a tarefa até validação.",
    { x:6.5, y:2.05, w:3.0, h:2.7, fontSize:9.5, color:C.dk2, fontFace:FB }
  );

  timeChip(s, "15–30 min (dependendo do volume da rota)", 0.3, 5.08, 5.8);
  footer(s);
}

// ════════════════════════════════════════════════════════════════════════════
// SLIDE 6 — ETAPA 5: REGRA DE LANÇAMENTO
// ════════════════════════════════════════════════════════════════════════════
{
  var s = pres.addSlide();
  s.background = { color: C.bg };
  topBar(s);
  logoSmall(s);
  slideTitle(s, "Etapa 5: Regra de Lançamento", "Decisão por tipo de frota — a regra mais crítica do processo");

  // Subtítulo explicativo
  s.addText("Para cada endereço validado no Book Logístico, o analista aplica a seguinte regra de decisão:", { x:0.3, y:1.65, w:9.4, h:0.35, fontSize:11, color:C.gy, fontFace:FB });

  // 3 Cards de decisão
  var cards = [
    {
      tipo: "CHAPA",
      acao: "SUBIR A TAREFA",
      desc: "A tarefa deve ser lançada no sistema MeuChapa normalmente. Segue o fluxo padrão de alocação.",
      bg: C.gnP, brd: C.gnB, acc: C.gn, icone: "✅",
    },
    {
      tipo: "PRÓPRIA",
      acao: "NÃO SUBIR",
      desc: "A empresa opera com frota própria. A tarefa não é do escopo MeuChapa e não deve ser lançada.",
      bg: C.rdP, brd: C.rdB, acc: C.rd, icone: "❌",
    },
    {
      tipo: "MISTA",
      acao: "NÃO SUBIR",
      desc: "Combinação de frota própria e terceirizada. Por padrão, não sobe até nova instrução.",
      bg: C.rdP, brd: C.rdB, acc: C.rd, icone: "❌",
    },
  ];

  cards.forEach(function(c, i) {
    var cx = 0.3 + i*3.2;
    s.addShape(pres.shapes.RECTANGLE, { x:cx, y:2.1, w:3.0, h:3.05, fill:{color:c.bg}, line:{color:c.brd,width:1.5}, shadow:makeShadow() });
    s.addShape(pres.shapes.RECTANGLE, { x:cx, y:2.1, w:3.0, h:0.08, fill:{color:c.acc}, line:{color:c.acc,width:0} });
    // Ícone
    s.addText(c.icone, { x:cx, y:2.22, w:3.0, h:0.6, fontSize:28, align:"center", fontFace:FB });
    // Tipo de frota
    s.addShape(pres.shapes.RECTANGLE, { x:cx+0.25, y:2.9, w:2.5, h:0.38, fill:{color:c.acc}, line:{color:c.acc,width:0} });
    s.addText(c.tipo, { x:cx+0.25, y:2.9, w:2.5, h:0.38, fontSize:16, bold:true, color:C.wh, fontFace:FH, align:"center", valign:"middle", margin:0 });
    // Ação
    s.addText(c.acao, { x:cx+0.1, y:3.38, w:2.8, h:0.35, fontSize:13, bold:true, color:c.acc, fontFace:FH, align:"center" });
    // Linha separadora
    s.addShape(pres.shapes.RECTANGLE, { x:cx+0.25, y:3.75, w:2.5, h:0.01, fill:{color:c.brd}, line:{color:c.brd,width:0} });
    // Descrição
    s.addText(c.desc, { x:cx+0.15, y:3.8, w:2.7, h:1.2, fontSize:9.5, color:C.dk2, fontFace:FB, align:"center" });
  });

  footer(s);
}

// ════════════════════════════════════════════════════════════════════════════
// SLIDE 7 — ETAPAS 6–7: Não Mapeados + Finalização
// ════════════════════════════════════════════════════════════════════════════
{
  var s = pres.addSlide();
  s.background = { color: C.bg };
  topBar(s);
  logoSmall(s);
  slideTitle(s, "Etapas 6–7: Endereços Não Mapeados e Finalização", "Da validação de exceções ao envio final das rotas aprovadas");

  var rows = [
    { num:"6a", title:"Separar endereços não encontrados no Book",   tool:"Excel",          detail:"Listar os endereços da roteirização que não têm correspondência no Book Logístico." },
    { num:"6b", title:"Enviar para Larissa Hieda via Teams",         tool:"Microsoft Teams", detail:"Encaminhar a lista de endereços não mapeados para validação com a Larissa." },
    { num:"6c", title:"Aguardar retorno e aplicar ajustes",          tool:"Microsoft Teams", detail:"Com base no retorno da Larissa, definir o que sobe ou não sobe." },
    { num:"7a", title:"Enviar placas e endereços no grupo 3º TURNO", tool:"Umbler Talk",     detail:"Compartilhar no grupo as informações de rota aprovadas para acompanhamento." },
    { num:"7b", title:"Aguardar validação final das rotas pelo Alex", tool:"Grupo Umbler",   detail:"Alex revisa e aprova as rotas no grupo. Após confirmação, o processo está concluído." },
  ];
  rows.forEach(function(r, i) {
    stepRow(s, r.num, r.title, r.tool, r.detail, 0.3, 1.65+i*0.68, 9.4, 0.62);
  });

  timeChip(s, "Variável — depende da velocidade de resposta de Larissa e Alex", 0.3, 5.09, 9.4);
  footer(s);
}

// ════════════════════════════════════════════════════════════════════════════
// SLIDE 8 — RESUMO E CONTATOS (dark)
// ════════════════════════════════════════════════════════════════════════════
{
  var s = pres.addSlide();
  s.background = { color: C.dk };
  s.addShape(pres.shapes.RECTANGLE, { x:0, y:0, w:0.55, h:5.625, fill:{color:C.or}, line:{color:C.or,width:0} });
  s.addShape(pres.shapes.RECTANGLE, { x:0, y:5.27, w:10, h:0.355, fill:{color:C.or}, line:{color:C.or,width:0} });

  s.addText("Resumo do\nProcesso SEARA", { x:0.78, y:0.3, w:6.5, h:1.4, fontSize:36, bold:true, color:C.wh, fontFace:FH });

  // Pontos principais
  var pontos = [
    "Roteirização recebida entre 22h–00h via e-mail de Renato Henrique.",
    "Filtrar apenas a transportadora Framento antes de qualquer análise.",
    "Validar cada endereço contra o Book Logístico (\"cara a crachá\").",
    "Regra de lançamento: CHAPA sobe • PRÓPRIA não sobe • MISTA não sobe.",
    "Endereços não mapeados: encaminhar para Larissa Hieda via Teams.",
    "Após ajustes: enviar placas e endereços no grupo 3º TURNO e aguardar Alex.",
  ];
  pontos.forEach(function(p, i) {
    s.addShape(pres.shapes.OVAL, { x:0.78, y:1.85+i*0.52, w:0.22, h:0.22, fill:{color:C.or}, line:{color:C.or,width:0} });
    s.addText(p, { x:1.1, y:1.82+i*0.52, w:5.7, h:0.3, fontSize:10.5, color:C.wh, fontFace:FB });
  });

  // Contatos-chave
  s.addShape(pres.shapes.RECTANGLE, { x:7.1, y:0.35, w:2.6, h:4.7, fill:{color:C.dk2}, line:{color:C.dk3,width:1} });
  s.addShape(pres.shapes.RECTANGLE, { x:7.1, y:0.35, w:2.6, h:0.07, fill:{color:C.or}, line:{color:C.or,width:0} });
  s.addText("Contatos-chave", { x:7.2, y:0.45, w:2.4, h:0.3, fontSize:10, bold:true, color:C.or, fontFace:FB, align:"center" });
  [
    { nome:"Renato Henrique", papel:"Roteirização SEARA", canal:"E-mail" },
    { nome:"Larissa Hieda",   papel:"Validação de endereços", canal:"Microsoft Teams" },
    { nome:"Alex",            papel:"Aprovação de rotas", canal:"Grupo Umbler" },
  ].forEach(function(c, i) {
    s.addText(c.nome, { x:7.2, y:0.92+i*1.35, w:2.4, h:0.3, fontSize:10, bold:true, color:C.wh, fontFace:FB, align:"center" });
    s.addText(c.papel, { x:7.2, y:1.24+i*1.35, w:2.4, h:0.28, fontSize:9, color:C.gyL, fontFace:FB, align:"center" });
    s.addShape(pres.shapes.RECTANGLE, { x:7.3, y:1.54+i*1.35, w:1.6, h:0.24, fill:{color:C.or}, line:{color:C.or,width:0} });
    s.addText(c.canal, { x:7.3, y:1.54+i*1.35, w:1.6, h:0.24, fontSize:9, bold:true, color:C.wh, fontFace:FB, align:"center", valign:"middle", margin:0 });
    if (i < 2) s.addShape(pres.shapes.RECTANGLE, { x:7.25, y:1.83+i*1.35, w:2.3, h:0.01, fill:{color:C.dk3}, line:{color:C.dk3,width:0} });
  });

  s.addText("Junho 2026  •  MeuChapa", { x:0.78, y:5.3, w:4, h:0.22, fontSize:9, color:C.gyL, fontFace:FB, margin:0 });
  s.addImage({ path:LOGO, x:8.3, y:5.28, w:1.4, h:0.49 });
}

// ─── Gerar arquivo ────────────────────────────────────────────────────────────
var outFile = path.resolve(__dirname, "../Mapeamento_SEARA_MeuChapa.pptx");
pres.writeFile({ fileName: outFile }).then(function() {
  console.log("Gerado: " + outFile);
}).catch(function(e) {
  console.error("Erro:", e.message);
});
