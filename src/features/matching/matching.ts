import type { AvailabilitySlot, BuddyMatch, PeerGroupMatch, Skill, UserProfile } from '../../types'

export const MIN_PEER_MEMBERS = 3
export const MAX_PEER_MEMBERS = 5

const aliases: Record<string, string[]> = {
  database: ['sql', 'postgres', 'mysql', 'data systems'],
  sql: ['database', 'postgres', 'mysql'],
  'java oop': ['java', 'object oriented programming', 'oop', 'inheritance', 'polymorphism'],
  oop: ['java oop', 'object oriented programming', 'inheritance', 'polymorphism'],
  algorithms: ['data structures', 'graph theory', 'problem solving'],
  'data structures': ['algorithms', 'problem solving'],
  python: ['pandas', 'data science', 'programming'],
  react: ['typescript', 'frontend', 'javascript'],
  'ui/ux design': ['figma', 'product design', 'frontend'],
}

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

export const topicSimilarity = (left: string, right: string) => {
  const a = normalize(left)
  const b = normalize(right)
  if (a === b) return 1
  if (a.includes(b) || b.includes(a)) return 0.88
  const aTokens = new Set(a.split(' '))
  const bTokens = new Set(b.split(' '))
  const tokenOverlap = [...aTokens].filter((token) => bTokens.has(token)).length / Math.max(aTokens.size, bTokens.size)
  const aliasMatch = (aliases[a] ?? []).some((item) => normalize(item) === b) || (aliases[b] ?? []).some((item) => normalize(item) === a)
  if (aliasMatch) return 0.82
  if (tokenOverlap > 0) return 0.55 + tokenOverlap * 0.2
  return 0
}

const scoreCoverage = (strengths: Skill[], needs: Skill[]) => {
  if (!needs.length || !strengths.length) return { score: 0, covered: [] as Skill[] }
  const covered = needs.map((need) => {
    const best = strengths
      .map((strength) => ({ strength, similarity: topicSimilarity(strength.name, need.name) }))
      .sort((a, b) => b.similarity * b.strength.proficiency - a.similarity * a.strength.proficiency)[0]
    const effectiveness = best ? best.similarity * (best.strength.proficiency / 100) : 0
    return { need, effectiveness, strength: best?.strength }
  })
  return {
    score: covered.reduce((total, item) => total + item.effectiveness, 0) / covered.length * 100,
    covered: covered.filter((item) => item.effectiveness >= 0.35).map((item) => item.need),
  }
}

const timeToMinutes = (value: string) => {
  const [hours, minutes] = value.split(':').map(Number)
  return hours * 60 + minutes
}

export const availabilityOverlap = (first: AvailabilitySlot[], second: AvailabilitySlot[]) => {
  const shared = first.filter((left) => second.some((right) => {
    if (left.day !== right.day) return false
    return Math.min(timeToMinutes(left.end), timeToMinutes(right.end)) - Math.max(timeToMinutes(left.start), timeToMinutes(right.start)) >= 45
  }))
  const score = first.length && second.length ? Math.min(100, (shared.length / Math.min(first.length, second.length)) * 100) : 0
  return { score, shared }
}

const preferenceScore = (first: UserProfile, second: UserProfile) => {
  if (first.preferredStudyMode === second.preferredStudyMode) return 100
  if (first.preferredStudyMode === 'Text first' || second.preferredStudyMode === 'Text first') return 72
  return 58
}

const academicScore = (first: UserProfile, second: UserProfile) => {
  const firstWords = `${first.course} ${first.school}`.toLowerCase().split(/\W+/)
  const secondWords = `${second.course} ${second.school}`.toLowerCase().split(/\W+/)
  const overlap = firstWords.filter((word) => word.length > 2 && secondWords.includes(word)).length
  return Math.min(100, 45 + overlap * 18 + (first.school === second.school ? 30 : 0))
}

