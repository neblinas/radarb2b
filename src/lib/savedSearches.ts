export type SavedSearchFilters = {
  query?: string | null;
  procedureType?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  valueFrom?: string | number | null;
  valueTo?: string | number | null;
};

export function buildSearchUrl(filters: SavedSearchFilters) {
  const params = new URLSearchParams();

  if (filters.query) {
    params.set("query", String(filters.query));
  }

  if (filters.procedureType) {
    params.set("procedureType", String(filters.procedureType));
  }

  if (filters.dateFrom) {
    params.set("dateFrom", String(filters.dateFrom));
  }

  if (filters.dateTo) {
    params.set("dateTo", String(filters.dateTo));
  }

  if (
    filters.valueFrom !== null &&
    filters.valueFrom !== undefined &&
    filters.valueFrom !== ""
  ) {
    params.set("valueFrom", String(filters.valueFrom));
  }

  if (
    filters.valueTo !== null &&
    filters.valueTo !== undefined &&
    filters.valueTo !== ""
  ) {
    params.set("valueTo", String(filters.valueTo));
  }

  const queryString = params.toString();

  return queryString ? `/pesquisa?${queryString}` : "/pesquisa";
}
