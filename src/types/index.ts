export type StudyMode = 'Video call' | 'Voice call' | 'In person' | 'Text first'

export type SkillLevel = 'Beginner' | 'Developing' | 'Proficient' | 'Advanced'

export type MessageKind = 'text' | 'image' | 'file' | 'system'

export type MatchMode = 'buddy' | 'peer'

export type RequestStatus = 'pending' | 'accepted' | 'declined' | 'skipped'

export type AvailabilitySlot = {
  day: string
  start: string
  end: string
}

export type Skill = {
  name: string
  proficiency: number
  level: SkillLevel
  category?: string
}

export type StudyStats = {
  buddySessions: number
  peerSessions: number
  studentsHelped: number
  learningHours: number
}

export type UserProfile = {
  id: string
  fullName: string
  username: string
  email: string
  course: string
  yearLevel: string
  school: string
  bio: string
  avatar: string
  preferredStudyMode: StudyMode
  availability: AvailabilitySlot[]
  learningInterests: string[]
  strengths: Skill[]
  weaknesses: Skill[]
  stats: StudyStats
  online: boolean
  lastSeen?: string
}

export type MatchBreakdown = {
  complementarity: number
  learningNeedRelevance: number
  availability: number
  studyPreference: number
  academicRelevance: number
}

export type BuddyMatch = {
  id: string
  profile: UserProfile
  score: number
  breakdown: MatchBreakdown
  canHelp: Skill[]
  needsHelp: Skill[]
  sharedAvailability: AvailabilitySlot[]
}

export type PeerGroupMatch = {
  id: string
  members: UserProfile[]
  score: number
  strengths: string[]
  learningGoals: string[]
  recommendedTopic: string
  sharedAvailability: AvailabilitySlot[]
}

export type MatchRequest = {
  id: string
  senderId: string
  recipientId: string
  mode: MatchMode
  matchId: string
  score: number
  status: RequestStatus
  createdAt: string
  updatedAt: string
  remoteId?: string
}

export type Conversation = {
  id: string
  type: MatchMode
  name: string
  memberIds: string[]
  avatar?: string
  lastMessage?: string
  lastMessageAt?: string
  unreadCount: number
  online?: boolean
}

export type Message = {
  id: string
  conversationId: string
  senderId: string
  content: string
  kind: MessageKind
  attachmentUrl?: string
  attachmentPath?: string
  attachmentName?: string
  createdAt: string
  readBy: string[]
}

export type NotificationType = 'request' | 'accepted' | 'message' | 'call' | 'reminder'

export type NotificationItem = {
  id: string
  userId: string
  type: NotificationType
  title: string
  body: string
  createdAt: string
  read: boolean
  actionId?: string
}

export type CallKind = 'voice' | 'video'

export type CallSession = {
  id: string
  conversationId: string
  roomUrl?: string
  roomName?: string
  kind: CallKind
  callerId: string
  status: 'ringing' | 'active' | 'ended'
  createdAt: string
}

export type RandomEncounter = {
  id: string
  participantIds: string[]
  kind: CallKind
  mode: MatchMode
  maxMembers: number
  conversationId?: string
  status: 'matched' | 'active' | 'ended' | 'skipped'
  roomName?: string
  roomUrl?: string
  createdAt: string
  startedAt?: string
  endedAt?: string
}

export type CallRating = {
  callId?: string
  encounterId?: string
  rateeId: string
  rating: number
  feedback?: string
}
