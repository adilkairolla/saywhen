// Russian morphology, enumerated as data (spec: no stemmer — inflections are lexicon entries).
// The formatter reads the same tables to pick grammatically agreeing forms.

export type Which = "this" | "next" | "last";
export type Gender = "m" | "f" | "n" | "pl";

// ---------- weekdays (index = day: 0 Sunday … 6 Saturday) ----------

export interface WeekdayForms {
  nom: string;   // понедельник — also matches "в понедельник" where acc = nom
  gen: string;   // понедельника — "с понедельника", "после понедельника"
  acc: string;   // понедельник/среду — "в среду", "по пятницу"
  abbr: string;
  gender: Gender;
}

export const WEEKDAYS: WeekdayForms[] = [
  { nom: "воскресенье", gen: "воскресенья", acc: "воскресенье", abbr: "вс", gender: "n" },
  { nom: "понедельник", gen: "понедельника", acc: "понедельник", abbr: "пн", gender: "m" },
  { nom: "вторник", gen: "вторника", acc: "вторник", abbr: "вт", gender: "m" },
  { nom: "среда", gen: "среды", acc: "среду", abbr: "ср", gender: "f" },
  { nom: "четверг", gen: "четверга", acc: "четверг", abbr: "чт", gender: "m" },
  { nom: "пятница", gen: "пятницы", acc: "пятницу", abbr: "пт", gender: "f" },
  { nom: "суббота", gen: "субботы", acc: "субботу", abbr: "сб", gender: "f" },
];

// ---------- months (index = m: 0 January … 11 December) ----------

export const MONTHS_NOM = [
  "январь", "февраль", "март", "апрель", "май", "июнь",
  "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь",
];
/** genitive — used with day numbers: "21 марта" */
export const MONTHS_GEN = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];
/** prepositional — "в марте" */
export const MONTHS_PREP = [
  "январе", "феврале", "марте", "апреле", "мае", "июне",
  "июле", "августе", "сентябре", "октябре", "ноябре", "декабре",
];
/** "май" is already the nominative — the dedupe in add() makes the empty slot unnecessary, but keep intent clear */
export const MONTH_ABBR: string[][] = [
  ["янв"], ["фев"], ["мар"], ["апр"], [], ["июн"],
  ["июл"], ["авг"], ["сен", "сент"], ["окт"], ["ноя"], ["дек"],
];

// ---------- relative days ----------

export const RELDAYS: Array<[string, number]> = [
  ["сегодня", 0], ["завтра", 1], ["послезавтра", 2], ["вчера", -1], ["позавчера", -2],
];

// ---------- this / next / last: full inflection sets for the lexicon ----------

export const REL_FORMS: Record<Which, string[]> = {
  this: ["этот", "эта", "это", "эти", "этого", "этой", "этих", "эту", "этим", "этом", "этими"],
  next: [
    "следующий", "следующая", "следующее", "следующие", "следующего", "следующей",
    "следующих", "следующую", "следующим", "следующем", "следующими",
    "будущий", "будущая", "будущее", "будущего", "будущей", "будущем", "будущую",
  ],
  last: [
    "прошлый", "прошлая", "прошлое", "прошлые", "прошлого", "прошлой",
    "прошлых", "прошлую", "прошлым", "прошлом", "прошлыми",
  ],
};

// case tables the FORMATTERS use to pick the agreeing form
export const REL_NOM: Record<Which, Record<Gender, string>> = {
  this: { m: "этот", f: "эта", n: "это", pl: "эти" },
  next: { m: "следующий", f: "следующая", n: "следующее", pl: "следующие" },
  last: { m: "прошлый", f: "прошлая", n: "прошлое", pl: "прошлые" },
};
export const REL_GEN: Record<Which, Record<Gender, string>> = {
  this: { m: "этого", f: "этой", n: "этого", pl: "этих" },
  next: { m: "следующего", f: "следующей", n: "следующего", pl: "следующих" },
  last: { m: "прошлого", f: "прошлой", n: "прошлого", pl: "прошлых" },
};
export const REL_ACC: Record<Which, Record<Gender, string>> = {
  this: { m: "этот", f: "эту", n: "это", pl: "эти" },
  next: { m: "следующий", f: "следующую", n: "следующее", pl: "следующие" },
  last: { m: "прошлый", f: "прошлую", n: "прошлое", pl: "прошлые" },
};
export const REL_INS: Record<Which, Record<Gender, string>> = {
  this: { m: "этим", f: "этой", n: "этим", pl: "этими" },
  next: { m: "следующим", f: "следующей", n: "следующим", pl: "следующими" },
  last: { m: "прошлым", f: "прошлой", n: "прошлым", pl: "прошлыми" },
};

// ---------- units ----------

export const UNIT_FORMS = {
  day: ["день", "дня", "дней", "дн"],
  week: ["неделя", "недели", "неделю", "недель", "неделе", "нед"],
  month: ["месяц", "месяца", "месяцев", "месяце", "мес"],
  year: ["год", "года", "году", "лет", "г"],
  hour: ["час", "часа", "часов", "ч"],
  minute: ["минута", "минуты", "минут", "мин"],
} as const;

