/**
 * Column hide flag for AG Grid: respects user visibility + optional narrow-screen auto-hide.
 * User can force-show a narrow-hidden column with columnVisibility[field] === true.
 */
export function getAgGridColumnHide(
  field: string,
  columnVisibility: Record<string, boolean>,
  isNarrowScreen: boolean,
  narrowAutoHideFields: Set<string>
): boolean {
  const userHidden = columnVisibility[field] === false;
  const userExplicitShow = columnVisibility[field] === true;
  const narrowHidden =
    isNarrowScreen &&
    narrowAutoHideFields.has(field) &&
    !userExplicitShow;
  return userHidden || narrowHidden;
}
