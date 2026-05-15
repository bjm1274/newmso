# -*- coding: utf-8 -*-
"""연차관리대장 → 시스템 반영 미리보기 (DB 쓰기 없음).
실행: python scripts/연차대장import/preview.py"""
import json
import os
from common import (
    parse_excel, fetch_staff_members, fetch_leave_balances, fetch_leave_requests,
    norm_name, TODAY, PROJECT_ROOT,
)


def main():
    print("=" * 78)
    print(f"연차관리대장 반영 미리보기  (기준일 {TODAY}, DB 쓰기 없음)")
    print("=" * 78)

    emp_rows = parse_excel()
    valid = [e for e in emp_rows if e.get("valid")]
    invalid = [e for e in emp_rows if not e.get("valid")]

    print(f"\n[엑셀] 시트 {len(emp_rows)}개 중 유효 {len(valid)}명, 제외 {len(invalid)}개")
    for e in invalid:
        print(f"   - 제외: {e['sheet']}  ({e['reason']})")

    # DB 조회
    print("\n[DB] 운영 Supabase 조회 중...")
    staff = fetch_staff_members()
    print(f"   staff_members {len(staff)}행")
    by_name = {}
    for s in staff:
        by_name.setdefault(norm_name(s["name"]), []).append(s)

    # 이름 매칭
    matched, unmatched, ambiguous = [], [], []
    for e in valid:
        cands = by_name.get(norm_name(e["name"]), [])
        if len(cands) == 0:
            unmatched.append(e)
        elif len(cands) > 1:
            ambiguous.append((e, cands))
        else:
            e["_staff"] = cands[0]
            matched.append(e)

    staff_ids = [e["_staff"]["id"] for e in matched]
    balances = fetch_leave_balances(TODAY.year)
    bal_by_staff = {b["staff_id"]: b for b in balances}
    leave_reqs = fetch_leave_requests(staff_ids)
    lr_by_staff = {}
    for lr in leave_reqs:
        lr_by_staff.setdefault(lr["staff_id"], []).append(lr)

    # ---- 매칭 실패 ----
    if unmatched:
        print(f"\n⚠️  이름 매칭 실패 {len(unmatched)}명 (운영 DB에 동명 직원 없음):")
        for e in unmatched:
            print(f"   - {e['name']} ({e['dept']}, 입사 {e['join_date']})")
    if ambiguous:
        print(f"\n⚠️  동명이인 {len(ambiguous)}건 — 수동 확인 필요:")
        for e, cands in ambiguous:
            print(f"   - {e['name']}: {[c['employee_no'] for c in cands]}")

    # ---- 연차수동부여 미리보기 ----
    print("\n" + "=" * 78)
    print("① 시스템마스터센터 · 연차수동부여  (부여=현재사이클 발생, 사용=현재사이클 사용)")
    print("=" * 78)
    print(f"{'직원':<8}{'입사일':<12}{'사이클시작':<12}"
          f"{'현재 부여/사용/잔여':<22}{'→ 반영 부여/사용/잔여':<24}{'비고'}")
    print("-" * 78)
    grant_plan = []
    for e in matched:
        s = e["_staff"]
        cur_total = s.get("annual_leave_total")
        cur_used = s.get("annual_leave_used")
        bal = bal_by_staff.get(s["id"])
        cur_exp = bal.get("expired_days") if bal else None
        cur_comp = bal.get("compensated_days") if bal else None
        cur_remain = None
        if cur_total is not None:
            cur_remain = round((cur_total or 0) - (cur_used or 0)
                               - (cur_exp or 0) - (cur_comp or 0), 2)
        new_total = e["grant_current_cycle"]
        new_used = e["used_current_cycle"]
        new_exp = e["expired_current_cycle"]
        new_comp = e["compensated_current_cycle"]
        new_remain = round(new_total - new_used - new_exp - new_comp, 2)
        note = "; ".join(e["flags"])
        cur_str = f"{cur_total}/{cur_used}/{cur_remain}"
        new_str = f"{new_total}/{new_used}/{new_remain}"
        mark = "" if cur_str == new_str else " *변경*"
        print(f"{e['name']:<8}{e['join_date']:<12}{e['cycle_start']:<12}"
              f"{cur_str:<22}{new_str:<24}{note}{mark}")
        grant_plan.append({
            "staff_id": s["id"], "name": e["name"], "employee_no": s["employee_no"],
            "before": {"total": cur_total, "used": cur_used,
                       "expired": cur_exp, "compensated": cur_comp},
            "after": {"total": new_total, "used": new_used,
                      "expired": new_exp, "compensated": new_comp},
        })

    # ---- 사용일(leave_requests) 미리보기 ----
    print("\n" + "=" * 78)
    print("② 인사관리 근태 · 연차/휴가  (엑셀 사용일 → leave_requests, status=승인, type=연차)")
    print("=" * 78)
    total_new_dates = 0
    total_flagged = 0
    lr_plan = []
    for e in matched:
        s = e["_staff"]
        existing = lr_by_staff.get(s["id"], [])
        dates = e["usage_dates"]
        total_new_dates += len(dates)
        nflag = len(e["flagged_cells"]) + len(e["used_count_mismatch"])
        total_flagged += nflag
        flagtxt = f"  ⚠️검토 {nflag}건" if nflag else ""
        print(f"   {e['name']:<8} 기존 leave_requests {len(existing):>3}건 "
              f"| 엑셀 추출 사용일 {len(dates):>3}건{flagtxt}")
        lr_plan.append({
            "staff_id": s["id"], "name": e["name"],
            "existing_count": len(existing),
            "dates": dates,
            "flagged_cells": e["flagged_cells"],
            "used_count_mismatch": e["used_count_mismatch"],
        })

    print(f"\n   합계: 신규 leave_requests 후보 {total_new_dates}건, 검토필요 {total_flagged}건")

    # ---- 검토 필요 상세 ----
    print("\n" + "=" * 78)
    print("③ 검토 필요 항목 (자동 분류가 애매한 셀 — 실행 전 확인)")
    print("=" * 78)
    for e in matched:
        if not e["flagged_cells"] and not e["used_count_mismatch"]:
            continue
        print(f"\n  ▷ {e['name']} ({e['dept']})")
        for ym, raw in e["flagged_cells"]:
            print(f"      [{ym}] 비연차/잡데이터로 제외: {raw!r}")
        for mm in e["used_count_mismatch"]:
            print(f"      [{mm['row_ym']}] 사용={mm['사용']} 인데 날짜 {mm['추출날짜수']}개 추출 "
                  f"→ {mm['dates']}  (반차 가능성)")

    # ---- 충돌 경고 ----
    print("\n" + "=" * 78)
    print("⚠️  설계상 충돌 — 실행 방식 결정 필요")
    print("=" * 78)
    print("""
  manual-grant API 와 syncAnnualLeaveUsedForStaff 는 '사이클 구분 없이'
  승인된 연차 leave_requests 를 전부 합산해 staff_members.annual_leave_used 를
  덮어쓴다. 따라서 '전체 과거 사용일'을 모두 status=승인/type=연차로 넣으면
  → 사용 = 평생 누적치가 되어 잔여(부여-사용)가 음수로 깨진다.

  해결안 (실행 시 택1):
   A. 과거(이전 사이클) 사용일은 type을 '연차(이력)' 등 비집계 유형으로 넣어
      근태 화면엔 보이되 잔여 계산엔 포함되지 않게 한다.  ← 권장
   B. leave_requests 에는 '현재 사이클' 사용일만 type=연차로 넣고,
      과거 사용일은 넣지 않는다.
   C. manual-grant API 를 거치지 않고 staff_members / leave_balances 에
      엑셀값(부여/사용)을 직접 기록한다(단, 향후 결재 동기화 시 덮어써질 위험).
""")

    # ---- 계획 JSON 저장 ----
    out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "산출물")
    os.makedirs(out_dir, exist_ok=True)
    plan_path = os.path.join(out_dir, "미리보기_계획.json")
    with open(plan_path, "w", encoding="utf-8") as f:
        json.dump({"grant_plan": grant_plan, "lr_plan": lr_plan,
                   "unmatched": [e["name"] for e in unmatched],
                   "invalid": [e["sheet"] for e in invalid]},
                  f, ensure_ascii=False, indent=2)
    print(f"\n계획 JSON 저장: {plan_path}")
    print("DB 는 변경되지 않았습니다. 검토 후 실행 방식을 알려주세요.")


if __name__ == "__main__":
    main()
