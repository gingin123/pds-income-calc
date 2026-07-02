/** Порт parse_fns_income_pdf из pds-income-service/main.py */

const MARK_INCOME_START =
  /Сведения о доходах,[\s\S]*?налоговыми агентами/i;
const MARK_INSURANCE_PAYOUTS =
  /Сведения о выплатах,[\s\S]*?произвед[её]нных плательщиками страховых взносов/i;
const NUM = String.raw`\d{1,3}(?:[\s\u00a0]\d{3})*(?:[.,]\d+)?|\d+(?:[.,]\d+)?`;
const ROW_HEADER = new RegExp(
  String.raw`(?<inn>\d{10,12})\s+(?<kpp>\d{9})\s+(?<total>${NUM})\s+(?<base>${NUM})\s+(?<code>\d{4})\s+(?<code_amt>${NUM})\s+(?<year>\d{4})\s*$`
);
const CONT_CODE = new RegExp(String.raw`^(\d{4})\s+(${NUM})\s*$`);

function isSecuritiesIncomeCode(code) {
  return code >= 1530 && code <= 1539;
}

function normalizeNum(s) {
  return parseFloat(String(s).replace(/[\s\u00a0]/g, "").replace(",", "."));
}

function incomeSectionOnly(fullText) {
  const m0 = MARK_INCOME_START.exec(fullText);
  if (!m0) return fullText;
  const start = m0.index + m0[0].length;
  const tail = fullText.slice(start);
  const m1 = MARK_INSURANCE_PAYOUTS.exec(tail);
  return m1 ? tail.slice(0, m1.index) : tail;
}

function parseAgentBlocks(sectionText) {
  const lines = sectionText
    .split(/\r?\n/)
    .map((ln) => ln.trim())
    .filter(Boolean);
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const m = ROW_HEADER.exec(lines[i]);
    if (!m) {
      i += 1;
      continue;
    }

    const inn = m.groups.inn;
    const kpp = m.groups.kpp;
    const totalIncome = normalizeNum(m.groups.total);
    const taxBase = normalizeNum(m.groups.base);
    const codes = [[parseInt(m.groups.code, 10), normalizeNum(m.groups.code_amt)]];

    let j = i + 1;
    while (j < lines.length) {
      if (ROW_HEADER.test(lines[j])) break;
      const cm = CONT_CODE.exec(lines[j]);
      if (!cm) break;
      codes.push([parseInt(cm[1], 10), normalizeNum(cm[2])]);
      j += 1;
    }

    const codeSet = [...new Set(codes.map(([c]) => c))];
    const allSec = codeSet.length > 0 && codeSet.every(isSecuritiesIncomeCode);
    const mixedSec =
      codeSet.some(isSecuritiesIncomeCode) && !codeSet.every(isSecuritiesIncomeCode);

    let pdsAmount;
    let method;
    if (allSec) {
      pdsAmount = taxBase;
      method = "tax_base_securities_net";
    } else {
      pdsAmount = totalIncome;
      method = "total_income_gross";
    }

    const block = {
      inn,
      kpp,
      total_income_rub: totalIncome,
      tax_base_rub: taxBase,
      income_codes: codeSet.sort((a, b) => a - b),
      pds_amount_rub: Math.round(pdsAmount * 100) / 100,
      method,
      line_preview: lines[i].slice(0, 200),
    };

    if (mixedSec) {
      block.warning =
        "В блоке смешаны коды ЦБ и иные коды; для ПДС берётся «Общая сумма дохода» целиком — " +
        "при необходимости уточните долю по ЦБ вручную.";
    }

    blocks.push(block);
    i = j > i + 1 ? j : i + 1;
  }

  return blocks;
}

export function parseFnsIncomeText(fullText) {
  const section = incomeSectionOnly(fullText);
  const blocks = parseAgentBlocks(section);
  const warnings = [];

  if (!blocks.length) {
    warnings.push(
      "Не удалось разобрать блоки агентов. Проверьте формат PDF или введите сумму вручную."
    );
  }

  for (const b of blocks) {
    if (b.warning) warnings.push(`ИНН ${b.inn}: ${b.warning}`);
  }

  const total = blocks.reduce((sum, b) => sum + b.pds_amount_rub, 0);

  return {
    blocks,
    certificate_total_rub: Math.round(total * 100) / 100,
    warnings,
    certificate_breakdown: blocks.map((b) => ({
      inn: b.inn,
      kpp: b.kpp,
      pds_amount_rub: b.pds_amount_rub,
      method: b.method,
      income_codes: b.income_codes,
    })),
  };
}

/** Из pdf.js: склеиваем строки по hasEOL (как pypdf), не по Y-позиции. */
export function itemsToLines(items) {
  const lines = [];
  let cur = [];
  for (const item of items) {
    if (item.str) cur.push(item.str);
    if (item.hasEOL) {
      lines.push(cur.join(" ").replace(/\s+/g, " ").trim());
      cur = [];
    }
  }
  if (cur.length) lines.push(cur.join(" ").replace(/\s+/g, " ").trim());
  return lines.filter(Boolean);
}

/** @deprecated оставлено для совместимости; для ФНС не подходит */
export function groupTextItemsByLine(items) {
  const lineMap = new Map();
  for (const item of items) {
    if (!item.str) continue;
    const y = Math.round(item.transform[5]);
    if (!lineMap.has(y)) lineMap.set(y, []);
    lineMap.get(y).push({ x: item.transform[4], str: item.str });
  }
  return [...lineMap.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, words]) =>
      words
        .sort((a, b) => a.x - b.x)
        .map((w) => w.str)
        .join(" ")
    );
}
