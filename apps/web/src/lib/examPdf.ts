import type { PDFFont, PDFPage } from 'pdf-lib';
import { compileExpr, niceTicks, sampleFn, type Diagram, type PracticeContent, type PracticeMaterial, type PracticeTask } from '@study/core';

/**
 * Übungsklausur als PDF im Aussehen einer echten Klausur (Kopf mit Fach, Zeit, Hilfsmittel und Punkten, Material mit Zeilenzählung,
 * Aufgaben mit BE, Punktetabelle) und der Erwartungshorizont mit Musterlösung als zweites PDF. Nur im Browser (pdf-lib, nachgeladen).
 * Die Schrift ist DejaVu Sans (public/fonts), sie kann Umlaute, Mathezeichen und Griechisch.
 */

export interface PdfFonts {
  regular: ArrayBuffer | Uint8Array;
  bold: ArrayBuffer | Uint8Array;
}

export interface ExamPdfInfo {
  subject: string;
  levelLabel: string; // zum Beispiel "Schwer"
  quarter: string | null;
  teacher: string;
  date: string; // schon formatiert, zum Beispiel "9. Oktober 2026"
  basis?: string[]; // wie die Note entsteht (nur für den Erwartungshorizont)
}

let fontCache: Promise<PdfFonts> | null = null;

/** Lädt die Schriften einmal aus dem Ordner public/fonts. */
export function loadExamFonts(): Promise<PdfFonts> {
  if (!fontCache) {
    const base = `${import.meta.env.BASE_URL}fonts/`;
    const get = async (name: string) => {
      const res = await fetch(`${base}${name}`);
      if (!res.ok) throw new Error('Die Schrift für das PDF konnte nicht geladen werden.');
      return res.arrayBuffer();
    };
    fontCache = Promise.all([get('DejaVuSans-Regular.woff'), get('DejaVuSans-Bold.woff')])
      .then(([regular, bold]) => ({ regular, bold }))
      .catch((e) => {
        fontCache = null;
        throw e;
      });
  }
  return fontCache;
}

const PAGE = { width: 595.28, height: 841.89 };
const M = { left: 62, right: 56, top: 60, bottom: 64 };
const WIDTH = PAGE.width - M.left - M.right;
const GUTTER = 26; // Platz links vom Text für die Zeilennummern
const INK = [0.09, 0.12, 0.2] as const;
const GREY = [0.4, 0.43, 0.5] as const;
const LINE = [0.78, 0.8, 0.85] as const;
const SHADE = [0.94, 0.95, 0.97] as const;

const fmtBe = (n: number) => `${String(n).replace('.', ',')} BE`;

