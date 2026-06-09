import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { ApiError, api } from '@/lib/api'

export interface MyProfile {
  user: string
  first_name: string | null
  last_name: string | null
  full_name: string | null
  email: string | null
  mobile_no: string | null
  phone: string | null
  user_image: string | null
  language: string | null
  time_zone: string | null
  last_login: string | null
  creation: string | null
  roles: string[]
  is_admin: boolean
}

export interface ProfileOptions {
  languages: { code: string; label: string }[]
  timezones: string[]
}

export function useMyProfile() {
  return useQuery({
    queryKey: ['profile', 'me'],
    queryFn: () =>
      api.callMethodGet<MyProfile>('gym_management.users.get_my_profile'),
  })
}

export function useProfileOptions() {
  return useQuery({
    queryKey: ['profile', 'options'],
    queryFn: () =>
      api.callMethodGet<ProfileOptions>('gym_management.users.profile_options'),
    staleTime: 60 * 60 * 1000, // these barely change
  })
}

export function useUpdateMyProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (fields: {
      first_name?: string
      last_name?: string
      mobile_no?: string
      phone?: string
      language?: string
      time_zone?: string
    }) =>
      api.callMethod<MyProfile>(
        'gym_management.users.update_my_profile',
        fields,
      ),
    onSuccess: (data) => qc.setQueryData(['profile', 'me'], data),
  })
}

export function useChangeMyPassword() {
  return useMutation({
    mutationFn: (vars: { old_password: string; new_password: string }) =>
      api.callMethod<{ ok: boolean }>(
        'gym_management.users.change_my_password',
        vars,
      ),
  })
}

function getCsrf(): string {
  const w = window as unknown as { csrf_token?: string }
  return w.csrf_token ?? ''
}

/** Multipart upload — bypasses the JSON api helper. */
async function uploadAvatar(file: File): Promise<MyProfile> {
  const fd = new FormData()
  fd.append('file', file, file.name)
  const res = await fetch(
    '/api/method/gym_management.users.set_my_avatar',
    {
      method: 'POST',
      credentials: 'include',
      headers: { 'X-Frappe-CSRF-Token': getCsrf() },
      body: fd,
    },
  )
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const message =
      (body as { message?: string; exception?: string } | null)?.message ??
      (body as { exception?: string } | null)?.exception ??
      `${res.status} ${res.statusText}`
    throw new ApiError(res.status, body, message)
  }
  return (body as { message: MyProfile }).message
}

export function useUploadAvatar() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: uploadAvatar,
    onSuccess: (data) => qc.setQueryData(['profile', 'me'], data),
  })
}

export function useRemoveAvatar() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () =>
      api.callMethod<MyProfile>('gym_management.users.remove_my_avatar'),
    onSuccess: (data) => qc.setQueryData(['profile', 'me'], data),
  })
}
