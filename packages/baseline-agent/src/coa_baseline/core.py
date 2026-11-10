# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

"""The "without COA" baseline: plain text-to-SQL over raw Glue schema.

What it deliberately does NOT use: the ontology, governed metrics, documents,
or COA's business descriptions. It sees what a generic assistant pointed at
the data catalog would see (table names, column names and types, and the
terse Glue comments), writes one SQL query, runs it, and phrases the result.

Access control is COA's own: the caller's token is replayed to the COA API,
whose authorizer runs the Cedar checks, to read the context graph and its
connections. Any failure there denies the request (fail closed).
"""

from __future__ import annotations

import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any

import sqlglot
from sqlglot import exp

_NAMESPACE_RE = re.compile(r"^[A-Za-z0-9-]{1,64}$")
MAX_QUESTION_CHARS = 2000
MAX_ROWS = 20
ATHENA_TIMEOUT_S = 25


class AccessDenied(Exception):
    """The caller may not query this context graph (or we could not verify it)."""


class NoGlueData(Exception):
    """The context graph has no approved AWS Glue connection the baseline can read."""


class BadRequest(Exception):
    """The request payload is invalid."""


class UnsafeSql(Exception):
    """The generated SQL is not a single read-only SELECT."""


# ── COA API (authorization + which databases belong to the graph) ──────────


