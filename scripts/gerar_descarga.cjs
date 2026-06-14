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
  am:  "F57F17",  amP: "FFFDE7",  amB: "FFF176",
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
function alertBox(s, titulo, texto, x, y, w, h) {
  s.addShape(pres.shapes.RECTANGLE, { x:x, y:y, w:w, h:h, fill:{color:C.amP}, line:{color:C.amB,width:1.5} });
  s.addShape(pres.shapes.RECTANGLE, { x:x, y:y, w:0.07, h:h, fill:{color:C.am}, line:{color:C.am,width:0} });
  s.addText("ATENÇÃO", { x:x+0.15, y:y+0.1, w:w-0.25, h:0.24, fontSize:7.5, bold:true, color:C.am, fontFace:FB, charSpacing:1.5 });
  s.addText(titulo, { x:x+0.15, y:y+0.34, w:w-0.25, h:0.28, fontSize:10.5, bold:true, color:C.dk, fontFace:FB });
  s.addText(texto, { x:x+0.15, y:y+0.62, w:w-0.25, h:h-0.72, fontSize:9, color:C.dk2, fontFace:FB });
}
function clienteHeader(s, nome, subtitulo, y) {
  s.addShape(pres.shapes.RECTANGLE, { x:0.3, y:y, w:9.4, h:0.42, fill:{color:C.dk2}, line:{color:C.dk2,width:0} });
  s.addShape(pres.shapes.RECTANGLE, { x:0.3, y:y, w:0.07, h:0.42, fill:{color:C.or}, line:{color:C.or,width:0} });
  s.addText(nome, { x:0.45, y:y+0.04, w:5.5, h:0.28, fontSize:13, bold:true, color:C.wh, fontFace:FH });
  if (subtitulo) s.addText(subtitulo, { x:6.2, y:y+0.08, w:3.4, h:0.28, fontSize:9, color:C.gyL, fontFace:FB, align:"right" });
}
function stepMini(s, num, texto, sx, sy, sw) {
  sw = sw || 4.4;
  var sh = 0.58;
  var isRed = num === "!";
  var col = isRed ? C.am : C.or;
  s.addShape(pres.shapes.RECTANGLE, { x:sx, y:sy, w:sw, h:sh, fill:{color:C.wh}, line:{color:C.bdr,width:1}, shadow:makeShadow() });
  s.addShape(pres.shapes.RECTANGLE, { x:sx, y:sy, w:0.05, h:sh, fill:{color:col}, line:{color:col,width:0} });
  s.addShape(pres.shapes.OVAL, { x:sx+0.1, y:sy+0.15, w:0.24, h:0.24, fill:{color:col}, line:{color:col,width:0} });
  s.addText(String(num), { x:sx+0.1, y:sy+0.15, w:0.24, h:0.24, fontSize:8, bold:true, color:C.wh, fontFace:FH, align:"center", valign:"middle", margin:0 });
  s.addText(texto, { x:sx+0.42, y:sy+0.1, w:sw-0.52, h:0.38, fontSize:9.5, color:C.dk, fontFace:FB, valign:"middle" });
}

// ─── Apresentação ────────────────────────────────────────────────────────────
var pres = new pptxgen();
pres.layout = "LAYOUT_16x9";
pres.title  = "Descarga com Chapa Indicado — Procedimentos por Cliente";

