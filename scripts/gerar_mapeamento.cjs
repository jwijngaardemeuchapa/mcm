"use strict";
const pptxgen = require("pptxgenjs");
const path = require("path");

// ─── Paleta MeuChapa ──────────────────────────────────────────────────────────
const C = {
  or:   "FF6600",   // laranja principal
  or2:  "FF8833",   // laranja médio
  orP:  "FFF0E6",   // laranja pálido (fundo de chip)
  orB:  "FFE0CC",   // laranja mais saturado para borda
  dk:   "1A1A1A",   // preto/carvão
  dk2:  "2D2D2D",   // carvão médio
  dk3:  "3D3D3D",   // carvão claro
  wh:   "FFFFFF",   // branco
  bg:   "F8F7F5",   // fundo quente off-white
  bdr:  "E5E0D8",   // borda sutil
  gy:   "666666",   // texto cinza
  gyL:  "999999",   // cinza claro
  gyB:  "F2F1EF",   // bg cinza claro
  rd:   "D32F2F",   // vermelho (dor)
  rdP:  "FFF3F3",   // vermelho pálido
  rdB:  "FFCDD2",   // vermelho borda
  gn:   "2E7D32",   // verde (ganho)
  gnP:  "F1FFF4",   // verde pálido
  gnB:  "C8E6C9",   // verde borda
};
const FH = "Arial Black";
const FB = "Calibri";
const LOGO = path.resolve(__dirname, "../src/assets/logo-meuchapa.png");

// ─── Helpers ──────────────────────────────────────────────────────────────────
const makeShadow = () => ({
  type: "outer", color: "000000", blur: 8, offset: 3, angle: 135, opacity: 0.08,
});

function topBar(s, pres, color = C.or) {
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 0, w: 10, h: 0.07,
    fill: { color }, line: { color, width: 0 },
  });
}

function logoSmall(s) {
  s.addImage({ path: LOGO, x: 0.3, y: 0.18, w: 1.3, h: 0.45 });
}

function slideTitle(s, title, subtitle) {
  s.addText(title, {
    x: 0.3, y: 0.75, w: 9.4, h: 0.55,
    fontSize: 24, bold: true, color: C.dk, fontFace: FH,
  });
  if (subtitle) {
    s.addText(subtitle, {
      x: 0.3, y: 1.3, w: 9.4, h: 0.3,
      fontSize: 10.5, color: C.gy, fontFace: FB,
    });
  }
}

function timeChip(s, pres, text, x, y, w = 1.6) {
  s.addShape(pres.shapes.RECTANGLE, {
    x, y, w, h: 0.28,
    fill: { color: C.orP }, line: { color: C.or, width: 0.75 },
  });
  s.addText("⏱  " + text, {
    x, y, w, h: 0.28,
    fontSize: 8.5, bold: true, color: C.or, fontFace: FB,
    align: "center", valign: "middle", margin: 0,
  });
}

function painBox(s, pres, lines, x, y, w, h) {
  s.addShape(pres.shapes.RECTANGLE, {
    x, y, w, h,
    fill: { color: C.rdP }, line: { color: C.rdB, width: 1 },
  });
  s.addShape(pres.shapes.RECTANGLE, {
    x, y, w: 0.06, h,
    fill: { color: C.rd }, line: { color: C.rd, width: 0 },
  });
  s.addText("GARGALO", {
    x: x + 0.12, y: y + 0.1, w: w - 0.2, h: 0.25,
    fontSize: 7.5, bold: true, color: C.rd, fontFace: FB, charSpacing: 1.5,
  });
  s.addText(lines, {
    x: x + 0.12, y: y + 0.35, w: w - 0.2, h: h - 0.45,
    fontSize: 9.5, color: C.dk2, fontFace: FB, align: "left", valign: "top",
  });
}

function gainBox(s, pres, lines, x, y, w, h) {
  s.addShape(pres.shapes.RECTANGLE, {
    x, y, w, h,
    fill: { color: C.gnP }, line: { color: C.gnB, width: 1 },
  });
  s.addShape(pres.shapes.RECTANGLE, {
    x, y, w: 0.06, h,
    fill: { color: C.gn }, line: { color: C.gn, width: 0 },
  });
  s.addText("MELHORIA", {
    x: x + 0.12, y: y + 0.1, w: w - 0.2, h: 0.25,
    fontSize: 7.5, bold: true, color: C.gn, fontFace: FB, charSpacing: 1.5,
  });
  s.addText(lines, {
    x: x + 0.12, y: y + 0.35, w: w - 0.2, h: h - 0.45,
    fontSize: 9.5, color: C.dk2, fontFace: FB, align: "left", valign: "top",
  });
}

function stepCard(s, pres, { num, title, tools, detail }, x, y, w = 4.5, h = 1.8) {
  s.addShape(pres.shapes.RECTANGLE, {
    x, y, w, h,
    fill: { color: C.wh }, line: { color: C.bdr, width: 1 },
    shadow: makeShadow(),
  });
  // Left orange bar
  s.addShape(pres.shapes.RECTANGLE, {
    x, y, w: 0.07, h,
    fill: { color: C.or }, line: { color: C.or, width: 0 },
  });
  // Step number circle
  s.addShape(pres.shapes.OVAL, {
    x: x + 0.15, y: y + 0.12, w: 0.42, h: 0.42,
    fill: { color: C.or }, line: { color: C.or, width: 0 },
  });
  s.addText(String(num), {
    x: x + 0.15, y: y + 0.12, w: 0.42, h: 0.42,
    fontSize: 13, bold: true, color: C.wh, fontFace: FH,
    align: "center", valign: "middle", margin: 0,
  });
  s.addText(title, {
    x: x + 0.65, y: y + 0.1, w: w - 0.75, h: 0.45,
    fontSize: 12, bold: true, color: C.dk, fontFace: FB,
  });
  if (tools) {
    s.addText(tools, {
      x: x + 0.65, y: y + 0.52, w: w - 0.75, h: 0.25,
      fontSize: 8.5, color: C.or, fontFace: FB, bold: true,
    });
  }
  if (detail) {
    s.addText(detail, {
      x: x + 0.15, y: y + 0.8, w: w - 0.25, h: h - 0.85,
      fontSize: 9.5, color: C.gy, fontFace: FB, align: "left", valign: "top",
    });
  }
}

// ─── Apresentação ─────────────────────────────────────────────────────────────
const pres = new pptxgen();
pres.layout = "LAYOUT_16x9"; // 10" × 5.625"
pres.title = "Mapeamento de Processo FUP — MeuChapa";

