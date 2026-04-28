import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../hooks/useSocket';
import { useWebRTC } from '../hooks/useWebRTC';
import CodeEditor from '../components/CodeEditor';
import { api } from '../services/api';
import { getInitialCodeState, getBoilerplate } from '../utils/boilerplate';
import MainLayout from '../components/MainLayout';

const LANGS = [
  { id: 'javascript', label: 'JavaScript' },
  { id: 'python', label: 'Python' },
  { id: 'cpp', label: 'C++' },
  { id: 'java', label: 'Java' }
];

export default function InterviewRoom() {
  const { roomCode } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { socket, connected } = useSocket();

  const [room, setRoom] = useState(null);
  const [interview, setInterview] = useState(null);
  const [problem, setProblem] = useState(null);
  const [error, setError] = useState(null);

  const [language, setLanguage] = useState('javascript');
  const [codeState, setCodeState] = useState({ javascript: '', python: '', cpp: '', java: '' });

  const [runResult, setRunResult] = useState(null);
  const [aiFeedback, setAiFeedback] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bottomTab, setBottomTab] = useState('tests'); // 'tests' | 'output' | 'notes'
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [remainingMs, setRemainingMs] = useState(0);
  const [feedback, setFeedback] = useState({ rating: 4, feedback: '' });

  // Interviewer specific
  const [notes, setNotes] = useState('');
  const [evaluation, setEvaluation] = useState({ problemSolving: 3, communication: 3, codeQuality: 3, overall: 3, comment: '' });

  const partnerRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const webrtc = useWebRTC(socket, roomCode, partnerRef.current?._id?.toString?.() || partnerRef.current);

  const [roomReady, setRoomReady] = useState(false);
  const isInterviewer = interview?.interviewerId?._id?.toString() === user?._id?.toString() || interview?.interviewerId?.toString() === user?._id?.toString();
  const isCompleted = interview?.status === 'completed' || !!interview?.endedAt;

  const syncProblemForRound = useCallback((interviewData) => {
    const idx = Math.max(0, (interviewData?.currentRound || 1) - 1);
    const selected = interviewData?.problemIds?.[idx] || interviewData?.problemIds?.[0];
    if (!selected) return;
    const pid = selected?._id || selected;
    api.get(`/problems/${pid}`).then((p) => {
      setProblem(p.data);
      setCodeState(prev => getInitialCodeState(p.data, prev));
    }).catch(() => { });
  }, []);

  useEffect(() => {
    if (!roomCode) return;
    api.get(`/rooms/${roomCode}`)
      .then(r => {
        const roomData = r?.data;
        if (!roomData) throw new Error('Room not found');
        setRoom(roomData);
        return roomData._id;
      })
      .then(async roomId => {
        if (!roomId) return;
        let data;
        try { data = (await api.get(`/interviews/room/${roomId}`))?.data; } catch (_) { }

        // If no interview exists, create it (should be done by flow, but fallback)
        if (!data) {
          const hostId = room?.hostId?._id || room?.hostId;
          const candidateId = user?._id && hostId?.toString() !== user._id ? user._id : null;
          // Note: Proper flow sets problemIds during creation, here we just try to fetch
          data = (await api.post('/interviews', { roomId, interviewerId: hostId, candidateId, problemIds: [] }))?.data;
        }

        if (!data) throw new Error('Could not load interview');
        setInterview(data);
        setNotes(data.notes || '');
        setEvaluation(data.evaluation || { problemSolving: 3, communication: 3, codeQuality: 3, overall: 3, comment: '' });
        syncProblemForRound(data);
        if (!data.problemIds?.length) {
          setCodeState(prev => getInitialCodeState(null, prev));
        }
      })
      .catch(err => setError(err?.response?.data?.message || err?.message || 'Failed to load'));
  }, [roomCode, navigate, user?._id, syncProblemForRound]);

  useEffect(() => {
    if (!interview) return;
    const start = new Date(interview.startedAt || interview.scheduledFor || Date.now()).getTime();
    const end = interview.endedAt
      ? new Date(interview.endedAt).getTime()
      : start + (interview.meetingDurationMin || 45) * 60 * 1000;
    const tick = () => setRemainingMs(Math.max(0, end - Date.now()));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [interview]);

  useEffect(() => {
    if (!socket || !roomCode) return;

    socket.emit('join_room', { roomCode, mode: 'interview', role: isInterviewer ? 'interviewer' : 'candidate' }, (res) => {
      if (res?.success) {
        setRoomReady(true);
        const other = res.participants?.find(p => (p.user?._id || p.userId?._id || p.userId)?.toString() !== user?._id?.toString());
        if (other) partnerRef.current = other.user?._id || other.userId?._id || other.userId || other.user;
      }
    });

    const onCodeUpdate = (data) => {
      if (data.senderSocketId === socket.id) return;
      if (data.code !== undefined && data.language) {
        setCodeState(prev => {
          if (prev[data.language] === data.code) return prev;
          return { ...prev, [data.language]: data.code };
        });
      }
    };

    const onRoomJoined = (data) => {
      const other = data.participants?.find(p => (p.user?._id || p.userId?._id || p.userId)?.toString() !== user?._id?.toString());
      if (other) partnerRef.current = other.user?._id || other.userId?._id || other.userId || other.user;
    };

    const onNewMessage = (msg) => setMessages(prev => [...prev, msg]);
    const onProblemChange = (data) => {
      if (data?.problemId) {
        api.get(`/problems/${data.problemId}`).then((p) => setProblem(p.data)).catch(() => { });
      }
    };
    const onInterviewCompleted = () => {
      setInterview((prev) => prev ? { ...prev, status: 'completed', endedAt: new Date().toISOString() } : prev);
    };

    socket.on('room_joined', onRoomJoined);
    socket.on('codeUpdate', onCodeUpdate);
    socket.on('newMessage', onNewMessage);
    socket.on('problem_change', onProblemChange);
    socket.on('interview_completed', onInterviewCompleted);

    return () => {
      socket.emit('leave_room', { roomCode });
      socket.off('room_joined', onRoomJoined);
      socket.off('codeUpdate', onCodeUpdate);
      socket.off('newMessage', onNewMessage);
      socket.off('problem_change', onProblemChange);
      socket.off('interview_completed', onInterviewCompleted);
    };
  }, [socket, roomCode]); // Stable dependencies

  // WebRTC Signaling
  useEffect(() => {
    if (!socket || !roomCode) return;
    const onOffer = data => webrtc.handleRemoteOffer(data?.offer);
    const onAnswer = data => webrtc.handleRemoteAnswer(data?.answer);
    const onIce = data => webrtc.handleRemoteIce(data?.candidate);

    socket.on('webrtc_offer', onOffer);
    socket.on('webrtc_answer', onAnswer);
    socket.on('webrtc_ice', onIce);

    return () => {
      socket.off('webrtc_offer', onOffer);
      socket.off('webrtc_answer', onAnswer);
      socket.off('webrtc_ice', onIce);
    };
  }, [socket, roomCode, webrtc.handleRemoteOffer, webrtc.handleRemoteAnswer, webrtc.handleRemoteIce]);

  const handleCodeChange = useCallback((newCode) => {
    setCodeState(prev => {
      if (prev[language] === newCode) return prev;
      const next = { ...prev, [language]: newCode };
      if (socket && roomCode && roomReady) {
        socket.emit('codeChange', { roomCode, language, code: newCode });
      }
      return next;
    });
  }, [socket, roomCode, language, roomReady]);

  const handleLangChange = (langId) => {
    setLanguage(langId);
    if (socket && roomCode && roomReady) {
      socket.emit('language_change', { roomCode, language: langId });
    }
  };

  const handleRun = async () => {
    if (!problem?._id) return;
    setIsSubmitting(true);
    setRunResult(null);
    setBottomTab('output');
    try {
      const res = await api.post('/run', { code: codeState[language], language, problemId: problem._id });
      setRunResult(res.data);
    } catch (err) {
      setRunResult({ error: err?.response?.data?.message || err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSwitchRole = async () => {
    try {
      const res = await api.post(`/interviews/${interview._id}/switch-role`, {});
      setInterview(res.data);
      syncProblemForRound(res.data);
      setRunResult(null);
    } catch (err) {
      setError(err?.message || 'Failed to switch role');
    }
  };

  const handleComplete = async () => {
    try {
      const res = await api.post(`/interviews/${interview._id}/complete`, {});
      setInterview(res.data);
    } catch (err) {
      setError(err?.message || 'Failed to complete interview');
    }
  };

  const handleFeedbackSubmit = async () => {
    try {
      await api.post(`/interviews/${interview._id}/feedback`, feedback);
      setError('');
    } catch (err) {
      setError(err?.message || 'Failed to save feedback');
    }
  };

  const handleAiFeedback = async () => {
    try {
      setAiLoading(true);
      const res = await api.post(`/interviews/${interview._id}/ai-feedback`, { problemId: problem?._id });
      setAiFeedback(res.data?.analysis || null);
      setBottomTab('output');
    } catch (err) {
      setError(err?.message || 'Failed to fetch AI feedback');
    } finally {
      setAiLoading(false);
    }
  };

  const sendMessage = (e) => {
    e.preventDefault();
    if (!chatInput.trim() || !socket) return;
    socket.emit('sendMessage', { roomCode, message: chatInput.trim() });
    setChatInput('');
  };

  useEffect(() => {
    if (remoteAudioRef.current && webrtc.remoteStream) {
      remoteAudioRef.current.srcObject = webrtc.remoteStream;
    }
  }, [webrtc.remoteStream]);

  if (error) {
    return (
      <MainLayout activeTab="interview">
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-6 rounded-2xl max-w-lg text-center">
            <h2 className="text-xl font-bold mb-2">Interview Error</h2>
            <p className="mb-6 opacity-80">{error}</p>
            <button onClick={() => navigate('/dashboard/interview')} className="px-6 py-2 bg-red-500/20 hover:bg-red-500/30 rounded-lg text-white font-medium transition-colors">Go Back</button>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (!room || !interview) {
    return (
      <MainLayout activeTab="interview">
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-500 border-t-transparent" />
        </div>
      </MainLayout>
    );
  }

  const ACCENT = '#6366f1'; // Indigo-500
  const isCandidate = !isInterviewer;

  return (
    <MainLayout activeTab="interview">
      <div className="flex flex-col h-full overflow-hidden p-4 gap-4 w-full max-w-[1600px] mx-auto">

        {/* TOP BAR */}
        <div className="flex items-center justify-between bg-white/[0.02] border border-white/[0.05] rounded-2xl p-3 backdrop-blur-sm shadow-xl">
          <div className="flex items-center gap-4 px-2">
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${connected ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-red-500'}`} />
              <span className="font-bold text-gray-200 uppercase tracking-widest text-xs hidden sm:inline">Room {roomCode}</span>
            </div>
            <div className="h-4 w-px bg-white/10" />
            <span className={`font-semibold text-sm px-3 py-1 rounded-full border ${isInterviewer ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}`}>
              {isInterviewer ? '🧑‍💼 Interviewer' : '👨‍💻 Candidate'}
            </span>
            <div className="h-4 w-px bg-white/10" />
            <span className="text-xs font-bold text-amber-400 uppercase tracking-widest">
              {String(Math.floor(remainingMs / 60000)).padStart(2, '0')}:{String(Math.floor((remainingMs % 60000) / 1000)).padStart(2, '0')}
            </span>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-white/5 rounded-xl p-1 border border-white/5">
              <button
                onClick={webrtc.isConnected ? webrtc.stopAudio : webrtc.startAudio}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${webrtc.isConnected ? 'bg-rose-500/20 text-rose-300 hover:bg-rose-500/30' : 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'}`}
              >
                {webrtc.isConnected ? '📞 Disconnect Audio' : '📞 Join Audio'}
              </button>
              {webrtc.isConnected && (
                <button onClick={webrtc.toggleMute} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${webrtc.isMuted ? 'bg-rose-500/20 text-rose-300' : 'bg-white/10 text-gray-300 hover:bg-white/20'}`}>
                  {webrtc.isMuted ? '🔇 Unmuted' : '🎤 Mute'}
                </button>
              )}
            </div>

            <div className="h-6 w-px bg-white/10" />

            <div className="flex items-center gap-1 bg-white/5 rounded-xl p-1 border border-white/5">
              {LANGS.map(l => (
                <button
                  key={l.id}
                  onClick={() => handleLangChange(l.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-colors ${language === l.id ? 'bg-indigo-500 text-white shadow-md' : 'text-gray-400 hover:text-gray-200'}`}
                >
                  {l.label}
                </button>
              ))}
            </div>

            {isCompleted && (
              <button
                onClick={handleAiFeedback}
                disabled={aiLoading}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30"
              >
                {aiLoading ? 'Loading AI...' : 'AI Feedback'}
              </button>
            )}
          </div>
        </div>

        {webrtc.remoteStream && <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />}

        {/* MAIN THREE COLUMN GRID */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-[380px_minmax(0,1fr)_340px] gap-4 min-h-0">

          {/* LEFT: PROBLEM DESCRIPTION */}
          <div className="flex flex-col bg-white/[0.02] border border-white/[0.05] rounded-2xl overflow-hidden backdrop-blur-sm h-full">
            <div className="px-5 py-4 border-b border-white/[0.05] bg-black/20 flex items-center shadow-sm">
              <h2 className="font-bold text-lg text-gray-100 truncate">{problem ? problem.title : 'Waiting for problem...'}</h2>
            </div>
            <div className="p-6 overflow-y-auto min-h-0 text-sm prose prose-invert max-w-none custom-scrollbar">
              {problem ? (
                <>
                  <div className="text-gray-300 whitespace-pre-wrap leading-relaxed">{problem.description}</div>

                  {problem.examples?.length > 0 && (
                    <div className="mt-8 space-y-4">
                      {problem.examples.map((ex, i) => (
                        <div key={i} className="bg-black/30 rounded-xl p-4 border border-white/[0.05]">
                          <div className="font-semibold text-gray-400 mb-2 text-xs uppercase tracking-wider">Example {i + 1}</div>
                          <div className="space-y-2 font-mono text-xs">
                            <div className="flex gap-2"><span className="text-gray-500">Input:</span><span className="text-amber-200 break-all">{ex.input}</span></div>
                            <div className="flex gap-2"><span className="text-gray-500">Output:</span><span className="text-emerald-200 break-all">{ex.output}</span></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {problem.constraints && (
                    <div className="mt-8">
                      <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">Constraints</h3>
                      <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-4 font-mono text-xs text-rose-200">
                        {problem.constraints}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center text-gray-500 py-10">
                  <span className="text-4xl mb-4 block">📝</span>
                  <p>Problem statement will appear here once selected by the interviewer.</p>
                </div>
              )}
            </div>
          </div>

          {/* CENTER: EDITOR & TEST CASES */}
          <div className="flex flex-col gap-4 min-h-0 h-full">
            {/* Editor */}
            <div className="flex-1 bg-white/[0.02] border border-white/[0.05] rounded-2xl overflow-hidden backdrop-blur-sm flex flex-col min-h-0 shadow-inner relative group">
              <CodeEditor value={codeState[language]} onChange={handleCodeChange} language={language} readOnly={isInterviewer} height="100%" />
            </div>

            {/* Test Cases Panel */}
            <div className="h-64 flex flex-col bg-white/[0.02] border border-white/[0.05] rounded-2xl overflow-hidden backdrop-blur-sm shrink-0">
              <div className="flex items-center justify-between bg-black/20 border-b border-white/[0.05] px-2 shadow-sm">
                <div className="flex">
                  <button onClick={() => setBottomTab('tests')} className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${bottomTab === 'tests' ? 'border-indigo-500 text-indigo-400 bg-white/[0.02]' : 'border-transparent text-gray-400 hover:text-gray-200'}`}>Test Cases</button>
                  <button onClick={() => setBottomTab('output')} className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${bottomTab === 'output' ? 'border-indigo-500 text-indigo-400 bg-white/[0.02]' : 'border-transparent text-gray-400 hover:text-gray-200'}`}>Execution Result</button>
                </div>
                <div className="flex items-center gap-2 px-2">
                    <button onClick={handleRun} disabled={isSubmitting || !problem || isInterviewer} className="px-5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold tracking-wider uppercase shadow-[0_0_15px_rgba(99,102,241,0.3)] transition-colors disabled:opacity-50">Run Code</button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-[#0d0d0d]">
                {bottomTab === 'tests' && (
                  <div className="space-y-4">
                    <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Visible Test Cases</p>
                    <div className="flex gap-4 overflow-x-auto pb-2">
                      {problem?.testCases?.filter(tc => !tc.hidden).map((tc, idx) => (
                        <div key={idx} className="flex-shrink-0 w-64 bg-white/[0.02] border border-white/[0.05] rounded-xl p-3 font-mono text-xs">
                          <div className="text-gray-500 mb-1 leading-none">Input</div>
                          <div className="truncate text-amber-200 mb-2">{tc.input}</div>
                          <div className="text-gray-500 mb-1 leading-none">Expected</div>
                          <div className="truncate text-emerald-200">{tc.expectedOutput}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {bottomTab === 'output' && (
                  <div>
                    {!runResult ? (
                      <div className="text-center text-gray-500 text-sm py-10">Run to see execution results</div>
                    ) : runResult.error ? (
                      <div className="text-red-400 font-mono text-sm whitespace-pre-wrap">{runResult.error}</div>
                    ) : (
                      <div className="space-y-4">
                        <div className="flex items-center gap-4">
                          <span className={`text-xl font-bold uppercase tracking-widest ${runResult.status === 'ac' ? 'text-emerald-500' : 'text-red-500'}`}>
                            {runResult.status === 'ac' ? 'ACCEPTED' : runResult.status === 're' ? 'RUNTIME ERROR' : runResult.status === 'tle' ? 'TIME LIMIT' : 'WRONG ANSWER'}
                          </span>
                          <span className="text-gray-400 font-mono text-sm">Passed {runResult.passed}/{runResult.total}</span>
                        </div>

                        {runResult.tests?.length > 0 && (
                          <div className="space-y-2">
                            {runResult.tests.map((t, idx) => (
                              <div key={idx} className={`border rounded-lg p-3 font-mono text-xs ${t.passed ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-red-500/20 bg-red-500/5'}`}>
                                <div className="flex justify-between mb-1">
                                  <span className={t.passed ? 'text-emerald-400' : 'text-red-400'}>Test {idx + 1} {t.isHidden && '(Hidden)'}</span>
                                  <span className="text-gray-500">{t.executionTime || 0}ms</span>
                                </div>
                                <div className="grid grid-cols-2 gap-4 mt-2">
                                  <div>
                                    <span className="text-gray-500 block mb-1">Output</span>
                                    <span className={t.passed ? 'text-emerald-200' : 'text-red-300'}>{t.actualOutput || '-'}</span>
                                  </div>
                                  <div>
                                    <span className="text-gray-500 block mb-1">Expected</span>
                                    <span className="text-gray-300">{t.expectedOutput || '-'}</span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {aiFeedback && (
                          <div className="mt-4 border border-indigo-500/20 bg-indigo-500/5 rounded-xl p-3 text-xs">
                            <div className="text-indigo-300 font-bold mb-2">AI Analysis</div>
                            <div className="grid grid-cols-2 gap-2 text-gray-300">
                              <div>Code quality: <span className="text-white">{aiFeedback.codeQuality}</span></div>
                              <div>TC: <span className="text-white">{aiFeedback.timeComplexity}</span></div>
                              <div>SC: <span className="text-white">{aiFeedback.spaceComplexity}</span></div>
                              <div>Approach: <span className="text-white">{aiFeedback.betterApproach}</span></div>
                            </div>
                            <div className="mt-2 text-gray-300">Mistakes: <span className="text-white">{aiFeedback.mistakes}</span></div>
                            <div className="mt-1 text-gray-300">Edge cases: <span className="text-white">{aiFeedback.edgeCasesMissed}</span></div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT: INTERVIEWER PANEL OR CANDIDATE CHAT */}
          <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl overflow-hidden backdrop-blur-sm h-full flex flex-col">
            <div className="px-5 py-4 border-b border-white/[0.05] bg-black/20 shadow-sm">
              <h2 className="font-bold text-lg text-indigo-400 tracking-wide uppercase">
                {isInterviewer ? 'Interview Controls' : 'Interview Status'}
              </h2>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar">
              {isInterviewer ? (
                <>
                  <div className="space-y-2">
                    <label className="text-xs text-gray-400 font-bold uppercase tracking-wider">Private Notes</label>
                    <textarea
                      value={notes} onChange={e => setNotes(e.target.value)}
                      onBlur={() => api.patch(`/interviews/${interview._id}`, { notes })}
                      className="w-full h-32 bg-black/40 border border-white/10 rounded-xl p-3 text-sm text-gray-200 focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all placeholder:text-gray-600 custom-scrollbar"
                      placeholder="Takes notes about candidate's performance... (auto-saved)"
                    />
                  </div>

                  <div className="space-y-3 pt-4 border-t border-white/10">
                    <label className="text-xs text-gray-400 font-bold uppercase tracking-wider">Evaluation</label>
                    {[
                      { k: 'problemSolving', l: 'Prob Solving' },
                      { k: 'communication', l: 'Communication' },
                      { k: 'codeQuality', l: 'Code Quality' },
                      { k: 'overall', l: 'Overall Hire' }
                    ].map(f => (
                      <div key={f.k} className="flex items-center justify-between">
                        <span className="text-sm text-gray-300">{f.l}</span>
                        <div className="flex gap-1">
                          {[1, 2, 3, 4, 5].map(v => (
                            <button key={v} onClick={() => setEvaluation(ev => ({ ...ev, [f.k]: v }))}
                              className={`w-6 h-6 rounded-md text-xs font-bold transition-colors ${evaluation[f.k] >= v ? 'bg-indigo-500 text-white' : 'bg-gray-800 text-gray-500 hover:bg-gray-700'}`}>
                              {v}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                    <textarea
                      value={evaluation.comment} onChange={e => setEvaluation(ev => ({ ...ev, comment: e.target.value }))}
                      className="w-full mt-2 h-20 bg-black/40 border border-white/10 rounded-xl p-3 text-sm text-gray-200 focus:border-indigo-500/50 transition-all custom-scrollbar"
                      placeholder="Final comments..."
                    />
                    <div className="flex gap-2 mt-4">
                      <button onClick={() => api.patch(`/interviews/${interview._id}`, { evaluation })} className="flex-1 py-2 rounded-xl text-sm font-bold bg-white/5 hover:bg-white/10 text-white transition-colors border border-white/10">
                        Save Eval
                      </button>
                      <button onClick={handleSwitchRole} className="flex-1 py-2 rounded-xl text-sm font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors">
                        Switch Role
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={handleComplete} className="flex-1 py-2 rounded-xl text-sm font-bold bg-rose-600 hover:bg-rose-500 text-white transition-colors">
                        End Interview
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="space-y-4">
                  <div className="bg-indigo-500/10 border border-indigo-500/20 p-4 rounded-xl text-center">
                    <p className="text-indigo-300 text-sm font-medium">Focus on communicating your thought process.</p>
                  </div>
                  <div className="bg-white/5 border border-white/10 p-4 rounded-xl text-center mt-auto">
                    <span className="text-4xl block mb-2">💡</span>
                    <p className="text-gray-400 text-sm mb-4">You are currently in an active interview. The interviewer can see your code updates in real time.</p>
                    <button onClick={handleSwitchRole} className="w-full py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-500 transition">
                      Request Role Switch
                    </button>
                  </div>
                </div>
              )}

              <div className="pt-4 border-t border-white/10">
                <div className="text-xs text-gray-500 uppercase font-bold tracking-widest mb-2">Chat</div>
                <div className="max-h-36 overflow-y-auto space-y-2 pr-1">
                  {messages.map((msg, i) => (
                    <div key={i} className="text-xs">
                      <span className="text-gray-500 mr-2">{msg.user?.username || 'User'}:</span>
                      <span className="text-gray-200">{msg.message}</span>
                    </div>
                  ))}
                </div>
                <form onSubmit={sendMessage} className="mt-2 flex gap-2">
                  <input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    className="flex-1 bg-black/30 border border-white/10 rounded-lg p-2 text-xs text-white"
                    placeholder="Ask question..."
                  />
                  <button className="px-3 py-2 rounded-lg bg-white/10 text-xs text-white">Send</button>
                </form>
              </div>

              <div className="pt-4 border-t border-white/10 space-y-2">
                <div className="text-xs text-gray-500 uppercase font-bold tracking-widest">Session Feedback</div>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={feedback.rating}
                  onChange={(e) => setFeedback((prev) => ({ ...prev, rating: Number(e.target.value) }))}
                  className="w-full bg-black/30 border border-white/10 rounded-lg p-2 text-xs text-white"
                />
                <textarea
                  value={feedback.feedback}
                  onChange={(e) => setFeedback((prev) => ({ ...prev, feedback: e.target.value }))}
                  className="w-full h-16 bg-black/30 border border-white/10 rounded-lg p-2 text-xs text-white"
                  placeholder="Share interview feedback"
                />
                <button onClick={handleFeedbackSubmit} className="w-full py-2 rounded-lg bg-teal-500 text-black text-xs font-bold uppercase">
                  Submit Feedback
                </button>
              </div>
            </div>
          </div>

        </div>
      </div>
    </MainLayout>
  );
}