/** Zeichnet die Seiten. Hält die Schreibposition und blättert selbst um. */
async function createTypesetter(fonts: PdfFonts, footerLeft: string) {
  const { PDFDocument, rgb, degrees, pushGraphicsState, popGraphicsState, rectangle, clip, endPath } = await import('pdf-lib');
  const fontkit = (await import('@pdf-lib/fontkit')).default;
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const regular: PDFFont = await doc.embedFont(fonts.regular, { subset: true });
  const bold: PDFFont = await doc.embedFont(fonts.bold, { subset: true });
  const known = new Set(regular.getCharacterSet());
  const color = (c: readonly number[]) => rgb(c[0], c[1], c[2]);

  const pages: PDFPage[] = [];
  let page!: PDFPage;
  let y = 0;
  const newPage = () => {
    page = doc.addPage([PAGE.width, PAGE.height]);
    pages.push(page);
    y = PAGE.height - M.top;
  };
  newPage();
  const ensure = (h: number) => {
    if (y - h < M.bottom) newPage();
  };

  /** Nur Zeichen, die die Schrift hat. Alles andere wird zu "?", Leerraum zu einfachen Leerzeichen. */
  const safe = (s: string) =>
    [...s.replace(/\r/g, '').replace(/\t/g, '    ').replace(/[   ]/g, ' ').replace(/[​-‍﻿]/g, '')]
      .map((ch) => (ch === '\n' || known.has(ch.codePointAt(0)!) ? ch : '?'))
      .join('');

  const width = (s: string, f: PDFFont, size: number) => f.widthOfTextAtSize(s, size);

  /** Bricht einen Absatz in Zeilen der Breite w. Zu lange Wörter werden zeichenweise getrennt. */
  const wrap = (text: string, f: PDFFont, size: number, w: number): string[] => {
    const out: string[] = [];
    let line = '';
    const push = () => {
      out.push(line);
      line = '';
    };
    for (const word of text.split(' ')) {
      if (word === '') continue;
      const next = line ? `${line} ${word}` : word;
      if (width(next, f, size) <= w) {
        line = next;
        continue;
      }
      if (line) push();
      if (width(word, f, size) <= w) {
        line = word;
        continue;
      }
      let piece = '';
      for (const ch of word) {
        if (width(piece + ch, f, size) > w && piece) {
          out.push(piece);
          piece = '';
        }
        piece += ch;
      }
      line = piece;
    }
    if (line || out.length === 0) push();
    return out;
  };

  const drawText = (s: string, x: number, top: number, f: PDFFont, size: number, c: readonly number[] = INK) => {
    if (s) page.drawText(s, { x, y: top - size, size, font: f, color: color(c) });
  };

  /** Absatz (mit Absätzen durch \n). Rückgabe: Zahl der gezeichneten Zeilen. */
  const paragraph = (
    text: string,
    o: { size?: number; bold?: boolean; x?: number; w?: number; color?: readonly number[]; after?: number; lead?: number; lineNumbers?: { count: number } } = {},
  ): void => {
    const size = o.size ?? 10.5;
    const f = o.bold ? bold : regular;
    const x = o.x ?? M.left;
    const w = o.w ?? WIDTH - (x - M.left);
    const lead = size * (o.lead ?? 1.45);
    const blocks = safe(text).split('\n');
    for (const block of blocks) {
      if (block.trim() === '') {
        y -= lead * 0.55; // Absatzabstand, wird nicht mitgezählt
        continue;
      }
      for (const ln of wrap(block, f, size, w)) {
        ensure(lead);
        drawText(ln, x, y, f, size, o.color);
        if (o.lineNumbers) {
          o.lineNumbers.count++;
          if (o.lineNumbers.count % 5 === 0) {
            const label = String(o.lineNumbers.count);
            drawText(label, x - 8 - width(label, regular, 8), y - 1, regular, 8, GREY);
          }
        }
        y -= lead;
      }
    }
    y -= o.after ?? 0;
  };

  /** Zeile mit Text links und BE rechts (für Aufgaben). */
  const titleWithRight = (left: string, right: string, size = 12) => {
    ensure(size * 3);
    drawText(safe(left), M.left, y, bold, size);
    if (right) {
      const t = safe(right);
      drawText(t, PAGE.width - M.right - width(t, regular, 10.5), y + 1, regular, 10.5, GREY);
    }
    y -= size * 1.5;
  };

  const rule = (gap = 6) => {
    ensure(gap * 2);
    page.drawLine({ start: { x: M.left, y }, end: { x: PAGE.width - M.right, y }, thickness: 0.8, color: color(LINE) });
    y -= gap;
  };

  const box = (cols: { label: string; value: string }[]) => {
    const w = WIDTH / cols.length;
    const size = 9.5;
    const lines = cols.map((c) => wrap(safe(c.value), bold, size, w - 16)); // fett gemessen, weil fett gezeichnet
    const h = 14 + Math.max(...lines.map((l) => l.length)) * size * 1.4 + 8;
    ensure(h + 8);
    cols.forEach((c, i) => {
      const x = M.left + i * w;
      page.drawRectangle({ x, y: y - h, width: w, height: h, borderColor: color(LINE), borderWidth: 0.8, color: color(SHADE) });
      drawText(safe(c.label), x + 8, y - 5, regular, 7.5, GREY);
      lines[i].forEach((l, k) => drawText(l, x + 8, y - 17 - k * size * 1.4, bold, size));
    });
    y -= h + 10;
  };

  const table = (head: string[], rows: string[][], size = 9.5, minCol = 36) => {
    const cols = Math.max(head.length, ...rows.map((r) => r.length), 1);
    const pad = 5;
    const natural = Array.from({ length: cols }, (_, c) =>
      Math.min(
        190,
        Math.max(...[head[c] ?? '', ...rows.map((r) => r[c] ?? '')].map((s) => width(safe(s), s === head[c] ? bold : regular, size))) + pad * 2,
      ),
    );
    const total = natural.reduce((s, v) => s + v, 0);
    const scale = total > WIDTH ? WIDTH / total : 1;
    const colW = natural.map((v) => Math.max(minCol, v * scale));
    const fit = colW.reduce((s, v) => s + v, 0);
    if (fit > WIDTH) for (let i = 0; i < colW.length; i++) colW[i] = (colW[i] / fit) * WIDTH;
    const drawRow = (cells: string[], isHead: boolean) => {
      const wrapped = colW.map((cw, c) => wrap(safe(cells[c] ?? ''), isHead ? bold : regular, size, cw - pad * 2));
      const h = Math.max(...wrapped.map((l) => l.length)) * size * 1.35 + pad * 2 - 2;
      ensure(h);
      let x = M.left;
      wrapped.forEach((lines, c) => {
        page.drawRectangle({ x, y: y - h, width: colW[c], height: h, borderColor: color(LINE), borderWidth: 0.6, color: isHead ? color(SHADE) : undefined });
        lines.forEach((l, k) => drawText(l, x + pad, y - pad + 1 - k * size * 1.35, isHead ? bold : regular, size));
        x += colW[c];
      });
      y -= h;
    };
    if (head.length > 0) drawRow(head, true);
    rows.forEach((r) => drawRow(r, false));
    y -= 8;
  };

  /** Code und ähnlicher Text mit festen Zeilenumbrüchen im grauen Kasten. */
  const code = (text: string) => {
    const size = 8.5;
    const w = WIDTH - 16;
    const lines = safe(text)
      .split('\n')
      .flatMap((l) => {
        const out: string[] = [];
        let cur = '';
        for (const ch of l) {
          if (width(cur + ch, regular, size) > w && cur) {
            out.push(cur);
            cur = '';
          }
          cur += ch;
        }
        out.push(cur);
        return out;
      });
    const lead = size * 1.4;
    let i = 0;
    while (i < lines.length) {
      ensure(lead * 3 + 8);
      const fit = Math.max(1, Math.floor((y - M.bottom - 8) / lead));
      const chunk = lines.slice(i, i + fit);
      const h = chunk.length * lead + 8;
      page.drawRectangle({ x: M.left, y: y - h, width: WIDTH, height: h, color: color(SHADE), borderColor: color(LINE), borderWidth: 0.6 });
      chunk.forEach((l, k) => drawText(l, M.left + 8, y - 4 - k * lead, regular, size));
      y -= h;
      i += chunk.length;
    }
    y -= 8;
  };

  const gap = (h: number) => {
    y -= h;
  };

  // -------------------------------------------------------------------------------------------------------------
  // Diagramme: schwarz-weiß tauglich (Grautöne, Strichmuster), gezeichnet aus den Daten der Klausur

  const SHADES = [0.2, 0.5, 0.75, 0.9];
  const PIE_SHADES = [0.25, 0.7, 0.45, 0.87, 0.58, 0.35, 0.78, 0.52, 0.92, 0.4, 0.65, 0.82];
  const DASHES: (number[] | undefined)[] = [undefined, [5, 3], [1.5, 2.5], [8, 3, 2, 3]];
  const fmtNum = (n: number) => String(Number(n.toPrecision(6))).replace('.', ',').replace('-', '−');
  const gray = (v: number) => color([v, v, v]);

  const diagram = (d: Diagram) => {
    const W = Math.min(WIDTH - 20, 430);
    const H = d.art === 'kreis' ? 170 : 200;
    const legendRows = d.art === 'kreis' ? 0 : d.reihen.length > 1 || d.reihen.some((r) => r.name) ? Math.ceil(d.reihen.length / 2) : 0;
    const total = H + 44 + legendRows * 13 + (d.titel ? 14 : 0) + 14;
    ensure(total);
    const left = M.left + 10;
    let top = y;
    if (d.titel) {
      drawText(safe(d.titel), left, top, bold, 9.5);
      top -= 16;
    }
    const x0 = left + 38;
    const x1 = left + W;
    const yTop = top - 4;
    const yBottom = yTop - H;
    const pw = x1 - x0;
    const line = (ax: number, ay: number, bx: number, by: number, o: { w?: number; c?: readonly number[]; dash?: number[] } = {}) =>
      page.drawLine({ start: { x: ax, y: ay }, end: { x: bx, y: by }, thickness: o.w ?? 0.6, color: color(o.c ?? INK), dashArray: o.dash });
    const label = (t: string, x: number, yy: number, size = 7.5, align: 'l' | 'c' | 'r' = 'l') => {
      const s2 = safe(t);
      const w = width(s2, regular, size);
      page.drawText(s2, { x: align === 'c' ? x - w / 2 : align === 'r' ? x - w : x, y: yy, size, font: regular, color: color(INK) });
    };

    const frame = () => page.drawRectangle({ x: x0, y: yBottom, width: pw, height: H, borderColor: color(INK), borderWidth: 0.8 });
    const axisTitles = () => {
      if (d.xlabel) label(d.xlabel, x0 + pw / 2, yBottom - 26, 8, 'c');
      if (d.ylabel) {
        const t = safe(d.ylabel);
        page.drawText(t, { x: left + 4, y: yBottom + H / 2 - width(t, regular, 8) / 2, size: 8, font: regular, color: color(INK), rotate: degrees(90) });
      }
    };
    const legend = (entries: { name: string; paint: (x: number, yy: number) => void }[]) => {
      let ly = yBottom - 40;
      entries.forEach((e, i) => {
        const lx = x0 + (i % 2) * (pw / 2);
        if (i > 0 && i % 2 === 0) ly -= 13;
        e.paint(lx, ly + 3);
        label(e.name || `Reihe ${i + 1}`, lx + 24, ly, 8);
      });
    };

    if (d.art === 'graph') {
      const mapX = (v: number) => x0 + ((v - d.xmin) / (d.xmax - d.xmin)) * pw;
      const mapY = (v: number) => yBottom + ((v - d.ymin) / (d.ymax - d.ymin)) * H;
      const xt = niceTicks(d.xmin, d.xmax, 8);
      const yt = niceTicks(d.ymin, d.ymax, 6);
      for (const v of xt) line(mapX(v), yBottom, mapX(v), yTop, { w: 0.3, c: LINE });
      for (const v of yt) line(x0, mapY(v), x1, mapY(v), { w: 0.3, c: LINE });
      frame();
      if (d.xmin < 0 && d.xmax > 0) line(mapX(0), yBottom, mapX(0), yTop, { w: 1 });
      if (d.ymin < 0 && d.ymax > 0) line(x0, mapY(0), x1, mapY(0), { w: 1 });
      for (const v of xt) {
        line(mapX(v), yBottom, mapX(v), yBottom - 3);
        label(fmtNum(v), mapX(v), yBottom - 11, 7.5, 'c');
      }
      for (const v of yt) {
        line(x0, mapY(v), x0 - 3, mapY(v));
        label(fmtNum(v), x0 - 5, mapY(v) - 2.5, 7.5, 'r');
      }
      page.pushOperators(pushGraphicsState(), rectangle(x0, yBottom, pw, H), clip(), endPath());
      d.reihen.forEach((r, i) => {
        const dash = r.stil === 'gestrichelt' ? [5, 3] : DASHES[i % DASHES.length];
        const shade = i === 0 ? 0.1 : SHADES[i % SHADES.length] * 0.6;
        if (r.fn) {
          const f = compileExpr(r.fn);
          if (!f) return;
          const pts = sampleFn(f, d.xmin, d.xmax, d.ymin, d.ymax, 300);
          for (let k = 1; k < pts.length; k++) {
            const a = pts[k - 1];
            const b = pts[k];
            if (a && b) line(mapX(a.x), mapY(a.y), mapX(b.x), mapY(b.y), { w: 1.2, c: [shade, shade, shade], dash });
          }
        } else {
          const sorted = r.stil === 'punkte' ? r.punkte : [...r.punkte].sort((a, b) => a[0] - b[0]);
          if (r.stil !== 'punkte') for (let k = 1; k < sorted.length; k++) line(mapX(sorted[k - 1]![0]), mapY(sorted[k - 1]![1]), mapX(sorted[k]![0]), mapY(sorted[k]![1]), { w: 1.2, c: [shade, shade, shade], dash });
          for (const p of sorted) page.drawCircle({ x: mapX(p[0]), y: mapY(p[1]), size: 2.2, color: color([shade, shade, shade]) });
        }
      });
      for (const m of d.markierungen) {
        page.drawCircle({ x: mapX(m.x), y: mapY(m.y), size: 3, color: color(INK) });
        if (m.text) label(m.text, mapX(m.x) + 5, mapY(m.y) + 4, 8);
      }
      page.pushOperators(popGraphicsState());
      axisTitles();
      legend(
        d.reihen.map((r, i) => ({
          name: r.name,
          paint: (lx, ly) => {
            const shade = i === 0 ? 0.1 : SHADES[i % SHADES.length] * 0.6;
            if (r.stil === 'punkte') page.drawCircle({ x: lx + 9, y: ly, size: 2.2, color: color([shade, shade, shade]) });
            else line(lx, ly, lx + 18, ly, { w: 1.2, c: [shade, shade, shade], dash: r.stil === 'gestrichelt' ? [5, 3] : DASHES[i % DASHES.length] });
          },
        })),
      );
    } else if (d.art === 'saeulen' || d.art === 'linie') {
      const all = d.reihen.flatMap((r) => r.werte);
      const lo = Math.min(0, ...all);
      const hiRaw = Math.max(0, ...all);
      const hi = hiRaw === lo ? lo + 1 : hiRaw;
      const first = niceTicks(lo, hi, 6);
      const step = first.length > 1 ? first[1]! - first[0]! : 1;
      const yMin = Math.floor(lo / step + 1e-9) * step;
      let yMax = Math.ceil(hi / step - 1e-9) * step;
      if (yMax - hi < step * 0.15) yMax += step; // Platz für die Zahl über der höchsten Säule
      const ticks: number[] = [];
      for (let v = yMin; v <= yMax + step * 1e-6; v += step) ticks.push(Number(v.toPrecision(12)) || 0);
      const mapY = (v: number) => yBottom + ((v - yMin) / (yMax - yMin)) * H;
      const n = d.kategorien.length;
      const group = pw / n;
      for (const v of ticks) {
        line(x0, mapY(v), x1, mapY(v), { w: 0.3, c: LINE });
        line(x0, mapY(v), x0 - 3, mapY(v));
        label(fmtNum(v), x0 - 5, mapY(v) - 2.5, 7.5, 'r');
      }
      frame();
      if (yMin < 0) line(x0, mapY(0), x1, mapY(0), { w: 1 });
      const m = d.reihen.length;
      d.kategorien.forEach((cat, c) => {
        const cx = x0 + group * (c + 0.5);
        let t = safe(cat);
        const maxW = group - 2;
        while (t.length > 1 && width(t, regular, 7.5) > maxW) t = `${t.slice(0, -2)}…`;
        label(t, cx, yBottom - 11, 7.5, 'c');
      });
      if (d.art === 'saeulen') {
        const bw = (group * 0.72) / m;
        d.reihen.forEach((r, i) => {
          r.werte.forEach((v, c) => {
            const bx = x0 + group * c + group * 0.14 + i * bw;
            const base = mapY(Math.max(yMin, Math.min(0, yMax)));
            const top2 = mapY(v);
            page.drawRectangle({ x: bx, y: Math.min(base, top2), width: bw, height: Math.abs(top2 - base), color: gray(SHADES[i % SHADES.length]), borderColor: color(INK), borderWidth: 0.5 });
            if (n * m <= 16) label(fmtNum(v), bx + bw / 2, (v >= 0 ? top2 : top2 - 9) + (v >= 0 ? 2 : 0), 7, 'c');
          });
        });
      } else {
        d.reihen.forEach((r, i) => {
          const shade = i === 0 ? 0.1 : SHADES[i % SHADES.length] * 0.6;
          const dash = DASHES[i % DASHES.length];
          const pts = r.werte.map((v, c) => ({ x: x0 + group * (c + 0.5), y: mapY(v) }));
          for (let k = 1; k < pts.length; k++) line(pts[k - 1]!.x, pts[k - 1]!.y, pts[k]!.x, pts[k]!.y, { w: 1.2, c: [shade, shade, shade], dash });
          for (const p of pts) page.drawCircle({ x: p.x, y: p.y, size: 2.2, color: color([shade, shade, shade]) });
        });
      }
      axisTitles();
      legend(
        d.reihen.map((r, i) => ({
          name: r.name,
          paint: (lx, ly) => {
            if (d.art === 'saeulen') page.drawRectangle({ x: lx, y: ly - 3, width: 18, height: 7, color: gray(SHADES[i % SHADES.length]), borderColor: color(INK), borderWidth: 0.5 });
            else line(lx, ly, lx + 18, ly, { w: 1.2, c: i === 0 ? [0.1, 0.1, 0.1] : [SHADES[i % SHADES.length] * 0.6, SHADES[i % SHADES.length] * 0.6, SHADES[i % SHADES.length] * 0.6], dash: DASHES[i % DASHES.length] });
          },
        })),
      );
    } else {
      // Kreisdiagramm: Sektoren mit Grautönen, daneben die Legende mit Anteilen
      const values = d.reihen[0]!.werte;
      const sum = values.reduce((a, b) => a + b, 0);
      const r = Math.min(H / 2 - 4, 78);
      const cx = x0 + r + 10;
      const cy = yTop - H / 2;
      let angle = Math.PI / 2;
      values.forEach((v, i) => {
        const sweep = (v / sum) * Math.PI * 2;
        const steps = Math.max(2, Math.ceil(sweep / 0.08));
        const pts: string[] = [`${cx.toFixed(2)} ${(-cy).toFixed(2)}`];
        for (let k = 0; k <= steps; k++) {
          const a = angle - (sweep * k) / steps;
          pts.push(`${(cx + r * Math.cos(a)).toFixed(2)} ${(-(cy + r * Math.sin(a))).toFixed(2)}`);
        }
        const shade = PIE_SHADES[i % PIE_SHADES.length]!;
        page.drawSvgPath(`M ${pts.join(' L ')} Z`, { x: 0, y: 0, color: gray(shade), borderColor: rgb(1, 1, 1), borderWidth: 1 });
        angle -= sweep;
      });
      values.forEach((v, i) => {
        const ly = yTop - 14 - i * 14;
        if (ly < yBottom) return;
        const shade = PIE_SHADES[i % PIE_SHADES.length]!;
        page.drawRectangle({ x: cx + r + 30, y: ly - 2, width: 10, height: 9, color: gray(shade), borderColor: color(INK), borderWidth: 0.5 });
        label(`${d.kategorien[i] ?? ''} (${fmtNum(Math.round((v / sum) * 1000) / 10)} %)`, cx + r + 46, ly, 8);
      });
    }
    y = yBottom - 34 - legendRows * 13;
  };

  const finish = async (): Promise<Blob> => {
    const n = pages.length;
    pages.forEach((p, i) => {
      p.drawLine({ start: { x: M.left, y: 44 }, end: { x: PAGE.width - M.right, y: 44 }, thickness: 0.5, color: color(LINE) });
      p.drawText(safe(footerLeft), { x: M.left, y: 30, size: 8, font: regular, color: color(GREY) });
      const t = `Seite ${i + 1} von ${n}`;
      p.drawText(t, { x: PAGE.width - M.right - width(t, regular, 8), y: 30, size: 8, font: regular, color: color(GREY) });
    });
    const bytes = await doc.save({ useObjectStreams: true });
    return new Blob([bytes as BlobPart], { type: 'application/pdf' });
  };

  return { paragraph, titleWithRight, rule, box, table, code, gap, ensure, diagram, finish };
}

