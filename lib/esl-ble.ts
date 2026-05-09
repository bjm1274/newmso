'use client';

// ─── ESL BLE 통신 + 이미지 렌더링 유틸 ───
// Zhsunyco(WoLink) ESL 기기와 Web Bluetooth로 직접 통신하여
// 환자 정보를 e-ink 디스플레이에 표시합니다.

// ─── 상수 ───

/** GATT 서비스 UUID (WoLink ESL 공통) */
export const ESL_SERVICE_UUID = '30323032-4c53-4545-4c42-4b4e494c4f57';

/** Characteristic UUID */
export const ESL_CHAR = {
  /** 이미지/명령 데이터 write */
  EPD: '31323032-4c53-4545-4c42-4b4e494c4f57',
  /** 버전 정보 read */
  VERSION: '32323032-4c53-4545-4c42-4b4e494c4f57',
  /** 보안 인증 read/write */
  CRYPTO: '33323032-4c53-4545-4c42-4b4e494c4f57',
  /** 상태 read */
  STATUS: '34323032-4c53-4545-4c42-4b4e494c4f57',
  /** 배터리 read */
  BATTERY: '35323032-4c53-4545-4c42-4b4e494c4f57',
} as const;

/** AES-128 ECB 암호화 키 (ESL 보안 인증용) */
const AES_KEY = new Uint8Array([
  0x9b, 0x60, 0x9f, 0x28, 0xbc, 0x49, 0xe2, 0x57,
  0x29, 0xbd, 0x7b, 0x8d, 0xf2, 0x2b, 0x44, 0x20,
]);

/** localStorage 키: ESL 기기 바인딩 정보 */
export const ESL_BINDINGS_KEY = 'erp-esl-room-bindings';

// ─── 타입 ───

export type EslBinding = {
  roomNumber: string;
  deviceId: string;
  deviceName: string;
  lastUpdated: string | null;
};

export type EslDeviceStatus = {
  battery: number;
  version: string;
  busy: boolean;
  error: number;
};

export type PatientDisplayData = {
  roomNumber: string;
  bedNumber: number;
  patientName: string;
  age: string;
  gender: string;
  doctor: string;
  admissionDate: string;
};

export type EslTransferProgress = {
  stage: 'connecting' | 'authenticating' | 'sending' | 'refreshing' | 'done' | 'error';
  percent: number;
  message: string;
};

// Web Bluetooth API 타입 (런타임 전용, TS 타입 보완)
type BleDevice = any;

// ─── Web Bluetooth 지원 확인 ───

export function isBleSupported(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in (navigator as any);
}

// ─── BLE 디바이스 스캔 ───

export async function scanEslDevice(): Promise<BleDevice> {
  if (!isBleSupported()) {
    throw new Error('이 브라우저는 Web Bluetooth를 지원하지 않습니다. Chrome을 사용해 주세요.');
  }

  const bt = (navigator as any).bluetooth;
  if (!bt) throw new Error('Web Bluetooth API를 사용할 수 없습니다.');

  const device = await bt.requestDevice({
    filters: [{ namePrefix: 'WL' }],
    optionalServices: [ESL_SERVICE_UUID],
  });

  return device;
}

// ─── AES-128 ECB 암호화 (Web Crypto API) ───

async function aes128EcbEncrypt(plaintext: Uint8Array): Promise<Uint8Array> {
  // Web Crypto API는 ECB 모드를 직접 지원하지 않으므로
  // CBC 모드 + zero IV로 단일 블록(16바이트) 암호화를 구현합니다.
  // ECB와 CBC는 첫 번째 블록에서 동일한 결과를 냅니다 (IV가 0일 때).
  if (plaintext.length !== 16) {
    throw new Error(`AES ECB 인증에는 정확히 16바이트가 필요합니다 (수신: ${plaintext.length}바이트)`);
  }
  const key = await crypto.subtle.importKey('raw', AES_KEY, { name: 'AES-CBC' }, false, ['encrypt']);
  const iv = new Uint8Array(16); // zero IV
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, key, plaintext.buffer as ArrayBuffer);
  // CBC 결과에서 첫 16바이트만 사용 (= ECB 결과)
  return new Uint8Array(encrypted).slice(0, 16);
}