@dataclass
class CoaApi:
    """Minimal COA REST client that forwards the caller's own bearer token."""

    base_url: str
    token: str
    timeout_s: float = 10.0

    def get(self, path: str) -> dict[str, Any]:
        """GET a COA API path as the caller; 401/403/404 become AccessDenied."""
        req = urllib.request.Request(
            self.base_url.rstrip("/") + path,
            headers={"Authorization": f"Bearer {self.token}", "Accept": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout_s) as resp:  # noqa: S310 - fixed https base URL
                return json.loads(resp.read() or b"{}")
        except urllib.error.HTTPError as e:
            if e.code in (401, 403, 404):
                raise AccessDenied(f"COA API returned {e.code} for {path.split('?')[0]}") from e
            raise


@dataclass
class GraphScope:
    """The graph's Athena workgroup and its approved Glue databases."""

    workgroup: str
    databases: list[str]


def resolve_scope(api: CoaApi, namespace: str) -> GraphScope:
    """Confirm access through COA and list the graph's approved Glue databases."""
    ns = api.get(f"/namespaces/{namespace}")
    ns = ns.get("namespace", ns)
    workgroup = ns.get("athenaWorkgroupName") or ""
    if not workgroup:
        raise AccessDenied("Context graph has no Athena workgroup")
    databases: list[str] = []
    listing = api.get(f"/namespaces/{namespace}/sources")
    for item in listing.get("items") or []:
        if item.get("sourceType") != "DATABASE" or item.get("sourceSubType") != "GLUE_DATABASE":
            continue
        if item.get("status") != "APPROVED":
            continue
        detail = api.get(f"/namespaces/{namespace}/sources/{urllib.parse.quote(item['sourceId'], safe='')}")
        detail = detail.get("source", detail)
        name = ((detail.get("databaseDetails") or {}).get("glueConfiguration") or {}).get("databaseName")
        if name:
            databases.append(name)
    if not databases:
        raise NoGlueData("Context graph has no approved Glue connections")
    return GraphScope(workgroup=workgroup, databases=sorted(set(databases)))


# ── Raw schema, as a data catalog shows it ─────────────────────────────────


def render_schema(glue: Any, databases: list[str]) -> str:
    """Table and column names, types and Glue comments only."""
    lines: list[str] = []
    for db in databases:
        token = None
        while True:
            page = glue.get_tables(DatabaseName=db, **({"NextToken": token} if token else {}))
            for t in page.get("TableList", []):
                cols = (t.get("StorageDescriptor") or {}).get("Columns", []) + t.get("PartitionKeys", [])
                parts = []
                for c in cols:
                    note = f" -- {c['Comment']}" if c.get("Comment") else ""
                    parts.append(f"    {c['Name']} {c.get('Type', '')}{note}")
                desc = f" -- {t['Description']}" if t.get("Description") else ""
                lines.append(f"{db}.{t['Name']}{desc}\n" + "\n".join(parts))
            token = page.get("NextToken")
            if not token:
                break
    return "\n\n".join(lines)


# ── Agent skills (hand-written business rules) ─────────────────────────────

SKILLS_DIR = Path(__file__).parent / "skills"


@dataclass(frozen=True)
class Skill:
    """A SKILL.md file: a name, the Glue databases it covers, and its markdown body."""

    name: str
    databases: frozenset[str]
    body: str


def parse_skill(text: str) -> Skill | None:
    """Read the front matter (name, databases) and body of a SKILL.md; None if malformed."""
    m = re.match(r"^---\n(.*?)\n---\n(.*)$", text, re.S)
    if not m:
        return None
    meta: dict[str, str] = {}
    for line in m.group(1).splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            meta[k.strip()] = v.strip()
    dbs = frozenset(x.strip() for x in meta.get("databases", "").strip("[]").split(",") if x.strip())
    if not meta.get("name") or not dbs:
        return None
    return Skill(name=meta["name"], databases=dbs, body=m.group(2).strip())


def load_skills(directory: Path = SKILLS_DIR) -> list[Skill]:
    """Every valid skills/*/SKILL.md, sorted by name."""
    skills = [parse_skill(p.read_text()) for p in sorted(directory.glob("*/SKILL.md"))]
    return [s for s in skills if s is not None]


def skills_for(skills: list[Skill], databases: list[str]) -> list[Skill]:
    """Skills whose databases overlap the context graph's Glue databases."""
    have = set(databases)
    return [s for s in skills if s.databases & have]


# ── SQL generation and safety ──────────────────────────────────────────────

SQL_SYSTEM_PROMPT = """You are a data analyst. Write ONE Amazon Athena (Trino SQL) SELECT query
that answers the user's question from the tables below.
Use fully qualified names (database.table). Use only tables and columns that appear in the schema.
Return only JSON: {{"sql": "<the query>", "assumptions": "<one short sentence>"}}.
Today's date is {today}.
{skills}
Schema:
{schema}"""

SKILLS_PREAMBLE = """
Follow these skills. They are the organisation's business rules and override
your own assumptions about what the columns mean.

"""

ANSWER_SYSTEM_PROMPT = (
    "Answer the user's question in one or two plain sentences using only the query result given. "
    "State the number. Do not add caveats about data you were not shown."
)


def extract_sql(model_text: str) -> tuple[str, str]:
    """Pull {"sql", "assumptions"} out of the model reply (tolerates code fences)."""
    text = model_text.strip()
    # Models often wrap the JSON in a ```json fence; unwrap it before looking for the object.
    json_fence = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text, re.S | re.I)
    candidate = json_fence.group(1) if json_fence else None
    if candidate is None:
        match = re.search(r"\{.*\}", text, re.S)
        candidate = match.group(0) if match else None
    if candidate is not None:
        try:
            # strict=False accepts raw newlines and tabs inside strings, which models
            # emit when the SQL spans several lines.
            obj = json.loads(candidate, strict=False)
            if isinstance(obj, dict):
                return str(obj.get("sql", "")).strip(), str(obj.get("assumptions", "")).strip()
        except json.JSONDecodeError:
            pass
        # Still not valid JSON (e.g. an unescaped quote): pull the two fields out directly.
        sql = _json_string_field(candidate, "sql")
        if sql:
            return sql, _json_string_field(candidate, "assumptions")
    fence = re.search(r"```(?:sql)?\s*(.*?)```", text, re.S | re.I)
    return (fence.group(1) if fence else text).strip(), ""


def _json_string_field(text: str, key: str) -> str:
    """Best-effort read of ``"key": "..."`` from almost-JSON, honouring backslash escapes."""
    m = re.search(rf'"{key}"\s*:\s*"((?:[^"\\]|\\.)*)"', text, re.S)
    if not m:
        return ""
    try:
        return str(json.loads(f'"{m.group(1)}"', strict=False)).strip()
    except json.JSONDecodeError:
        return m.group(1).strip()


