import { describe, expect, test } from "vitest";
import { createEngine, type ParseContext } from "@saywhen/core";
import { ru } from "../src/index.js";

const engine = createEngine({ locale: ru });
// Friday 2026-06-12, 11:00 in Moscow (UTC+3, no DST); weekStart 1, dateOrder DMY
const CTX: ParseContext = { now: new Date("2026-06-12T08:00:00Z"), timeZone: "Europe/Moscow" };

const top = (text: string, ctx: ParseContext = CTX) => {
  const r = engine.parse(text, ctx);
  if (r.candidates.length === 0) throw new Error(`no parse for "${text}": ${r.errors.join("; ")}`);
  return r.candidates[0]!;
};

describe("single dates", () => {
  test.each([
    ["сегодня", "2026-06-12"],
    ["завтра", "2026-06-13"],
    ["послезавтра", "2026-06-14"],
    ["вчера", "2026-06-11"],
    ["позавчера", "2026-06-10"],
    ["пятница", "2026-06-12"],
    ["в среду", "2026-06-17"],
    ["следующая пятница", "2026-06-19"],
    ["следующее воскресенье", "2026-06-21"],   // Monday weeks: this week's Sunday is 06-14
    ["прошлая среда", "2026-06-03"],
    ["пт", "2026-06-12"],
    ["вт", "2026-06-16"],
    ["21 марта", "2027-03-21"],
    ["21-го марта", "2027-03-21"],
    ["двадцать первое марта", "2027-03-21"],
    ["21 марта 2027 года", "2027-03-21"],      // "года" must read as filler here
    ["4 марта 2026", "2026-03-04"],
    ["21-е", "2026-06-21"],
    ["третье", "2026-07-03"],                  // June 3 passed → rolls to next month
    ["сентябрь", "2026-09-01"],
    ["в марте", "2027-03-01"],                 // prepositional month form
  ])("'%s' → %s", (text, date) => {
    expect(top(text).start.date).toBe(date);
  });

  test("DMY default: '3/4' ranks April 3 over March 4", () => {
    const r = engine.parse("3/4", CTX);
    expect(r.candidates[0]!.start.date).toBe("2027-04-03");
    expect(r.candidates[1]!.start.date).toBe("2027-03-04");
  });
});

describe("relative, periods, ranges", () => {
  test.each([
    ["через 2 недели", "2026-06-26", "2026-06-26"],
    ["через 21 день", "2026-07-03", "2026-07-03"],
    ["2 недели назад", "2026-05-29", "2026-05-29"],
    ["прошлые 2 недели", "2026-05-29", "2026-06-12"],
    ["следующая неделя", "2026-06-15", "2026-06-21"], // Monday weeks
    ["эта неделя", "2026-06-08", "2026-06-14"],
    ["в следующем году", "2027-01-01", "2027-12-31"],
    ["эти выходные", "2026-06-13", "2026-06-14"],
    ["конец следующего месяца", "2026-07-31", "2026-07-31"],
    ["начало следующей недели", "2026-06-15", "2026-06-15"],
    ["конец этого месяца", "2026-06-30", "2026-06-30"],
    ["с понедельника по пятницу", "2026-06-15", "2026-06-19"],
    ["понедельник - пятница", "2026-06-15", "2026-06-19"],
    ["3 дня до 4 марта", "2027-03-01", "2027-03-01"],
    ["2 недели после следующей пятницы", "2026-07-03", "2026-07-03"],
    ["следующая пятница + 2 недели", "2026-07-03", "2026-07-03"],
    ["это лето", "2026-06-01", "2026-08-31"],
  ])("'%s' → %s..%s", (text, start, end) => {
    const c = top(text);
    expect(c.start.date).toBe(start);
    expect(c.end.date).toBe(end);
  });
});

describe("times (Moscow = UTC+3)", () => {
  test.each([
    ["пятница в 5 вечера", "2026-06-12T14:00:00.000Z"],
    ["завтра в полдень", "2026-06-13T09:00:00.000Z"],
    ["завтра в полночь", "2026-06-12T21:00:00.000Z"],
    ["пятница в 17:30", "2026-06-12T14:30:00.000Z"],
    ["понедельник в 9:30", "2026-06-15T06:30:00.000Z"],
  ])("'%s' → %s", (text, iso) => {
    expect(top(text).start.utcIso).toBe(iso);
  });
});

describe("typos (ЙЦУКЕН keyboard + curated map)", () => {
  test("'пятнца' corrects to пятница", () => {
    const r = engine.parse("пятнца", CTX);
    expect(r.corrections).toHaveLength(1);
    expect(r.candidates[0]!.start.date).toBe("2026-06-12");
  });
  test.each([
    ["седня", "2026-06-12"],      // curated
    ["завтро", "2026-06-13"],     // curated
    ["зватра", "2026-06-13"],     // transposition, cost 0.5
    ["понеделник", "2026-06-15"], // dropped ь, cost 1 within len-10 threshold 2
  ])("'%s' → %s", (text, date) => {
    expect(top(text).start.date).toBe(date);
  });
});

describe("bare-unit offsets (plan 04 closes the plan-03 gap)", () => {
  test.each([
    ["через неделю", "2026-06-19"],
    ["через месяц", "2026-07-12"],
    ["через год", "2027-06-12"],
  ])("'%s' → %s", (text, date) => {
    expect(top(text).start.date).toBe(date);
  });
});