export const calculateBuddyMatch = (first: UserProfile, second: UserProfile): BuddyMatch => {
  const firstToSecond = scoreCoverage(first.strengths, second.weaknesses)
  const secondToFirst = scoreCoverage(second.strengths, first.weaknesses)
  const availability = availabilityOverlap(first.availability, second.availability)
  const complementarity = (firstToSecond.score + secondToFirst.score) / 2
  const balancedNeed = Math.min(firstToSecond.score, secondToFirst.score) * 0.7 + complementarity * 0.3
  const preference = preferenceScore(first, second)
  const academic = academicScore(first, second)
  const score = Math.round(complementarity * 0.45 + balancedNeed * 0.25 + availability.score * 0.15 + preference * 0.1 + academic * 0.05)

  return {
    id: `buddy-${first.id}-${second.id}`,
    profile: second,
    score: Math.max(0, Math.min(100, score)),
    breakdown: {
      complementarity: Math.round(complementarity),
      learningNeedRelevance: Math.round(balancedNeed),
      availability: Math.round(availability.score),
      studyPreference: preference,
      academicRelevance: academic,
    },
    canHelp: firstToSecond.covered,
    needsHelp: secondToFirst.covered,
    sharedAvailability: availability.shared,
  }
}

export const findBuddyMatches = (current: UserProfile, profiles: UserProfile[]) =>
  profiles
    .filter((profile) => profile.id !== current.id)
    .map((profile) => calculateBuddyMatch(current, profile))
    .sort((a, b) => b.score - a.score)

const combinations = <T,>(items: T[], size: number): T[][] => {
  if (size === 0) return [[]]
  if (items.length < size) return []
  const [first, ...rest] = items
  return [
    ...combinations(rest, size - 1).map((combination) => [first, ...combination]),
    ...combinations(rest, size),
  ]
}

export const calculatePeerGroup = (members: UserProfile[]): PeerGroupMatch => {
  const coveredNeeds = members.flatMap((member) => member.weaknesses.map((need) => {
    const helpers = members
      .filter((other) => other.id !== member.id)
      .flatMap((other) => other.strengths.map((strength) => ({ strength, similarity: topicSimilarity(strength.name, need.name) })))
      .sort((a, b) => b.similarity * b.strength.proficiency - a.similarity * a.strength.proficiency)
    const best = helpers[0]
    return { member, need, effectiveness: best ? best.similarity * (best.strength.proficiency / 100) : 0 }
  }))
  const score = coveredNeeds.length ? coveredNeeds.reduce((total, item) => total + item.effectiveness, 0) / coveredNeeds.length * 100 : 0
  const sharedAvailability = members.slice(1).reduce<AvailabilitySlot[]>((shared, member) => {
    if (!shared.length) return members[0].availability.filter((slot) => member.availability.some((other) => other.day === slot.day))
    return shared.filter((slot) => member.availability.some((other) => other.day === slot.day))
  }, members[0]?.availability ?? [])
  const strengths = [...new Set(members.flatMap((member) => member.strengths).sort((a, b) => b.proficiency - a.proficiency).slice(0, 5).map((skill) => skill.name))]
  const learningGoals = [...new Set(coveredNeeds.filter((item) => item.effectiveness < 0.7).map((item) => item.need.name))].slice(0, 4)
  const recommended = coveredNeeds.sort((a, b) => b.effectiveness - a.effectiveness)[0]?.need.name ?? strengths[0] ?? 'Study planning'

  return {
    id: `peer-${members.map((member) => member.id).sort().join('-')}`,
    members,
    score: Math.round(score),
    strengths,
    learningGoals: learningGoals.length ? learningGoals : [...new Set(members.flatMap((member) => member.weaknesses.map((skill) => skill.name)))].slice(0, 4),
    recommendedTopic: recommended,
    sharedAvailability,
  }
}

export const findBestPeerGroup = (current: UserProfile, profiles: UserProfile[]) => {
  const candidates = profiles.filter((profile) => profile.id !== current.id).sort((a, b) => calculateBuddyMatch(current, b).score - calculateBuddyMatch(current, a).score).slice(0, 8)
  if (candidates.length < MIN_PEER_MEMBERS - 1) return null
  const groups = [
    ...combinations(candidates, MIN_PEER_MEMBERS - 1),
    ...combinations(candidates, MIN_PEER_MEMBERS),
    ...combinations(candidates, MAX_PEER_MEMBERS - 1),
  ].map((group) => calculatePeerGroup([current, ...group]))
  return groups.sort((a, b) => b.score - a.score || b.members.length - a.members.length)[0] ?? null
}