// ════════════════════════════════════════════════════════════════════════════
// SLIDE 1 — CAPA
// ════════════════════════════════════════════════════════════════════════════
{
  var s = pres.addSlide();
  s.background = { color: C.dk };
  s.addShape(pres.shapes.RECTANGLE, { x:0, y:0, w:0.55, h:5.625, fill:{color:C.or}, line:{color:C.or,width:0} });
  s.addShape(pres.shapes.RECTANGLE, { x:0, y:5.27, w:10, h:0.355, fill:{color:C.or}, line:{color:C.or,width:0} });
  s.addImage({ path:LOGO, x:0.78, y:0.35, w:2.1, h:0.74 });

  s.addShape(pres.shapes.RECTANGLE, { x:0.78, y:1.28, w:2.6, h:0.3, fill:{color:C.dk2}, line:{color:C.dk3,width:1} });
  s.addText("PROCEDIMENTO OPERACIONAL", { x:0.78, y:1.28, w:2.6, h:0.3, fontSize:8, bold:true, color:C.or, fontFace:FB, align:"center", valign:"middle", margin:0, charSpacing:0.8 });

  s.addText("Descarga com\nChapa Indicado", { x:0.78, y:1.72, w:7.2, h:2.3, fontSize:46, bold:true, color:C.wh, fontFace:FH });
  s.addText("Análise, Conferência e Alocação de Ajudantes por Cliente", { x:0.78, y:3.95, w:7.2, h:0.45, fontSize:13, color:C.gyL, fontFace:FB });

  s.addShape(pres.shapes.RECTANGLE, { x:0.78, y:4.52, w:3.4, h:0.38, fill:{color:C.am}, line:{color:C.am,width:0} });
  s.addText("PAGAMENTO NO MESMO DIA — ZERO DIVERGÊNCIA", { x:0.78, y:4.52, w:3.4, h:0.38, fontSize:9, bold:true, color:C.wh, fontFace:FB, align:"center", valign:"middle", margin:0 });

  s.addText("Junho 2026", { x:0.78, y:5.3, w:3, h:0.25, fontSize:9, bold:true, color:C.wh, fontFace:FB, margin:0 });

  // Stats panel direito
  s.addShape(pres.shapes.RECTANGLE, { x:7.6, y:1.1, w:2.1, h:4.0, fill:{color:C.dk2}, line:{color:C.dk2,width:0} });
  s.addShape(pres.shapes.RECTANGLE, { x:7.6, y:1.1, w:2.1, h:0.06, fill:{color:C.or}, line:{color:C.or,width:0} });
  [
    { val:"9",      lbl:"clientes mapeados" },
    { val:"4",      lbl:"dados obrigatórios" },
    { val:"2",      lbl:"fluxos distintos" },
    { val:"1",      lbl:"checklist universal" },
  ].forEach(function(st, i) {
    s.addText(st.val, { x:7.6, y:1.28+i*0.95, w:2.1, h:0.58, fontSize:28, bold:true, color:C.or, fontFace:FH, align:"center" });
    s.addText(st.lbl, { x:7.6, y:1.82+i*0.95, w:2.1, h:0.28, fontSize:9, color:C.gyL, fontFace:FB, align:"center" });
  });
}