function drawMaterial(t: Awaited<ReturnType<typeof createTypesetter>>, m: PracticeMaterial) {
  t.ensure(m.typ === 'diagramm' ? 320 : 60); // Überschrift und Diagramm bleiben zusammen
  t.paragraph(`Material ${m.id}${m.titel ? `: ${m.titel}` : ''}`, { bold: true, size: 11, after: 1 });
  if (m.quelle) t.paragraph(m.quelle, { size: 8.5, color: GREY, after: 4 });
  if (m.typ === 'diagramm' && m.diagramm) t.diagram(m.diagramm);
  else if (m.typ === 'tabelle') t.table(m.kopf, m.zeilen);
  else if (m.typ === 'code') t.code(m.text);
  else t.paragraph(m.text, { x: M.left + GUTTER, size: 10.5, lineNumbers: { count: 0 }, after: 6 });
  t.gap(4);
}

function drawTask(t: Awaited<ReturnType<typeof createTypesetter>>, task: PracticeTask, withSolution: boolean) {
  t.titleWithRight(`Aufgabe ${task.nr}`, fmtBe(task.be));
  t.paragraph(task.text, { x: M.left, after: task.teilaufgaben.length > 0 ? 3 : 2, color: withSolution ? GREY : INK, size: withSolution ? 9.5 : 10.5 });
  if (!withSolution) {
    for (const s of task.teilaufgaben) {
      t.ensure(30);
      t.paragraph(`${s.nr})`, { bold: true, x: M.left + 6, w: 18, after: -10.5 * 1.45 });
      t.paragraph(`${s.text}  (${fmtBe(s.be)})`, { x: M.left + 26, after: 2 });
    }
  }
}

