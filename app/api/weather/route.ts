import { NextRequest, NextResponse } from 'next/server';

// ──────────────────────────────────────────────
// 타입 정의
// ──────────────────────────────────────────────

interface WeatherApiResponse {
  current: {
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    wind_speed_10m: number;
    weather_code: number;
  };
}

interface AirQualityApiResponse {
  current: {
    pm2_5: number;
    pm10: number;
  };
}

interface WeatherData {
  temperature: number;
  feelsLike: number;
  humidity: number;
  windSpeed: number;
  weatherCode: number;
  weatherLabel: string;
  weatherEmoji: string;
  pm25: number;
  pm10: number;
  pm25Grade: string;
  pm25GradeColor: string;
  pm10Grade: string;
  pm10GradeColor: string;
  aqi: string;
  aqiColor: string;
}

// ──────────────────────────────────────────────
// WMO 날씨 코드 매핑
// ──────────────────────────────────────────────

const WMO_MAP: Record<number, [string, string]> = {
  0:  ['맑음',          '☀️'],
  1:  ['대체로 맑음',   '🌤️'],
  2:  ['구름 조금',     '⛅'],
  3:  ['흐림',          '☁️'],
  45: ['안개',          '🌫️'],
  48: ['안개',          '🌫️'],
  51: ['이슬비',        '🌦️'],
  53: ['이슬비',        '🌦️'],
  55: ['이슬비',        '🌦️'],
  61: ['비',            '🌧️'],
  63: ['비',            '🌧️'],
  65: ['비',            '🌧️'],
  71: ['눈',            '❄️'],
  73: ['눈',            '❄️'],
  75: ['눈',            '❄️'],
  77: ['진눈깨비',      '🌨️'],
  80: ['소나기',        '🌦️'],
  81: ['소나기',        '🌦️'],
  82: ['소나기',        '🌦️'],
  85: ['눈 소나기',     '🌨️'],
  86: ['눈 소나기',     '🌨️'],
  95: ['천둥번개',      '⛈️'],
  96: ['우박 동반 뇌우','⛈️'],
  99: ['우박 동반 뇌우','⛈️'],
};

function getWeatherInfo(code: number): { label: string; emoji: string } {
  const entry = WMO_MAP[code];
  if (entry) return { label: entry[0], emoji: entry[1] };
  return { label: '흐림', emoji: '🌥️' };
}

// ──────────────────────────────────────────────
// 미세먼지 등급 계산
// ──────────────────────────────────────────────

type GradeResult = { grade: string; color: string };

function getPm25Grade(value: number): GradeResult {
  if (value <= 15) return { grade: '좋음',     color: 'green'  };
  if (value <= 35) return { grade: '보통',     color: 'yellow' };
  if (value <= 75) return { grade: '나쁨',     color: 'orange' };
  return              { grade: '매우나쁨', color: 'red'    };
}

function getPm10Grade(value: number): GradeResult {
  if (value <= 30)  return { grade: '좋음',     color: 'green'  };
  if (value <= 80)  return { grade: '보통',     color: 'yellow' };
  if (value <= 150) return { grade: '나쁨',     color: 'orange' };
  return               { grade: '매우나쁨', color: 'red'    };
}

const GRADE_ORDER: Record<string, number> = {
  '좋음': 0, '보통': 1, '나쁨': 2, '매우나쁨': 3,
};

function worstGrade(a: GradeResult, b: GradeResult): GradeResult {
  return GRADE_ORDER[a.grade] >= GRADE_ORDER[b.grade] ? a : b;
}

// ──────────────────────────────────────────────
// GET Handler
// ──────────────────────────────────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const lat = searchParams.get('lat');
  const lon = searchParams.get('lon');

  if (!lat || !lon) {
    return NextResponse.json(
      { error: 'lat, lon 파라미터가 필요합니다.' },
      { status: 400 },
    );
  }

  // 날씨 API 호출
  const weatherUrl =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code` +
    `&timezone=Asia/Seoul`;

  let weatherRes: Response;
  try {
    weatherRes = await fetch(weatherUrl, { cache: 'no-store' });
    if (!weatherRes.ok) throw new Error(`weather API ${weatherRes.status}`);
  } catch (err) {
    return NextResponse.json(
      { error: `날씨 API 호출 실패: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }

  const weatherJson = (await weatherRes.json()) as WeatherApiResponse;
  const wc = weatherJson.current;
  const { label: weatherLabel, emoji: weatherEmoji } = getWeatherInfo(wc.weather_code);

  // 공기질 API 호출 (실패해도 weather만 반환)
  let pm25 = -1;
  let pm10 = -1;

  try {
    const aqUrl =
      `https://air-quality-api.open-meteo.com/v1/air-quality` +
      `?latitude=${lat}&longitude=${lon}` +
      `&current=pm2_5,pm10` +
      `&timezone=Asia/Seoul`;

    const aqRes = await fetch(aqUrl, { cache: 'no-store' });
    if (aqRes.ok) {
      const aqJson = (await aqRes.json()) as AirQualityApiResponse;
      pm25 = Math.round(aqJson.current.pm2_5 ?? -1);
      pm10 = Math.round(aqJson.current.pm10  ?? -1);
    }
  } catch {
    // 공기질 실패는 무시하고 pm25/pm10 = -1 유지
  }

  // 등급 계산 (값이 -1이면 '알 수 없음' 처리)
  const pm25GradeResult: GradeResult =
    pm25 >= 0 ? getPm25Grade(pm25) : { grade: '알 수 없음', color: 'gray' };
  const pm10GradeResult: GradeResult =
    pm10 >= 0 ? getPm10Grade(pm10) : { grade: '알 수 없음', color: 'gray' };

  const aqiResult: GradeResult =
    pm25 >= 0 && pm10 >= 0
      ? worstGrade(pm25GradeResult, pm10GradeResult)
      : { grade: '알 수 없음', color: 'gray' };

  const data: WeatherData = {
    temperature: Math.round(wc.temperature_2m * 10) / 10,
    feelsLike:   Math.round(wc.apparent_temperature * 10) / 10,
    humidity:    wc.relative_humidity_2m,
    windSpeed:   Math.round(wc.wind_speed_10m * 10) / 10,
    weatherCode: wc.weather_code,
    weatherLabel,
    weatherEmoji,
    pm25,
    pm10,
    pm25Grade:      pm25GradeResult.grade,
    pm25GradeColor: pm25GradeResult.color,
    pm10Grade:      pm10GradeResult.grade,
    pm10GradeColor: pm10GradeResult.color,
    aqi:      aqiResult.grade,
    aqiColor: aqiResult.color,
  };

  return NextResponse.json(data, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
