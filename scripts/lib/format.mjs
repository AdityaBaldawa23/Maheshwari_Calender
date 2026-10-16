/**
 * Human-friendly JSON layout: one line per day / per occasion, so the files are
 * easy to scan, edit by hand, and review in diffs.
 */

export function formatCalendarJson(data) {
  const header = JSON.stringify({ year: data.year, meta: data.meta }, null, 2);
  const dayLines = Object.entries(data.days).map(
    ([key, record]) => `    ${JSON.stringify(key)}: ${JSON.stringify(record)}`,
  );
  return `${header.slice(0, -2)},\n  "days": {\n${dayLines.join(',\n')}\n  }\n}\n`;
}

export function formatOccasionsJson(data) {
  const header = JSON.stringify({ year: data.year, meta: data.meta }, null, 2);
  const lines = data.occasions.map((o) => `    ${JSON.stringify(o)}`);
  return `${header.slice(0, -2)},\n  "occasions": [\n${lines.join(',\n')}\n  ]\n}\n`;
}
