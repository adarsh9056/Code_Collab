import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../services/api";
import MainLayout from "../components/MainLayout";

const MODES = [
  { id: "peer", label: "Practice with peers" },
  { id: "friend", label: "Practice with friend" },
];

const LEVELS = [
  { id: "beginner", label: "Beginner" },
  { id: "intermediate", label: "Intermediate" },
  { id: "advanced", label: "Advanced" },
];

const SLOTS = ["09:00", "12:30", "15:00", "18:30", "21:00"];

function buildICS(calendar) {
  if (!calendar?.start || !calendar?.end) return "";
  const toICS = (iso) => iso.replace(/[-:]/g, "").split(".")[0] + "Z";
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    `SUMMARY:${calendar.title}`,
    `DESCRIPTION:${calendar.description || ""}`,
    `DTSTART:${toICS(new Date(calendar.start).toISOString())}`,
    `DTEND:${toICS(new Date(calendar.end).toISOString())}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\n");
}

export default function InterviewSchedulePage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState("peer");
  const [level, setLevel] = useState("beginner");
  const [slot, setSlot] = useState("12:30");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [friendUserId, setFriendUserId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState(null);

  const scheduledFor = useMemo(() => new Date(`${date}T${slot}:00`).toISOString(), [date, slot]);

  const handleSchedule = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await api.post("/interviews/schedule", {
        mode,
        level,
        timeSlot: slot,
        scheduledFor,
        friendUserId: mode === "friend" && friendUserId ? friendUserId : null,
      });
      setConfirmation(res.data);
    } catch (err) {
      setError(err?.message || "Failed to schedule interview");
    } finally {
      setLoading(false);
    }
  };

  return (
    <MainLayout activeTab="interview">
      <div className="mx-auto max-w-6xl w-full p-6 overflow-y-auto">
        <h1 className="text-3xl font-black text-white mb-2">Interview Schedule</h1>
        <p className="text-sm text-gray-400 mb-6">Select mode, level, and time slot for your session.</p>

        {error && <div className="mb-4 rounded-xl bg-red-500/10 border border-red-400/20 p-3 text-sm text-red-300">{error}</div>}

        <div className="grid md:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 space-y-5">
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Mode</label>
              <div className="flex gap-2">
                {MODES.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setMode(m.id)}
                    className={`px-4 py-2 rounded-lg text-xs font-bold uppercase ${mode === m.id ? "bg-indigo-500 text-white" : "bg-white/5 text-gray-300"}`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Level</label>
              <div className="flex gap-2">
                {LEVELS.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => setLevel(l.id)}
                    className={`px-4 py-2 rounded-lg text-xs font-bold uppercase ${level === l.id ? "bg-teal-500 text-black" : "bg-white/5 text-gray-300"}`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Date</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full bg-black/30 border border-white/10 rounded-lg p-2 text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Time Slot</label>
                <select
                  value={slot}
                  onChange={(e) => setSlot(e.target.value)}
                  className="w-full bg-black/30 border border-white/10 rounded-lg p-2 text-sm text-white"
                >
                  {SLOTS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            {mode === "friend" && (
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Friend User ID (optional)</label>
                <input
                  value={friendUserId}
                  onChange={(e) => setFriendUserId(e.target.value)}
                  className="w-full bg-black/30 border border-white/10 rounded-lg p-2 text-sm text-white"
                  placeholder="Paste friend user ID"
                />
              </div>
            )}

            <button
              onClick={handleSchedule}
              disabled={loading}
              className="w-full py-3 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white font-black text-xs uppercase tracking-widest disabled:opacity-40"
            >
              {loading ? "Scheduling..." : "Schedule Interview"}
            </button>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
            <h3 className="text-sm font-black text-indigo-300 uppercase tracking-widest mb-3">Upcoming Interviews</h3>
            <p className="text-sm text-gray-400 mb-4">Manage scheduled sessions, cancel, or start when ready.</p>
            <button
              onClick={() => navigate("/dashboard/interview/upcoming")}
              className="w-full py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold text-sm"
            >
              Open Upcoming Interviews
            </button>
          </div>
        </div>
      </div>

      {confirmation && (
        <div className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#101015] p-6">
            <h2 className="text-xl font-black text-white mb-2">Schedule Confirmed</h2>
            <p className="text-sm text-gray-400 mb-4">
              Date & Time: {new Date(confirmation.scheduledFor || scheduledFor).toLocaleString()}
            </p>
            <p className="text-sm text-gray-300 mb-2">
              Assigned Question: <span className="font-semibold">{confirmation.problemIds?.[0]?.title || "Will be assigned at start"}</span>
            </p>
            <p className="text-xs text-gray-500 mb-4">Room Code: {confirmation.roomCode}</p>
            <div className="flex gap-2">
              <a
                href={`data:text/calendar;charset=utf8,${encodeURIComponent(buildICS(confirmation.calendar))}`}
                download="codecollab-interview.ics"
                className="flex-1 text-center py-2 rounded-lg bg-teal-500 text-black font-bold text-sm"
              >
                Add to Calendar
              </a>
              <button
                onClick={() => navigate(`/dashboard/interview/${confirmation.roomCode}`)}
                className="flex-1 py-2 rounded-lg bg-indigo-500 text-white font-bold text-sm"
              >
                Open Room
              </button>
            </div>
            <button onClick={() => setConfirmation(null)} className="mt-3 w-full py-2 rounded-lg bg-white/5 text-gray-300 text-sm">Close</button>
          </div>
        </div>
      )}
    </MainLayout>
  );
}