// ════════════════════════════════════════════════════════════════════════════
// SLIDE 2 — INTRODUÇÃO E REGRA GERAL
// ════════════════════════════════════════════════════════════════════════════
{
  var s = pres.addSlide();
  s.background = { color: C.bg };
  topBar(s);
  logoSmall(s);
  slideTitle(s, "O que é Descarga com Chapa Indicado?", "Quando o próprio cliente informa quem deve ser alocado na tarefa");

  // Descrição
  s.addShape(pres.shapes.RECTANGLE, { x:0.3, y:1.62, w:5.9, h:1.5, fill:{color:C.wh}, line:{color:C.bdr,width:1}, shadow:makeShadow() });
  s.addShape(pres.shapes.RECTANGLE, { x:0.3, y:1.62, w:0.07, h:1.5, fill:{color:C.or}, line:{color:C.or,width:0} });
  s.addText("O que muda nesta modalidade?", { x:0.5, y:1.7, w:5.5, h:0.3, fontSize:11, bold:true, color:C.or, fontFace:FB });
  s.addText(
    "Nas tarefas de Descarga com Chapa Indicado, o cliente já define quem será o ajudante antes de a tarefa começar. " +
    "O analista não faz captação nem BID — sua função é verificar se o ajudante informado está correto no sistema e, quando necessário, criar a tarefa manualmente.",
    { x:0.5, y:2.0, w:5.5, h:1.05, fontSize:10, color:C.dk2, fontFace:FB }
  );

  // 4 dados obrigatórios
  s.addShape(pres.shapes.RECTANGLE, { x:6.45, y:1.62, w:3.25, h:1.5, fill:{color:C.orP}, line:{color:C.orB,width:1} });
  s.addShape(pres.shapes.RECTANGLE, { x:6.45, y:1.62, w:0.07, h:1.5, fill:{color:C.or}, line:{color:C.or,width:0} });
  s.addText("4 dados sempre verificar", { x:6.62, y:1.7, w:2.95, h:0.28, fontSize:10, bold:true, color:C.or, fontFace:FB });
  [
    "✓  Nome completo do ajudante",
    "✓  CPF ou telefone",
    "✓  Tipo de trabalho correto",
    "✓  Valor referente ao pagamento",
  ].forEach(function(o, i) {
    s.addText(o, { x:6.62, y:2.04+i*0.27, w:2.95, h:0.26, fontSize:10, color:C.dk2, fontFace:FB });
  });

  // Alerta de pagamento
  alertBox(s,
    "Pagamento realizado no mesmo dia",
    "Qualquer divergência de cadastro ou alocação incorreta pode gerar prejuízos financeiros e retrabalho operacional. Confirme sempre antes de finalizar.",
    0.3, 3.28, 9.4, 1.0
  );

  // 2 fluxos
  s.addShape(pres.shapes.RECTANGLE, { x:0.3, y:4.42, w:9.4, h:0.68, fill:{color:C.wh}, line:{color:C.bdr,width:1}, shadow:makeShadow() });
  s.addText("Fluxo A — Cliente lança a tarefa + informa ajudante:", { x:0.5, y:4.5, w:4.4, h:0.26, fontSize:10, bold:true, color:C.dk, fontFace:FB });
  s.addText("Conferir dados → Alocar ajudante correto → Finalizar", { x:0.5, y:4.76, w:4.4, h:0.26, fontSize:9.5, color:C.gy, fontFace:FB });
  s.addShape(pres.shapes.RECTANGLE, { x:4.9, y:4.5, w:0.01, h:0.52, fill:{color:C.bdr}, line:{color:C.bdr,width:0} });
  s.addText("Fluxo B — Analista cria a tarefa manualmente (CNPJ):", { x:5.05, y:4.5, w:4.4, h:0.26, fontSize:10, bold:true, color:C.dk, fontFace:FB });
  s.addText("Criar tarefa → Selecionar tipo → Vincular ajudante → Finalizar", { x:5.05, y:4.76, w:4.4, h:0.26, fontSize:9.5, color:C.gy, fontFace:FB });

  footer(s);
}

// ════════════════════════════════════════════════════════════════════════════
// SLIDE 3 — REVALLE AMBEV
// ════════════════════════════════════════════════════════════════════════════
{
  var s = pres.addSlide();
  s.background = { color: C.bg };
  topBar(s);
  logoSmall(s);
  slideTitle(s, "Revalle Ambev", "Procedimento de alocação de chapa indicado");

  clienteHeader(s, "REVALLE AMBEV", "Fluxo A — cliente lança + informa via grupo", 1.62);

  // Unidades
  s.addShape(pres.shapes.RECTANGLE, { x:0.3, y:2.14, w:3.5, h:3.05, fill:{color:C.wh}, line:{color:C.bdr,width:1}, shadow:makeShadow() });
  s.addShape(pres.shapes.RECTANGLE, { x:0.3, y:2.14, w:3.5, h:0.07, fill:{color:C.or}, line:{color:C.or,width:0} });
  s.addText("Unidades atendidas", { x:0.45, y:2.24, w:3.2, h:0.28, fontSize:10, bold:true, color:C.dk, fontFace:FB });
  ["Beira Rio", "Juazeiro", "Paulo Afonso", "Serrinha", "Alagoinhas", "Pombal", "Bonfim"].forEach(function(u, i) {
    s.addShape(pres.shapes.OVAL, { x:0.45, y:2.62+i*0.34, w:0.14, h:0.14, fill:{color:C.or}, line:{color:C.or,width:0} });
    s.addText(u, { x:0.66, y:2.58+i*0.34, w:2.9, h:0.28, fontSize:10, color:C.dk2, fontFace:FB });
  });

  // Procedimento
  s.addShape(pres.shapes.RECTANGLE, { x:3.98, y:2.14, w:5.72, h:3.05, fill:{color:C.wh}, line:{color:C.bdr,width:1}, shadow:makeShadow() });
  s.addShape(pres.shapes.RECTANGLE, { x:3.98, y:2.14, w:5.72, h:0.07, fill:{color:C.or}, line:{color:C.or,width:0} });
  s.addText("Procedimento", { x:4.13, y:2.24, w:5.4, h:0.28, fontSize:10, bold:true, color:C.dk, fontFace:FB });
  [
    "Cliente realiza o lançamento da tarefa (Diária e Alimentação).",
    "Cliente envia no grupo: Nome do ajudante + CPF ou telefone.",
    "Realizar a conferência dos dados no sistema.",
    "Alocar o ajudante correto na tarefa correspondente.",
  ].forEach(function(p, i) {
    stepMini(s, i+1, p, 4.13, 2.6+i*0.62, 5.4);
  });

  footer(s);
}