// ─── BLE 연결 + 인증 + 데이터 전송 ───

export async function sendImageToEsl(
  device: BleDevice,
  imageData: Uint8Array,
  onProgress?: (progress: EslTransferProgress) => void,
): Promise<EslDeviceStatus> {
  const report = (stage: EslTransferProgress['stage'], percent: number, message: string) => {
    onProgress?.({ stage, percent, message });
  };

  report('connecting', 0, 'BLE 연결 중...');

  const server = device.gatt;
  if (!server) throw new Error('GATT 서버를 사용할 수 없습니다.');

  const gatt = await server.connect();
  try {
    const service = await gatt.getPrimaryService(ESL_SERVICE_UUID);

    const cryptoChar = await service.getCharacteristic(ESL_CHAR.CRYPTO);
    const epdChar = await service.getCharacteristic(ESL_CHAR.EPD);
    const batteryChar = await service.getCharacteristic(ESL_CHAR.BATTERY);
    const statusChar = await service.getCharacteristic(ESL_CHAR.STATUS);
    const versionChar = await service.getCharacteristic(ESL_CHAR.VERSION);

    // 배터리 읽기
    report('connecting', 10, '기기 정보 읽는 중...');
    const batteryBytes = await batteryChar.readValue();
    const battery = batteryBytes.getUint8(0) + batteryBytes.getUint8(1) * 256;

    // 버전 읽기
    const versionBytes = await versionChar.readValue();
    let version = '';
    for (let i = 2; i < versionBytes.byteLength; i++) {
      version += versionBytes.getUint8(i).toString(16).padStart(2, '0');
      if (i === 3 || i === 5) version += '/';
    }
    version = version.toUpperCase();

    // 보안 인증
    report('authenticating', 15, '보안 인증 중...');
    const secretBytes = await cryptoChar.readValue();
    const plaintext = new Uint8Array(secretBytes.buffer);
    const encrypted = await aes128EcbEncrypt(plaintext);
    await cryptoChar.writeValueWithResponse(encrypted);

    // 이미지 데이터 전송 (청크 분할)
    report('sending', 20, '이미지 전송 중...');
    const mtu = 244; // 일반적인 BLE MTU
    const chunk = mtu - 9; // BLE 오버헤드 3바이트 + 헤더 6바이트

    for (let idx = 0; idx < imageData.length; idx += chunk) {
      const slice = imageData.slice(idx, Math.min(idx + chunk, imageData.length));
      const packet = new Uint8Array(6 + slice.length);
      packet[0] = 0x00;
      packet[1] = 0xa5;
      packet[2] = (idx >> 0) & 0xff;
      packet[3] = (idx >> 8) & 0xff;
      packet[4] = (idx >> 16) & 0xff;
      packet[5] = (idx >> 24) & 0xff;
      packet.set(slice, 6);

      await epdChar.writeValueWithResponse(packet);

      const percent = 20 + Math.floor((idx / imageData.length) * 70);
      report('sending', percent, `전송 중... ${Math.floor((idx / imageData.length) * 100)}%`);
    }

    // 비압축 새로고침 명령
    report('refreshing', 95, '화면 새로고침 중...');
    const refreshCmd = new Uint8Array(6);
    refreshCmd[0] = 0x02;
    refreshCmd[1] = 0xa5;
    refreshCmd[2] = (imageData.length >> 0) & 0xff;
    refreshCmd[3] = (imageData.length >> 8) & 0xff;
    refreshCmd[4] = (imageData.length >> 16) & 0xff;
    refreshCmd[5] = (imageData.length >> 24) & 0xff;
    await epdChar.writeValueWithResponse(refreshCmd);

    // 상태 확인
    const statusBytes = await statusChar.readValue();
    const busy = statusBytes.getUint8(0) === 1;
    const errorCode = statusBytes.getUint8(1);

    report('done', 100, '전송 완료');

    return { battery, version, busy, error: errorCode };
  } finally {
    gatt.disconnect();
  }
}

