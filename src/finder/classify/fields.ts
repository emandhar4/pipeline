/**
 * Title keywords per field category slug. Titles are short, so these are role words.
 * A keyword matches at the start of a word; keywords of 3 letters or fewer must be whole words.
 * Separate from the resume keyword map on purpose.
 */
export const TITLE_FIELD_KEYWORDS: Record<string, string[]> = {
  'software-engineering': [
    'software', 'full stack', 'fullstack', 'front end', 'frontend', 'back end', 'backend', 'web developer',
    'mobile developer', 'ios', 'android', 'devops', 'site reliability', 'sre', 'swe', 'application developer',
    'platform engineer', 'cloud engineer',
  ],
  'data-analysis': [
    'data analy', 'data scien', 'data engineer', 'analytics', 'business intelligence', 'statistic', 'data',
    'bi analyst',
  ],
  'machine-learning-and-ai': [
    'machine learning', 'ml', 'ai', 'artificial intelligence', 'deep learning', 'nlp', 'computer vision',
    'applied scientist', 'research scientist', 'generative',
  ],
  'product-management': [
    'product manage', 'product owner', 'associate product', 'apm', 'technical program manage', 'product operations',
  ],
  'accounting-and-finance': [
    'accounting', 'accountant', 'finance', 'financial', 'audit', 'tax', 'treasury', 'investment', 'banking',
    'equity research', 'actuar', 'quant', 'trader', 'trading', 'fp&a', 'underwrit', 'credit', 'wealth',
    'portfolio', 'bookkeep', 'controller',
  ],
  'engineering-and-development': [
    'mechanical', 'electrical', 'civil', 'chemical', 'hardware', 'manufacturing', 'industrial engineer',
    'aerospace', 'embedded', 'firmware', 'process engineer', 'systems engineer', 'test engineer', 'engineering',
    'r&d', 'design engineer', 'structural', 'biomedical engineer', 'materials engineer', 'field engineer',
  ],
  'business-analyst': [
    'business analy', 'business systems', 'strategy and operations', 'operations analyst', 'strategy analyst',
    'business operations', 'bizops', 'management analyst', 'systems analyst', 'process analyst',
  ],
  marketing: [
    'marketing', 'brand', 'social media', 'seo', 'content', 'communications', 'growth', 'public relations',
    'advertising', 'copywrit', 'campaign', 'demand gen', 'market research',
  ],
  cybersecurity: [
    'security', 'cyber', 'infosec', 'penetration', 'threat', 'vulnerab', 'appsec', 'soc analyst',
    'information assurance',
  ],
  consulting: ['consult', 'advisory', 'strategy', 'management consult'],
  'creatives-and-design': [
    'design', 'ux', 'ui', 'graphic', 'creative', 'illustrat', 'animat', 'visual', 'art director', 'video',
    'photograph', 'motion',
  ],
  'management-and-executive': [
    'general manager', 'director', 'executive', 'head of', 'vp', 'vice president', 'chief', 'president',
    'management trainee', 'leadership development', 'operations manager', 'program manager', 'project manager',
    'rotational',
  ],
  'public-sector-and-government': [
    'government', 'public policy', 'policy', 'public sector', 'municipal', 'federal', 'legislat', 'public affairs',
    'civil service', 'intelligence analyst', 'public administration',
  ],
  'legal-and-compliance': [
    'legal', 'law', 'attorney', 'paralegal', 'compliance', 'counsel', 'regulatory', 'contracts', 'privacy',
    'aml', 'kyc', 'ethics',
  ],
  'human-resources': [
    'human resources', 'hr', 'recruit', 'talent', 'people operations', 'people partner', 'payroll', 'benefits',
    'employee', 'workforce',
  ],
  'arts-and-entertainment': [
    'entertainment', 'music', 'film', 'theatre', 'theater', 'production assistant', 'game', 'broadcast',
    'journalis', 'editor', 'museum', 'artist', 'media', 'sports',
  ],
  sales: [
    'sales', 'account executive', 'business development', 'sdr', 'bdr', 'account manager', 'revenue',
    'territory', 'inside sales',
  ],
  'customer-service-and-support': [
    'customer service', 'customer support', 'customer success', 'support specialist', 'support engineer',
    'help desk', 'helpdesk', 'technical support', 'client service', 'customer experience', 'call center',
    'service desk',
  ],
  'education-and-training': [
    'teach', 'tutor', 'instructor', 'education', 'training', 'curriculum', 'learning and development',
    'professor', 'instructional', 'academic', 'school',
  ],
  healthcare: [
    'health', 'clinical', 'clinic', 'nurs', 'medical', 'pharmac', 'patient', 'physician', 'therapist', 'dental',
    'hospital', 'caregiver', 'laboratory',
  ],
  'supply-chain': [
    'supply chain', 'logistics', 'procurement', 'purchasing', 'sourcing', 'inventory', 'warehouse',
    'demand planning', 'operations planning', 'transportation', 'distribution', 'materials', 'buyer',
    'planner', 'supplier',
  ],
};

const SIMPLIFY_CATEGORY: Record<string, string[]> = {
  'software engineering': ['software-engineering'],
  software: ['software-engineering'],
  'ai/ml/data': ['machine-learning-and-ai', 'data-analysis'],
  'data science': ['data-analysis'],
  'product management': ['product-management'],
  product: ['product-management'],
  'hardware engineering': ['engineering-and-development'],
  hardware: ['engineering-and-development'],
  quant: ['accounting-and-finance'],
  'quantitative finance': ['accounting-and-finance'],
};

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const MATCHERS: [string, RegExp[]][] = Object.entries(TITLE_FIELD_KEYWORDS).map(([slug, kws]) => [
  slug,
  kws.map(
    (k) => new RegExp(`(?<![a-z0-9])${escape(k).replace(/ /g, '[\\s-]+')}${k.length <= 3 ? '(?![a-z0-9])' : ''}`, 'i'),
  ),
]);

/**
 * Field category slugs for a posting title plus an optional SimplifyJobs category.
 * LLM-UPGRADE: replace the keyword match with a model call that classifies title and description.
 */
export function fieldSlugsFromTitle(title: string, simplifyCategory?: string): string[] {
  const out = new Set<string>();
  for (const [slug, res] of MATCHERS) {
    if (res.some((re) => re.test(title))) out.add(slug);
  }
  const cat = simplifyCategory?.trim().toLowerCase();
  if (cat) for (const s of SIMPLIFY_CATEGORY[cat] ?? []) out.add(s);
  return Object.keys(TITLE_FIELD_KEYWORDS).filter((s) => out.has(s));
}
