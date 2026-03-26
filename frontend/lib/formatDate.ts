/**
 * App-wide date display: MM/DD/YYYY (US, zero-padded).
 */

function toValidDate(input: string | Date | null | undefined): Date | null {
  if (input == null || input === "") return null;
  const d = input instanceof Date ? input : new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** MM/DD/YYYY */
export function formatAppDate(
  input: string | Date | null | undefined,
  empty: string = "—"
): string {
  const d = toValidDate(input);
  if (!d) return empty;
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

/** MM/DD/YYYY, h:mm AM/PM */
export function formatAppDateTime(
  input: string | Date | null | undefined,
  empty: string = "—"
): string {
  const d = toValidDate(input);
  if (!d) return empty;
  const datePart = formatAppDate(d, empty);
  if (datePart === empty) return empty;
  const time = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${datePart}, ${time}`;
}

/** Time only (12-hour US), for compact UI */
export function formatAppTime(
  input: string | Date | null | undefined,
  empty: string = ""
): string {
  const d = toValidDate(input);
  if (!d) return empty;
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}
