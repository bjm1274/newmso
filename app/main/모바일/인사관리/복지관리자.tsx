'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/db-client';
import type { StaffMember, ErpUser } from '@/types';
import { toast } from '@/lib/toast';
import MBtn from '../공통/MBtn';

interface WelfareAdminProps {
  staffs: StaffMember[];
  type: 'family' | 'health' | 'cert' | 'dev';
  initialData?: any;
  onClose: () => void;
  onSuccess: () => void;
}

export default function 복지관리자({ staffs, type, initialData, onClose, onSuccess }: WelfareAdminProps) {
  const [submitting, setSubmitting] = useState(false);

  // 1. 경조사 폼 상태
  const [staffId, setStaffId] = useState(initialData?.staff_id || '');
  const [eventType, setEventType] = useState(initialData?.event_type || '결혼');
  const [eventDate, setEventDate] = useState(initialData?.event_date || '');
  const [amount, setAmount] = useState(initialData?.amount || 0);
  const [relation, setRelation] = useState(initialData?.relation || '본인');
  const [status, setStatus] = useState(initialData?.status || '접수');

  // 2. 건강검진 폼 상태
  const [chkDate, setChkDate] = useState(initialData?.checkup_date || '');
  const [chkVendor, setChkVendor] = useState(initialData?.vendor || '');
  const [chkStatus, setChkStatus] = useState(initialData?.status || '예정');

  // 3. 면허·자격 폼 상태
  const [licName, setLicName] = useState(initialData?.license_name || '');
  const [licExpiry, setLicExpiry] = useState(initialData?.expiry_date || '');

  // 4. 의료기기 폼 상태
  const [devName, setDevName] = useState(initialData?.device_name || initialData?.name || '');
  const [devModel, setDevModel] = useState(initialData?.model || '');
  const [devCycle, setDevCycle] = useState(initialData?.cycle ? String(initialData.cycle).replace(/[^0-9]/g, '') : '12');
  const [devNextDate, setDevNextDate] = useState(initialData?.next_check_date || initialData?.next_inspection_date || '');

  const selectedStaff = staffs.find((s) => s.id === staffId);

  const handleSave = async () => {
    setSubmitting(true);
    try {
      if (type === 'family') {
        if (!staffId) {
          toast('직원을 선택해 주세요.', 'warning');
          setSubmitting(false);
          return;
        }
        const payload = {
          staff_id: staffId,
          staff_name: selectedStaff?.name || '미확인',
          event_type: eventType,
          event_date: eventDate || null,
          amount: Number(amount) || 0,
          relation,
          status,
          company: selectedStaff?.company || '전체' };

        if (initialData?.id) {
          const { error } = await db.from('congratulations_condolences').update(payload).eq('id', initialData.id);
          if (error) throw error;
        } else {
          const { error } = await db.from('congratulations_condolences').insert([payload]);
          if (error) throw error;
        }
        toast('경조사 정보가 저장되었습니다.', 'success');
      } else if (type === 'health') {
        if (!staffId) {
          toast('직원을 선택해 주세요.', 'warning');
          setSubmitting(false);
          return;
        }
        const payload = {
          staff_id: staffId,
          staff_name: selectedStaff?.name || '미확인',
          checkup_date: chkDate || null,
          vendor: chkVendor.trim(),
          status: chkStatus,
          company: selectedStaff?.company || '전체' };

        if (initialData?.id) {
          const { error } = await db.from('health_checkups').update(payload).eq('id', initialData.id);
          if (error) throw error;
        } else {
          const { error } = await db.from('health_checkups').insert([payload]);
          if (error) throw error;
        }
        toast('건강검진 일정이 저장되었습니다.', 'success');
      } else if (type === 'cert') {
        if (!staffId) {
          toast('직원을 선택해 주세요.', 'warning');
          setSubmitting(false);
          return;
        }
        const payload = {
          staff_id: staffId,
          license_name: licName.trim(),
          expiry_date: licExpiry || null };

        if (initialData?.id) {
          const { error } = await db.from('staff_licenses').update(payload).eq('id', initialData.id);
          if (error) throw error;
        } else {
          const { error } = await db.from('staff_licenses').insert([payload]);
          if (error) throw error;
        }
        toast('면허/자격증 정보가 저장되었습니다.', 'success');
      } else if (type === 'dev') {
        if (!devName.trim()) {
          toast('기기 명칭을 입력해 주세요.', 'warning');
          setSubmitting(false);
          return;
        }
        const payload = {
          name: devName.trim(),
          model: devModel.trim(),
          cycle: Number(devCycle) || 12,
          next_inspection_date: devNextDate || null };

        if (initialData?.id) {
          const { error } = await db.from('medical_devices').update(payload).eq('id', initialData.id);
          if (error) throw error;
        } else {
          const { error } = await db.from('medical_devices').insert([payload]);
          if (error) throw error;
        }
        toast('의료기기 점검 정보가 저장되었습니다.', 'success');
      }

      onSuccess();
      onClose();
    } catch (err) {
      console.error('[WelfareAdmin] 저장 실패:', err);
      toast('저장에 실패했습니다.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!initialData?.id) return;
    if (!confirm('정말 삭제하시겠습니까?')) return;

    setSubmitting(true);
    try {
      const table =
        type === 'family'
          ? 'congratulations_condolences'
          : type === 'health'
            ? 'health_checkups'
            : type === 'cert'
              ? 'staff_licenses'
              : 'medical_devices';

      const { error } = await db.from(table).delete().eq('id', initialData.id);
      if (error) throw error;

      toast('삭제되었습니다.', 'success');
      onSuccess();
      onClose();
    } catch (err) {
      console.error('[WelfareAdmin] 삭제 오류:', err);
      toast('삭제에 실패했습니다.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const titles = {
    family: '경조사 관리',
    health: '건강검진 관리',
    cert: '면허·자격증 관리',
    dev: '의료기기 등록' };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[1200] flex items-end justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white rounded-t-2xl shadow-2xl border-t border-slate-200"
        style={{
          padding: '20px 16px 24px',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 16, fontWeight: 800 }}>{titles[type]}</span>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: 16, fontWeight: 700 }}
          >
            ✕
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {type !== 'dev' && (
            <div>
              <label style={{ fontSize: 11, fontWeight: 800, color: 'var(--z-500)' }}>대상 직원</label>
              <select
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
                disabled={Boolean(initialData?.id)}
                style={{
                  width: '100%',
                  padding: 10,
                  border: '1px solid var(--m-border)',
                  borderRadius: 8,
                  fontSize: 13,
                  marginTop: 4,
                  background: initialData?.id ? 'var(--m-bg)' : 'white' }}
              >
                <option value="">직원을 선택하세요</option>
                {staffs.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.department} · {s.position})
                  </option>
                ))}
              </select>
            </div>
          )}

          {type === 'family' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 800, color: 'var(--z-500)' }}>경조 구분</label>
                  <select
                    value={eventType}
                    onChange={(e) => setEventType(e.target.value)}
                    style={{
                      width: '100%',
                      padding: 10,
                      border: '1px solid var(--m-border)',
                      borderRadius: 8,
                      fontSize: 13,
                      marginTop: 4,
                      background: 'white' }}
                  >
                    <option value="결혼">결혼</option>
                    <option value="조사">조사 (사망)</option>
                    <option value="출산">출산</option>
                    <option value="생일">생일</option>
                    <option value="기타">기타</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 800, color: 'var(--z-500)' }}>관계</label>
                  <input
                    type="text"
                    value={relation}
                    onChange={(e) => setRelation(e.target.value)}
                    placeholder="예: 본인, 부, 모"
                    style={{
                      width: '100%',
                      padding: 10,
                      border: '1px solid var(--m-border)',
                      borderRadius: 8,
                      fontSize: 13,
                      marginTop: 4 }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 800, color: 'var(--z-500)' }}>경조 일자</label>
                <input
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  style={{
                    width: '100%',
                    padding: 10,
                    border: '1px solid var(--m-border)',
                    borderRadius: 8,
                    fontSize: 13,
                    marginTop: 4 }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 800, color: 'var(--z-500)' }}>지급 금액 (원)</label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  placeholder="금액 입력"
                  style={{
                    width: '100%',
                    padding: 10,
                    border: '1px solid var(--m-border)',
                    borderRadius: 8,
                    fontSize: 13,
                    marginTop: 4 }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 800, color: 'var(--z-500)' }}>지급 상태</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  style={{
                    width: '100%',
                    padding: 10,
                    border: '1px solid var(--m-border)',
                    borderRadius: 8,
                    fontSize: 13,
                    marginTop: 4,
                    background: 'white' }}
                >
                  <option value="접수">접수</option>
                  <option value="지급대기">지급대기</option>
                  <option value="지급완료">지급완료</option>
                  <option value="반려">반려</option>
                </select>
              </div>
            </>
          )}

          {type === 'health' && (
            <>
              <div>
                <label style={{ fontSize: 11, fontWeight: 800, color: 'var(--z-500)' }}>검진 예정일</label>
                <input
                  type="date"
                  value={chkDate}
                  onChange={(e) => setChkDate(e.target.value)}
                  style={{
                    width: '100%',
                    padding: 10,
                    border: '1px solid var(--m-border)',
                    borderRadius: 8,
                    fontSize: 13,
                    marginTop: 4 }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 800, color: 'var(--z-500)' }}>검진 기관 (병원)</label>
                <input
                  type="text"
                  value={chkVendor}
                  onChange={(e) => setChkVendor(e.target.value)}
                  placeholder="예: 서울아산병원"
                  style={{
                    width: '100%',
                    padding: 10,
                    border: '1px solid var(--m-border)',
                    borderRadius: 8,
                    fontSize: 13,
                    marginTop: 4 }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 800, color: 'var(--z-500)' }}>진행 상태</label>
                <select
                  value={chkStatus}
                  onChange={(e) => setChkStatus(e.target.value)}
                  style={{
                    width: '100%',
                    padding: 10,
                    border: '1px solid var(--m-border)',
                    borderRadius: 8,
                    fontSize: 13,
                    marginTop: 4,
                    background: 'white' }}
                >
                  <option value="예정">예정</option>
                  <option value="진행중">진행중</option>
                  <option value="완료">완료</option>
                  <option value="미수검">미수검</option>
                </select>
              </div>
            </>
          )}

          {type === 'cert' && (
            <>
              <div>
                <label style={{ fontSize: 11, fontWeight: 800, color: 'var(--z-500)' }}>면허 / 자격증 명칭</label>
                <input
                  type="text"
                  value={licName}
                  onChange={(e) => setLicName(e.target.value)}
                  placeholder="예: 간호사 면허증, 요양보호사 1급"
                  style={{
                    width: '100%',
                    padding: 10,
                    border: '1px solid var(--m-border)',
                    borderRadius: 8,
                    fontSize: 13,
                    marginTop: 4 }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 800, color: 'var(--z-500)' }}>만료 일자</label>
                <input
                  type="date"
                  value={licExpiry}
                  onChange={(e) => setLicExpiry(e.target.value)}
                  style={{
                    width: '100%',
                    padding: 10,
                    border: '1px solid var(--m-border)',
                    borderRadius: 8,
                    fontSize: 13,
                    marginTop: 4 }}
                />
              </div>
            </>
          )}

          {type === 'dev' && (
            <>
              <div>
                <label style={{ fontSize: 11, fontWeight: 800, color: 'var(--z-500)' }}>의료기기 명칭</label>
                <input
                  type="text"
                  value={devName}
                  onChange={(e) => setDevName(e.target.value)}
                  placeholder="예: 초음파 진단 장비"
                  style={{
                    width: '100%',
                    padding: 10,
                    border: '1px solid var(--m-border)',
                    borderRadius: 8,
                    fontSize: 13,
                    marginTop: 4 }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 800, color: 'var(--z-500)' }}>모델명 / 제조사</label>
                <input
                  type="text"
                  value={devModel}
                  onChange={(e) => setDevModel(e.target.value)}
                  placeholder="예: SSD-3500"
                  style={{
                    width: '100%',
                    padding: 10,
                    border: '1px solid var(--m-border)',
                    borderRadius: 8,
                    fontSize: 13,
                    marginTop: 4 }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 800, color: 'var(--z-500)' }}>점검 주기 (개월)</label>
                  <input
                    type="number"
                    value={devCycle}
                    onChange={(e) => setDevCycle(e.target.value)}
                    placeholder="예: 12"
                    style={{
                      width: '100%',
                      padding: 10,
                      border: '1px solid var(--m-border)',
                      borderRadius: 8,
                      fontSize: 13,
                      marginTop: 4 }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 800, color: 'var(--z-500)' }}>차기 점검 예정일</label>
                  <input
                    type="date"
                    value={devNextDate}
                    onChange={(e) => setDevNextDate(e.target.value)}
                    style={{
                      width: '100%',
                      padding: 10,
                      border: '1px solid var(--m-border)',
                      borderRadius: 8,
                      fontSize: 13,
                      marginTop: 4 }}
                  />
                </div>
              </div>
            </>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          {initialData?.id && (
            <button
              type="button"
              disabled={submitting}
              onClick={handleDelete}
              style={{
                flex: 1,
                padding: '12px',
                borderRadius: 8,
                border: '1px solid var(--m-danger)',
                background: 'white',
                color: 'var(--m-danger)',
                fontWeight: 700,
                fontSize: 13 }}
            >
              삭제
            </button>
          )}
          <MBtn block onClick={onClose}>
            취소
          </MBtn>
          <MBtn block variant="primary" disabled={submitting} onClick={handleSave}>
            저장하기
          </MBtn>
        </div>
      </div>
    </div>
  );
}