// ══════════════════════════════════════════════════════════════════════════════
// SLIDE 1 — CAPA
// ══════════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.dk };

  // Barra laranja esquerda
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 0, w: 0.55, h: 5.625,
    fill: { color: C.or }, line: { color: C.or, width: 0 },
  });

  // Barra laranja rodapé
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 5.27, w: 10, h: 0.355,
    fill: { color: C.or }, line: { color: C.or, width: 0 },
  });

  // Logo
  s.addImage({ path: LOGO, x: 0.78, y: 0.38, w: 2.1, h: 0.74 });

  // Tag AS-IS × TO-BE
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.78, y: 1.3, w: 2.0, h: 0.3,
    fill: { color: C.or }, line: { color: C.or, width: 0 },
  });
  s.addText("AS-IS  ×  TO-BE", {
    x: 0.78, y: 1.3, w: 2.0, h: 0.3,
    fontSize: 9, bold: true, color: C.wh, fontFace: FB,
    align: "center", valign: "middle", margin: 0, charSpacing: 1,
  });

  // Título principal
  s.addText("Mapeamento de\nProcesso FUP", {
    x: 0.78, y: 1.72, w: 7.5, h: 2.3,
    fontSize: 52, bold: true, color: C.wh, fontFace: FH,
    align: "left", valign: "top",
  });

  // Subtítulo
  s.addText("Follow-Up de Chapas — Fluxo Operacional do Analista", {
    x: 0.78, y: 3.95, w: 7.2, h: 0.45,
    fontSize: 13, color: C.gyL, fontFace: FB, align: "left",
  });

  // Data
  s.addText("Junho 2026", {
    x: 0.78, y: 5.3, w: 3, h: 0.28,
    fontSize: 9, bold: true, color: C.wh, fontFace: FB, margin: 0,
  });

  // Painel de stats (direita)
  s.addShape(pres.shapes.RECTANGLE, {
    x: 7.6, y: 1.1, w: 2.1, h: 4.0,
    fill: { color: C.dk2 }, line: { color: C.dk2, width: 0 },
  });
  s.addShape(pres.shapes.RECTANGLE, {
    x: 7.6, y: 1.1, w: 2.1, h: 0.06,
    fill: { color: C.or }, line: { color: C.or, width: 0 },
  });

  const stats = [
    { val: "+160K", lbl: "chapas cadastrados" },
    { val: "27",    lbl: "estados atendidos" },
    { val: "+400",  lbl: "clientes ativos" },
    { val: "+12MM", lbl: "tarefas conectadas" },
  ];
  stats.forEach((st, i) => {
    const sy = 1.3 + i * 0.95;
    s.addText(st.val, {
      x: 7.6, y: sy, w: 2.1, h: 0.6,
      fontSize: 26, bold: true, color: C.or, fontFace: FH, align: "center",
    });
    s.addText(st.lbl, {
      x: 7.6, y: sy + 0.58, w: 2.1, h: 0.28,
      fontSize: 9, color: C.gyL, fontFace: FB, align: "center",
    });
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// SLIDE 2 — CONTEXTO
// ══════════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.bg };
  topBar(s, pres);
  logoSmall(s);
  slideTitle(s, "O que é o processo de FUP?", "Follow-Up de presença de chapas antes do início de cada tarefa operacional");

  // Box de definição
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.3, y: 1.65, w: 5.9, h: 1.45,
    fill: { color: C.wh }, line: { color: C.bdr, width: 1 },
    shadow: makeShadow(),
  });
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.3, y: 1.65, w: 0.07, h: 1.45,
    fill: { color: C.or }, line: { color: C.or, width: 0 },
  });
  s.addText("O que é o FUP?", {
    x: 0.5, y: 1.72, w: 5.5, h: 0.3,
    fontSize: 11, bold: true, color: C.or, fontFace: FB,
  });
  s.addText(
    "O Follow-Up é o processo de confirmar a presença dos chapas (ajudantes) antes do início de cada tarefa operacional — cargas, descargas e movimentações logísticas. " +
    "É executado diariamente pelo analista, em paralelo com dezenas de tarefas simultâneas, envolvendo comunicação ativa com chapas, clientes e o time de BID.",
    {
      x: 0.5, y: 2.05, w: 5.6, h: 0.9,
      fontSize: 10.5, color: C.dk2, fontFace: FB, align: "left",
    }
  );

  // Box objetivo
  s.addShape(pres.shapes.RECTANGLE, {
    x: 6.45, y: 1.65, w: 3.25, h: 1.45,
    fill: { color: C.orP }, line: { color: C.orB, width: 1 },
  });
  s.addShape(pres.shapes.RECTANGLE, {
    x: 6.45, y: 1.65, w: 0.07, h: 1.45,
    fill: { color: C.or }, line: { color: C.or, width: 0 },
  });
  s.addText("Objetivo deste documento", {
    x: 6.62, y: 1.72, w: 2.95, h: 0.28,
    fontSize: 10, bold: true, color: C.or, fontFace: FB,
  });
  const objetivos = [
    "Documentar o processo atual (AS-IS)",
    "Mapear as melhorias implementadas (TO-BE)",
    "Estimar ganhos de tempo por etapa",
    "Subsidiar processualização do time",
  ];
  objetivos.forEach((o, i) => {
    s.addText("• " + o, {
      x: 6.62, y: 2.06 + i * 0.23, w: 2.95, h: 0.22,
      fontSize: 9.5, color: C.dk2, fontFace: FB,
    });
  });

  // Stats cards
  const stats = [
    { val: "+160K", lbl: "chapas cadastrados", c: C.or },
    { val: "27",    lbl: "estados atendidos",  c: C.dk },
    { val: "+400",  lbl: "clientes ativos",    c: C.or },
    { val: "+12MM", lbl: "tarefas conectadas", c: C.dk },
  ];
  const sw = 2.2;
  stats.forEach((st, i) => {
    const sx = 0.3 + i * (sw + 0.1);
    s.addShape(pres.shapes.RECTANGLE, {
      x: sx, y: 3.28, w: sw, h: 1.95,
      fill: { color: C.wh }, line: { color: C.bdr, width: 1 },
      shadow: makeShadow(),
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x: sx, y: 3.28, w: sw, h: 0.07,
      fill: { color: st.c }, line: { color: st.c, width: 0 },
    });
    s.addText(st.val, {
      x: sx, y: 3.45, w: sw, h: 0.9,
      fontSize: 36, bold: true, color: st.c, fontFace: FH, align: "center",
    });
    s.addText(st.lbl, {
      x: sx, y: 4.35, w: sw, h: 0.65,
      fontSize: 10.5, color: C.gy, fontFace: FB, align: "center",
    });
  });

  // Rodapé
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 5.44, w: 10, h: 0.185,
    fill: { color: C.bdr }, line: { color: C.bdr, width: 0 },
  });
  s.addImage({ path: LOGO, x: 8.4, y: 5.45, w: 1.25, h: 0.44 });
}

// ══════════════════════════════════════════════════════════════════════════════
// SLIDE 3 — SEÇÃO AS-IS
// ══════════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.or };

  s.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 0, w: 0.55, h: 5.625,
    fill: { color: C.dk }, line: { color: C.dk, width: 0 },
  });
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 5.27, w: 10, h: 0.355,
    fill: { color: C.dk }, line: { color: C.dk, width: 0 },
  });

  s.addText("Processo\nAtual", {
    x: 0.78, y: 0.65, w: 8.5, h: 2.8,
    fontSize: 70, bold: true, color: C.wh, fontFace: FH, align: "left",
  });

  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.78, y: 3.6, w: 1.5, h: 0.07,
    fill: { color: C.dk }, line: { color: C.dk, width: 0 },
  });

  s.addText("AS-IS", {
    x: 0.78, y: 3.75, w: 4, h: 0.55,
    fontSize: 22, bold: true, color: C.dk, fontFace: FH,
  });
  s.addText("Como funciona hoje — sem o FUP Manager", {
    x: 0.78, y: 4.3, w: 6.5, h: 0.35,
    fontSize: 14, color: C.dk2, fontFace: FB,
  });

  s.addImage({ path: LOGO, x: 8.3, y: 5.28, w: 1.4, h: 0.49 });
}

