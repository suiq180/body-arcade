// README.md의 "업데이트 기록"을 워드 파일(docs/업데이트기록.docx)로 만든다.
// 사용: npm run update-log
// 원본은 README.md 하나 — 새 패치는 README의 "업데이트 기록 시작" 줄 바로 아래(맨 위)에
//   ### YYYY-MM-DD · 제목 (`커밋`)
//   - 내용
// 형식으로 추가한 뒤 이 스크립트를 실행한다.

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AlignmentType, BorderStyle, Document, HeadingLevel, LevelFormat, Packer, Paragraph,
  ShadingType, Table, TableCell, TableRow, TextRun, WidthType,
} from 'docx';

// 한글 폴더 경로는 fileURLToPath로 (docs/제작과정.md 5장)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const README = path.join(root, 'README.md');
const OUT = path.join(root, 'docs', '업데이트기록.docx');
const START = '<!-- 업데이트 기록 시작';
const END = '<!-- 업데이트 기록 끝 -->';
const FONT = '맑은 고딕';
const REPO = 'https://github.com/suiq180/body-arcade';

/** 마크다운 꾸밈(굵게, 코드, 링크) 없애기 */
const plain = (s) => s
  .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
  .replace(/\*\*([^*]+)\*\*/g, '$1')
  .replace(/`([^`]+)`/g, '$1')
  .trim();

function readEntries() {
  const md = readFileSync(README, 'utf8');
  const a = md.indexOf(START), b = md.indexOf(END);
  if (a < 0 || b < 0) throw new Error('README.md에서 업데이트 기록 표시(시작·끝 주석)를 찾지 못했어요');
  const entries = [];
  for (const line of md.slice(a, b).split(/\r?\n/)) {
    const h = line.match(/^###\s+(\d{4}-\d{2}-\d{2})\s*·\s*(.+)$/);
    if (h) {
      // 제목 끝의 (`커밋`, `커밋`) 분리
      const c = h[2].match(/^(.*?)\s*\(((?:`[0-9a-f]+`(?:,\s*)?)+)\)\s*$/);
      entries.push({
        date: h[1],
        title: plain(c ? c[1] : h[2]),
        commits: c ? [...c[2].matchAll(/`([0-9a-f]+)`/g)].map((m) => m[1]) : [],
        items: [],
      });
      continue;
    }
    const item = line.match(/^\s*-\s+(.+)$/);
    if (item && entries.length) entries[entries.length - 1].items.push(plain(item[1]));
  }
  if (!entries.length) throw new Error('업데이트 기록 항목(### 날짜 · 제목)이 없어요');
  return entries;
}

const run = (text, o = {}) => new TextRun({ text, font: FONT, ...o });
const border = { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' };
const borders = { top: border, bottom: border, left: border, right: border };
const COLS = [1800, 5700, 1526]; // A4 본문 폭 9026 DXA

function cell(text, width, header = false) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    shading: header ? { fill: 'FFE8CC', type: ShadingType.CLEAR, color: 'auto' } : undefined,
    children: [new Paragraph({ children: [run(text, { bold: header, size: 20 })] })],
  });
}

function build(entries) {
  const today = new Date().toISOString().slice(0, 10);
  const summary = new Table({
    width: { size: COLS.reduce((s, w) => s + w, 0), type: WidthType.DXA },
    columnWidths: COLS,
    rows: [
      new TableRow({ tableHeader: true, children: ['날짜', '업데이트', '커밋'].map((t, i) => cell(t, COLS[i], true)) }),
      ...entries.map((e) => new TableRow({ children: [cell(e.date, COLS[0]), cell(e.title, COLS[1]), cell(e.commits.join(', ') || '—', COLS[2])] })),
    ],
  });

  const details = entries.flatMap((e) => [
    new Paragraph({ heading: HeadingLevel.HEADING_2, children: [run(`${e.date} · ${e.title}`)] }),
    ...(e.commits.length ? [new Paragraph({ spacing: { after: 80 }, children: [run(`커밋: ${e.commits.join(', ')}`, { size: 18, color: '868E96' })] })] : []),
    ...e.items.map((t) => new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [run(t, { size: 21 })] })),
  ]);

  return new Document({
    creator: '몸으로 아케이드',
    title: '몸으로 아케이드 — 업데이트 기록',
    styles: {
      default: { document: { run: { font: FONT, size: 21 } } },
      paragraphStyles: [
        { id: 'Title', name: 'Title', basedOn: 'Normal', run: { font: FONT, size: 40, bold: true }, paragraph: { spacing: { before: 0, after: 120 }, keepNext: true } },
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 28, bold: true, color: 'E8590C' }, paragraph: { spacing: { before: 360, after: 160 }, keepNext: true, outlineLevel: 0 } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 24, bold: true }, paragraph: { spacing: { before: 280, after: 60 }, keepNext: true, outlineLevel: 1 } },
      ],
    },
    numbering: {
      config: [{ reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 560, hanging: 280 } } } }] }],
    },
    sections: [{
      properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
      children: [
        new Paragraph({ heading: HeadingLevel.TITLE, children: [run('🕹️ 몸으로 아케이드 — 업데이트 기록')] }),
        new Paragraph({ spacing: { after: 60 }, children: [run(`만든 날 ${today} · 원본: README.md "업데이트 기록" · 최신 패치가 맨 위`, { size: 18, color: '868E96' })] }),
        new Paragraph({ spacing: { after: 240 }, children: [run(`사이트 https://minimode.netlify.app · 저장소 ${REPO}`, { size: 18, color: '868E96' })] }),
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [run('한눈에 보기')] }),
        summary,
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [run('자세한 내용')] }),
        ...details,
      ],
    }],
  });
}

const entries = readEntries();
writeFileSync(OUT, await Packer.toBuffer(build(entries)));
console.log(`[업데이트 기록] ${entries.length}개 항목 → ${path.relative(root, OUT)}`);
