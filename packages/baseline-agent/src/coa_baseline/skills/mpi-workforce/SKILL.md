---
name: mpi-workforce
description: Business rules for answering Ministry of Public Innovation (MPI) workforce questions from the HRMS, Finance, Learning and reference tables.
databases: [mpi_hrms, mpi_finance, mpi_learning, mpi_reference]
---

# MPI workforce analytics

Hand-written from MPI's policy documents (Workforce Metrics Definitions v2.1,
HR Circular 07/2026, Scheme of Service note, HRMS Data Dictionary). Apply these
rules whenever a question uses one of the terms below.

## Code tables

- `employment.employment_type`: P Permanent, C Contract, R Re-employed after
  retirement age, T Temporary or part-time.
- `separation.reason_code`: RSN resignation (voluntary), TRO transfer out to
  another ministry (the officer stays in the Public Service), RET retirement,
  EOC end of contract, TRM termination.
- `officer.gender`: F or M.
- `dim_grade.grade_rank`: 1 = most junior, 14 = most senior. Never compare
  grade codes as text; MX9 is senior to MX15.

## Reporting periods

- The financial year runs 1 April to 31 March. "FY2025" means
  1 Apr 2025 to 31 Mar 2026. Never use the calendar year.
- An employment is active on a date when `start_date` is on or before the
  date and `end_date` is empty or on or after the date.

## Definitions

- **Headcount** on a date: distinct `officer_id` with an active employment on
  that date, counting types P, C and R only (exclude T). The `officer` table
  also holds leavers, so never count its rows.
- **FTE**: sum of `employment.fte` over active employments, types P, C and R.
- **Funded posts** on a date: rows in `mpi_finance.establishment_position` whose
  funding window (`funded_from` to `funded_to`, empty `funded_to` = open-ended)
  contains the date. Posts outside their window are abolished, not vacant.
- **Vacancy rate**: funded posts on the date that no current employment
  (`end_date` empty) fills, via `employment.position_id`, divided by funded
  posts.
- **Voluntary attrition rate** for a financial year: separations with reason
  RSN only, dated within the year, divided by average headcount. Average
  headcount is the mean of the 12 month-end headcounts (30 April to 31 March).
  Transfers (TRO), retirements, end of contract and terminations are excluded.
- **Agency turnover rate**: like attrition but counting every reason, including
  TRO. Never call it attrition.
- **Senior management**: grade_rank 10 and above (MX10, MX9, SR10, SR9, SR8).
  It is NOT the published "Senior Executive & above" band, which also covers
  MX11 to MX15. Female share = women among current officers (`end_date` empty)
  in senior management.
- **Learning hours per officer**: completed learning hours in the financial
  year divided by headcount at the year end.

## Retirement and re-employment (HR Circular 07/2026)

- From 1 Jul 2026 the retirement age is 64 and the re-employment age is 69
  (previously 63 and 68). Age 64 applies to officers who turn 63 on or after
  1 Jul 2026; anyone who turned 63 earlier has already passed retirement age.
- **Retirement cohort** for a date: current officers (`end_date` empty) who are
  not on a re-employment contract (type R), who turned 63 on or after
  1 Jul 2026, and whose 64th birthday falls in the 12 months starting on the
  date.
- "Without a re-employment assessment" means the officer has no row in
  `mpi_hrms.reemployment_assessment`.
