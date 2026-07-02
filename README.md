# ПДС — расчёт среднемесячного дохода (GitHub Pages)

Статическая версия калькулятора: PDF ФНС + проценты по вкладам → категория ПДС.  
Весь расчёт в браузере, без сервера (доступно из РФ без VPN).

**Production:** https://gingin123.github.io/pds-income-calc/

> `tov-checker` — приватный репо, GitHub Pages на free-плане недоступен. Статика выложена в публичный [`pds-income-calc`](https://github.com/gingin123/pds-income-calc).

**Источник логики:** `pds-income-service/main.py`  
**UI:** копия `pds-income-service/web/index.html`

## Обновить после правок

1. Синхронизируйте логику в `fns-pdf.js` / `pds-calc.js` с `main.py` (или UI с `web/index.html`).
2. Push в `main` — GitHub Actions задеплоит в Pages автоматически.

## Локально

```bash
cd docs/pds-income
python3 -m http.server 8765
# http://127.0.0.1:8765/
```

## Vercel (запасной канал)

`pds-income-service.vercel.app` — FastAPI; из РФ может не открываться без VPN.