// ════════════════════════════════════════════════════════════════════════════
// SLIDE 4 — MANTIQUEIRA RIO + MANTIQUEIRA GUARULHOS
// ════════════════════════════════════════════════════════════════════════════
{
  var s = pres.addSlide();
  s.background = { color: C.bg };
  topBar(s);
  logoSmall(s);
  slideTitle(s, "Mantiqueira Rio e Mantiqueira Guarulhos", "Mesma rede, procedimentos distintos para cada unidade");

  // MANTIQUEIRA RIO
  clienteHeader(s, "MANTIQUEIRA RIO", "Fluxo A — cliente lança + envia planilha Excel", 1.62);
  [
    "Cliente lança a tarefa no sistema.",
    "Cliente envia planilha Excel com os ajudantes que devem ser vinculados.",
    "Conferir se o ajudante alocado é exatamente o mesmo da planilha.",
    "Validar todos os nomes da planilha antes de concluir a análise.",
  ].forEach(function(p, i) {
    stepMini(s, i+1, p, 0.3, 2.14+i*0.64, 9.4);
  });

  // Referência a Mantiqueira Guarulhos (slide dedicado)
  s.addShape(pres.shapes.RECTANGLE, { x:0.3, y:4.82, w:9.4, h:0.42, fill:{color:C.orP}, line:{color:C.orB,width:1} });
  s.addShape(pres.shapes.RECTANGLE, { x:0.3, y:4.82, w:0.07, h:0.42, fill:{color:C.or}, line:{color:C.or,width:0} });
  s.addText("MANTIQUEIRA GUARULHOS — procedimento detalhado no slide seguinte", { x:0.45, y:4.82, w:9.1, h:0.42, fontSize:10, bold:true, color:C.or, fontFace:FB, valign:"middle" });

  footer(s);
}