// ══════════════════════════════════════════════════════════════════════════════
// SLIDE 4 — AS-IS MACRO TIMELINE
// ══════════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.bg };
  topBar(s, pres);
  logoSmall(s);
  slideTitle(s, "Fluxo Geral — Processo Atual (AS-IS)", "Visão macro do dia operacional do analista de FUP");

  const steps = [
    { num: "1", label: "Abertura\ndo Dashboard",  sub: "MeuChapa online",         time: "5–10 min" },
    { num: "2", label: "Extração\nde Dados",       sub: "CTRL+C/V → Excel",        time: "20–30 min" },
    { num: "3", label: "Disparo\nde FUP",          sub: "CSV → Umbler",            time: "10–20 min/tarefa" },
    { num: "4", label: "Monitoramento\nde Respostas", sub: "Excel + 3C + WhatsApp", time: "60–120 min" },
    { num: "5", label: "Validação\nde Presença",   sub: "Grupos do cliente",       time: "15–20 min" },
    { num: "6", label: "Acompanhamento\nContínuo", sub: "Grupos + Metabase",       time: "Dia todo" },
  ];

  const n = steps.length;
  const cardW = 1.48;
  const gap = 0.07;
  const startX = 0.25;
  const circY = 1.75;
  const cR = 0.37;
  const cardY = 2.72;
  const cardH = 2.0;

  // Linha de conexão
  s.addShape(pres.shapes.RECTANGLE, {
    x: startX + cR, y: circY + cR - 0.04,
    w: n * (cardW + gap) - gap - cR * 2,
    h: 0.07,
    fill: { color: C.bdr }, line: { color: C.bdr, width: 0 },
  });

  steps.forEach((st, i) => {
    const sx = startX + i * (cardW + gap);
    const cx = sx + cardW / 2 - 0.02;

    // Círculo numerado
    s.addShape(pres.shapes.OVAL, {
      x: cx - cR, y: circY, w: cR * 2, h: cR * 2,
      fill: { color: C.or }, line: { color: C.wh, width: 2 },
    });
    s.addText(st.num, {
      x: cx - cR, y: circY, w: cR * 2, h: cR * 2,
      fontSize: 16, bold: true, color: C.wh, fontFace: FH,
      align: "center", valign: "middle", margin: 0,
    });

    // Card
    s.addShape(pres.shapes.RECTANGLE, {
      x: sx, y: cardY, w: cardW, h: cardH,
      fill: { color: C.wh }, line: { color: C.bdr, width: 1 },
      shadow: makeShadow(),
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x: sx, y: cardY, w: cardW, h: 0.06,
      fill: { color: C.or }, line: { color: C.or, width: 0 },
    });
    s.addText(st.label, {
      x: sx + 0.07, y: cardY + 0.1, w: cardW - 0.14, h: 0.8,
      fontSize: 10, bold: true, color: C.dk, fontFace: FB, align: "center",
    });
    s.addText(st.sub, {
      x: sx + 0.07, y: cardY + 0.92, w: cardW - 0.14, h: 0.45,
      fontSize: 8.5, color: C.gy, fontFace: FB, align: "center",
    });

    // Time chip
    s.addShape(pres.shapes.RECTANGLE, {
      x: sx + 0.1, y: cardY + 1.48, w: cardW - 0.2, h: 0.3,
      fill: { color: C.orP }, line: { color: C.or, width: 0.75 },
    });
    s.addText("⏱  " + st.time, {
      x: sx + 0.1, y: cardY + 1.48, w: cardW - 0.2, h: 0.3,
      fontSize: 8, bold: true, color: C.or, fontFace: FB,
      align: "center", valign: "middle", margin: 0,
    });
  });

  // Rodapé total
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 5.14, w: 10, h: 0.485,
    fill: { color: C.dk }, line: { color: C.dk, width: 0 },
  });
  s.addText("TOTAL ESTIMADO POR DIA  •  3 a 5 horas de trabalho ativo de FUP  •  dezenas de tarefas simultâneas", {
    x: 0.3, y: 5.14, w: 9.4, h: 0.485,
    fontSize: 10.5, bold: true, color: C.wh, fontFace: FB,
    align: "center", valign: "middle", margin: 0, charSpacing: 0.5,
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// SLIDE 5 — AS-IS DETALHE: LEVANTAMENTO E EXTRAÇÃO (ETAPAS 1–2)
// ══════════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.bg };
  topBar(s, pres);
  logoSmall(s);

  s.addText("Etapas 1–2: Abertura e Extração de Dados", {
    x: 0.3, y: 0.75, w: 9.4, h: 0.5,
    fontSize: 22, bold: true, color: C.dk, fontFace: FH,
  });

  // Badge
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.3, y: 1.3, w: 1.2, h: 0.26,
    fill: { color: C.orP }, line: { color: C.or, width: 1 },
  });
  s.addText("AS-IS", {
    x: 0.3, y: 1.3, w: 1.2, h: 0.26,
    fontSize: 8.5, bold: true, color: C.or, fontFace: FB,
    align: "center", valign: "middle", margin: 0, charSpacing: 1.5,
  });

  // Steps lado esquerdo
  const steps1 = [
    { n: "1", t: "Abrir MeuChapa Online", tool: "Navegador web", d: 'Verificar tarefas com status "Em Aberto" e "Aguardando Início" no dashboard.' },
    { n: "2", t: "Identificar chapas por tarefa", tool: "Dashboard MeuChapa", d: "Localizar nomes, telefones e quantidades de cada tarefa — uma a uma." },
    { n: "3", t: "Copiar dados manualmente", tool: "CTRL+C / CTRL+V", d: "Transferir nomes e telefones para planilha Excel. Processo repetido para cada chapa de cada tarefa." },
    { n: "4", t: "Organizar planilha", tool: "Microsoft Excel", d: "Criar colunas: Nome | Telefone | Status FUP. Limpar hyperlinks residuais do dashboard." },
    { n: "5", t: "Exportar como CSV", tool: "Excel → Salvar como", d: "Gerar arquivo CSV formatado para importação na Umbler." },
  ];

  const stepH = 0.73;
  const stepStartY = 1.65;
  steps1.forEach((st, i) => {
    const sy = stepStartY + i * (stepH + 0.06);
    s.addShape(pres.shapes.RECTANGLE, {
      x: 0.3, y: sy, w: 5.8, h: stepH,
      fill: { color: C.wh }, line: { color: C.bdr, width: 1 },
      shadow: { type: "outer", color: "000000", blur: 4, offset: 2, angle: 135, opacity: 0.05 },
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x: 0.3, y: sy, w: 0.06, h: stepH,
      fill: { color: C.or }, line: { color: C.or, width: 0 },
    });
    // Número
    s.addShape(pres.shapes.OVAL, {
      x: 0.45, y: sy + 0.14, w: 0.34, h: 0.34,
      fill: { color: C.or }, line: { color: C.or, width: 0 },
    });
    s.addText(st.n, {
      x: 0.45, y: sy + 0.14, w: 0.34, h: 0.34,
      fontSize: 10, bold: true, color: C.wh, fontFace: FH,
      align: "center", valign: "middle", margin: 0,
    });
    s.addText(st.t, {
      x: 0.87, y: sy + 0.08, w: 3.5, h: 0.3,
      fontSize: 10.5, bold: true, color: C.dk, fontFace: FB,
    });
    // Tool tag
    s.addShape(pres.shapes.RECTANGLE, {
      x: 0.87, y: sy + 0.38, w: 1.45, h: 0.2,
      fill: { color: C.orP }, line: { color: C.orB, width: 0.5 },
    });
    s.addText(st.tool, {
      x: 0.87, y: sy + 0.38, w: 1.45, h: 0.2,
      fontSize: 7.5, bold: true, color: C.or, fontFace: FB,
      align: "center", valign: "middle", margin: 0,
    });
    s.addText(st.d, {
      x: 2.4, y: sy + 0.34, w: 3.6, h: 0.33,
      fontSize: 8.5, color: C.gy, fontFace: FB,
    });
  });

  // Coluna direita
  painBox(s, pres,
    "Extração 100% manual via CTRL+C por chapa. Com dezenas de tarefas simultâneas, o risco de omitir algum chapa ou tarefa é alto. Não há confirmação visual de completude.",
    6.35, 1.65, 3.3, 1.5
  );

  timeChip(s, pres, "20–30 min por manhã", 6.35, 3.3, 3.3);

  s.addShape(pres.shapes.RECTANGLE, {
    x: 6.35, y: 3.72, w: 3.3, h: 1.55,
    fill: { color: C.wh }, line: { color: C.bdr, width: 1 },
    shadow: makeShadow(),
  });
  s.addText("Fluxo de dados", {
    x: 6.5, y: 3.8, w: 3.0, h: 0.3,
    fontSize: 9, bold: true, color: C.dk, fontFace: FB,
  });
  const fluxo = ["MeuChapa Dashboard", "↓  CTRL+C / CTRL+V", "Excel (planilha manual)", "↓  Limpar hyperlinks", "Exportar .CSV"];
  fluxo.forEach((f, i) => {
    const isArrow = f.startsWith("↓");
    s.addText(f, {
      x: 6.5, y: 4.12 + i * 0.22, w: 3.0, h: 0.22,
      fontSize: isArrow ? 9 : 10, color: isArrow ? C.gyL : C.dk2,
      fontFace: FB, bold: !isArrow,
    });
  });

  // Rodapé
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 5.44, w: 10, h: 0.185,
    fill: { color: C.bdr }, line: { color: C.bdr, width: 0 },
  });
  s.addImage({ path: LOGO, x: 8.4, y: 5.45, w: 1.25, h: 0.44 });
}

