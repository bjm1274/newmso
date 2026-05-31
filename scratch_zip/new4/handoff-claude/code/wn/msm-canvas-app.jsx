// MSO 모바일 — iOS + Android 프레임 캔버스
function MMount({ children }) { return <div style={{ position: 'relative', height: '100%', width: '100%' }}>{children}</div>; }

function App() {
  return (
    <DesignCanvas>
      <DCSection id="mso-mobile" title="MSO 모바일 — 전체 메뉴" subtitle="iOS · Android · 하단 탭바(홈·게시판·채팅·결재·전체) — 상태바/홈인디케이터 안전영역 준수">
        <DCArtboard id="ios" label="iOS — iPhone" width={462} height={934}>
          <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', background: '#EEF0F3' }}>
            <IOSDevice><MMount><MsmShell os="ios" topInset={52} bottomInset={30} /></MMount></IOSDevice>
          </div>
        </DCArtboard>
        <DCArtboard id="android" label="Android — Material 3" width={472} height={952}>
          <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', background: '#EEF0F3' }}>
            <AndroidDevice><MMount><MsmShell os="android" topInset={8} bottomInset={10} /></MMount></AndroidDevice>
          </div>
        </DCArtboard>
      </DCSection>
    </DesignCanvas>
  );
}
ReactDOM.createRoot(document.getElementById('root')).render(<App />);
