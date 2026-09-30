import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const password = process.env.DEMO_PASSWORD || 'StudyMatch!2026'

if (!url || !serviceRoleKey) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running the demo seed.')
  process.exit(1)
}

const admin = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })

const students = [
  ['Alex Johnson', 'alexj', 'alex@studymatch.demo', 'BS Computer Science', '2nd Year', ['Database:91', 'SQL:88', 'Python:72'], ['Java OOP:32', 'Algorithms:42', 'Inheritance:28']],
  ['Maria Santos', 'maria.codes', 'maria@studymatch.demo', 'BS Computer Science', '2nd Year', ['Java OOP:94', 'Inheritance:89', 'Polymorphism:84', 'Algorithms:95'], ['Database:35', 'SQL:40']],
  ['Joshua Kim', 'joshua.k', 'joshua@studymatch.demo', 'BS Software Engineering', '3rd Year', ['Algorithms:93', 'Data Structures:88', 'Graph Theory:79'], ['Python:36']],
  ['Anna Reyes', 'annareyes', 'anna@studymatch.demo', 'BS Data Science', '2nd Year', ['Python:95', 'Pandas:82', 'Data Visualization:74'], ['Database:31']],
  ['Liam Chen', 'liam.designs', 'liam@studymatch.demo', 'BS Information Technology', '3rd Year', ['UI/UX Design:93', 'Figma:91'], ['React:38']],
  ['Priya Nair', 'priyanair', 'priya@studymatch.demo', 'BS Information Systems', '3rd Year', ['React:94', 'TypeScript:90'], ['UI/UX Design:43']],
  ['Noah Williams', 'noahw', 'noah@studymatch.demo', 'BS Mathematics', '2nd Year', ['Statistics:92', 'Probability:89'], ['Python:46']],
  ['Sofia Garcia', 'sofiag', 'sofia@studymatch.demo', 'BS Computer Engineering', '3rd Year', ['Networking:92', 'Linux:81'], ['Database:44']],
  ['Carlos Mendoza', 'carlosm', 'carlos@studymatch.demo', 'BS Computer Science', '1st Year', ['C++:88'], ['Algorithms:47']],
  ['Mina Patel', 'minapatel', 'mina@studymatch.demo', 'BA Communication', '2nd Year', ['Presentation:94'], ['Data Visualization:39']],
  ['Ethan Brooks', 'ethanb', 'ethan@studymatch.demo', 'BS Software Engineering', '2nd Year', ['Software Testing:91'], ['Java OOP:54']],
]

const slugify = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
const parseSkills = (values) => values.map((value) => {
  const [name, proficiency] = value.split(':')
  return { name, proficiency: Number(proficiency) }
})

const { data: listed, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 })
if (listError) throw listError

for (const [fullName, username, email, course, yearLevel, strengthValues, weaknessValues] of students) {
  let user = listed.users.find((candidate) => candidate.email === email)
  if (!user) {
    const result = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName, username, course, year_level: yearLevel, school: 'Northbridge University' } })
    if (result.error) throw result.error
    user = result.data.user
  }
  if (!user) continue
  await admin.from('profiles').upsert({ id: user.id, full_name: fullName, username, email, course, year_level: yearLevel, school: 'Northbridge University', bio: 'A demo StudyMatch learner ready to teach and grow.', preferred_study_mode: 'Video call', learning_interests: ['Peer learning'] })
  const skills = [...parseSkills(strengthValues), ...parseSkills(weaknessValues)]
  for (const skill of skills) await admin.from('skills').upsert({ name: skill.name, slug: slugify(skill.name), category: 'Learning topic' }, { onConflict: 'slug' })
  const { data: skillRows, error: skillError } = await admin.from('skills').select('id,name').in('name', skills.map((skill) => skill.name))
  if (skillError) throw skillError
  await admin.from('user_skills').delete().eq('user_id', user.id)
  const strengthNames = new Set(parseSkills(strengthValues).map((skill) => skill.name))
  const rows = (skillRows ?? []).map((skill) => {
    const source = skills.find((item) => item.name === skill.name)
    return { user_id: user.id, skill_id: skill.id, kind: strengthNames.has(skill.name) ? 'strength' : 'weakness', proficiency: source?.proficiency ?? 0, level: (source?.proficiency ?? 0) > 80 ? 'Advanced' : 'Developing' }
  })
  if (rows.length) {
    const { error: userSkillError } = await admin.from('user_skills').insert(rows)
    if (userSkillError) throw userSkillError
  }
  console.log(`Seeded ${fullName} (${email})`)
}

console.log(`Demo seed complete. Password for demo accounts: ${password}`)