// ══════════════════════════════════════════════════════════════════════════════
// SLIDE 6 — AS-IS DETALHE: DISPARO DE FUP (ETAPA 3)
// ══════════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.bg };
  topBar(s, pres);
  logoSmall(s);

  s.addText("Etapa 3: Disparo do FUP via Umbler", {
    x: 0.3, y: 0.75, w: 9.4, h: 0.5,
    fontSize: 22, bold: true, color: C.dk, fontFace: FH,
  });
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.3, y: 1.3, w: 1.2, h: 0.26,
    fill: { color: C.orP }, line: { color: C.or, width: 1 },
  });
  s.addText("AS-IS", {
    x: 0.3, y: 1.3, w: 1.2, h: 0.26,
    fontSize: 8.5, bold: true, color: C.or, fontFace: FB,
    align: "center", valign: "middle", margin: 0, charSpacing: 1.5,
  });

  const steps2 = [
    { n: "1", t: "Abrir Umbler Talk", tool: "Navegador / App", d: "Acessar a plataforma de disparos de campanha WhatsApp." },
    { n: "2", t: "Criar nova campanha", tool: "Umbler Talk", d: "Uma campanha separada por tarefa (empresa + horário)." },
    { n: "3", t: "Preencher dados da tarefa", tool: "Manual", d: "Empresa, horário de início, endereço, quantidade de chapas — digitado manualmente." },
    { n: "4", t: "Importar CSV com contatos", tool: "Arquivo CSV", d: "Fazer upload do arquivo gerado no Excel com os chapas da tarefa." },
    { n: "5", t: "Configurar mensagem FUP", tool: "Template Umbler", d: "Selecionar ou ajustar o template de mensagem de confirmação de presença." },
    { n: "6", t: "Disparar e aguardar", tool: "Umbler Talk", d: "Iniciar campanha e monitorar as primeiras respostas chegando." },
  ];

  const stepH = 0.64;
  const stepStartY = 1.65;
  steps2.forEach((st, i) => {
    const sy = stepStartY + i * (stepH + 0.06);
    s.addShape(pres.shapes.RECTANGLE, {
      x: 0.3, y: sy, w: 5.8, h: stepH,
      fill: { color: C.wh }, line: { color: C.bdr, width: 1 },
      shadow: { type: "outer", color: "000000", blur: 4, offset: 2, angle: 135, opacity: 0.05 },
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x: 0.3, y: sy, w: 0.06, h: stepH,
      fill: { color: C.or }, line: { color: C.or, width: 0 },
    });
    s.addShape(pres.shapes.OVAL, {
      x: 0.45, y: sy + 0.12, w: 0.32, h: 0.32,
      fill: { color: C.or }, line: { color: C.or, width: 0 },
    });
    s.addText(st.n, {
      x: 0.45, y: sy + 0.12, w: 0.32, h: 0.32,
      fontSize: 10, bold: true, color: C.wh, fontFace: FH,
      align: "center", valign: "middle", margin: 0,
    });
    s.addText(st.t, {
      x: 0.85, y: sy + 0.06, w: 3.5, h: 0.28,
      fontSize: 10.5, bold: true, color: C.dk, fontFace: FB,
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x: 0.85, y: sy + 0.34, w: 1.35, h: 0.19,
      fill: { color: C.orP }, line: { color: C.orB, width: 0.5 },
    });
    s.addText(st.tool, {
      x: 0.85, y: sy + 0.34, w: 1.35, h: 0.19,
      fontSize: 7.5, bold: true, color: C.or, fontFace: FB,
      align: "center", valign: "middle", margin: 0,
    });
    s.addText(st.d, {
      x: 2.28, y: sy + 0.32, w: 3.72, h: 0.28,
      fontSize: 8.5, color: C.gy, fontFace: FB,
    });
  });

  // Coluna direita
  painBox(s, pres,
    "O processo é repetido manualmente para cada tarefa do dia. Com múltiplas empresas e horários diferentes, pode haver 5 a 15 campanhas criadas por dia, cada uma exigindo preenchimento completo e upload de CSV individual.",
    6.35, 1.65, 3.3, 1.8
  );
  timeChip(s, pres, "10–20 min por tarefa", 6.35, 3.6, 3.3);

  s.addShape(pres.shapes.RECTANGLE, {
    x: 6.35, y: 4.0, w: 3.3, h: 1.15,
    fill: { color: C.wh }, line: { color: C.bdr, width: 1 },
    shadow: makeShadow(),
  });
  s.addText("Exemplo de carga por dia:", {
    x: 6.5, y: 4.08, w: 3.0, h: 0.28,
    fontSize: 9, bold: true, color: C.dk, fontFace: FB,
  });
  s.addText("5 a 15 campanhas disparadas\npor dia de trabalho", {
    x: 6.5, y: 4.38, w: 3.0, h: 0.6,
    fontSize: 13, bold: true, color: C.or, fontFace: FH, align: "center",
  });

  s.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 5.44, w: 10, h: 0.185,
    fill: { color: C.bdr }, line: { color: C.bdr, width: 0 },
  });
  s.addImage({ path: LOGO, x: 8.4, y: 5.45, w: 1.25, h: 0.44 });
}

