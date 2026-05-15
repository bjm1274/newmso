# -*- coding: utf-8 -*-
"""연차관리대장 → 운영 DB 반영.
  기본(미리보기)   : python apply.py
  실제 실행        : python apply.py --commit
실행 시 16:54 기준 백업을 먼저 남기고, revert.py 로 전체 회귀 가능."""
import sys
import json
import datetime
from common import (
    parse_excel, fetch_staff_members, fetch_leave_requests, sb_request,
    norm_name, split_usage_dates, compute_expiry_date,
    EXCLUDE_NAMES, EXCLUDE_REASON, LEAVE_TYPE_CURRENT, LEAVE_TYPE_PAST,
    IMPORT_REASON, TODAY, COMMAND_TS, BACKUP_PATH,
)

COMMIT = "--commit" in sys.argv


def build_targets():
    emp = [e for e in parse_excel() if e.get("valid")]
    staff = fetch_staff_members()
    by_name = {}
    for s in staff:
        by_name.setdefault(norm_name(s["name"]), []).append(s)
    targets, excluded = [], []
    for e in emp:
        if e["name"] in EXCLUDE_NAMES:
            excluded.append((e["name"], EXCLUDE_REASON[e["name"]]))
            continue
        cands = by_name.get(norm_name(e["name"]), [])
        if len(cands) == 0:
            excluded.append((e["name"], "운영 DB에 동명 직원 없음 — 매칭 실패"))
            continue
        if len(cands) > 1:
            excluded.append((e["name"], f"동명이인 {len(cands)}명 — 수동 확인 필요"))
            continue
        e["_staff"] = cands[0]
        targets.append(e)
    return targets, excluded


def annual_used_from_rows(rows):
    """syncAnnualLeaveUsedForStaff 와 동일 (단, '이력' 유형 제외)."""
    total = 0.0
    for r in rows:
        st = str(r.get("status") or "").strip().lower()
        if st not in ("승인", "approved"):
            continue
        lt = str(r.get("leave_type") or "").strip().lower()
        if not lt:
            continue
        is_half = lt.startswith("반차") or lt.endswith("반차") or lt in (
            "half_leave", "half-day", "오전반차", "오후반차")
        if is_half:
            total += 0.5
            continue
        if "이력" in lt:
            continue
        if "연차" not in lt and lt not in ("annual_leave", "annual"):
            continue
        sd = r.get("start_date")
        ed = r.get("end_date") or sd
        if not sd:
            continue
        d1 = datetime.date.fromisoformat(sd[:10])
        d2 = datetime.date.fromisoformat(ed[:10])
        total += max(1, (d2 - d1).days + 1)
    return round(total, 2)


