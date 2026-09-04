export function evaluateAuthenticatedTemplateVisibility({
  databaseOwnedIds,
  apiStatus,
  apiRows,
  ownerId,
}) {
  const databaseIds = new Set(databaseOwnedIds.map(String));
  const base = {
    check: "authenticated-template-visibility",
    databaseOwnedCount: databaseIds.size,
    httpStatus: apiStatus,
  };
  if (apiStatus < 200 || apiStatus >= 300) {
    return { ...base, apiVisibleCount: null, failure: "authenticated_api_error", verdict: "fail" };
  }
  if (!Array.isArray(apiRows)) {
    return { ...base, apiVisibleCount: null, failure: "invalid_authenticated_api_payload", verdict: "fail" };
  }
  const apiIds = new Set(
    apiRows.filter((row) => row && typeof row === "object" && row.user_id === ownerId)
      .map((row) => String(row.id)),
  );
  const missing = [...databaseIds].some((id) => !apiIds.has(id));
  return {
    ...base,
    apiVisibleCount: apiIds.size,
    ...(missing ? { failure: "owned_rows_missing_from_authenticated_api" } : {}),
    verdict: missing ? "fail" : "pass",
  };
}

export async function checkAuthenticatedTemplateVisibility({
  database,
  ownerId,
  endpoint,
  bearerToken,
  fetchImpl = fetch,
}) {
  const ownedRows = database.prepare(`
    SELECT id
    FROM templates
    WHERE user_id = ?
      AND owner_type = 'user'
      AND team_id IS NULL
      AND deleted_at IS NULL
    ORDER BY id
  `).all(ownerId);
  const databaseOwnedIds = ownedRows.map((row) => String(row.id));

  let response;
  try {
    response = await fetchImpl(endpoint, {
      headers: { authorization: `Bearer ${bearerToken}` },
    });
  } catch {
    return {
      check: "authenticated-template-visibility",
      databaseOwnedCount: databaseOwnedIds.length,
      httpStatus: null,
      apiVisibleCount: null,
      failure: "authenticated_api_error",
      verdict: "fail",
    };
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  return evaluateAuthenticatedTemplateVisibility({
    databaseOwnedIds,
    apiStatus: response.status,
    apiRows: payload,
    ownerId,
  });
}