// ══════════════════════════════════════════════════════════════════════════════
// SLIDE 7 — AS-IS DETALHE: MONITORAMENTO E GESTÃO (ETAPA 4)
// ══════════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.bg };
  topBar(s, pres);
  logoSmall(s);

  s.addText("Etapa 4: Monitoramento de Respostas e Gestão de Ausências", {
    x: 0.3, y: 0.75, w: 9.4, h: 0.5,
    fontSize: 20, bold: true, color: C.dk, fontFace: FH,
  });
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.3, y: 1.28, w: 1.2, h: 0.26,
    fill: { color: C.orP }, line: { color: C.or, width: 1 },
  });
  s.addText("AS-IS", {
    x: 0.3, y: 1.28, w: 1.2, h: 0.26,
    fontSize: 8.5, bold: true, color: C.or, fontFace: FB,
    align: "center", valign: "middle", margin: 0, charSpacing: 1.5,
  });

  const steps3 = [
    { n: "1", t: "Monitorar respostas na Umbler", tool: "Umbler Talk", d: "Acompanhar mensagens recebidas de cada campanha em tempo real." },
    { n: "2", t: "Registrar status no Excel", tool: "Excel (manual)", d: 'Digitar "Confirmado", "Cancelado" ou aguardar em coluna de controle.' },
    { n: "3", t: "Gerir cancelamentos", tool: "WhatsApp + MeuChapa", d: "Perguntar motivo → acionar BID → verificar prazo com cliente → criar ocorrência." },
    { n: "4", t: "Abrir aba por tarefa", tool: "Navegador", d: "Manter abas nomeadas com empresa + horário para controle visual simultâneo." },
    { n: "5", t: "Contato ativo ~1h antes", tool: "Plataforma 3C", d: "Ligar para chapas sem retorno. Se não atender, remover da tarefa." },
  ];

  const stepH = 0.67;
  steps3.forEach((st, i) => {
    const sy = 1.65 + i * (stepH + 0.07);
    s.addShape(pres.shapes.RECTANGLE, {
      x: 0.3, y: sy, w: 5.8, h: stepH,
      fill: { color: C.wh }, line: { color: C.bdr, width: 1 },
      shadow: { type: "outer", color: "000000", blur: 4, offset: 2, angle: 135, opacity: 0.05 },
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x: 0.3, y: sy, w: 0.06, h: stepH,
      fill: { color: C.or }, line: { color: C.or, width: 0 },
    });
    s.addShape(pres.shapes.OVAL, {
      x: 0.45, y: sy + 0.14, w: 0.32, h: 0.32,
      fill: { color: C.or }, line: { color: C.or, width: 0 },
    });
    s.addText(st.n, {
      x: 0.45, y: sy + 0.14, w: 0.32, h: 0.32,
      fontSize: 10, bold: true, color: C.wh, fontFace: FH,
      align: "center", valign: "middle", margin: 0,
    });
    s.addText(st.t, {
      x: 0.85, y: sy + 0.07, w: 3.5, h: 0.28,
      fontSize: 10.5, bold: true, color: C.dk, fontFace: FB,
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x: 0.85, y: sy + 0.37, w: 1.35, h: 0.19,
      fill: { color: C.orP }, line: { color: C.orB, width: 0.5 },
    });
    s.addText(st.tool, {
      x: 0.85, y: sy + 0.37, w: 1.35, h: 0.19,
      fontSize: 7.5, bold: true, color: C.or, fontFace: FB,
      align: "center", valign: "middle", margin: 0,
    });
    s.addText(st.d, {
      x: 2.28, y: sy + 0.34, w: 3.72, h: 0.3,
      fontSize: 8.5, color: C.gy, fontFace: FB,
    });
  });

  painBox(s, pres,
    "O principal gargalo: não há como saber em tempo real há quanto tempo cada chapa foi tentado. Com dezenas de tarefas simultâneas, o controle manual no Excel torna difícil saber quem já foi contatado, quando, e o que falta fazer.",
    6.35, 1.65, 3.3, 1.95
  );
  timeChip(s, pres, "60–120 min (contínuo)", 6.35, 3.75, 3.3);

  s.addShape(pres.shapes.RECTANGLE, {
    x: 6.35, y: 4.15, w: 3.3, h: 1.0,
    fill: { color: C.wh }, line: { color: C.bdr, width: 1 },
    shadow: makeShadow(),
  });
  s.addText("Ferramentas em uso simultâneo:", {
    x: 6.5, y: 4.22, w: 3.0, h: 0.28,
    fontSize: 9, bold: true, color: C.dk, fontFace: FB,
  });
  ["Umbler Talk", "Excel", "WhatsApp Web", "MeuChapa", "Plataforma 3C"].forEach((t, i) => {
    s.addText("• " + t, {
      x: 6.5, y: 4.52 + i * 0.13, w: 3.0, h: 0.13,
      fontSize: 8.5, color: C.gy, fontFace: FB,
    });
  });

  s.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 5.44, w: 10, h: 0.185,
    fill: { color: C.bdr }, line: { color: C.bdr, width: 0 },
  });
  s.addImage({ path: LOGO, x: 8.4, y: 5.45, w: 1.25, h: 0.44 });
}

