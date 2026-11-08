# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0
"""Unit tests for the baseline ("without COA") agent."""

from __future__ import annotations

import sys
from datetime import date
from pathlib import Path
from typing import Any

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from coa_baseline import core  # noqa: E402

NS = "fc10868d-54d1-4a42-bdfe-2f257a04fb0b"


class FakeApi:
    def __init__(self, responses: dict[str, Any]):
        self.responses = responses
        self.calls: list[str] = []

    def get(self, path: str) -> dict[str, Any]:
        self.calls.append(path)
        value = self.responses.get(path)
        if isinstance(value, Exception):
            raise value
        if value is None:
            raise core.AccessDenied(f"404 {path}")
        return value


def graph_api() -> FakeApi:
    return FakeApi(
        {
            f"/namespaces/{NS}": {"namespace": {"athenaWorkgroupName": "wg-1"}},
            f"/namespaces/{NS}/sources": {
                "items": [
                    {
                        "sourceId": "s1",
                        "sourceType": "DATABASE",
                        "sourceSubType": "GLUE_DATABASE",
                        "status": "APPROVED",
                    },
                    {
                        "sourceId": "s2",
                        "sourceType": "DATABASE",
                        "sourceSubType": "GLUE_DATABASE",
                        "status": "PENDING_REVIEW",
                    },
                    {
                        "sourceId": "d1",
                        "sourceType": "DOCUMENTS",
                        "sourceSubType": "LOCAL_UPLOAD",
                        "status": "COMPLETED",
                    },
                ]
            },
            f"/namespaces/{NS}/sources/s1": {"databaseDetails": {"glueConfiguration": {"databaseName": "mpi_hrms"}}},
        }
    )


class FakeGlue:
    def get_tables(self, DatabaseName: str, **_: Any) -> dict[str, Any]:  # noqa: N803 - boto3 shape
        return {
            "TableList": [
                {
                    "Name": "officer",
                    "StorageDescriptor": {
                        "Columns": [
                            {"Name": "officer_id", "Type": "string", "Comment": "Officer identifier"},
                            {"Name": "gender", "Type": "string"},
                        ]
                    },
                }
            ]
        }


class FakeAthena:
    def __init__(self, state: str = "SUCCEEDED"):
        self.state = state
        self.sql: list[str] = []

    def start_query_execution(self, QueryString: str, WorkGroup: str) -> dict[str, str]:  # noqa: N803
        self.sql.append(QueryString)
        assert WorkGroup == "wg-1"
        return {"QueryExecutionId": "q1"}

    def get_query_execution(self, QueryExecutionId: str) -> dict[str, Any]:  # noqa: N803
        return {"QueryExecution": {"Status": {"State": self.state, "StateChangeReason": "boom"}}}

    def get_query_results(self, QueryExecutionId: str, MaxResults: int) -> dict[str, Any]:  # noqa: N803
        return {
            "ResultSet": {
                "ResultSetMetadata": {"ColumnInfo": [{"Name": "n"}]},
                "Rows": [{"Data": [{"VarCharValue": "n"}]}, {"Data": [{"VarCharValue": "2112"}]}],
            }
        }

    def stop_query_execution(self, QueryExecutionId: str) -> None:  # noqa: N803
        pass


def deps(api: FakeApi, athena: FakeAthena, sql_reply: str) -> core.Deps:
    replies = iter([sql_reply, "There are 2,112 officers."])
    return core.Deps(
        api=api,
        glue=FakeGlue(),
        athena=athena,
        converse=lambda s, u: next(replies),
        model_id="m",
        today=date(2026, 11, 7),
    )


def test_scope_lists_only_approved_glue_databases():
    scope = core.resolve_scope(graph_api(), NS)
    assert scope.workgroup == "wg-1"
    assert scope.databases == ["mpi_hrms"]


def test_scope_fails_closed_when_coa_denies():
    api = FakeApi({f"/namespaces/{NS}": core.AccessDenied("403")})
    with pytest.raises(core.AccessDenied):
        core.resolve_scope(api, NS)


def test_scope_reports_graph_without_glue_connections():
    api = FakeApi({f"/namespaces/{NS}": {"athenaWorkgroupName": "wg-1"}, f"/namespaces/{NS}/sources": {"items": []}})
    with pytest.raises(core.NoGlueData):
        core.resolve_scope(api, NS)


def test_schema_has_raw_names_and_glue_comments_only():
    text = core.render_schema(FakeGlue(), ["mpi_hrms"])
    assert "mpi_hrms.officer" in text
    assert "officer_id string -- Officer identifier" in text
    assert "gender string" in text


@pytest.mark.parametrize(
    "sql",
    [
        "SELECT 1",
        "WITH a AS (SELECT 1 AS x) SELECT x FROM a;",
        "SELECT 1 UNION ALL SELECT 2",
    ],
)
def test_read_only_accepts_selects(sql):
    assert core.ensure_read_only(sql)


@pytest.mark.parametrize(
    "sql",
    [
        "",
        "DROP TABLE mpi_hrms.officer",
        "SELECT 1; SELECT 2",
        "INSERT INTO t SELECT 1",
        "CREATE TABLE t AS SELECT 1",
    ],
)
def test_read_only_refuses_everything_else(sql):
    with pytest.raises(core.UnsafeSql):
        core.ensure_read_only(sql)


def test_extract_sql_from_json_and_fences():
    assert core.extract_sql('{"sql": "SELECT 1", "assumptions": "x"}') == ("SELECT 1", "x")
    assert core.extract_sql("```sql\nSELECT 2\n```")[0] == "SELECT 2"


def test_answer_runs_generated_sql_and_phrases_result():
    athena = FakeAthena()
    out = core.answer(
        {"namespace": NS, "query": "How many officers?"},
        deps(graph_api(), athena, '{"sql": "SELECT count(*) AS n FROM mpi_hrms.officer"}'),
    )
    assert athena.sql == ["SELECT count(*) AS n FROM mpi_hrms.officer"]
    assert out["rows"] == [["2112"]] and out["columns"] == ["n"]
    assert out["answer"] == "There are 2,112 officers."
    assert out["databases"] == ["mpi_hrms"]


def test_answer_never_runs_unsafe_sql():
    athena = FakeAthena()
    out = core.answer(
        {"namespace": NS, "query": "drop it"}, deps(graph_api(), athena, '{"sql": "DROP TABLE mpi_hrms.officer"}')
    )
    assert athena.sql == []
    assert "error" in out


def test_answer_reports_athena_failure():
    out = core.answer({"namespace": NS, "query": "q"}, deps(graph_api(), FakeAthena("FAILED"), '{"sql": "SELECT 1"}'))
    assert out["error"] == "boom"
    assert "answer" not in out


@pytest.mark.parametrize(
    "payload",
    [
        {"namespace": "../etc", "query": "q"},
        {"namespace": NS, "query": ""},
        {"namespace": NS, "query": "x" * 2001},
    ],
)
def test_answer_validates_payload(payload):
    with pytest.raises(core.BadRequest):
        core.answer(payload, deps(graph_api(), FakeAthena(), "{}"))