// ════════════════════════════════════════════════════════════════════════════
// SLIDE 5 — DUNAS (dois fluxos)
// ════════════════════════════════════════════════════════════════════════════
{
  var s = pres.addSlide();
  s.background = { color: C.bg };
  topBar(s);
  logoSmall(s);
  slideTitle(s, "Dunas", "Dois fluxos distintos por unidade — atenção ao procedimento de cada cidade");

  // Unidades
  s.addShape(pres.shapes.RECTANGLE, { x:0.3, y:1.62, w:9.4, h:0.38, fill:{color:C.gyB}, line:{color:C.bdr,width:0.75} });
  s.addText("Unidades:  Aracati  •  Quixeramobim  •  Tauá", { x:0.45, y:1.62, w:9.1, h:0.38, fontSize:10.5, bold:true, color:C.dk, fontFace:FB, valign:"middle" });

  // FLUXO A — Aracati
  s.addShape(pres.shapes.RECTANGLE, { x:0.3, y:2.1, w:4.55, h:2.94, fill:{color:C.wh}, line:{color:C.bdr,width:1}, shadow:makeShadow() });
  s.addShape(pres.shapes.RECTANGLE, { x:0.3, y:2.1, w:4.55, h:0.07, fill:{color:C.or}, line:{color:C.or,width:0} });
  s.addText("ARACATI — Fluxo A", { x:0.45, y:2.18, w:4.2, h:0.3, fontSize:11, bold:true, color:C.dk, fontFace:FB });
  [
    "Cliente lança as tarefas no sistema.",
    "Cliente envia planilha com os ajudantes indicados.",
    "Conferir e vincular os ajudantes conforme informado.",
  ].forEach(function(p, i) {
    stepMini(s, i+1, p, 0.42, 2.56+i*0.72, 4.3);
  });

  // FLUXO B — Quixeramobim e Tauá
  s.addShape(pres.shapes.RECTANGLE, { x:5.15, y:2.1, w:4.55, h:2.94, fill:{color:C.wh}, line:{color:C.bdr,width:1}, shadow:makeShadow() });
  s.addShape(pres.shapes.RECTANGLE, { x:5.15, y:2.1, w:4.55, h:0.07, fill:{color:C.am}, line:{color:C.am,width:0} });
  s.addText("QUIXERAMOBIM / TAUÁ — Fluxo B", { x:5.3, y:2.18, w:4.2, h:0.3, fontSize:11, bold:true, color:C.dk, fontFace:FB });
  [
    "Cliente envia planilha com os ajudantes.",
    "Analista cria a tarefa manualmente usando o CNPJ informado.",
    "Selecionar obrigatoriamente o tipo de trabalho: Descarga.",
    "Vincular os ajudantes conforme a planilha recebida.",
  ].forEach(function(p, i) {
    stepMini(s, i < 1 ? i+1 : (i === 1 ? "!" : i+1), p, 5.27, 2.56+i*0.72, 4.3);
  });

  s.addShape(pres.shapes.RECTANGLE, { x:5.27, y:2.56+1*0.72, w:4.3, h:0.58, fill:{color:C.amP}, line:{color:C.amB,width:1}, shadow:makeShadow() });
  s.addShape(pres.shapes.RECTANGLE, { x:5.27, y:2.56+1*0.72, w:0.05, h:0.58, fill:{color:C.am}, line:{color:C.am,width:0} });
  s.addShape(pres.shapes.OVAL, { x:5.37, y:2.56+1*0.72+0.17, w:0.24, h:0.24, fill:{color:C.am}, line:{color:C.am,width:0} });
  s.addText("!", { x:5.37, y:2.56+1*0.72+0.17, w:0.24, h:0.24, fontSize:8, bold:true, color:C.wh, fontFace:FH, align:"center", valign:"middle", margin:0 });
  s.addText("Analista cria a tarefa manualmente usando o CNPJ informado.", { x:5.68, y:2.56+1*0.72+0.1, w:3.8, h:0.38, fontSize:9.5, color:C.am, fontFace:FB, bold:true, valign:"middle" });

  // Re-add steps B mais limpos
  [
    "Cliente envia planilha com os ajudantes.",
    "Selecionar obrigatoriamente o tipo de trabalho: Descarga.",
    "Vincular os ajudantes conforme a planilha recebida.",
  ].forEach(function(p, i) {
    var yy = i === 0 ? 2.56 : 2.56+1*0.72+0.72+i*0.0;
    if (i === 0) stepMini(s, 1, p, 5.27, 2.56, 4.3);
    if (i === 1) stepMini(s, 3, p, 5.27, 2.56+1.44, 4.3);
    if (i === 2) stepMini(s, 4, p, 5.27, 2.56+1.44+0.66, 4.3);
  });

  footer(s);
}

// ════════════════════════════════════════════════════════════════════════════
// SLIDE 6 — OQC + RFK BEVERAGE
// ════════════════════════════════════════════════════════════════════════════
{
  var s = pres.addSlide();
  s.background = { color: C.bg };
  topBar(s);
  logoSmall(s);
  slideTitle(s, "OQC e RFK Beverage", "Procedimentos de conferência e finalização de chapa indicado");

  // OQC
  clienteHeader(s, "OQC", "Fluxo A — dados na descrição + recibo exigido", 1.62);
  [
    "Cliente lança a tarefa no sistema.",
    "Os dados do ajudante estão presentes no corpo da tarefa.",
    "Realizar a conferência dos dados.",
    "Finalizar a tarefa e solicitar aprovação.",
    "Enviar o recibo juntamente com o ID da tarefa no grupo do cliente.",
  ].forEach(function(p, i) {
    stepMini(s, i+1, p, 0.3, 2.14+i*0.58, 9.4);
  });

  // Linha divisória
  s.addShape(pres.shapes.RECTANGLE, { x:0.3, y:5.06, w:9.4, h:0.02, fill:{color:C.bdr}, line:{color:C.bdr,width:0} });

  // RFK — Como não há espaço para um segundo bloco completo, adicionamos como nota
  s.addShape(pres.shapes.RECTANGLE, { x:0.3, y:5.11, w:9.4, h:0.28, fill:{color:C.orP}, line:{color:C.orB,width:0.75} });
  s.addText("RFK BEVERAGE — Fluxo A idêntico ao OQC: cliente lança → dados na descrição → conferir → finalizar (sem exigência de recibo).", { x:0.45, y:5.11, w:9.1, h:0.28, fontSize:9, color:C.dk2, fontFace:FB, valign:"middle" });

  footer(s);
}