// ══════════════════════════════════════════════════════════════════════════════
// SLIDE 8 — AS-IS DETALHE: VALIDAÇÃO E HISTÓRICO (ETAPAS 5–6)
// ══════════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.bg };
  topBar(s, pres);
  logoSmall(s);

  s.addText("Etapas 5–6: Validação de Presença e Acompanhamento Contínuo", {
    x: 0.3, y: 0.75, w: 9.4, h: 0.5,
    fontSize: 19, bold: true, color: C.dk, fontFace: FH,
  });
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.3, y: 1.28, w: 1.2, h: 0.26,
    fill: { color: C.orP }, line: { color: C.or, width: 1 },
  });
  s.addText("AS-IS", {
    x: 0.3, y: 1.28, w: 1.2, h: 0.26,
    fontSize: 8.5, bold: true, color: C.or, fontFace: FB,
    align: "center", valign: "middle", margin: 0, charSpacing: 1.5,
  });

  const steps4 = [
    { n: "1", t: "Questionar presença no grupo do cliente", tool: "WhatsApp", d: "Perguntar ao responsável quais chapas estão fisicamente no local no horário de início." },
    { n: "2", t: "Remover ausentes e atualizar status", tool: "MeuChapa", d: 'Remover chapas ausentes da tarefa. Passar para "Em Andamento" apenas com validados.' },
    { n: "3", t: "Monitorar grupos continuamente", tool: "WhatsApp (múltiplos grupos)", d: "Validações tardias, horas extras, comprovantes de pagamento, chapas não alocados." },
    { n: "4", t: "Atender solicitações de chapas", tool: "WhatsApp direto", d: "Ajudantes das empresas que acompanhamos fazem solicitações diretas em paralelo." },
    { n: "5", t: "Consulta histórica de presença", tool: "Metabase", d: "Metabase → Ativação → Tabela FUP → Filtros. Cada página carrega em 5–10 segundos." },
  ];

  const stepH = 0.67;
  steps4.forEach((st, i) => {
    const sy = 1.65 + i * (stepH + 0.07);
    s.addShape(pres.shapes.RECTANGLE, {
      x: 0.3, y: sy, w: 5.8, h: stepH,
      fill: { color: C.wh }, line: { color: C.bdr, width: 1 },
      shadow: { type: "outer", color: "000000", blur: 4, offset: 2, angle: 135, opacity: 0.05 },
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x: 0.3, y: sy, w: 0.06, h: stepH,
      fill: { color: C.or }, line: { color: C.or, width: 0 },
    });
    s.addShape(pres.shapes.OVAL, {
      x: 0.45, y: sy + 0.14, w: 0.32, h: 0.32,
      fill: { color: C.or }, line: { color: C.or, width: 0 },
    });
    s.addText(st.n, {
      x: 0.45, y: sy + 0.14, w: 0.32, h: 0.32,
      fontSize: 10, bold: true, color: C.wh, fontFace: FH,
      align: "center", valign: "middle", margin: 0,
    });
    s.addText(st.t, {
      x: 0.85, y: sy + 0.07, w: 3.5, h: 0.28,
      fontSize: 10.5, bold: true, color: C.dk, fontFace: FB,
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x: 0.85, y: sy + 0.37, w: 1.7, h: 0.19,
      fill: { color: C.orP }, line: { color: C.orB, width: 0.5 },
    });
    s.addText(st.tool, {
      x: 0.85, y: sy + 0.37, w: 1.7, h: 0.19,
      fontSize: 7.5, bold: true, color: C.or, fontFace: FB,
      align: "center", valign: "middle", margin: 0,
    });
    s.addText(st.d, {
      x: 2.63, y: sy + 0.34, w: 3.37, h: 0.3,
      fontSize: 8.5, color: C.gy, fontFace: FB,
    });
  });

  painBox(s, pres,
    "Consultas históricas exigem navegação em múltiplas telas no Metabase com 5–10s de carregamento por página. O acompanhamento dos grupos de clientes exige atenção constante e ininterrupta ao longo de todo o dia.",
    6.35, 1.65, 3.3, 1.95
  );
  timeChip(s, pres, "15–20 min + dia todo", 6.35, 3.75, 3.3);

  s.addShape(pres.shapes.RECTANGLE, {
    x: 6.35, y: 4.15, w: 3.3, h: 1.0,
    fill: { color: C.rdP }, line: { color: C.rdB, width: 1 },
  });
  s.addText("Consulta histórica (Metabase):", {
    x: 6.5, y: 4.22, w: 3.0, h: 0.28,
    fontSize: 9, bold: true, color: C.rd, fontFace: FB,
  });
  s.addText("Metabase → Ativação de Chapas\n→ Tabela FUP → Filtros\n→ 5–10s por página carregada", {
    x: 6.5, y: 4.52, w: 3.0, h: 0.55,
    fontSize: 9, color: C.dk2, fontFace: FB,
  });

  s.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 5.44, w: 10, h: 0.185,
    fill: { color: C.bdr }, line: { color: C.bdr, width: 0 },
  });
  s.addImage({ path: LOGO, x: 8.4, y: 5.45, w: 1.25, h: 0.44 });
}

// ══════════════════════════════════════════════════════════════════════════════
// SLIDE 9 — GARGALOS DO PROCESSO ATUAL
// ══════════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.dk };

  s.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 0, w: 10, h: 0.07,
    fill: { color: C.or }, line: { color: C.or, width: 0 },
  });
  s.addImage({ path: LOGO, x: 0.3, y: 0.18, w: 1.3, h: 0.45 });

  s.addText("Principais Gargalos do Processo Atual", {
    x: 0.3, y: 0.75, w: 9.4, h: 0.5,
    fontSize: 22, bold: true, color: C.wh, fontFace: FH,
  });
  s.addText("6 pontos críticos que impactam a eficiência e a qualidade do FUP diário", {
    x: 0.3, y: 1.28, w: 9.4, h: 0.28,
    fontSize: 10.5, color: C.gyL, fontFace: FB,
  });

  const pains = [
    { n: "01", t: "Extração Manual",      d: "CTRL+C de nomes e telefones um a um. Risco de omissão e erro com múltiplas tarefas." },
    { n: "02", t: "Controle em Planilha", d: "Status digitado manualmente no Excel. Sem histórico automático nem rastreabilidade centralizada." },
    { n: "03", t: "Dezenas de Abas",      d: "Uma aba de navegador por tarefa para controle visual. Difícil gerenciar sem perder contexto." },
    { n: "04", t: "Sem Cronômetro",       d: "Impossível saber em tempo real há quanto tempo uma tentativa de contato foi feita por chapa." },
    { n: "05", t: "Consulta Lenta",       d: "Histórico via Metabase carrega em 5–10 segundos por página. Prejudica consultas urgentes." },
    { n: "06", t: "Paralelo Constante",   d: "BID, grupos de clientes, solicitações de chapas — tudo simultâneo sem centralização de contexto." },
  ];

  const cw = 2.9, ch = 1.52, gap = 0.13;
  const row1Y = 1.7, row2Y = 3.36;
  [0, 1, 2].forEach(i => {
    const sx = 0.3 + i * (cw + gap);
    [row1Y, row2Y].forEach((ry, ri) => {
      const p = pains[ri * 3 + i];
      s.addShape(pres.shapes.RECTANGLE, {
        x: sx, y: ry, w: cw, h: ch,
        fill: { color: C.dk2 }, line: { color: C.dk3, width: 1 },
      });
      // Top orange bar
      s.addShape(pres.shapes.RECTANGLE, {
        x: sx, y: ry, w: cw, h: 0.06,
        fill: { color: C.or }, line: { color: C.or, width: 0 },
      });
      s.addText(p.n, {
        x: sx + 0.15, y: ry + 0.12, w: 0.5, h: 0.45,
        fontSize: 20, bold: true, color: C.or, fontFace: FH,
      });
      s.addText(p.t, {
        x: sx + 0.15, y: ry + 0.55, w: cw - 0.25, h: 0.3,
        fontSize: 11, bold: true, color: C.wh, fontFace: FB,
      });
      s.addText(p.d, {
        x: sx + 0.15, y: ry + 0.88, w: cw - 0.25, h: 0.55,
        fontSize: 9, color: C.gyL, fontFace: FB,
      });
    });
  });

  s.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 5.44, w: 10, h: 0.185,
    fill: { color: C.or }, line: { color: C.or, width: 0 },
  });
  s.addImage({ path: LOGO, x: 8.4, y: 5.45, w: 1.25, h: 0.44 });
}