/** counting triples [n%10==1, n%10 in 2..4, else] — accusative-leaning singular ("через 1 неделю") */
export const UNIT_COUNT: Record<keyof typeof UNIT_FORMS, [string, string, string]> = {
  day: ["день", "дня", "дней"],
  week: ["неделю", "недели", "недель"],
  month: ["месяц", "месяца", "месяцев"],
  year: ["год", "года", "лет"],
  hour: ["час", "часа", "часов"],
  minute: ["минуту", "минуты", "минут"],
};

// ---------- periods / seasons / boundaries ----------

export const WEEKEND_FORMS = ["выходные", "выходных", "выходным"];
export const QUARTER_FORMS = ["квартал", "квартала", "квартале"];

/** formatter noun table for REL-agreeing periods */
export const PERIOD_NOUNS: Record<"week" | "month" | "year" | "weekend" | "quarter",
  { nom: string; gen: string; gender: Gender }> = {
  week: { nom: "неделя", gen: "недели", gender: "f" },
  month: { nom: "месяц", gen: "месяца", gender: "m" },
  year: { nom: "год", gen: "года", gender: "m" },
  weekend: { nom: "выходные", gen: "выходных", gender: "pl" },
  quarter: { nom: "квартал", gen: "квартала", gender: "m" },
};

export const SEASONS: Array<{ nom: string; gen: string; ins: string; gender: Gender; lexicon: string[] }> = [
  { nom: "весна", gen: "весны", ins: "весной", gender: "f", lexicon: ["весна", "весны", "весной", "весне"] },
  { nom: "лето", gen: "лета", ins: "летом", gender: "n", lexicon: ["лето", "лета", "летом"] },
  { nom: "осень", gen: "осени", ins: "осенью", gender: "f", lexicon: ["осень", "осени", "осенью"] },
  { nom: "зима", gen: "зимы", ins: "зимой", gender: "f", lexicon: ["зима", "зимы", "зимой", "зиме"] },
];

export const BOUNDARIES = {
  start: ["начало", "начала", "начале"],
  end: ["конец", "конца", "конце"],
};

// ---------- function words ----------

export const DIRECTIONS: Array<["before" | "after" | "from" | "ago" | "in", string[]]> = [
  ["after", ["после"]],
  ["before", ["до"]],          // "до" ALSO gets a CONNECTOR payload (range "с … до …")
  ["in", ["через", "спустя"]], // "через 2 недели"
  ["ago", ["назад"]],
  ["from", ["от"]],
];

export const CONNECTORS = ["по", "до"];

export const MERIDIEMS: Array<["am" | "pm", string[]]> = [
  ["am", ["утра", "ночи"]],
  ["pm", ["вечера", "дня"]], // "дня" ALSO maps to UNIT day — different kinds, legal ambiguity
];

/** год/года/году/г also map to UNIT year — the FILLER reading lets "2027 года" consume fully */
export const FILLERS = ["в", "во", "на", "к", "с", "со", "год", "года", "году", "г", "число", "числа"];

// ---------- numbers ----------

export const TENS: Record<string, number> = {
  двадцать: 20, тридцать: 30, сорок: 40, пятьдесят: 50,
  шестьдесят: 60, семьдесят: 70, восемьдесят: 80, девяносто: 90,
};

export const CARDINALS: Record<string, number> = {
  один: 1, одна: 1, одно: 1, два: 2, две: 2, три: 3, четыре: 4, пять: 5,
  шесть: 6, семь: 7, восемь: 8, девять: 9, десять: 10,
  одиннадцать: 11, двенадцать: 12, тринадцать: 13, четырнадцать: 14, пятнадцать: 15,
  шестнадцать: 16, семнадцать: 17, восемнадцать: 18, девятнадцать: 19,
  ...TENS,
};

/** neuter + genitive date ordinals; ё words get both spellings (normalize keeps ё) */
export const ORDINALS: Record<string, number> = {
  первое: 1, первого: 1, второе: 2, второго: 2, третье: 3, третьего: 3,
  четвёртое: 4, четвертое: 4, четвёртого: 4, четвертого: 4,
  пятое: 5, пятого: 5, шестое: 6, шестого: 6, седьмое: 7, седьмого: 7,
  восьмое: 8, восьмого: 8, девятое: 9, девятого: 9, десятое: 10, десятого: 10,
  одиннадцатое: 11, одиннадцатого: 11, двенадцатое: 12, двенадцатого: 12,
  тринадцатое: 13, тринадцатого: 13, четырнадцатое: 14, четырнадцатого: 14,
  пятнадцатое: 15, пятнадцатого: 15, шестнадцатое: 16, шестнадцатого: 16,
  семнадцатое: 17, семнадцатого: 17, восемнадцатое: 18, восемнадцатого: 18,
  девятнадцатое: 19, девятнадцатого: 19, двадцатое: 20, двадцатого: 20,
  тридцатое: 30, тридцатого: 30,
};

/** masculine ordinals for accessible quarter phrasing ("первый квартал") */
export const ORD_QUARTER = ["первый", "второй", "третий", "четвёртый"];

// ---------- typing ----------

/** ЙЦУКЕН physical rows (ё sits apart on the backtick key — omitted, no adjacency) */
export const KEYBOARD_ROWS = ["йцукенгшщзхъ", "фывапролджэ", "ячсмитьбю"];

export const TYPO_MAP: Record<string, string> = {
  седня: "сегодня", сёдня: "сегодня", завтро: "завтра",
};