// ════════════════════════════════════════════════════════════════════════════
// SLIDE 7 — NUTRIEN (atenção especial)
// ════════════════════════════════════════════════════════════════════════════
{
  var s = pres.addSlide();
  s.background = { color: C.bg };
  topBar(s);
  logoSmall(s);
  slideTitle(s, "Nutrien", "Atenção especial — tipo de trabalho obrigatório e markup de recálculo");

  clienteHeader(s, "NUTRIEN", "Fluxo A com atenção especial no tipo de trabalho e markup", 1.62);

  // Alerta (altura aumentada para o texto caber)
  alertBox(s,
    "Tipo de trabalho OBRIGATÓRIO: \"Descarga com Chapa Indicado\"",
    "Se o tipo de trabalho estiver incorreto, alterar para \"Descarga com Chapa Indicado\" e recalcular o markup: Valor × 1,24",
    0.3, 2.14, 9.4, 1.05
  );

  // Procedimento — 2 colunas: passos 1–3 à esquerda, 4–6 à direita
  var n7steps = [
    { num:1, txt:"Cliente lança a tarefa no sistema.",                                                              at:false },
    { num:2, txt:"Os dados do ajudante estão presentes na descrição da tarefa.",                                    at:false },
    { num:3, txt:"Verificar o tipo de trabalho — deve ser obrigatoriamente \"Descarga com Chapa Indicado\".",       at:true  },
    { num:4, txt:"Se incorreto: alterar o tipo de trabalho e recalcular o markup (Valor × 1,24).",                  at:true  },
    { num:5, txt:"Solicitar a lista de presença no grupo do cliente.",                                              at:false },
    { num:6, txt:"Anexar a lista de presença na tarefa antes de finalizar.",                                        at:false },
  ];
  var n7L = 0.3, n7R = 5.15, n7W = 4.55;
  function drawStep7(r, i, sx, sw) {
    var sy = 3.27+i*0.62, sh = 0.56;
    var col = r.at ? C.am : C.or;
    var bg  = r.at ? C.amP : C.wh;
    var brd = r.at ? C.amB : C.bdr;
    s.addShape(pres.shapes.RECTANGLE, { x:sx, y:sy, w:sw, h:sh, fill:{color:bg}, line:{color:brd,width:1}, shadow:makeShadow() });
    s.addShape(pres.shapes.RECTANGLE, { x:sx, y:sy, w:0.05, h:sh, fill:{color:col}, line:{color:col,width:0} });
    s.addShape(pres.shapes.OVAL, { x:sx+0.1, y:sy+0.16, w:0.24, h:0.24, fill:{color:col}, line:{color:col,width:0} });
    s.addText(String(r.num), { x:sx+0.1, y:sy+0.16, w:0.24, h:0.24, fontSize:8, bold:true, color:C.wh, fontFace:FH, align:"center", valign:"middle", margin:0 });
    s.addText(r.txt, { x:sx+0.42, y:sy+0.08, w:sw-0.52, h:0.40, fontSize:9, color:r.at ? C.am : C.dk, fontFace:FB, bold:r.at, valign:"middle" });
  }
  n7steps.slice(0, 3).forEach(function(r, i) { drawStep7(r, i, n7L, n7W); });
  n7steps.slice(3).forEach(function(r, i)    { drawStep7(r, i, n7R, n7W); });

  // Fórmula markup — chip de destaque na base
  s.addShape(pres.shapes.RECTANGLE, { x:0.3, y:5.15, w:9.4, h:0.22, fill:{color:C.dk2}, line:{color:C.dk3,width:0} });
  s.addText("Markup:  Valor × 1,24  —  aplicar sempre que o tipo de trabalho for corrigido", { x:0.3, y:5.15, w:9.4, h:0.22, fontSize:9.5, bold:true, color:C.or, fontFace:FH, align:"center", valign:"middle", margin:0 });

  footer(s);
}