// ══════════════════════════════════════════════════════════════════════════════
// SLIDE 10 — SEÇÃO TO-BE
// ══════════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.or };

  s.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 0, w: 0.55, h: 5.625,
    fill: { color: C.dk }, line: { color: C.dk, width: 0 },
  });
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 5.27, w: 10, h: 0.355,
    fill: { color: C.dk }, line: { color: C.dk, width: 0 },
  });

  s.addText("Processo\nImplementado", {
    x: 0.78, y: 0.5, w: 8.5, h: 3.1,
    fontSize: 60, bold: true, color: C.wh, fontFace: FH, align: "left",
  });

  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.78, y: 3.75, w: 1.5, h: 0.07,
    fill: { color: C.dk }, line: { color: C.dk, width: 0 },
  });

  s.addText("TO-BE", {
    x: 0.78, y: 3.9, w: 4, h: 0.55,
    fontSize: 22, bold: true, color: C.dk, fontFace: FH,
  });
  s.addText("Como o FUP Manager transforma cada etapa do processo", {
    x: 0.78, y: 4.45, w: 7.5, h: 0.35,
    fontSize: 14, color: C.dk2, fontFace: FB,
  });

  s.addImage({ path: LOGO, x: 8.3, y: 5.28, w: 1.4, h: 0.49 });
}

// ══════════════════════════════════════════════════════════════════════════════
// SLIDE 11 — TO-BE MACRO TIMELINE
// ══════════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.bg };
  topBar(s, pres);
  logoSmall(s);
  slideTitle(s, "Fluxo Geral — Processo Implementado (TO-BE)", "Como o FUP Manager transforma o dia operacional do analista");

  const steps = [
    { num: "1", label: "Dashboard\nLocal",     sub: "FUP Manager",           time: "2–3 min" },
    { num: "2", label: "Importar\nChapas",     sub: "CSV → app local",       time: "1–2 min" },
    { num: "3", label: "Disparar\nFUP",        sub: "Integrado via webhook", time: "2–5 min/tarefa" },
    { num: "4", label: "Monitorar\ncom Timestamp", sub: "Dashboard em tempo real", time: "Automático" },
    { num: "5", label: "Validar\nPresença",    sub: "App local + histórico", time: "3–8 min" },
    { num: "6", label: "Consultar\nHistórico", sub: "SQLite local (<1s)",    time: "<1 segundo" },
  ];

  const n = steps.length;
  const cardW = 1.48;
  const gap = 0.07;
  const startX = 0.25;
  const circY = 1.75;
  const cR = 0.37;
  const cardY = 2.72;
  const cardH = 2.0;

  s.addShape(pres.shapes.RECTANGLE, {
    x: startX + cR, y: circY + cR - 0.04,
    w: n * (cardW + gap) - gap - cR * 2,
    h: 0.07,
    fill: { color: C.bdr }, line: { color: C.bdr, width: 0 },
  });

  steps.forEach((st, i) => {
    const sx = startX + i * (cardW + gap);
    const cx = sx + cardW / 2 - 0.02;

    s.addShape(pres.shapes.OVAL, {
      x: cx - cR, y: circY, w: cR * 2, h: cR * 2,
      fill: { color: C.dk }, line: { color: C.wh, width: 2 },
    });
    s.addText(st.num, {
      x: cx - cR, y: circY, w: cR * 2, h: cR * 2,
      fontSize: 16, bold: true, color: C.or, fontFace: FH,
      align: "center", valign: "middle", margin: 0,
    });

    s.addShape(pres.shapes.RECTANGLE, {
      x: sx, y: cardY, w: cardW, h: cardH,
      fill: { color: C.wh }, line: { color: C.bdr, width: 1 },
      shadow: makeShadow(),
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x: sx, y: cardY, w: cardW, h: 0.06,
      fill: { color: C.dk }, line: { color: C.dk, width: 0 },
    });
    s.addText(st.label, {
      x: sx + 0.07, y: cardY + 0.1, w: cardW - 0.14, h: 0.8,
      fontSize: 10, bold: true, color: C.dk, fontFace: FB, align: "center",
    });
    s.addText(st.sub, {
      x: sx + 0.07, y: cardY + 0.92, w: cardW - 0.14, h: 0.45,
      fontSize: 8.5, color: C.gy, fontFace: FB, align: "center",
    });

    // Green chip for TO-BE
    s.addShape(pres.shapes.RECTANGLE, {
      x: sx + 0.1, y: cardY + 1.48, w: cardW - 0.2, h: 0.3,
      fill: { color: C.gnP }, line: { color: C.gnB, width: 0.75 },
    });
    s.addText("⏱  " + st.time, {
      x: sx + 0.1, y: cardY + 1.48, w: cardW - 0.2, h: 0.3,
      fontSize: 8, bold: true, color: C.gn, fontFace: FB,
      align: "center", valign: "middle", margin: 0,
    });
  });

  s.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 5.14, w: 10, h: 0.485,
    fill: { color: C.dk }, line: { color: C.dk, width: 0 },
  });
  s.addText("TOTAL ESTIMADO POR DIA  •  45 min a 1,5 hora de FUP ativo  •  histórico, timestamps e validações centralizados", {
    x: 0.3, y: 5.14, w: 9.4, h: 0.485,
    fontSize: 10.5, bold: true, color: C.or, fontFace: FB,
    align: "center", valign: "middle", margin: 0, charSpacing: 0.5,
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// SLIDE 12 — COMPARATIVO AS-IS × TO-BE
// ══════════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.bg };
  topBar(s, pres);
  logoSmall(s);
  slideTitle(s, "Comparativo AS-IS × TO-BE", "Estimativa de tempo e impacto por etapa do processo");

  const rows = [
    { etapa: "Abertura e levantamento de tarefas", asis: "5–10 min", tobe: "2–3 min",   ganho: "~70%", tipo: "tempo" },
    { etapa: "Extração de dados dos chapas",       asis: "20–30 min", tobe: "1–2 min",  ganho: "~95%", tipo: "tempo" },
    { etapa: "Disparo de campanha FUP",            asis: "10–20 min/tarefa", tobe: "2–5 min/tarefa", ganho: "~75%", tipo: "tempo" },
    { etapa: "Controle de respostas",              asis: "Manual (Excel)", tobe: "Automático (dashboard)", ganho: "Qualitativo", tipo: "qual" },
    { etapa: "Gestão de cancelamentos",            asis: "Manual + múltiplas ferramentas", tobe: "Fluxo guiado no app", ganho: "Qualitativo", tipo: "qual" },
    { etapa: "Contato ativo (ligações 3C)",        asis: "15–30 min", tobe: "Timestamp visível no app", ganho: "Contexto", tipo: "ctx" },
    { etapa: "Consulta de histórico",              asis: "5–10 min (Metabase)", tobe: "< 1 segundo (SQLite)", ganho: "~99%", tipo: "tempo" },
    { etapa: "Rastreabilidade de ocorrências",     asis: "Manual (criação individual)", tobe: "Automático (fup_log)", ganho: "Qualitativo", tipo: "qual" },
  ];

  const headerY = 1.65;
  const rowH = 0.44;
  const colW = [3.5, 2.1, 2.1, 1.8];
  const colX = [0.3, 3.85, 5.95, 8.05];
  const headers = ["Etapa", "AS-IS (atual)", "TO-BE (FUP Manager)", "Ganho"];
  const headerColors = [C.dk, C.rd, C.gn, C.or];

  // Header
  headers.forEach((h, i) => {
    s.addShape(pres.shapes.RECTANGLE, {
      x: colX[i], y: headerY, w: colW[i], h: 0.38,
      fill: { color: headerColors[i] }, line: { color: headerColors[i], width: 0 },
    });
    s.addText(h, {
      x: colX[i] + 0.1, y: headerY, w: colW[i] - 0.1, h: 0.38,
      fontSize: 10, bold: true, color: C.wh, fontFace: FB,
      valign: "middle", margin: 0,
    });
  });

  // Rows
  rows.forEach((r, i) => {
    const ry = headerY + 0.38 + i * rowH;
    const bg = i % 2 === 0 ? C.wh : C.gyB;
    colX.forEach((cx, ci) => {
      s.addShape(pres.shapes.RECTANGLE, {
        x: cx, y: ry, w: colW[ci], h: rowH,
        fill: { color: bg }, line: { color: C.bdr, width: 0.5 },
      });
    });
    s.addText(r.etapa, {
      x: colX[0] + 0.1, y: ry, w: colW[0] - 0.15, h: rowH,
      fontSize: 9.5, color: C.dk, fontFace: FB, bold: true, valign: "middle",
    });
    s.addText(r.asis, {
      x: colX[1] + 0.1, y: ry, w: colW[1] - 0.15, h: rowH,
      fontSize: 9, color: C.rd, fontFace: FB, valign: "middle",
    });
    s.addText(r.tobe, {
      x: colX[2] + 0.1, y: ry, w: colW[2] - 0.15, h: rowH,
      fontSize: 9, color: C.gn, fontFace: FB, bold: true, valign: "middle",
    });

    // Ganho chip
    const ganhoColor = r.tipo === "tempo" ? C.gn : r.tipo === "qual" ? C.or : C.dk;
    s.addShape(pres.shapes.RECTANGLE, {
      x: colX[3] + 0.2, y: ry + 0.09, w: colW[3] - 0.4, h: 0.26,
      fill: { color: r.tipo === "tempo" ? C.gnP : r.tipo === "qual" ? C.orP : C.gyB },
      line: { color: ganhoColor, width: 0.75 },
    });
    s.addText(r.ganho, {
      x: colX[3] + 0.2, y: ry + 0.09, w: colW[3] - 0.4, h: 0.26,
      fontSize: 8.5, bold: true, color: ganhoColor, fontFace: FB,
      align: "center", valign: "middle", margin: 0,
    });
  });

  s.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 5.44, w: 10, h: 0.185,
    fill: { color: C.bdr }, line: { color: C.bdr, width: 0 },
  });
  s.addImage({ path: LOGO, x: 8.4, y: 5.45, w: 1.25, h: 0.44 });
}