def main():
    print("=" * 78)
    mode = "실제 실행 (--commit)" if COMMIT else "미리보기 (DRY-RUN, DB 변경 없음)"
    print(f"연차관리대장 반영 — {mode}")
    print(f"백업 기준 시각: {COMMAND_TS}")
    print("=" * 78)

    targets, excluded = build_targets()
    staff_ids = [t["_staff"]["id"] for t in targets]
    existing_lr = fetch_leave_requests(staff_ids)
    lr_by_staff = {}
    for lr in existing_lr:
        lr_by_staff.setdefault(lr["staff_id"], []).append(lr)
    existing_bal = sb_request("GET", "leave_balances",
                              params={"select": "*", "year": f"eq.{TODAY.year}"})
    bal_by_staff = {b["staff_id"]: b for b in existing_bal}

    # ---- 제외 명단 ----
    print(f"\n■ 제외 {len(excluded)}명 (이번 반영에서 빠짐 — 수동 확인 필요):")
    for nm, reason in excluded:
        print(f"   - {nm}: {reason}")

    # ---- 직원별 반영 계획 ----
    print(f"\n■ 반영 대상 {len(targets)}명")
    print("-" * 78)
    plan = []
    halfday_flags = []
    for t in targets:
        s = t["_staff"]
        sid = s["id"]
        cur_dates, past_dates = split_usage_dates(t)
        existing = lr_by_staff.get(sid, [])
        exist_keys = {(e.get("start_date") or "")[:10] for e in existing}

        new_current = [d for d in cur_dates if d not in exist_keys]
        new_past = [d for d in past_dates if d not in exist_keys]
        skipped = len(cur_dates) + len(past_dates) - len(new_current) - len(new_past)

        grant = t["grant_current_cycle"]
        expired = t["expired_current_cycle"]
        comp = t["compensated_current_cycle"]

        # 반영 후 사용 = 기존+신규 의 (이력 제외) 승인 연차 합산
        projected_rows = list(existing)
        for d in new_current:
            projected_rows.append({"status": "승인", "leave_type": LEAVE_TYPE_CURRENT,
                                   "start_date": d, "end_date": d})
        for d in new_past:
            projected_rows.append({"status": "승인", "leave_type": LEAVE_TYPE_PAST,
                                   "start_date": d, "end_date": d})
        used = annual_used_from_rows(projected_rows)
        remaining = round(max(0, grant - used - expired - comp), 2)

        excel_used = t["used_current_cycle"]
        if abs(used - excel_used) > 0.01:
            halfday_flags.append((t["name"], excel_used, used,
                                  round(used - excel_used, 2)))

        plan.append({
            "staff_id": sid, "name": t["name"], "employee_no": s["employee_no"],
            "grant": grant, "used": used, "expired": expired,
            "compensated": comp, "remaining": remaining,
            "new_current": new_current, "new_past": new_past,
            "skipped_dup": skipped, "existing_lr": len(existing),
            "expiry_date": compute_expiry_date(
                s.get("hire_date") or s.get("join_date") or s.get("joined_at")).isoformat(),
        })
        print(f"   {t['name']:<7} 부여 {grant:>4} / 사용 {used:>4} / 소멸 {expired:>3} "
              f"/ 수당 {comp:>3} / 잔여 {remaining:>5}  "
              f"| 기존LR {len(existing):>2} / +{len(new_current)}(연차) "
              f"+{len(new_past)}(이력) / 중복skip {skipped}")

    # ---- 사용일수 차이 플래그 ----
    if halfday_flags:
        print(f"\n■ 엑셀 사용 ≠ 반영후 시스템 사용 — {len(halfday_flags)}명 (실행 전 확인):")
        print("   (원인: ①반차를 전부 풀데이로 입력 ②엑셀에 없는 기존 leave_requests 합산)")
        for nm, exc, sysv, diff in halfday_flags:
            sign = f"+{diff}" if diff > 0 else str(diff)
            print(f"   - {nm}: 엑셀 {exc} → 시스템 {sysv} ({sign})")

    total_new = sum(len(p["new_current"]) + len(p["new_past"]) for p in plan)
    print(f"\n■ 합계: 신규 leave_requests {total_new}건, staff_members·leave_balances {len(plan)}건 갱신")

    if not COMMIT:
        print("\nDRY-RUN 종료 — DB는 변경되지 않았습니다.")
        print("실제 반영: python apply.py --commit")
        return

    # ================= 실제 실행 =================
    print("\n[1/4] 백업 생성 중...")
    backup = {
        "command_ts": COMMAND_TS,
        "created_at": datetime.datetime.now().isoformat(),
        "staff_members_before": [
            {"id": s["id"], "name": s["name"],
             "annual_leave_total": s.get("annual_leave_total"),
             "annual_leave_used": s.get("annual_leave_used"),
             "annual_leave_pay": s.get("annual_leave_pay")}
            for s in (sb_request("GET", "staff_members",
                                 params={"select": "id,name,annual_leave_total,annual_leave_used,annual_leave_pay",
                                         "id": f"in.({','.join(staff_ids)})"}))
        ],
        "leave_balances_before": [bal_by_staff[sid] for sid in staff_ids if sid in bal_by_staff],
        "leave_balances_existed": [sid for sid in staff_ids if sid in bal_by_staff],
        "inserted_leave_request_ids": [],
    }
    with open(BACKUP_PATH, "w", encoding="utf-8") as f:
        json.dump(backup, f, ensure_ascii=False, indent=2)
    print(f"      백업 저장: {BACKUP_PATH}")

    print("[2/4] leave_requests 삽입 중...")
    inserted_ids = []
    for p in plan:
        rows = []
        for d in p["new_current"]:
            rows.append({"staff_id": p["staff_id"], "leave_type": LEAVE_TYPE_CURRENT,
                         "start_date": d, "end_date": d, "status": "승인",
                         "approved_at": datetime.datetime.now().isoformat(),
                         "reason": IMPORT_REASON})
        for d in p["new_past"]:
            rows.append({"staff_id": p["staff_id"], "leave_type": LEAVE_TYPE_PAST,
                         "start_date": d, "end_date": d, "status": "승인",
                         "approved_at": datetime.datetime.now().isoformat(),
                         "reason": IMPORT_REASON})
        if not rows:
            continue
        res = sb_request("POST", "leave_requests", body=rows)
        ids = [r["id"] for r in res]
        inserted_ids += ids
        backup["inserted_leave_request_ids"] = inserted_ids
        with open(BACKUP_PATH, "w", encoding="utf-8") as f:  # 진행 중에도 회귀 가능하게 즉시 저장
            json.dump(backup, f, ensure_ascii=False, indent=2)
    print(f"      {len(inserted_ids)}건 삽입 완료")

    print("[3/4] staff_members 갱신 중...")
    for p in plan:
        sb_request("PATCH", "staff_members",
                   body={"annual_leave_total": p["grant"], "annual_leave_used": p["used"]},
                   params={"id": f"eq.{p['staff_id']}"})
    print(f"      {len(plan)}건 갱신 완료")

    print("[4/4] leave_balances upsert 중...")
    bal_rows = [{
        "staff_id": p["staff_id"], "year": TODAY.year,
        "total_days": p["grant"], "used_days": p["used"],
        "remaining_days": p["remaining"], "expiry_date": p["expiry_date"],
        "expired_days": p["expired"], "compensated_days": p["compensated"],
    } for p in plan]
    sb_request("POST", "leave_balances", body=bal_rows,
               params={"on_conflict": "staff_id,year"},
               prefer="resolution=merge-duplicates")
    print(f"      {len(bal_rows)}건 upsert 완료")

    print("\n반영 완료. 회귀: python revert.py")
    print(f"백업 파일: {BACKUP_PATH}")


if __name__ == "__main__":
    main()
