"use client"

import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"

export default function LogoutButton(){

  const router = useRouter()

  async function logout(){
    await supabase.auth.signOut()
    router.refresh()
  }

  return (
    <button
      onClick={logout}
      className="bg-gray-200 px-3 py-1 rounded"
    >
      Logout
    </button>
  )
}