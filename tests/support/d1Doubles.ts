type Row = Record<string, unknown>;

export function d1Result(results: Row[], meta: Partial<D1Meta> = {}): D1Result<Row> {
  return {
    success: true,
    results,
    meta: { duration: 0, size_after: 0, rows_read: 0, rows_written: 0, last_row_id: 0, changed_db: false, changes: 0, ...meta },
  };
}

export abstract class D1StatementDouble implements D1PreparedStatement {
  constructor(
    readonly sql: string,
    public params: unknown[] = [],
  ) {}

  bind(...params: unknown[]): D1PreparedStatement {
    return this.boundTo(params);
  }

  protected boundTo(params: unknown[]): D1PreparedStatement {
    this.params = params;
    return this;
  }

  protected abstract allRows(): Promise<D1Result<Row>>;

  protected abstract rawRows(columnNames: boolean): Promise<unknown[][]>;

  protected runRows(): Promise<D1Result<Row>> {
    return this.allRows();
  }

  all<T = Row>(): Promise<D1Result<T>>;
  all(): Promise<D1Result<Row>> {
    return this.allRows();
  }

  run<T = Row>(): Promise<D1Result<T>>;
  run(): Promise<D1Result<Row>> {
    return this.runRows();
  }

  raw<T = unknown[]>(options: { columnNames: true }): Promise<[string[], ...T[]]>;
  raw<T = unknown[]>(options?: { columnNames?: false }): Promise<T[]>;
  raw(options?: { columnNames?: boolean }): Promise<unknown[][]> {
    return this.rawRows(options?.columnNames === true);
  }

  first<T = unknown>(column: string): Promise<T | null>;
  first<T = Row>(): Promise<T | null>;
  async first(column?: string): Promise<unknown> {
    const [row] = (await this.allRows()).results;
    if (!row) return null;
    return column ? row[column] : row;
  }
}

export abstract class D1DatabaseDouble implements D1Database {
  abstract prepare(sql: string): D1PreparedStatement;

  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  batch(statements: D1PreparedStatement[]): Promise<D1Result<Row>[]> {
    return this.batchRows(statements);
  }

  protected batchRows(statements: D1PreparedStatement[]): Promise<D1Result<Row>[]> {
    return Promise.all(statements.map((statement) => statement.all()));
  }

  exec(): Promise<D1ExecResult> {
    throw new Error(`${this.constructor.name} runs no exec()`);
  }

  withSession(): D1DatabaseSession {
    throw new Error(`${this.constructor.name} opens no session`);
  }

  dump(): Promise<ArrayBuffer> {
    throw new Error(`${this.constructor.name} takes no dump`);
  }
}
