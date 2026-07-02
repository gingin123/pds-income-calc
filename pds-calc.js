/** Порт compute_pds_average_income из pds-income-service/main.py */

const THRESHOLD_80K = 80_000;
const THRESHOLD_150K = 150_000;

function classifyBand(avgMonthlyRub) {
  if (avgMonthlyRub <= THRESHOLD_80K) {
    return {
      band: "up_to_80k",
      band_label_ru: "до 80 000 ₽ в месяц (включительно)",
    };
  }
  if (avgMonthlyRub <= THRESHOLD_150K) {
    return {
      band: "from_80k_001_to_150k",
      band_label_ru: "от 80 001 ₽ до 150 000 ₽ в месяц (включительно)",
    };
  }
  return {
    band: "above_150k",
    band_label_ru: "свыше 150 000 ₽ в месяц",
  };
}

export function computePdsAverageIncome({
  certificate_total_rub,
  deposit_interest_rub = 0,
  extra_declared_rub = 0,
}) {
  const annual =
    Number(certificate_total_rub) +
    Number(deposit_interest_rub) +
    Number(extra_declared_rub);
  const avg = annual / 12;
  const { band, band_label_ru } = classifyBand(avg);

  return {
    annual_income_rub: Math.round(annual * 100) / 100,
    average_monthly_rub: Math.round(avg * 100) / 100,
    band,
    band_label_ru,
    thresholds_note_ru:
      "Границы для ориентира: до 80 000 ₽; 80 001–150 000 ₽; свыше 150 000 ₽ " +
      "(среднемесячно). Уточняйте актуальные коэффициенты и правила в программе ПДС и на " +
      "https://minfin.gov.ru/ru/perfomance/pds/calc/",
    certificate_total_rub: Number(certificate_total_rub),
  };
}
