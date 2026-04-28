import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import Logo from "./Logo";
import ProfileDropdown from "./ProfileDropdown";

const NAV_TABS = [
  { id: "collab", label: "Collab", path: "/dashboard", gradient: "from-teal-400 to-cyan-400" },
  { id: "contest", label: "Contest", path: "/dashboard/contest", gradient: "from-amber-400 to-orange-400" },
  { id: "interview", label: "Interview Prep", path: "/dashboard/interview", gradient: "from-sky-400 to-blue-400" },
];

export default function Navbar({ activeTab = "collab", bgClass = "bg-[#0F0F0F]/80" }) {
  const navigate = useNavigate();

  const joinLabel = "Join Room";

  return (
    <header className={`sticky top-0 z-50 border-b border-white/[0.07] ${bgClass} backdrop-blur-xl`}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">

          {/* Logo */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-3 cursor-pointer"
            onClick={() => navigate("/dashboard")}
          >
            <Logo size={32} />
          </motion.div>

          {/* Tabs */}
          <nav className="hidden md:flex items-center gap-1 bg-white/[0.04] p-1 rounded-2xl border border-white/[0.07]">
            {NAV_TABS.map((t) => (
              <motion.button
                key={t.id}
                onClick={() => navigate(t.path)}
                className={`relative px-6 py-2 rounded-xl text-sm font-medium transition-all duration-300 ${t.id === activeTab ? "text-white" : "text-gray-400 hover:text-white"
                  }`}
                whileHover={{ y: -1 }}
                whileTap={{ y: 0 }}
              >
                {t.id === activeTab && (
                  <motion.div
                    layoutId="navActiveTab"
                    className={`absolute inset-0 rounded-xl bg-gradient-to-r ${t.gradient} opacity-20`}
                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                  />
                )}
                <span className="relative">{t.label}</span>
              </motion.button>
            ))}
          </nav>

          {/* Right: Join + Profile */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-4"
          >
            <button
              onClick={() => navigate("/dashboard/join")}
              className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-700 text-white font-medium text-sm hover:bg-teal-600 transition-colors"
            >
              {joinLabel}
            </button>
            <ProfileDropdown />
          </motion.div>

        </div>
      </div>
    </header>
  );
}
