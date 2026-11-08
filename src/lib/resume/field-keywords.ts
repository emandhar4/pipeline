/**
 * Keywords per field category (slugs from `field_categories`). Lowercase, matched on word
 * boundaries, each keyword in exactly one category. Kept generic across majors and careers.
 */
export const FIELD_KEYWORDS: Record<string, string[]> = {
  'software-engineering': [
    'java', 'javascript', 'typescript', 'react', 'git', 'api', 'software engineering', 'c++',
    'python', 'node.js', 'backend', 'frontend', 'full stack', 'c#', 'agile',
  ],
  'data-analysis': [
    'sql', 'tableau', 'power bi', 'excel', 'data analysis', 'dashboard', 'r', 'statistics',
    'data visualization', 'pandas', 'data cleaning', 'looker', 'spss',
  ],
  'machine-learning-and-ai': [
    'machine learning', 'deep learning', 'tensorflow', 'pytorch', 'neural network', 'nlp',
    'computer vision', 'scikit-learn', 'artificial intelligence', 'llm', 'reinforcement learning',
  ],
  'product-management': [
    'product management', 'product manager', 'roadmap', 'user stories', 'product strategy',
    'a/b testing', 'jira', 'product launch', 'user research', 'prd',
  ],
  'accounting-and-finance': [
    'accounting', 'financial analysis', 'gaap', 'audit', 'financial modeling', 'valuation',
    'budgeting', 'accounts payable', 'accounts receivable', 'cpa', 'tax', 'quickbooks', 'forecasting',
  ],
  'engineering-and-development': [
    'cad', 'solidworks', 'autocad', 'matlab', 'mechanical design', 'prototyping', 'manufacturing',
    'finite element', 'circuit design', 'plc', 'gd&t', 'six sigma',
  ],
  'business-analyst': [
    'business analysis', 'requirements gathering', 'process improvement', 'stakeholder',
    'business requirements', 'process mapping', 'visio', 'kpi', 'gap analysis', 'use cases',
  ],
  marketing: [
    'marketing', 'seo', 'social media', 'campaign', 'brand', 'content', 'google analytics',
    'market research', 'email marketing', 'digital marketing', 'hubspot', 'copywriting',
  ],
  cybersecurity: [
    'cybersecurity', 'network security', 'penetration testing', 'siem', 'incident response',
    'vulnerability', 'firewall', 'security+', 'encryption', 'threat intelligence', 'nist',
  ],
  consulting: [
    'consulting', 'consultant', 'client engagement', 'case interview', 'strategy consulting',
    'due diligence', 'client deliverables', 'market sizing', 'management consulting',
  ],
  'creatives-and-design': [
    'graphic design', 'adobe', 'photoshop', 'illustrator', 'figma', 'ui/ux', 'typography',
    'indesign', 'user experience', 'visual design', 'wireframes',
  ],
  'management-and-executive': [
    'leadership', 'team lead', 'managed a team', 'operations management', 'strategic planning',
    'p&l', 'executive', 'director', 'people management',
  ],
  'public-sector-and-government': [
    'government', 'public policy', 'public administration', 'nonprofit', 'municipal', 'federal',
    'legislative', 'policy analysis', 'community outreach', 'grant writing',
  ],
  'legal-and-compliance': [
    'legal', 'compliance', 'contracts', 'litigation', 'regulatory', 'paralegal', 'legal research',
    'risk management', 'law', 'privacy',
  ],
  'human-resources': [
    'human resources', 'recruiting', 'talent acquisition', 'onboarding', 'employee relations',
    'payroll', 'hris', 'benefits administration', 'workday', 'compensation',
  ],
  'arts-and-entertainment': [
    'film', 'music', 'theater', 'video production', 'photography', 'animation', 'journalism',
    'creative writing', 'video editing', 'broadcast', 'screenwriting', 'museum',
  ],
  sales: [
    'sales', 'business development', 'lead generation', 'crm', 'salesforce', 'cold calling',
    'quota', 'account management', 'negotiation', 'b2b',
  ],
  'customer-service-and-support': [
    'customer service', 'customer support', 'help desk', 'zendesk', 'client satisfaction',
    'call center', 'troubleshooting', 'technical support', 'customer success',
  ],
  'education-and-training': [
    'teaching', 'tutoring', 'curriculum', 'lesson planning', 'instructional design', 'classroom',
    'mentoring', 'training', 'teaching assistant', 'student engagement',
  ],
  healthcare: [
    'clinical', 'patient care', 'hipaa', 'nursing', 'emr', 'electronic health records',
    'healthcare', 'medical', 'phlebotomy', 'public health', 'cpr',
  ],
  'supply-chain': [
    'supply chain', 'logistics', 'procurement', 'inventory', 'sourcing', 'warehouse',
    'demand planning', 'lean', 'supplier management', 'distribution', 'sap', 'erp', 'freight',
  ],
};