def ensure_read_only(sql: str) -> str:
    """Accept exactly one SELECT (incl. WITH / set operations); refuse anything else."""
    cleaned = sql.strip().rstrip(";").strip()
    if not cleaned:
        raise UnsafeSql("The model returned no SQL")
    try:
        statements = [s for s in sqlglot.parse(cleaned, read="trino") if s is not None]
    except sqlglot.errors.ParseError as e:
        raise UnsafeSql(f"SQL did not parse: {e}") from e
    if len(statements) != 1:
        raise UnsafeSql("Only a single statement is allowed")
    stmt = statements[0]
    if not isinstance(stmt, (exp.Select, exp.Union, exp.Intersect, exp.Except)):
        raise UnsafeSql(f"Only SELECT queries are allowed, not {type(stmt).__name__}")
    for bad in (exp.Insert, exp.Delete, exp.Update, exp.Create, exp.Drop, exp.Alter, exp.Merge, exp.Command):
        if stmt.find(bad) is not None:
            raise UnsafeSql("Only SELECT queries are allowed")
    return cleaned


# ── Athena ─────────────────────────────────────────────────────────────────


def run_athena(athena: Any, sql: str, workgroup: str, sleep: Callable[[float], None] = time.sleep) -> dict[str, Any]:
    """Run one query in the graph's workgroup; return columns and up to MAX_ROWS rows, or an error."""
    qid = athena.start_query_execution(QueryString=sql, WorkGroup=workgroup)["QueryExecutionId"]
    deadline = time.monotonic() + ATHENA_TIMEOUT_S
    while True:
        st = athena.get_query_execution(QueryExecutionId=qid)["QueryExecution"]["Status"]
        state = st["State"]
        if state == "SUCCEEDED":
            break
        if state in ("FAILED", "CANCELLED"):
            return {"error": st.get("StateChangeReason", state)}
        if time.monotonic() > deadline:
            athena.stop_query_execution(QueryExecutionId=qid)
            return {"error": "Query timed out"}
        sleep(0.5)
    res = athena.get_query_results(QueryExecutionId=qid, MaxResults=MAX_ROWS + 1)
    rows = res["ResultSet"]["Rows"]
    meta = res["ResultSet"]["ResultSetMetadata"]["ColumnInfo"]
    columns = [c["Name"] for c in meta]
    data = [[cell.get("VarCharValue") for cell in r["Data"]] for r in rows[1:]]
    return {"columns": columns, "rows": data[:MAX_ROWS]}


# ── The whole baseline turn ────────────────────────────────────────────────


@dataclass
class Deps:
    """Injected clients, so the turn can be tested without AWS."""

    api: CoaApi
    glue: Any
    athena: Any
    converse: Callable[[str, str], str]  # (system, user) -> text
    model_id: str
    today: date = field(default_factory=date.today)
    skills: list[Skill] = field(default_factory=list)


def answer(payload: dict[str, Any], deps: Deps) -> dict[str, Any]:
    """Run one baseline turn: authorize, read raw schema, write SQL, run it, phrase the result."""
    started = time.monotonic()
    namespace = str(payload.get("namespace", ""))
    question = str(payload.get("query", "")).strip()
    if not _NAMESPACE_RE.fullmatch(namespace):
        raise BadRequest("Invalid namespace")
    if not question or len(question) > MAX_QUESTION_CHARS:
        raise BadRequest("Invalid query")

    scope = resolve_scope(deps.api, namespace)
    schema = render_schema(deps.glue, scope.databases)
    used = skills_for(deps.skills, scope.databases)
    skills_text = SKILLS_PREAMBLE + "\n\n".join(f"## Skill: {s.name}\n{s.body}" for s in used) + "\n" if used else ""
    prompt = SQL_SYSTEM_PROMPT.format(today=deps.today.isoformat(), schema=schema, skills=skills_text)
    reply = deps.converse(prompt, question)
    sql, assumptions = extract_sql(reply)
    out: dict[str, Any] = {
        "sql": sql,
        "assumptions": assumptions,
        "model": deps.model_id,
        "databases": scope.databases,
        "skills": [s.name for s in used],
    }
    try:
        sql = ensure_read_only(sql)
    except UnsafeSql as e:
        out.update(error=str(e), elapsedMs=int((time.monotonic() - started) * 1000))
        return out
    result = run_athena(deps.athena, sql, scope.workgroup)
    out.update(result)
    if "error" not in result:
        shown = json.dumps({"columns": result["columns"], "rows": result["rows"][:10]})
        out["answer"] = deps.converse(ANSWER_SYSTEM_PROMPT, f"Question: {question}\nQuery result: {shown}").strip()
    out["elapsedMs"] = int((time.monotonic() - started) * 1000)
    return out
