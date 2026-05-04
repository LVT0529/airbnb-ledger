import { Platform } from './types';

export const PLATFORMS: {
  value: Platform;
  label: string;
  short: string;
  emoji: string;
}[] = [
  { value: 'airbnb', label: 'Airbnb', short: 'Airbnb', emoji: '🏠' },
  { value: 'booking', label: 'Booking.com', short: 'Booking', emoji: '🛎️' },
  { value: 'agoda', label: 'Agoda', short: 'Agoda', emoji: '🌏' },
  { value: 'expedia', label: 'Expedia', short: 'Expedia', emoji: '✈️' },
  { value: 'vrbo', label: 'Vrbo', short: 'Vrbo', emoji: '🏖️' },
  { value: 'wehome', label: '위홈', short: '위홈', emoji: '🏘️' },
  { value: 'mrmention', label: '미스터멘션', short: '멘션', emoji: '📌' },
  { value: 'direct', label: '직접 예약', short: '직접', emoji: '📞' },
  { value: 'other', label: '기타', short: '기타', emoji: '📋' },
];

export const COUNTRIES = [
  { code: 'KR', name: '대한민국' },
  { code: 'JP', name: '일본' },
  { code: 'CN', name: '중국' },
  { code: 'TW', name: '대만' },
  { code: 'HK', name: '홍콩' },
  { code: 'SG', name: '싱가포르' },
  { code: 'MY', name: '말레이시아' },
  { code: 'TH', name: '태국' },
  { code: 'VN', name: '베트남' },
  { code: 'ID', name: '인도네시아' },
  { code: 'PH', name: '필리핀' },
  { code: 'IN', name: '인도' },
  { code: 'US', name: '미국' },
  { code: 'CA', name: '캐나다' },
  { code: 'MX', name: '멕시코' },
  { code: 'BR', name: '브라질' },
  { code: 'AR', name: '아르헨티나' },
  { code: 'GB', name: '영국' },
  { code: 'IE', name: '아일랜드' },
  { code: 'FR', name: '프랑스' },
  { code: 'DE', name: '독일' },
  { code: 'ES', name: '스페인' },
  { code: 'IT', name: '이탈리아' },
  { code: 'PT', name: '포르투갈' },
  { code: 'NL', name: '네덜란드' },
  { code: 'BE', name: '벨기에' },
  { code: 'CH', name: '스위스' },
  { code: 'AT', name: '오스트리아' },
  { code: 'SE', name: '스웨덴' },
  { code: 'NO', name: '노르웨이' },
  { code: 'DK', name: '덴마크' },
  { code: 'FI', name: '핀란드' },
  { code: 'PL', name: '폴란드' },
  { code: 'CZ', name: '체코' },
  { code: 'GR', name: '그리스' },
  { code: 'RU', name: '러시아' },
  { code: 'TR', name: '튀르키예' },
  { code: 'IL', name: '이스라엘' },
  { code: 'AE', name: '아랍에미리트' },
  { code: 'SA', name: '사우디아라비아' },
  { code: 'EG', name: '이집트' },
  { code: 'ZA', name: '남아프리카' },
  { code: 'AU', name: '호주' },
  { code: 'NZ', name: '뉴질랜드' },
];

export { EXPENSE_CATEGORIES } from './types';
