'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function Home() {
  const router = useRouter()
  useEffect(() => {
    const token = localStorage.getItem('ta_token')
    router.replace(token ? '/workspace' : '/login')
  }, [])
  return null
}
