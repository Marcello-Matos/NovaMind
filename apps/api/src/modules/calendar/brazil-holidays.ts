/**
 * Feriados nacionais do Brasil calculados localmente — não dependem da
 * integração com o Google Calendar.
 *
 * Fixos: Lei 662/1949, Lei 6.802/1980 (N. Sra. Aparecida) e
 * Lei 14.759/2023 (Consciência Negra, a partir de 2024).
 * Móveis (derivados da Páscoa): Carnaval e Corpus Christi são pontos
 * facultativos nacionais, mas constam no calendário oficial e nas
 * agendas de feriados mais usadas.
 */
export interface BrazilHoliday {
  date: string; // yyyy-mm-dd
  name: string;
}

const FIXED: Array<{ month: number; day: number; name: string; since?: number }> = [
  { month: 1, day: 1, name: 'Confraternização Universal' },
  { month: 4, day: 21, name: 'Tiradentes' },
  { month: 5, day: 1, name: 'Dia do Trabalho' },
  { month: 9, day: 7, name: 'Independência do Brasil' },
  { month: 10, day: 12, name: 'Nossa Senhora Aparecida' },
  { month: 11, day: 2, name: 'Finados' },
  { month: 11, day: 15, name: 'Proclamação da República' },
  { month: 11, day: 20, name: 'Dia Nacional de Zumbi e da Consciência Negra', since: 2024 },
  { month: 12, day: 25, name: 'Natal' },
];

const MOVABLE: Array<{ offset: number; name: string }> = [
  { offset: -48, name: 'Carnaval (ponto facultativo)' },
  { offset: -47, name: 'Carnaval (ponto facultativo)' },
  { offset: -2, name: 'Sexta-feira Santa' },
  { offset: 0, name: 'Páscoa' },
  { offset: 60, name: 'Corpus Christi (ponto facultativo)' },
];

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher, calendário gregoriano). */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

export function brazilHolidays(year: number): BrazilHoliday[] {
  const easter = easterSunday(year).getTime();
  return [
    ...FIXED.filter((h) => !h.since || year >= h.since).map((h) => ({
      date: iso(new Date(Date.UTC(year, h.month - 1, h.day))),
      name: h.name,
    })),
    ...MOVABLE.map((h) => ({
      date: iso(new Date(easter + h.offset * 86_400_000)),
      name: h.name,
    })),
  ].sort((x, y) => x.date.localeCompare(y.date));
}

/** Feriados cujo dia (yyyy-mm-dd) cai em [from, to). */
export function brazilHolidaysBetween(from: Date, to: Date): BrazilHoliday[] {
  // Comparação por dia: feriados são de dia inteiro, independentes de fuso.
  const fromDay = iso(from);
  const toDay = iso(to);
  const result: BrazilHoliday[] = [];
  for (let y = from.getUTCFullYear(); y <= to.getUTCFullYear(); y++) {
    result.push(
      ...brazilHolidays(y).filter((h) => h.date >= fromDay && h.date < toDay),
    );
  }
  return result;
}
