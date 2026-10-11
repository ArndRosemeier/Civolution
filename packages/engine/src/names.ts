/**
 * City names until civilizations bring their own (Phase 6): historical places from many
 * cultures, used in order and skipping names the player already uses.
 */
export const CITY_NAMES = [
  'Ur', 'Memphis', 'Mohenjo-daro', 'Knossos', 'Jericho', 'Anyang', 'Byblos', 'Mycenae', 'Nineveh', 'Thebes',
  'Susa', 'Carchemish', 'Tyre', 'Sidon', 'Uruk', 'Lagash', 'Harappa', 'Ebla', 'Mari', 'Hattusa',
  'Troy', 'Gordion', 'Sardis', 'Pasargadae', 'Meroe', 'Aksum', 'Taxila', 'Pataliputra', 'Luoyang', 'Xianyang',
  'Cuzco', 'Teotihuacan', 'Tikal', 'Palenque', 'Copan', 'Monte Alban', 'Caral', 'Chan Chan', 'Cahokia', 'Mesa Verde',
  'Gades', 'Massalia', 'Syracuse', 'Corinth', 'Delphi', 'Miletus', 'Ephesus', 'Pergamon', 'Antioch', 'Palmyra',
  'Petra', 'Leptis Magna', 'Cyrene', 'Utica', 'Numantia', 'Alesia', 'Bibracte', 'Aquileia', 'Ravenna', 'Lugdunum',
  'Kyiv', 'Novgorod', 'Samarkand', 'Bukhara', 'Merv', 'Nishapur', 'Herat', 'Kandahar', 'Kashgar', 'Dunhuang',
  'Nara', 'Kyoto', 'Gyeongju', 'Angkor', 'Pagan', 'Ayutthaya', 'Malacca', 'Zanzibar', 'Kilwa', 'Timbuktu',
  'Djenne', 'Gao', 'Great Zimbabwe', 'Mapungubwe', 'Ife', 'Benin', 'Kano', 'Sijilmasa', 'Fez', 'Kairouan',
];

export function nextCityName(used: ReadonlySet<string>, count: number): string {
  for (const n of CITY_NAMES) if (!used.has(n)) return n;
  return `New Town ${count + 1}`;
}
