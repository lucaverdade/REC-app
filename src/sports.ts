// Agrupamento dos tipos Garmin nas modalidades do app.
// Hyrox: o Luca registra como "Cardio" no relógio, que chega como indoor_cardio.
export type Sport = 'bike' | 'corrida' | 'natacao' | 'hyrox' | 'academia' | 'outro';

const MAP: Record<string, Sport> = {
  cycling: 'bike', indoor_cycling: 'bike', road_biking: 'bike', virtual_ride: 'bike',
  running: 'corrida', treadmill_running: 'corrida', track_running: 'corrida', trail_running: 'corrida',
  lap_swimming: 'natacao', open_water_swimming: 'natacao',
  indoor_cardio: 'hyrox',
  strength_training: 'academia',
};

export const sportOf = (type: string): Sport => MAP[type] ?? 'outro';

export const SPORT_LABEL: Record<Sport, string> = {
  bike: 'Bike', corrida: 'Corrida', natacao: 'Natação', hyrox: 'Hyrox', academia: 'Academia', outro: 'Outro',
};