// ════════════════════════════════════════════════════════════════════════════
// SLIDE 8 — TRÊS CORAÇÕES + BATERIAS MOURA
// ════════════════════════════════════════════════════════════════════════════
{
  var s = pres.addSlide();
  s.background = { color: C.bg };
  topBar(s);
  logoSmall(s);
  slideTitle(s, "Três Corações e Baterias Moura", "Fluxo padrão — dados na descrição ou via grupo do cliente");

  // ── Duas colunas: TRÊS CORAÇÕES (esquerda) | BATERIAS MOURA (direita) ──
  var cL = 0.3;   // x coluna esquerda
  var cR = 5.15;  // x coluna direita
  var cW = 4.55;  // largura de cada coluna

  // Cabeçalhos
  function miniHeader(s, nome, sub, cx, cw) {
    s.addShape(pres.shapes.RECTANGLE, { x:cx, y:1.62, w:cw, h:0.42, fill:{color:C.dk2}, line:{color:C.dk2,width:0} });
    s.addShape(pres.shapes.RECTANGLE, { x:cx, y:1.62, w:0.07, h:0.42, fill:{color:C.or}, line:{color:C.or,width:0} });
    s.addText(nome, { x:cx+0.15, y:1.65, w:cw-0.2, h:0.28, fontSize:11, bold:true, color:C.wh, fontFace:FH });
    if (sub) s.addText(sub, { x:cx+0.15, y:1.88, w:cw-0.2, h:0.18, fontSize:8, color:C.gyL, fontFace:FB });
  }
  miniHeader(s, "TRÊS CORAÇÕES", "Fluxo A — dados na descrição da tarefa", cL, cW);
  miniHeader(s, "BATERIAS MOURA", "Moura Juazeiro/BA — ajudante via grupo", cR, cW);

  // Passos TRÊS CORAÇÕES
  [
    "Cliente lança a tarefa.",
    "Os dados do ajudante estão disponíveis no corpo da tarefa.",
    "Conferir os dados e finalizar a análise.",
  ].forEach(function(p, i) {
    stepMini(s, i+1, p, cL, 2.14+i*0.78, cW);
  });

  // Passos BATERIAS MOURA
  [
    "Cliente lança a tarefa no sistema.",
    "Cliente informa no grupo o ajudante referente à tarefa.",
    "Validar os dados e realizar a alocação correta.",
  ].forEach(function(p, i) {
    stepMini(s, i+1, p, cR, 2.14+i*0.78, cW);
  });

  footer(s);
}

// ════════════════════════════════════════════════════════════════════════════
// SLIDE 9 — MANTIQUEIRA GUARULHOS (slide dedicado) + CHECKLIST
// (Re-adicionamos Guarulhos aqui para o slide 4 não ficar sobrecarregado)
// ════════════════════════════════════════════════════════════════════════════
{
  var s = pres.addSlide();
  s.background = { color: C.bg };
  topBar(s);
  logoSmall(s);
  slideTitle(s, "Mantiqueira Guarulhos", "Procedimento de chapa indicado — dados na descrição da tarefa");

  clienteHeader(s, "MANTIQUEIRA GUARULHOS", "Fluxo A — cliente lança + dados na descrição", 1.62);
  [
    "Cliente lança a tarefa no sistema.",
    "Os dados do ajudante estão presentes na descrição da tarefa.",
    "Conferir os dados com atenção.",
    "Finalizar a análise após validação completa.",
  ].forEach(function(p, i) {
    stepMini(s, i+1, p, 0.3, 2.14+i*0.66, 9.4);
  });

  // Nota de alerta
  s.addShape(pres.shapes.RECTANGLE, { x:0.3, y:4.8, w:9.4, h:0.52, fill:{color:C.orP}, line:{color:C.orB,width:1} });
  s.addShape(pres.shapes.RECTANGLE, { x:0.3, y:4.8, w:0.07, h:0.52, fill:{color:C.or}, line:{color:C.or,width:0} });
  s.addText("Sempre validar os nomes informados na planilha/descrição antes de concluir — qualquer divergência pode resultar em pagamento incorreto no mesmo dia.", { x:0.45, y:4.87, w:9.1, h:0.38, fontSize:9.5, color:C.dk2, fontFace:FB, valign:"middle" });

  footer(s);
}

