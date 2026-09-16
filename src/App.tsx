import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Analytics } from "@vercel/analytics/react";
import Atmosphere from "./components/Atmosphere";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import WritingExercise from "./pages/WritingExercise";
import SpeakingExercise from "./pages/SpeakingExercise";
import Rubric from "./pages/Rubric";
import { AuthProvider, useAuth } from "./contexts/AuthContext";

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-deep">
        <div className="w-12 h-12 border border-border-main border-t-brand-blue rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    );
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/exercise/writing" element={<WritingExercise />} />
        <Route path="/exercise/speaking" element={<SpeakingExercise />} />
        <Route path="/rubric" element={<Rubric />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Atmosphere />
        <AppRoutes />
        <Analytics />
      </AuthProvider>
    </BrowserRouter>
  );
}