// ══════════════════════════════════════════════════════════════════════════════
// SLIDE 13 — CONCLUSÃO
// ══════════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.dk };

  s.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 0, w: 0.55, h: 5.625,
    fill: { color: C.or }, line: { color: C.or, width: 0 },
  });
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 5.27, w: 10, h: 0.355,
    fill: { color: C.or }, line: { color: C.or, width: 0 },
  });

  s.addImage({ path: LOGO, x: 0.78, y: 0.28, w: 2.0, h: 0.7 });

  s.addText("Conclusão e\nPróximos Passos", {
    x: 0.78, y: 1.1, w: 5.5, h: 1.7,
    fontSize: 38, bold: true, color: C.wh, fontFace: FH,
  });

  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.78, y: 2.9, w: 5.6, h: 0.06,
    fill: { color: C.or }, line: { color: C.or, width: 0 },
  });

  const conc = [
    "O processo de FUP concentra 3 a 5 horas diárias de trabalho ativo com alto grau de execução manual.",
    "O FUP Manager reduz esse tempo para 45 min a 1,5h, centralizando controle, timestamps e rastreabilidade.",
    "A eliminação do Excel como ferramenta de controle reduz drasticamente o risco de erro e omissão.",
    "O histórico local (SQLite) resolve o gargalo de consultas lentas no Metabase.",
  ];
  conc.forEach((c, i) => {
    s.addShape(pres.shapes.OVAL, {
      x: 0.78, y: 3.05 + i * 0.47, w: 0.22, h: 0.22,
      fill: { color: C.or }, line: { color: C.or, width: 0 },
    });
    s.addText(c, {
      x: 1.08, y: 3.02 + i * 0.47, w: 5.2, h: 0.4,
      fontSize: 9.5, color: C.gyL, fontFace: FB,
    });
  });

  // Caixa de próximos passos
  s.addShape(pres.shapes.RECTANGLE, {
    x: 6.5, y: 1.0, w: 3.15, h: 4.1,
    fill: { color: C.dk2 }, line: { color: C.dk3, width: 1 },
  });
  s.addShape(pres.shapes.RECTANGLE, {
    x: 6.5, y: 1.0, w: 3.15, h: 0.06,
    fill: { color: C.or }, line: { color: C.or, width: 0 },
  });
  s.addText("Próximos Passos", {
    x: 6.65, y: 1.12, w: 2.85, h: 0.35,
    fontSize: 12, bold: true, color: C.or, fontFace: FB,
  });
  const proximos = [
    { n: "01", t: "Validar mapeamento com o time de analistas" },
    { n: "02", t: "Coletar feedback sobre funcionalidades prioritárias" },
    { n: "03", t: "Documentar SLA de tempo por etapa para baseline" },
    { n: "04", t: "Definir métricas de acompanhamento pós-implantação" },
    { n: "05", t: "Revisão com área de Gestão e Operações" },
  ];
  proximos.forEach((p, i) => {
    s.addText(p.n, {
      x: 6.65, y: 1.58 + i * 0.56, w: 0.4, h: 0.35,
      fontSize: 14, bold: true, color: C.or, fontFace: FH,
    });
    s.addText(p.t, {
      x: 7.1, y: 1.58 + i * 0.56, w: 2.4, h: 0.35,
      fontSize: 9, color: C.gyL, fontFace: FB, valign: "middle",
    });
    if (i < proximos.length - 1) {
      s.addShape(pres.shapes.RECTANGLE, {
        x: 6.65, y: 1.93 + i * 0.56, w: 2.85, h: 0.01,
        fill: { color: C.dk3 }, line: { color: C.dk3, width: 0 },
      });
    }
  });

  s.addText("Junho 2026  •  MeuChapa", {
    x: 0.78, y: 5.3, w: 5, h: 0.25,
    fontSize: 9, color: C.wh, fontFace: FB, bold: true, margin: 0,
  });
  s.addImage({ path: LOGO, x: 8.3, y: 5.28, w: 1.4, h: 0.49 });
}

// ─── Exportar ─────────────────────────────────────────────────────────────────
const outFile = path.resolve(__dirname, "../Mapeamento_FUP_MeuChapa.pptx");
pres.writeFile({ fileName: outFile }).then(() => {
  console.log("Gerado: " + outFile);
}).catch(err => {
  console.error("Erro:", err);
  process.exit(1);
});
