/** JSON that `refresh_matches` writes to `posting_matches.reasons`. */
export type BarPart = 'better' | 'same' | 'worse';

export type MatchReasons = {
  fields: { label: string; weight: 'primary' | 'secondary' }[];
  weight: 'primary' | 'secondary' | null;
  location_unknown: boolean;
  age_days: number | null;
  dream: boolean;
  capped: boolean;
  preferred_industry: string | null;
  /** null = pay unknown */
  pay_ok: boolean | null;
  bar: null | {
    pay: BarPart | null;
    pay_pct: number | null;
    brand: BarPart;
    function: BarPart;
  };
  ai_reason?: string;
};

export type BarVerdict = 'beats' | 'does_not_beat' | 'no_bar';
