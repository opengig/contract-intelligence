import azure.functions as func
import contextlib
import io
import json
import os
import traceback
from collections import Counter

import psycopg2
import pandas as pd
import numpy as np

app = func.FunctionApp(http_auth_level=func.AuthLevel.FUNCTION)


# ── shared DB helper injected into every exec namespace ──────────────────────


def _make_globals():
    """Build a globals dict with a live DB connection and helper functions."""

    conn = psycopg2.connect(
        host=os.environ["DB_HOST"],
        port=os.environ["DB_PORT"],
        dbname=os.environ["DB_NAME"],
        user=os.environ["DB_USER"],
        password=os.environ["DB_PASSWORD"],
        sslmode="require",
    )
    cur = conn.cursor()

    def get_table(contract_id: str, table_pattern: str):
        """
        Load a ContractTable into a pandas DataFrame.
        - Strips whitespace from column names and string cells.
        - Deduplicates column names (second 'Rate' → 'Rate_2').
        - Raises ValueError with available table names if not found.
        """
        cur.execute(
            'SELECT name, headers, rows FROM "ContractTable" '
            'WHERE "contractId" = %s AND name ILIKE %s',
            (contract_id, f"%{table_pattern}%"),
        )
        row = cur.fetchone()
        if not row:
            cur.execute(
                'SELECT name FROM "ContractTable" WHERE "contractId" = %s',
                (contract_id,),
            )
            available = [r[0] for r in cur.fetchall()]
            raise ValueError(
                f"Table matching '{table_pattern}' not found for contract '{contract_id}'. "
                f"Available tables: {available}"
            )
        name, headers, rows_data = row

        # Strip and deduplicate column names
        stripped = [str(h).strip() for h in headers]
        counts: Counter = Counter()
        deduped = []
        for h in stripped:
            counts[h] += 1
            deduped.append(h if counts[h] == 1 else f"{h}_{counts[h]}")

        df = pd.DataFrame(rows_data, columns=deduped)
        df = df.apply(lambda c: c.str.strip() if c.dtype == object else c)
        return name, df

    def list_tables(contract_id: str):
        """Print all available tables and their columns for a contract."""
        cur.execute(
            'SELECT name, summary, headers, "rowCount" FROM "ContractTable" '
            'WHERE "contractId" = %s ORDER BY name',
            (contract_id,),
        )
        rows = cur.fetchall()
        if not rows:
            print(f"No tables found for contract {contract_id}")
            return
        for name, summary, headers, row_count in rows:
            cols = [str(h).strip() for h in headers]
            print(f"\n• {name} ({row_count} rows)")
            print(f"  summary: {summary}")
            print(f"  columns: {cols}")

    return {
        "__builtins__": __builtins__,
        "pd": pd,
        "np": np,
        "os": os,
        "json": json,
        "conn": conn,
        "cur": cur,
        "get_table": get_table,
        "list_tables": list_tables,
    }


# ── Azure Function handler ────────────────────────────────────────────────────


@app.route(route="execute", methods=["POST"])
def execute(req: func.HttpRequest) -> func.HttpResponse:
    try:
        body = req.get_json()
    except ValueError:
        return func.HttpResponse(
            json.dumps(
                {
                    "success": False,
                    "stdout": "",
                    "stderr": "Invalid JSON body",
                    "exitCode": 1,
                }
            ),
            status_code=400,
            mimetype="application/json",
        )

    code = body.get("code", "")
    if not code.strip():
        return func.HttpResponse(
            json.dumps(
                {
                    "success": False,
                    "stdout": "",
                    "stderr": "No code provided",
                    "exitCode": 1,
                }
            ),
            status_code=400,
            mimetype="application/json",
        )

    stdout_buf = io.StringIO()
    stderr_buf = io.StringIO()
    exit_code = 0

    try:
        globs = _make_globals()
        with contextlib.redirect_stdout(stdout_buf), contextlib.redirect_stderr(
            stderr_buf
        ):
            exec(compile(code, "<agent_script>", "exec"), globs)  # noqa: S102
    except SystemExit as e:
        exit_code = int(e.code) if e.code is not None else 0
    except Exception:
        stderr_buf.write(traceback.format_exc())
        exit_code = 1
    finally:
        # Close the DB connection created for this request
        try:
            globs["conn"].close()
        except Exception:
            pass

    return func.HttpResponse(
        json.dumps(
            {
                "success": exit_code == 0,
                "stdout": stdout_buf.getvalue(),
                "stderr": stderr_buf.getvalue(),
                "exitCode": exit_code,
            }
        ),
        mimetype="application/json",
    )
