import { describe, expect, test } from "vitest";
import { createEngine, type ParseContext } from "@saywhen/core";
import { kk } from "../src/index.js";

const engine = createEngine({ locale: kk });
// Friday 2026-06-12 in Almaty (UTC+5, no DST); weekStart 1 (Monday), dateOrder DMY
const CTX: ParseContext = { now: new Date("2026-06-12T08:00:00Z"), timeZone: "Asia/Almaty" };
const top = (text: string, ctx: ParseContext = CTX) => {
  const r = engine.parse(text, ctx);
  if (r.candidates.length === 0) throw new Error(`no parse for "${text}": ${r.errors.join("; ")}`);
  return r.candidates[0]!;
};

describe("single dates (kk)", () => {
  test.each([
    ["бүгін", "2026-06-12"],
    ["ертең", "2026-06-13"],
    ["бүрсігүні", "2026-06-14"],
    ["кеше", "2026-06-11"],
    ["жұма", "2026-06-12"],              // today is Friday
    ["сәрсенбі", "2026-06-17"],          // this week's Wed (06-10) passed → next
    ["келесі жұма", "2026-06-19"],
    ["өткен сәрсенбі", "2026-06-03"],   // "last Wed" = previous week (core week-based model; cf. ru "прошлая среда")
    ["дс", "2026-06-15"],                // abbreviation: next Monday
    ["21 наурыз", "2027-03-21"],         // March 21 2026 passed → next year
    ["4 наурыз 2026", "2026-03-04"],
    ["21-і", "2026-06-21"],
    ["қыркүйек", "2026-09-01"],
    ["наурызда", "2027-03-01"],          // locative month "in March"
  ])("'%s' → %s", (text, date) => {
    expect(top(text).start.date).toBe(date);
  });

  test("Latin input is accepted under kk (dual-script)", () => {
    expect(top("erteñ").start.date).toBe("2026-06-13");
    expect(top("kelesi jūma").start.date).toBe("2026-06-19"); // cyrToLat("келесі жұма")
  });
});

describe("relative, periods, ranges, time (kk)", () => {
  test.each([
    ["2 аптадан кейін", "2026-06-26", "2026-06-26"],
    ["аптадан кейін", "2026-06-19", "2026-06-19"],       // bare unit → n = 1
    ["бір аптадан кейін", "2026-06-19", "2026-06-19"],
    ["2 апта бұрын", "2026-05-29", "2026-05-29"],
    ["осы апта", "2026-06-08", "2026-06-14"],             // Monday weeks
    ["келесі апта", "2026-06-15", "2026-06-21"],
    ["келесі ай", "2026-07-01", "2026-07-31"],
    ["осы демалыс", "2026-06-13", "2026-06-14"],
    ["жаз", "2026-06-01", "2026-08-31"],                 // this summer
    ["дүйсенбіден жұмаға дейін", "2026-06-15", "2026-06-19"], // postpositional range (core rule)
    ["дүйсенбі - жұма", "2026-06-15", "2026-06-19"],          // dash range (canonical form)
    ["келесі жұма + 2 апта", "2026-07-03", "2026-07-03"],
  ])("'%s' → %s..%s", (text, start, end) => {
    const c = top(text);
    expect(c.start.date).toBe(start);
    expect(c.end.date).toBe(end);
  });
});

describe("times (Almaty = UTC+5)", () => {
  test.each([
    ["жұма сағат 17:30", "2026-06-12T12:30:00.000Z"],
    ["ертең түс", "2026-06-13T07:00:00.000Z"],            // noon
    ["дүйсенбі сағат 9:30", "2026-06-15T04:30:00.000Z"],
  ])("'%s' → %s", (text, iso) => {
    expect(top(text).start.utcIso).toBe(iso);
  });
});
