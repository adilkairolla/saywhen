import { getMonthGrid } from "@saywhen/core/controller";

export interface CalendarGridProps {
  year: number;
  month: number; // 0-based
  weekStart?: 0 | 1;
  selected?: string; // YYYY-MM-DD
  onSelect?: (date: string) => void;
}

const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const pad = (n: number) => String(n).padStart(2, "0");

export function CalendarGrid({ year, month, weekStart = 0, selected, onSelect }: CalendarGridProps) {
  const grid = getMonthGrid(year, month, weekStart);
  const header = weekStart === 1 ? [...DOW.slice(1), DOW[0]!] : DOW;
  // A native <table> (not role="grid") keeps it presentational and axe-clean — full
  // roving-tabindex grid keyboard semantics are future work (see Known gaps).
  return (
    <table aria-label={`${MONTHS[month]!} ${year}`} className="border-collapse text-center text-sm">
      <thead>
        <tr>
          {header.map((d) => (
            <th key={d} scope="col" className="p-1 font-medium text-muted-foreground">
              {d}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {grid.map((row, r) => (
          <tr key={r}>
            {row.map((cell) => {
              const iso = `${cell.y}-${pad(cell.m + 1)}-${pad(cell.d)}`;
              const isSelected = selected === iso;
              return (
                <td key={iso} className="p-0">
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => onSelect?.(iso)}
                    className={`h-9 w-9 rounded ${cell.inMonth ? "" : "text-muted-foreground"} ${
                      isSelected ? "bg-primary text-primary-foreground" : "hover:bg-accent"
                    }`}
                  >
                    {cell.d}
                  </button>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
