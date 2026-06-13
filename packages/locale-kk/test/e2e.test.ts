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
