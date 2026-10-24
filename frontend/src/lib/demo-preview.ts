/** Public, fictional snapshot of backend/app/demo.py (student, moderate scenario).
 * Deliberately bundled: the public landing page never needs Supabase or the API.
 * Authored expected outcomes: never claim these are live jobs or provider responses.
 */
export const demoPreview = {
  name: 'Aisha Rahman',
  label: 'Fictional profile · Curated demo data',
  cvScore: 82,
  matches: [
    { title: 'Junior Data Analyst', score: 86, skills: ['Communication', 'Data analysis', 'Python'] },
    { title: 'Reporting Analyst Trainee', score: 79, skills: ['Communication', 'Data analysis', 'Excel'] },
    { title: 'Technical Support Analyst', score: 72, skills: ['Data analysis', 'Git', 'Python', 'Teamwork'] },
  ],
  plan: {
    title: 'Cloud Fundamentals', role: 'Junior Data Analyst', weeks: 1, weeklyHours: 8, cost: 0,
    completed: 1, total: 3,
    steps: ['Cloud concepts', 'Build a service', 'Operate responsibly'],
    provider: 'Pravista Demo Learning Lab',
  },
  facts: { careers: 3, scenarios: 3, pathwayTypes: 4 },
} as const;