// ─── 언바인드 (화면 초기화) ───

export async function clearEslScreen(
  device: BleDevice,
  onProgress?: (progress: EslTransferProgress) => void,
): Promise<void> {
  const report = (stage: EslTransferProgress['stage'], percent: number, message: string) => {
    onProgress?.({ stage, percent, message });
  };

  report('connecting', 0, 'BLE 연결 중...');
  const server = device.gatt;
  if (!server) throw new Error('GATT 서버를 사용할 수 없습니다.');

  const gatt = await server.connect();
  try {
    const service = await gatt.getPrimaryService(ESL_SERVICE_UUID);
    const cryptoChar = await service.getCharacteristic(ESL_CHAR.CRYPTO);
    const epdChar = await service.getCharacteristic(ESL_CHAR.EPD);

    // 보안 인증
    report('authenticating', 30, '보안 인증 중...');
    const secretBytes = await cryptoChar.readValue();
    const encrypted = await aes128EcbEncrypt(new Uint8Array(secretBytes.buffer));
    await cryptoChar.writeValueWithResponse(encrypted);

    // 언바인드 + 화면 초기화 명령
    report('refreshing', 60, '화면 초기화 중...');
    const clearCmd = new Uint8Array([0x04, 0xa5]);
    await epdChar.writeValueWithResponse(clearCmd);

    report('done', 100, '초기화 완료');
  } finally {
    gatt.disconnect();
  }
}

// ─── 바인딩 저장/불러오기 (localStorage) ───

