import { Route, Routes } from 'react-router-dom'
import LandingPage from './pages/LandingPage'
import VoicePage from './pages/VoicePage'
import MusicPage from './pages/MusicPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/voice" element={<VoicePage />} />
      <Route path="/music" element={<MusicPage />} />
    </Routes>
  )
}
