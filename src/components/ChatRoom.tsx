"use client";

import { useState, useEffect, useRef } from "react";

interface Message {
  id: string;
  userId: string;
  nickname: string;
  content: string;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  timestamp: number;
  type: "text" | "file" | "system";
}

interface User {
  id: string;
  nickname: string;
  lastSeen: number;
  color: string;
}

const STORAGE_KEY = "chatsite_uid";
const STORAGE_NICK = "chatsite_nick";

// 生成短 ID，如 #A3F7
function generateShortId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `#${s}`;
}

// 根据 userId 生成稳定颜色
function getUserColor(id: string): string {
  const colors = [
    "#22c55e", "#3b82f6", "#f59e0b", "#ef4444",
    "#8b5cf6", "#ec4899", "#06b6d4", "#f97316",
    "#14b8a6", "#6366f1", "#e11d48", "#84cc16",
  ];
  let hash = 0;
  for (const c of id) hash = ((hash << 5) - hash + c.charCodeAt(0)) | 0;
  return colors[Math.abs(hash) % colors.length];
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// 获取昵称首字（用于头像）
function getAvatarLetter(name: string): string {
  return name ? name.charAt(0).toUpperCase() : "?";
}

export default function ChatRoom() {
  const [userId, setUserId] = useState("");
  const [nickname, setNickname] = useState("");
  const [showWelcome, setShowWelcome] = useState(false);
  const [nickInput, setNickInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [inputText, setInputText] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 初始化：读取本地存储，判断是否需要欢迎弹窗
  useEffect(() => {
    const uid = localStorage.getItem(STORAGE_KEY);
    const nick = localStorage.getItem(STORAGE_NICK) || "";
    if (uid) {
      setUserId(uid);
      setNickname(nick);
      setNickInput(nick);
      setShowWelcome(false);
    } else {
      setShowWelcome(true);
    }
  }, []);

  // 注册用户 & 开始轮询
  useEffect(() => {
    if (!userId) return;
    registerUser();
    startPolling();
    return () => stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, nickname]);

  async function registerUser() {
    try {
      await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, nickname: nickname || undefined }),
      });
    } catch { /* ignore */ }
  }

  function startPolling() {
    stopPolling();
    pollRef.current = setInterval(() => {
      fetchMessages();
      fetchUsers();
    }, 2000);
    fetchMessages();
    fetchUsers();
  }

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  const lastTsRef = useRef(0);

  async function fetchMessages() {
    try {
      const res = await fetch(`/api/messages?since=${lastTsRef.current}`);
      const data = await res.json();
      if (data.messages?.length > 0) {
        setMessages(prev => {
          const seen = new Set<string>();
          const merged = [...prev, ...data.messages].filter((m: Message) => {
            if (seen.has(m.id)) return false;
            seen.add(m.id);
            return true;
          });
          merged.sort((a: Message, b: Message) => a.timestamp - b.timestamp);
          return merged.slice(-200);
        });
        lastTsRef.current = data.messages[data.messages.length - 1]?.timestamp || lastTsRef.current;
      }
    } catch { /* ignore */ }
  }

  async function fetchUsers() {
    try {
      const res = await fetch("/api/users");
      const data = await res.json();
      setUsers(data.users || []);
    } catch { /* ignore */ }
  }

  useEffect(() => {
    if (messages.length > 0) {
      setIsLoading(false);
    }
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(content: string) {
    if (!content.trim()) return;
    try {
      await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, nickname, content: content.trim(), type: "text" }),
      });
      setInputText("");
      fetchMessages();
    } catch { /* ignore */ }
  }

  async function sendFile(file: File) {
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (data.success) {
        await fetch("/api/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId, nickname,
            content: `[文件] ${data.fileName}`,
            type: "file",
            fileUrl: data.url,
            fileName: data.fileName,
            fileSize: data.fileSize,
          }),
        });
        fetchMessages();
      }
    } catch { /* ignore */ }
    finally { setUploading(false); }
  }

  // 欢迎弹窗：确认昵称
  function confirmNickname() {
    const trimmed = nickInput.trim();
    if (!trimmed) return;
    const uid = generateShortId();
    setUserId(uid);
    localStorage.setItem(STORAGE_KEY, uid);
    setNickname(trimmed);
    localStorage.setItem(STORAGE_NICK, trimmed);
    setShowWelcome(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(inputText);
    }
  }

  const onlineCount = users.length;
  const userColor = getUserColor(userId);

  return (
    <div className="flex h-screen bg-[#0a0a0f] text-gray-100">
      {/* ====== 侧边栏 ====== */}
      <div
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-[#0f0f14] border-r border-white/5
          transform transition-transform duration-300 ease-in-out
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
          md:relative md:translate-x-0 md:z-0`}
      >
        {/* 侧边栏头部 */}
        <div className="p-5 border-b border-white/5">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <h2 className="text-base font-bold text-white">在线用户</h2>
          </div>
          <p className="text-xs text-gray-500">{onlineCount} 位用户在线</p>
        </div>

        {/* 用户列表 */}
        <div className="overflow-y-auto h-[calc(100%-80px)] py-2 px-3">
          {users.map((u) => {
            const isMe = u.id === userId;
            const color = getUserColor(u.id);
            return (
              <div
                key={u.id}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl mb-1 transition-colors
                  ${isMe ? "bg-white/[0.06]" : "hover:bg-white/[0.03]"}`}
              >
                {/* 头像 */}
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                  style={{ background: color }}
                >
                  {getAvatarLetter(u.nickname)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-white truncate">
                    {u.nickname}
                    {isMe && <span className="text-gray-500 text-xs ml-1">(你)</span>}
                  </div>
                  <div className="text-xs text-gray-600 font-mono">{u.id}</div>
                </div>
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
              </div>
            );
          })}
          {users.length === 0 && (
            <p className="text-xs text-gray-600 text-center py-8">等待用户加入…</p>
          )}
        </div>
      </div>

      {/* 遮罩（移动端） */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-30 md:hidden backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ====== 主区域 ====== */}
      <div className="flex-1 flex flex-col h-screen min-w-0">
        {/* 顶部栏 */}
        <header className="flex items-center gap-3 px-4 py-3 bg-[#0f0f14]/80 backdrop-blur-md border-b border-white/5">
          <button
            className="md:hidden text-gray-400 hover:text-white transition-colors p-1"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          {/* Logo + 标题 */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white text-sm font-bold shadow-lg shadow-emerald-500/20">
              C
            </div>
            <div>
              <h1 className="text-sm font-bold text-white leading-tight">ChatSite</h1>
              <p className="text-[10px] text-gray-500">在线聊天室</p>
            </div>
          </div>

          {/* 我的信息 */}
          {userId && (
            <div className="ml-auto flex items-center gap-2">
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/5">
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                  style={{ background: userColor }}
                >
                  {getAvatarLetter(nickname)}
                </div>
                <span className="text-xs text-gray-300 max-w-[80px] truncate">{nickname || "未设置"}</span>
                <span className="text-[10px] text-gray-600 font-mono">{userId}</span>
              </div>
              <button
                onClick={() => { setNickInput(nickname); setShowWelcome(true); }}
                className="text-xs text-gray-500 hover:text-emerald-400 transition-colors px-2 py-1 rounded-lg hover:bg-white/[0.03]"
                title="修改昵称"
              >
                编辑
              </button>
            </div>
          )}
        </header>

        {/* 消息列表 */}
        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4" style={{ scrollBehavior: "smooth" }}>
          {isLoading && messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-gray-600 gap-3">
              <div className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center justify-center text-2xl">
                💬
              </div>
              <p className="text-sm">正在连接聊天室…</p>
            </div>
          )}

          {!isLoading && messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-gray-600 gap-3">
              <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center justify-center text-3xl">
                🎉
              </div>
              <p className="text-base font-medium text-gray-400">来发第一条消息吧！</p>
              <p className="text-xs text-gray-600">和大家打个招呼～</p>
            </div>
          )}

          {messages.map((msg) => {
            const isSelf = msg.userId === userId;
            const color = getUserColor(msg.userId);

            if (msg.type === "system") {
              return (
                <div key={msg.id} className="flex justify-center py-1 animate-fade-in">
                  <span className="text-[11px] text-gray-600 bg-white/[0.02] px-3 py-1 rounded-full border border-white/[0.03]">
                    {msg.content}
                  </span>
                </div>
              );
            }

            return (
              <div
                key={msg.id}
                className={`flex gap-3 ${isSelf ? "flex-row-reverse" : ""} animate-fade-in group`}
              >
                {/* 头像 */}
                <div className="flex-shrink-0 pt-1">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-lg"
                    style={{ background: color, boxShadow: `0 0 12px ${color}40` }}
                  >
                    {getAvatarLetter(msg.nickname)}
                  </div>
                </div>

                {/* 气泡区域 */}
                <div className={`max-w-[70%] min-w-[60px]`}>
                  {/* 昵称 + 时间 */}
                  {!isSelf && (
                    <div className="flex items-center gap-2 mb-1 px-1">
                      <span className="text-xs font-medium" style={{ color }}>{msg.nickname}</span>
                      <span className="text-[10px] text-gray-600">{formatTime(msg.timestamp)}</span>
                    </div>
                  )}

                  {/* 文件消息 */}
                  {msg.type === "file" ? (
                    <div
                      className={`rounded-2xl px-4 py-3 border transition-all duration-200
                        ${isSelf
                          ? "bg-gradient-to-br from-emerald-500 to-teal-600 border-emerald-400/20 shadow-lg shadow-emerald-500/10"
                          : "bg-white/[0.04] border-white/5 hover:bg-white/[0.06]"}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${isSelf ? "bg-white/20" : "bg-white/[0.05]"}`}>
                          <svg className="w-5 h-5" fill="none" stroke={isSelf ? "white" : "#22c55e"} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                          </svg>
                        </div>
                        <div className="min-w-0">
                          <div className={`text-sm font-medium truncate ${isSelf ? "text-white" : "text-gray-200"}`}>
                            {msg.fileName}
                          </div>
                          {msg.fileSize && (
                            <div className={`text-[11px] ${isSelf ? "text-white/60" : "text-gray-500"}`}>
                              {formatFileSize(msg.fileSize)}
                            </div>
                          )}
                        </div>
                      </div>
                      {msg.fileUrl && (
                        <a
                          href={msg.fileUrl}
                          download={msg.fileName}
                          className={`inline-flex items-center gap-1 mt-2 text-[11px] transition-colors
                            ${isSelf ? "text-white/80 hover:text-white" : "text-emerald-400 hover:text-emerald-300"}`}
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                          下载文件
                        </a>
                      )}
                    </div>
                  ) : (
                    /* 文字消息 */
                    <div
                      className={`rounded-2xl px-4 py-2.5 break-words whitespace-pre-wrap text-sm leading-relaxed shadow-lg
                        ${isSelf
                          ? "bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-emerald-500/10 rounded-tr-md"
                          : "bg-white/[0.04] text-gray-200 border border-white/5 rounded-tl-md hover:bg-white/[0.06] transition-colors"}`}
                    >
                      {msg.content}
                    </div>
                  )}

                  {/* 自己的消息：时间显示在气泡下方 */}
                  {isSelf && (
                    <div className="text-[10px] text-gray-600 mt-1 px-1 text-right">
                      {formatTime(msg.timestamp)}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* 输入区域 */}
        <div className="px-4 py-3 bg-[#0f0f14]/80 backdrop-blur-md border-t border-white/5">
          {uploading && (
            <div className="flex items-center gap-2 mb-2 text-[11px] text-emerald-400/80">
              <div className="w-3 h-3 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
              正在上传文件…
            </div>
          )}
          <div className="flex items-end gap-2">
            {/* 上传按钮 */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex-shrink-0 p-2.5 text-gray-500 hover:text-emerald-400 hover:bg-white/[0.04] rounded-xl transition-all duration-200 disabled:opacity-30"
              title="发送文件"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) sendFile(f); e.target.value = ""; }}
            />

            {/* 输入框 */}
            <div className="flex-1 relative">
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="输入消息…（Enter 发送，Shift+Enter 换行）"
                className="w-full bg-white/[0.04] border border-white/5 rounded-2xl px-4 py-3 text-sm text-gray-200 placeholder-gray-600
                  focus:outline-none focus:border-emerald-500/30 focus:bg-white/[0.06] transition-all duration-200 resize-none"
                rows={1}
                style={{ minHeight: "44px", maxHeight: "120px" }}
                onInput={(e) => {
                  const el = e.target as HTMLTextAreaElement;
                  el.style.height = "auto";
                  el.style.height = Math.min(el.scrollHeight, 120) + "px";
                }}
              />
            </div>

            {/* 发送按钮 */}
            <button
              onClick={() => sendMessage(inputText)}
              disabled={!inputText.trim()}
              className="flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center
                bg-gradient-to-br from-emerald-500 to-teal-600 text-white
                hover:from-emerald-400 hover:to-teal-500
                disabled:from-gray-800 disabled:to-gray-800 disabled:text-gray-600
                shadow-lg shadow-emerald-500/20 disabled:shadow-none
                transition-all duration-200 transform hover:scale-105 active:scale-95 disabled:transform-none"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 12l6-6m0 0l6 6m-6-6v12.75" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* ====== 欢迎/设置昵称弹窗 ====== */}
      {showWelcome && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* 背景模糊层 */}
          <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={(e) => e.stopPropagation()} />
          <div className="relative w-full max-w-md animate-fade-in">
            {/* 卡片 */}
            <div className="bg-[#111118] border border-white/5 rounded-3xl p-8 shadow-2xl shadow-black/50">
              {/* 图标 */}
              <div className="flex justify-center mb-6">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white text-3xl shadow-2xl shadow-emerald-500/30">
                  💬
                </div>
              </div>

              <h2 className="text-xl font-bold text-white text-center mb-2">欢迎来到 ChatSite</h2>
              <p className="text-sm text-gray-500 text-center mb-8">设置一个昵称，开始聊天吧</p>

              {/* 昵称输入 */}
              <div className="mb-6">
                <label className="block text-xs text-gray-500 mb-2 ml-1">昵称</label>
                <input
                  value={nickInput}
                  onChange={(e) => setNickInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") confirmNickname(); }}
                  placeholder="请输入昵称…"
                  autoFocus
                  className="w-full bg-white/[0.04] border border-white/5 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-700
                    focus:outline-none focus:border-emerald-500/40 focus:bg-white/[0.06] transition-all duration-200"
                />
              </div>

              {/* 你的 ID 预览 */}
              <div className="mb-8 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.03]">
                <span className="text-[11px] text-gray-600">你的 ID</span>
                <span className="text-xs font-mono font-bold text-emerald-400">{userId || generateShortId()}</span>
              </div>

              {/* 确认按钮 */}
              <button
                onClick={confirmNickname}
                disabled={!nickInput.trim()}
                className="w-full py-3 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white text-sm font-bold
                  hover:from-emerald-400 hover:to-teal-500
                  disabled:from-gray-800 disabled:to-gray-800 disabled:text-gray-600
                  shadow-lg shadow-emerald-500/20 transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98]"
              >
                {userId ? "保存修改" : "进入聊天室 →"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
