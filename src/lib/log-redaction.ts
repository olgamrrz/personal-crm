// Database errors carry the values of the failed query: Drizzle puts its parameters into the message,
// and Postgres repeats parts of the row in `detail` ("Failing row contains (...)"). Those values are the
// names, phones and notes of real people, so the server log gets a copy without them: the query with its
// $1, $2 placeholders, the Postgres code and the names of the table, column and constraint.

type ErrorFields = Error & Record<string, unknown>;

// Detected by their fields, not by class: class names are minified in the production build
function isDrizzleQueryError(error: ErrorFields) {
  return typeof error.query === "string" && Array.isArray(error.params);
}

function isPostgresError(error: ErrorFields) {
  return typeof error.severity === "string" && typeof error.code === "string";
}

const MAX_CAUSE_DEPTH = 10;

function causes(error: Error) {
  const chain: ErrorFields[] = [];
  let current: unknown = error;
  while (current instanceof Error && chain.length < MAX_CAUSE_DEPTH) {
    chain.push(current as ErrorFields);
    current = current.cause;
  }
  return chain;
}

// The lines of the stack after its first line, which repeats the message
function stackFrames(error: Error) {
  const lines = (error.stack ?? "").split("\n");
  const first = lines.findIndex((line) => /^\s+at /.test(line));
  return first === -1 ? [] : lines.slice(first);
}

function safeError(source: ErrorFields, name: string, message: string) {
  const error = new Error(message) as ErrorFields;
  Object.defineProperty(error, "name", { value: name, configurable: true, writable: true });
  error.stack = [`${name}: ${message}`, ...stackFrames(source)].join("\n");
  if (typeof source.digest === "string") error.digest = source.digest;
  return error;
}

// Only names from the schema: the message and `detail`, `hint`, `where` may quote values
function describePostgresError(error: ErrorFields) {
  const parts = [`code ${String(error.code)}`];
  const names = [
    ["table", error.table_name],
    ["column", error.column_name],
    ["constraint", error.constraint_name],
    ["type", error.data_type_name],
  ] as const;
  for (const [label, value] of names) {
    if (typeof value === "string") parts.push(`${label} ${value}`);
  }
  return parts.join(", ");
}

// `insideQuery`: the error came out of a database query, so any text in it is suspect except driver errors
function redact(error: ErrorFields, insideQuery: boolean, depth: number): ErrorFields {
  let safe: ErrorFields;
  if (isDrizzleQueryError(error)) {
    safe = safeError(error, "Error", `Failed query: ${String(error.query)}`);
    insideQuery = true;
  } else if (isPostgresError(error)) {
    return safeError(error, "PostgresError", describePostgresError(error));
  } else {
    // Connection problems from the driver or Node.js ("connect ECONNREFUSED 10.0.0.2:5432") name the
    // server, not the data; an error around a database error is the app's own text
    safe = safeError(error, error.name, error.message);
    if (insideQuery && typeof error.code === "string") safe.code = error.code;
    if (insideQuery && Array.isArray(error.errors)) {
      safe.errors = error.errors.map((inner: unknown) =>
        inner instanceof Error ? redact(inner as ErrorFields, true, depth + 1) : "[redacted]",
      );
    }
  }

  if (error.cause instanceof Error && depth < MAX_CAUSE_DEPTH) {
    // Not enumerable, like a cause passed to `new Error()`, so the log prints it the usual way
    Object.defineProperty(safe, "cause", {
      value: redact(error.cause as ErrorFields, insideQuery, depth + 1),
      configurable: true,
      writable: true,
    });
  }
  return safe;
}

// Returns a copy of a database error without the values; anything else comes back as it is.
// The original is not changed: the app still reads the Postgres code from it (see groups.ts).
export function redactDatabaseError(value: unknown): unknown {
  if (!(value instanceof Error)) return value;
  if (!causes(value).some((error) => isDrizzleQueryError(error) || isPostgresError(error))) return value;
  return redact(value as ErrorFields, false, 0);
}

const CONSOLE_METHODS = ["error", "warn", "log", "info", "debug"] as const;

type LogMethod = (...args: unknown[]) => void;
type LogTarget = Record<(typeof CONSOLE_METHODS)[number], LogMethod>;

// Marks a method that already redacts, so installing twice does not wrap it again
const REDACTING = Symbol.for("personal-crm.log-redaction");

// Next.js prints server errors through the console, so wrapping it covers every page, action and route
export function installLogRedaction(target: LogTarget = console) {
  for (const method of CONSOLE_METHODS) {
    const original = target[method] as LogMethod & { [REDACTING]?: true };
    if (original[REDACTING]) continue;

    const redacting = function (this: unknown, ...args: unknown[]) {
      return original.apply(this, args.map(redactDatabaseError));
    } as LogMethod & { [REDACTING]?: true };
    redacting[REDACTING] = true;
    target[method] = redacting;
  }
}
