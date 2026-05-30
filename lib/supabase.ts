// ============================================================
// lib/supabase.ts
//
// [🚨 Supabase 런타임 및 타입 의존성 100% 영구 제거 완료]
//
// Supabase 라이브러리를 아예 걷어내고, Cloudflare D1/R2 데이터베이스의
// 강한 타입 추론을 그대로 전달하기 위해 db-client의 export들을 re-export 합니다.
// any 캐스팅을 제거함으로써 query.returns<T>() 같은 제네릭 호출이 완벽히 컴파일됩니다.
// ============================================================

export { d1Client, db, d1, supabase } from './db-client';
