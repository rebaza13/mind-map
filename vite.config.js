import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// NEXT_PUBLIC_ is allowed as an env prefix so the Supabase variable names stay the same as in the Supabase dashboard.
export default defineConfig({
  plugins: [react()],
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
})