const hoursLabel = (min: number) => `${min} Minuten`;

/** Die Klausur als PDF. */
export async function buildExamPdf(exam: PracticeContent, info: ExamPdfInfo, fonts: PdfFonts): Promise<Blob> {
  const t = await createTypesetter(fonts, `Übungsklausur ${info.subject} · ${info.levelLabel} · von der KI erstellt`);
  const meta = [info.subject, info.quarter, info.levelLabel].filter(Boolean).join(' · ');
  t.paragraph(`ÜBUNGSKLAUSUR · ${meta}`.toUpperCase(), { size: 8.5, bold: true, color: GREY, after: 6 });
  t.paragraph(exam.titel || `Übungsklausur ${info.subject}`, { size: 20, bold: true, lead: 1.25, after: 4 });
  t.paragraph([info.date, info.teacher ? `Lehrkraft: ${info.teacher}` : ''].filter(Boolean).join(' · '), { size: 10, color: GREY, after: 10 });
  t.paragraph('Name: ______________________________      Datum: ________________', { size: 10.5, after: 10 });
  t.box([
    { label: 'Bearbeitungszeit', value: hoursLabel(exam.dauer_min) },
    { label: 'Hilfsmittel', value: exam.hilfsmittel || 'keine' },
    { label: 'Gesamtpunkte', value: fmtBe(exam.gesamt_be) },
  ]);
  if (exam.hinweise.length > 0) {
    t.paragraph('Hinweise', { bold: true, size: 11, after: 2 });
    for (const h of exam.hinweise) t.paragraph(`•  ${h}`, { x: M.left + 6, size: 10, after: 1 });
    t.gap(4);
  }
  for (const part of exam.teile) {
    t.ensure(80);
    t.rule(8);
    t.paragraph(part.name, { bold: true, size: 14, lead: 1.3, after: 2 });
    if (part.hinweis) t.paragraph(part.hinweis, { size: 10, color: GREY, after: 6 });
    for (const m of part.materialien) drawMaterial(t, m);
    for (const task of part.aufgaben) {
      t.gap(8);
      drawTask(t, task, false);
    }
  }
  t.gap(4);
  t.rule(8);
  t.paragraph('Viel Erfolg!', { bold: true, size: 12, after: 8 });
  t.ensure(40 + (exam.teile.reduce((n, p) => n + p.aufgaben.length, 0) + 2) * 20);
  t.paragraph('Bewertung', { bold: true, size: 11, after: 3 });
  const rows = exam.teile.flatMap((p) => p.aufgaben).map((a) => [`Aufgabe ${a.nr}`, fmtBe(a.be), '']);
  rows.push(['Gesamt', fmtBe(exam.gesamt_be), '']);
  t.table(['Aufgabe', 'Erreichbar', 'Erreicht'], rows, 9.5, 90);
  t.paragraph('Notenpunkte: ________      Unterschrift: ______________________', { size: 10, after: 4 });
  t.paragraph('Diese Übungsklausur wurde von einer KI erstellt. Texte, Aufgaben und Lösungen können Fehler enthalten.', { size: 8, color: GREY });
  return t.finish();
}

