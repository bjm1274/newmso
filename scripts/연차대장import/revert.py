# -*- coding: utf-8 -*-
"""연차관리대장 반영 회귀 — 16:54 시점 상태로 복원.
  미리보기 : python revert.py
  실제 회귀: python revert.py --commit
백업_20260514_1654.json 을 읽어
  1) 삽입한 leave_requests 전부 삭제
  2) staff_members 를 백업값으로 복원
  3) leave_balances 를 백업값으로 복원(있던 것) / 삭제(새로 생긴 것)"""
import sys
import json
from common import sb_request, BACKUP_PATH, TODAY

COMMIT = "--commit" in sys.argv


def main():
    with open(BACKUP_PATH, "r", encoding="utf-8") as f:
        backup = json.load(f)

    sm_before = backup["staff_members_before"]
    lb_before = backup["leave_balances_before"]
    lb_existed = set(backup["leave_balances_existed"])
    ins_ids = backup["inserted_leave_request_ids"]
    all_staff_ids = [s["id"] for s in sm_before]
    lb_to_delete = [sid for sid in all_staff_ids if sid not in lb_existed]

    print("=" * 70)
    print(f"회귀 미리보기 ({'실제 실행' if COMMIT else 'DRY-RUN'})  기준: {backup['command_ts']}")
    print("=" * 70)
    print(f"  - 삭제할 leave_requests : {len(ins_ids)}건")
    print(f"  - 복원할 staff_members  : {len(sm_before)}건")
    print(f"  - 복원할 leave_balances : {len(lb_before)}건 (반영 전부터 있던 행)")
    print(f"  - 삭제할 leave_balances : {len(lb_to_delete)}건 (반영 때 새로 생긴 행)")

    if not COMMIT:
        print("\nDRY-RUN 종료 — DB 변경 없음. 실제 회귀: python revert.py --commit")
        return

    print("\n[1/3] 삽입된 leave_requests 삭제 중...")
    CHUNK = 50
    for i in range(0, len(ins_ids), CHUNK):
        chunk = ins_ids[i:i + CHUNK]
        sb_request("DELETE", "leave_requests",
                   params={"id": f"in.({','.join(chunk)})"})
    print(f"      {len(ins_ids)}건 삭제 완료")

    print("[2/3] staff_members 복원 중...")
    for s in sm_before:
        sb_request("PATCH", "staff_members",
                   body={"annual_leave_total": s["annual_leave_total"],
                         "annual_leave_used": s["annual_leave_used"],
                         "annual_leave_pay": s["annual_leave_pay"]},
                   params={"id": f"eq.{s['id']}"})
    print(f"      {len(sm_before)}건 복원 완료")

    print("[3/3] leave_balances 복원/삭제 중...")
    if lb_before:
        restore = [{k: v for k, v in row.items() if k != "id"} for row in lb_before]
        sb_request("POST", "leave_balances", body=restore,
                   params={"on_conflict": "staff_id,year"},
                   prefer="resolution=merge-duplicates")
    for sid in lb_to_delete:
        sb_request("DELETE", "leave_balances",
                   params={"staff_id": f"eq.{sid}", "year": f"eq.{TODAY.year}"})
    print(f"      복원 {len(lb_before)}건 / 삭제 {len(lb_to_delete)}건 완료")

    print("\n회귀 완료 — 16:54 시점 상태로 복원되었습니다.")


if __name__ == "__main__":
    main()
