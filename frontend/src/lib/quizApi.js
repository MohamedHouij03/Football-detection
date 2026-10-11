// Thin fetch wrapper for Coach Mode + Quiz Player endpoints. The app's other pages
// call fetch() inline; this one's justified by the number of distinct calls shared
// between Coach.jsx and Quiz.jsx.

async function request(url, options) {
  const res = await fetch(url, options)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `Server error ${res.status}`)
  }
  return res.json()
}

export const registerVideo = (jobMeta) => request('/api/quiz/videos/register', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(jobMeta),
})

export const listVideos = () => request('/api/quiz/videos')

export const getMediaUrl = (videoHash) => request(`/api/quiz/videos/${videoHash}/media_url`)

export const listQuestions = (videoHash) => request(`/api/quiz/questions?video_hash=${encodeURIComponent(videoHash)}`)

export const createQuestion = (q) => request('/api/quiz/questions', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(q),
})

export const updateQuestion = (id, q) => request(`/api/quiz/questions/${id}`, {
  method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(q),
})

export const deleteQuestion = (id) => request(`/api/quiz/questions/${id}`, { method: 'DELETE' })

export const startSession = (videoHash) => request('/api/quiz/sessions', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ video_hash: videoHash }),
})

export const submitAnswer = (sessionId, questionId, choiceId) =>
  request(`/api/quiz/sessions/${sessionId}/answers`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question_id: questionId, choice_id: choiceId }),
  })

export const completeSession = (sessionId) =>
  request(`/api/quiz/sessions/${sessionId}/complete`, { method: 'POST' })