// ════════════════════════════════════════════════════════════════════════════
// SLIDE 10 — CHECKLIST FINAL DO ANALISTA (dark)
// ════════════════════════════════════════════════════════════════════════════
{
  var s = pres.addSlide();
  s.background = { color: C.dk };
  s.addShape(pres.shapes.RECTANGLE, { x:0, y:0, w:0.55, h:5.625, fill:{color:C.or}, line:{color:C.or,width:0} });
  s.addShape(pres.shapes.RECTANGLE, { x:0, y:5.27, w:10, h:0.355, fill:{color:C.or}, line:{color:C.or,width:0} });

  s.addText("Checklist Final\ndo Analista", { x:0.78, y:0.25, w:5.5, h:1.35, fontSize:36, bold:true, color:C.wh, fontFace:FH });
  s.addText("Validar antes de concluir qualquer tarefa de Descarga com Chapa Indicado", { x:0.78, y:1.62, w:5.5, h:0.35, fontSize:10.5, color:C.gyL, fontFace:FB });

  // Checklist — 2 colunas
  var items = [
    "Nome do ajudante correto",
    "CPF ou telefone correspondente",
    "Tipo de trabalho correto",
    "Valor correto",
    "Documentos anexados quando exigido",
    "Aprovação solicitada quando aplicável",
    "Recibo enviado ao cliente quando necessário",
    "Ausência de divergências entre sistema e informações do cliente",
  ];
  var col1 = items.slice(0, 4);
  var col2 = items.slice(4);

  col1.forEach(function(item, i) {
    s.addShape(pres.shapes.RECTANGLE, { x:0.78, y:2.08+i*0.72, w:4.3, h:0.6, fill:{color:C.dk2}, line:{color:C.dk3,width:1} });
    s.addShape(pres.shapes.RECTANGLE, { x:0.78, y:2.08+i*0.72, w:0.07, h:0.6, fill:{color:C.gn}, line:{color:C.gn,width:0} });
    s.addText("✓", { x:0.88, y:2.08+i*0.72, w:0.3, h:0.6, fontSize:14, bold:true, color:C.gn, fontFace:FB, valign:"middle", margin:0 });
    s.addText(item, { x:1.25, y:2.08+i*0.72, w:3.7, h:0.6, fontSize:10, color:C.wh, fontFace:FB, valign:"middle" });
  });
  col2.forEach(function(item, i) {
    s.addShape(pres.shapes.RECTANGLE, { x:5.38, y:2.08+i*0.72, w:4.3, h:0.6, fill:{color:C.dk2}, line:{color:C.dk3,width:1} });
    s.addShape(pres.shapes.RECTANGLE, { x:5.38, y:2.08+i*0.72, w:0.07, h:0.6, fill:{color:C.gn}, line:{color:C.gn,width:0} });
    s.addText("✓", { x:5.48, y:2.08+i*0.72, w:0.3, h:0.6, fontSize:14, bold:true, color:C.gn, fontFace:FB, valign:"middle", margin:0 });
    s.addText(item, { x:5.85, y:2.08+i*0.72, w:3.7, h:0.6, fontSize:10, color:C.wh, fontFace:FB, valign:"middle" });
  });

  s.addText("Junho 2026  •  MeuChapa", { x:0.78, y:5.3, w:4, h:0.22, fontSize:9, color:C.gyL, fontFace:FB, margin:0 });
  s.addImage({ path:LOGO, x:8.3, y:5.28, w:1.4, h:0.49 });
}

// ─── Gerar arquivo ────────────────────────────────────────────────────────────
var outFile = path.resolve(__dirname, "../Mapeamento_Descarga_MeuChapa.pptx");
pres.writeFile({ fileName: outFile }).then(function() {
  console.log("Gerado: " + outFile);
}).catch(function(e) {
  console.error("Erro:", e.message);
});
