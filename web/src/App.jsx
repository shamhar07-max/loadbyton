import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth, roleHome } from './lib/auth.jsx';
import { Shell } from './components/Shell.jsx';
import { Spinner } from './components/ui.jsx';

import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Dashboard from './pages/Dashboard.jsx';
import OpenLoads from './pages/OpenLoads.jsx';
import JobDetail from './pages/JobDetail.jsx';
import MyBids from './pages/MyBids.jsx';
import WonJobs from './pages/WonJobs.jsx';
import Templates from './pages/Templates.jsx';
import Contracts from './pages/Contracts.jsx';
import Earnings from './pages/Earnings.jsx';
import Notifications from './pages/Notifications.jsx';
import Admin from './pages/Admin.jsx';
import Profile from './pages/Profile.jsx';
import Features from './pages/Features.jsx';
import Pricing from './pages/Pricing.jsx';
import About from './pages/About.jsx';
import Blog from './pages/Blog.jsx';
import Security from './pages/Security.jsx';
import Compliance from './pages/Compliance.jsx';
import NotFound from './pages/NotFound.jsx';

function FullScreenSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas">
      <Spinner size={28} className="text-brand-primary" />
    </div>
  );
}

function RequireAuth({ roles, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullScreenSpinner />;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to={roleHome(user.role)} replace />;
  return children;
}

function GuestOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenSpinner />;
  if (user) return <Navigate to={roleHome(user.role)} replace />;
  return children;
}

export default function App() {
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/features" element={<Features />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/about" element={<About />} />
        <Route path="/blog" element={<Blog />} />
        <Route path="/security" element={<Security />} />
        <Route path="/compliance" element={<Compliance />} />

        <Route path="/login" element={<GuestOnly><Login /></GuestOnly>} />
        <Route path="/register" element={<GuestOnly><Register /></GuestOnly>} />

        <Route path="/dashboard" element={<RequireAuth roles={['SHIPPER']}><Dashboard /></RequireAuth>} />
        <Route path="/templates" element={<RequireAuth roles={['SHIPPER']}><Templates /></RequireAuth>} />
        <Route path="/contracts" element={<RequireAuth roles={['SHIPPER']}><Contracts /></RequireAuth>} />

        <Route path="/open-loads" element={<RequireAuth roles={['CARRIER']}><OpenLoads /></RequireAuth>} />
        <Route path="/my-bids" element={<RequireAuth roles={['CARRIER']}><MyBids /></RequireAuth>} />
        <Route path="/won-jobs" element={<RequireAuth roles={['CARRIER']}><WonJobs /></RequireAuth>} />
        <Route path="/earnings" element={<RequireAuth roles={['CARRIER']}><Earnings /></RequireAuth>} />

        <Route path="/admin" element={<RequireAuth roles={['ADMIN']}><Admin /></RequireAuth>} />

        <Route path="/jobs/:id" element={<RequireAuth><JobDetail /></RequireAuth>} />
        <Route path="/notifications" element={<RequireAuth><Notifications /></RequireAuth>} />
        <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Shell>
  );
}