export function loadBindings(): EslBinding[] {
  try {
    const raw = localStorage.getItem(ESL_BINDINGS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveBindings(bindings: EslBinding[]): void {
  localStorage.setItem(ESL_BINDINGS_KEY, JSON.stringify(bindings));
}

export function updateBinding(bindings: EslBinding[], roomNumber: string, patch: Partial<EslBinding>): EslBinding[] {
  const idx = bindings.findIndex((b) => b.roomNumber === roomNumber);
  if (idx >= 0) {
    const updated = [...bindings];
    updated[idx] = { ...updated[idx], ...patch };
    return updated;
  }
  return [...bindings, { roomNumber, deviceId: '', deviceName: '', lastUpdated: null, ...patch }];
}

// ─── 환자 정보 → 1bit 흑백 비트맵 변환 ───

/**
 * 환자 정보를 e-ink 디스플레이용 1bit 흑백 비트맵으로 변환합니다.
 * OffscreenCanvas 또는 일반 Canvas를 사용하여 텍스트를 렌더링한 뒤,
 * 각 픽셀의 밝기를 기준으로 흑/백 1bit로 변환합니다.
 *
 * @param patients 해당 병실의 환자 정보 배열 (침대별)
 * @param width 디스플레이 가로 해상도 (픽셀)
 * @param height 디스플레이 세로 해상도 (픽셀)
 * @returns 1bit per pixel, MSB-first packed Uint8Array
 */
export function renderPatientBitmap(
  patients: PatientDisplayData[],
  width: number,
  height: number,
): Uint8Array {
  const canvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(width, height)
    : document.createElement('canvas');

  if ('width' in canvas) {
    canvas.width = width;
    canvas.height = height;
  }

  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  if (!ctx) throw new Error('Canvas 컨텍스트를 생성할 수 없습니다.');

  // 흰색 배경
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // 검은색 텍스트
  ctx.fillStyle = '#000000';

  const room = patients[0]?.roomNumber || '';
  const padding = 4;
  let y = padding;

  // 호실 헤더
  ctx.font = `bold ${Math.round(height * 0.15)}px sans-serif`;
  ctx.fillText(`${room}호`, padding, y + Math.round(height * 0.14));
  y += Math.round(height * 0.18);

  // 구분선
  ctx.fillRect(padding, y, width - padding * 2, 1);
  y += 4;

  // 환자별 정보
  const lineHeight = Math.max(12, Math.round(height * 0.08));
  const fontSize = Math.max(10, Math.round(height * 0.065));
  const smallFont = Math.max(8, Math.round(height * 0.05));

  for (const p of patients) {
    if (y + lineHeight * 3 > height) break;

    // 침대번호 + 환자명
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.fillText(`${p.bedNumber}번 ${p.patientName}`, padding, y + fontSize);
    y += lineHeight;

    // 나이/성별 + 담당의
    ctx.font = `${smallFont}px sans-serif`;
    ctx.fillText(`${p.gender}/${p.age}세  담당: ${p.doctor}`, padding + 4, y + smallFont);
    y += lineHeight;

    // 입원일
    ctx.fillText(`입원: ${p.admissionDate}`, padding + 4, y + smallFont);
    y += lineHeight + 2;
  }

  // 빈 침대이면 안내 문구
  if (patients.length === 0) {
    ctx.font = `${fontSize}px sans-serif`;
    ctx.fillText('빈 병실', padding, y + fontSize);
  }

  // 픽셀 데이터 → 1bit 변환
  const imageData = ctx.getImageData(0, 0, width, height);
  const pixels = imageData.data;
  const byteCount = Math.ceil((width * height) / 8);
  const bitmap = new Uint8Array(byteCount);

  for (let i = 0; i < width * height; i++) {
    const r = pixels[i * 4];
    const g = pixels[i * 4 + 1];
    const b = pixels[i * 4 + 2];
    const brightness = (r + g + b) / 3;
    // 흑: 1, 백: 0 (e-ink 표준: 검은 픽셀이 1)
    if (brightness < 128) {
      bitmap[Math.floor(i / 8)] |= 1 << (7 - (i % 8));
    }
  }

  return bitmap;
}

/**
 * 미리보기용: Canvas에 환자 정보를 렌더링하여 반환합니다.
 * UI에서 미리보기 이미지를 표시할 때 사용합니다.
 */
export function renderPatientPreview(
  patients: PatientDisplayData[],
  width: number,
  height: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 컨텍스트를 생성할 수 없습니다.');

  // 흰색 배경
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#000000';

  const room = patients[0]?.roomNumber || '';
  const padding = 4;
  let y = padding;

  // 호실 헤더
  ctx.font = `bold ${Math.round(height * 0.15)}px sans-serif`;
  ctx.fillText(`${room}호`, padding, y + Math.round(height * 0.14));
  y += Math.round(height * 0.18);

  ctx.fillRect(padding, y, width - padding * 2, 1);
  y += 4;

  const lineHeight = Math.max(12, Math.round(height * 0.08));
  const fontSize = Math.max(10, Math.round(height * 0.065));
  const smallFont = Math.max(8, Math.round(height * 0.05));

  for (const p of patients) {
    if (y + lineHeight * 3 > height) break;

    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.fillText(`${p.bedNumber}번 ${p.patientName}`, padding, y + fontSize);
    y += lineHeight;

    ctx.font = `${smallFont}px sans-serif`;
    ctx.fillText(`${p.gender}/${p.age}세  담당: ${p.doctor}`, padding + 4, y + smallFont);
    y += lineHeight;

    ctx.fillText(`입원: ${p.admissionDate}`, padding + 4, y + smallFont);
    y += lineHeight + 2;
  }

  if (patients.length === 0) {
    ctx.font = `${fontSize}px sans-serif`;
    ctx.fillText('빈 병실', padding, y + fontSize);
  }

  return canvas;
}