/** Erwartungshorizont und Musterlösung als PDF. */
export async function buildHorizonPdf(exam: PracticeContent, info: ExamPdfInfo, fonts: PdfFonts): Promise<Blob> {
  const t = await createTypesetter(fonts, `Erwartungshorizont ${info.subject} · ${info.levelLabel} · von der KI erstellt`);
  t.paragraph(`ERWARTUNGSHORIZONT UND MUSTERLÖSUNG · ${[info.subject, info.quarter, info.levelLabel].filter(Boolean).join(' · ')}`.toUpperCase(), { size: 8.5, bold: true, color: GREY, after: 6 });
  t.paragraph(exam.titel || `Übungsklausur ${info.subject}`, { size: 18, bold: true, lead: 1.25, after: 4 });
  t.paragraph(`${fmtBe(exam.gesamt_be)} · ${hoursLabel(exam.dauer_min)}${info.teacher ? ` · Lehrkraft: ${info.teacher}` : ''}`, { size: 10, color: GREY, after: 8 });
  if (info.basis && info.basis.length > 0) {
    t.paragraph('So wird die Note berechnet', { bold: true, size: 11, after: 2 });
    for (const b of info.basis) t.paragraph(`•  ${b}`, { x: M.left + 6, size: 9.5, after: 2 });
    t.gap(4);
  }
  for (const part of exam.teile) {
    t.ensure(60);
    t.rule(8);
    t.paragraph(part.name, { bold: true, size: 13, after: 4 });
    for (const task of part.aufgaben) {
      t.gap(4);
      drawTask(t, task, true);
      if (task.erwartung.length > 0) {
        t.paragraph('Erwartet', { bold: true, size: 10, after: 1 });
        for (const e of task.erwartung) t.paragraph(`•  ${e}`, { x: M.left + 6, size: 10, after: 1 });
      }
      if (task.loesung) {
        t.paragraph('Musterlösung', { bold: true, size: 10, after: 1 });
        t.paragraph(task.loesung, { x: M.left + 6, size: 10, after: 3 });
      }
      if (task.diagramm) {
        t.paragraph('Lösung im Diagramm', { bold: true, size: 10, after: 2 });
        t.diagram(task.diagramm);
      }
      for (const s of task.teilaufgaben) {
        t.paragraph(`${s.nr}) ${s.text}  (${fmtBe(s.be)})`, { bold: true, size: 9.5, x: M.left + 6, color: GREY, after: 1 });
        if (s.loesung) t.paragraph(s.loesung, { x: M.left + 16, size: 10, after: 3 });
        if (s.diagramm) {
          t.paragraph('Lösung im Diagramm', { bold: true, size: 9.5, x: M.left + 16, after: 2 });
          t.diagram(s.diagramm);
        }
      }
    }
  }
  t.paragraph('Von einer KI erstellt. Prüfe Rechnungen und Aussagen nach, bevor du dich darauf verlässt.', { size: 8, color: GREY });
  return t.finish();
}

/** Dateiname, zum Beispiel "2026-10-09 Übungsklausur Deutsch schwer.pdf". */
export function practiceFileName(date: string, subject: string, levelLabel: string, kind: 'klausur' | 'erwartung'): string {
  const clean = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim();
  return `${date} ${kind === 'klausur' ? 'Übungsklausur' : 'Erwartungshorizont'} ${clean(subject)} ${clean(levelLabel).toLowerCase()}.pdf`;
}
