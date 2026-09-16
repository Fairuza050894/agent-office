import type {
  CreateRunRequest,
  CreateTaskRequest,
  HealthResponse,
  Project,
  RegisterProjectRequest,
  Run,
  Task,
  VersionResponse,
} from './types'

export class ApiError extends Error {
  readonly status: number
  readonly detail?: string

  constructor(status: number, message: string, detail?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

function parseErrorDetail(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') {
    return undefined
  }

  const obj = data as Record<string, unknown>
  if (typeof obj.detail === 'string') {
    return obj.detail
  }

  if (Array.isArray(obj.detail)) {
    return obj.detail
      .map((item) => {
        if (typeof item === 'object' && item !== null && 'msg' in item) {
          const rawLoc = (item as { loc?: unknown }).loc
          const loc = Array.isArray(rawLoc)
            ? rawLoc.filter((l: unknown) => l !== 'body').map(String).join('.')
            : ''
          const msg = String((item as { msg: unknown }).msg)
          return loc ? `${loc}: ${msg}` : msg
        }
        return String(item)
      })
      .join('; ')
  }

  return undefined
}

async function request<T>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Network request failed'
    throw new ApiError(0, `Unable to reach Agent Office backend: ${errorMsg}`)
  }

  if (!response.ok) {
    let errorDetail: string | undefined
    let errorMessage: string

    try {
      const data = await response.json()
      errorDetail = parseErrorDetail(data)
    } catch {
      // Body was not JSON
    }

    switch (response.status) {
      case 400:
        errorMessage = errorDetail || 'Invalid request.'
        break
      case 403:
        errorMessage = errorDetail || 'The requested operation is not permitted.'
        break
      case 404:
        errorMessage = errorDetail || 'Resource not found.'
        break
      case 409:
        errorMessage = errorDetail || 'Request conflicts with the current resource state.'
        break
      case 422:
        errorMessage = errorDetail || 'Validation failed for request data.'
        break
      case 500:
        errorMessage = 'Internal server error occurred on the backend.'
        break
      default:
        errorMessage = errorDetail || `Request failed with status ${response.status}.`
        break
    }

    throw new ApiError(response.status, errorMessage, errorDetail)
  }

  return response.json() as Promise<T>
}

export const api = {
  getHealth(): Promise<HealthResponse> {
    return request<HealthResponse>('/health')
  },

  getVersion(): Promise<VersionResponse> {
    return request<VersionResponse>('/version')
  },

  listProjects(): Promise<Project[]> {
    return request<Project[]>('/api/projects')
  },

  getProject(projectId: string): Promise<Project> {
    return request<Project>(`/api/projects/${encodeURIComponent(projectId)}`)
  },

  registerProject(data: RegisterProjectRequest): Promise<Project> {
    return request<Project>('/api/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  archiveProject(projectId: string): Promise<Project> {
    return request<Project>(`/api/projects/${encodeURIComponent(projectId)}/archive`, {
      method: 'POST',
    })
  },

  listTasks(projectId: string): Promise<Task[]> {
    return request<Task[]>(`/api/projects/${encodeURIComponent(projectId)}/tasks`)
  },

  getTask(taskId: string): Promise<Task> {
    return request<Task>(`/api/tasks/${encodeURIComponent(taskId)}`)
  },

  createTask(projectId: string, data: CreateTaskRequest): Promise<Task> {
    return request<Task>(`/api/projects/${encodeURIComponent(projectId)}/tasks`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  listRuns(taskId: string): Promise<Run[]> {
    return request<Run[]>(`/api/tasks/${encodeURIComponent(taskId)}/runs`)
  },

  getRun(runId: string): Promise<Run> {
    return request<Run>(`/api/runs/${encodeURIComponent(runId)}`)
  },

  createRun(taskId: string, data: CreateRunRequest = {}): Promise<Run> {
    return request<Run>(`/api/tasks/${encodeURIComponent(taskId)}/runs`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },
}
