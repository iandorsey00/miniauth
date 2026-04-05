declare module "better-sqlite3" {
  type RunResult = {
    changes: number;
    lastInsertRowid: number | bigint;
  };

  type Statement = {
    all(...params: unknown[]): unknown[];
    get(...params: unknown[]): unknown;
    run(...params: unknown[]): RunResult;
  };

  export default class Database {
    constructor(path: string, options?: { readonly?: boolean; fileMustExist?: boolean });
    prepare(sql: string): Statement;
    close(): void;
  }
}
