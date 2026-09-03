import { BrowserRouter, Routes, Route } from "react-router-dom"
import { Toaster } from "sonner"
import AdminLayout from "./layouts/AdminLayout"
import Dashboard from "./pages/Dashboard"
import AccountsPage from "./pages/AccountsPage"
import TestPage from "./pages/TestPage"
import TokensPage from "./pages/TokensPage"
import SettingsPage from "./pages/SettingsPage"
import ImagePage from "./pages/ImagePage"
import VideoPage from "./pages/VideoPage"
import LogsPage from "./pages/LogsPage"

function App() {
  return (
    <>
      <Toaster position="top-center" richColors />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<AdminLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="accounts" element={<AccountsPage />} />
            <Route path="tokens" element={<TokensPage />} />
            <Route path="logs" element={<LogsPage />} />
            <Route path="test" element={<TestPage />} />
            <Route path="images" element={<ImagePage />} />
            <Route path="videos" element={<VideoPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </>
  )
}

export default App
