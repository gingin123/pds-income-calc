import { parseFnsIncomeText, itemsToLines } from "./fns-pdf.js";
import { computePdsAverageIncome } from "./pds-calc.js";

const pdfjsLib = globalThis.pdfjsLib;
if (!pdfjsLib) {
  throw new Error("pdf.js не загрузился. Обновите страницу.");
}

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "./vendor/pdf.worker.min.js",
  import.meta.url
).href;

const form = document.getElementById("form");
const err = document.getElementById("err");
const result = document.getElementById("result");
const btn = document.getElementById("btn");

function showError(msg) {
  err.textContent = msg;
  err.classList.add("visible");
}

function hideError() {
  err.classList.remove("visible");
  err.textContent = "";
}

function fmt(n) {
  if (n == null || Number.isNaN(n)) return "—";
  return (
    new Intl.NumberFormat("ru-RU", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n) + " ₽"
  );
}

function tierFromBand(band) {
  const map = {
    up_to_80k: { num: "1", title: "1-я категория дохода" },
    from_80k_001_to_150k: { num: "2", title: "2-я категория дохода" },
    above_150k: { num: "3", title: "3-я категория дохода" },
  };
  return map[band] || { num: "?", title: "Категория" };
}

function govSupportContributionHint(band) {
  const blocks = {
    up_to_80k: {
      html:
        "Если среднемесячный доход <strong>до 80 000 ₽</strong>, ориентир по личным взносам за год, чтобы получить максимум господдержки (<strong>до 36 000 ₽</strong> от государства), — <strong>36 000 ₽</strong>.",
    },
    from_80k_001_to_150k: {
      html:
        "Если доход <strong>от 80 001 до 150 000 ₽</strong> в месяц, ориентир по личным взносам за год — <strong>72 000 ₽</strong> (потолок поддержки по-прежнему до 36 000 ₽ в год).",
    },
    above_150k: {
      html:
        "Если доход <strong>свыше 150 000 ₽</strong> в месяц, ориентир по личным взносам за год — <strong>144 000 ₽</strong> (потолок поддержки до 36 000 ₽ в год).",
    },
  };
  const b = blocks[band];
  if (!b) return { html: "" };
  return {
    html:
      b.html +
      '<span class="gov-disclaimer">Ориентир по типовым правилам программы; фактические начисления — в личном кабинете НПФ и по данным ФНС.</span>',
  };
}

function launchSalute() {
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText =
    "position:fixed;inset:0;pointer-events:none;z-index:10000;width:100%;height:100%";
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  let w = (canvas.width = innerWidth);
  let h = (canvas.height = innerHeight);
  const bursts = [];
  const colors = ["#ffd54a", "#ff7043", "#21a038", "#42a5f5", "#e040fb", "#fff176"];
  for (let b = 0; b < 5; b++) {
    const cx = (w / 6) * (b + 0.6) + (Math.random() - 0.5) * 80;
    const cy = h * (0.25 + Math.random() * 0.2);
    for (let i = 0; i < 55; i++) {
      const ang = (Math.PI * 2 * i) / 55 + Math.random() * 0.4;
      const sp = 3 + Math.random() * 6;
      bursts.push({
        x: cx,
        y: cy,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        g: 0.06 + Math.random() * 0.04,
        life: 1,
        c: colors[(i + b) % colors.length],
        sz: 2 + Math.random() * 3,
      });
    }
  }
  let start = performance.now();
  const dur = 2200;
  function frame(now) {
    const t = now - start;
    if (t > dur) {
      canvas.remove();
      return;
    }
    ctx.clearRect(0, 0, w, h);
    for (const p of bursts) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.g;
      p.life = 1 - t / dur;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.c;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.sz, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  const onResize = () => {
    w = canvas.width = innerWidth;
    h = canvas.height = innerHeight;
  };
  window.addEventListener("resize", onResize);
  setTimeout(() => window.removeEventListener("resize", onResize), dur + 100);
}

async function extractPdfText(arrayBuffer) {
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const parts = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    parts.push(itemsToLines(content.items).join("\n"));
  }
  return parts.join("\n");
}

function renderResult(data, parsed) {
  document.getElementById("avgBig").textContent = fmt(data.average_monthly_rub);
  document.getElementById("annual").textContent = fmt(data.annual_income_rub);
  document.getElementById("cert").textContent = fmt(data.certificate_total_rub);

  const tier = tierFromBand(data.band);
  document.getElementById("pdsTierNum").textContent = tier.num;
  document.getElementById("pdsTierTitle").textContent = tier.title;
  document.getElementById("pdsTierDesc").textContent =
    (data.band_label_ru || "—") +
    " Итог по справке и введённым суммам — ориентир для прошлого года; факт софинансирования определяет ФНС.";

  const govEl = document.getElementById("pdsGovHint");
  const gov = govSupportContributionHint(data.band);
  if (gov.html) {
    govEl.innerHTML = gov.html;
    govEl.hidden = false;
  } else {
    govEl.innerHTML = "";
    govEl.hidden = true;
  }

  document.getElementById("thresholds").textContent = data.thresholds_note_ru || "";

  const w = parsed?.warnings || [];
  const wEl = document.getElementById("warnings");
  if (w.length) {
    wEl.innerHTML =
      "<strong>Предупреждения:</strong><br>" + w.map((x) => "• " + x).join("<br>");
  } else {
    wEl.textContent = "";
  }

  const tbody = document.querySelector("#tbl tbody");
  tbody.innerHTML = "";
  const br = parsed?.certificate_breakdown || [];
  if (br.length) {
    document.getElementById("details").open = false;
    for (const b of br) {
      const tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" +
        (b.inn || "") +
        "</td><td>" +
        fmt(b.pds_amount_rub) +
        "</td><td>" +
        (b.method || "") +
        "</td><td>" +
        (b.income_codes || []).join(", ") +
        "</td>";
      tbody.appendChild(tr);
    }
    document.getElementById("details").style.display = "";
  } else {
    document.getElementById("details").style.display = "none";
  }

  result.classList.add("visible");
}

document.getElementById("openPds").addEventListener("click", () => {
  launchSalute();
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideError();
  result.classList.remove("visible");

  const file = document.getElementById("pdf").files[0];
  if (!file) {
    showError("Выберите PDF-файл.");
    return;
  }

  const depRaw = document.getElementById("deposit").value.trim();
  const exRaw = document.getElementById("extra").value.trim();
  const deposit = depRaw === "" ? 0 : parseFloat(depRaw.replace(",", "."));
  const extra = exRaw === "" ? 0 : parseFloat(exRaw.replace(",", "."));

  btn.disabled = true;
  btn.textContent = "Считаем…";
  try {
    const buf = await file.arrayBuffer();
    const text = await extractPdfText(buf);
    const parsed = parseFnsIncomeText(text);
    if (!parsed.blocks.length) {
      showError(
        "Не удалось разобрать справку: проверьте, что это PDF «Сведения о доходах» с Госуслуг/ФНС. " +
          (parsed.warnings[0] || "")
      );
      return;
    }
    const data = computePdsAverageIncome({
      certificate_total_rub: parsed.certificate_total_rub,
      deposit_interest_rub: deposit,
      extra_declared_rub: extra,
    });
    renderResult(data, parsed);
  } catch (x) {
    showError(x.message || String(x));
  } finally {
    btn.disabled = false;
    btn.textContent = "Посчитать";
  }
});
