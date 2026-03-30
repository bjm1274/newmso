import { redirect } from 'next/navigation';

// Web Share Target: POST /share-target 는 서비스워커가 가로채지만
// GET 방식이나 SW 미설치 상태에서 직접 접근 시 채팅으로 리다이렉트
export default function ShareTargetPage() {
  redirect('/main?open_menu=%EC%B1%84%ED%8C%85');
}
