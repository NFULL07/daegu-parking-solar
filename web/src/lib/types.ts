import { Params } from './calc';

export interface Src { name: string; org: string; url: string }
export interface Meta {
  defaults: Omit<Params, 'yieldKey' | 'yieldCustom'>;
  city_plan: { sites: number; mw: number; source: string; url: string };
  sources: Src[];
  refs: Src[];
}
export interface Metric { nMAE_pct: number; nRMSE_pct: number; bias_pct: number; r: number }
export interface ForecastEval {
  label: string; n_hours: number; n_days: number; hours: string; capacity_mw: number;
  hourly: { official_ewp: Metric; ai: Metric };
  improvement: { nMAE_pctpt: number; relative_pct: number; pctpt_95ci_day_bootstrap: [number, number] };
  daily_total_nMAE_pct: { ewp: number; ai_nested: number };
  ai_better_hour_share: number;
  by_month: Record<string, { days: number; ewp_nMAE: number; ai_nMAE: number }>;
  model: { type: string; inputs: string; role: string };
}
export interface ForecastRow { date: string; hh: number; actual: number; ewp: number; ai: number }
export interface EssInputs {
  days263: { date: string; actual: number; ewp: number; ai: number; ewp_q20: number; ai_q20: number }[];
  days365_window_per_mw: number[];
  hourly_per_mw: Record<string, number[]>;
  charge_hours: [number, number];
  discharge_hours: [number, number];
  kpx_capacity_mw: number;
}
export interface CityGeo { type: 'FeatureCollection'; features: { type: 'Feature'; properties: { name: string }; geometry: GeoJSON.Geometry }[] }
